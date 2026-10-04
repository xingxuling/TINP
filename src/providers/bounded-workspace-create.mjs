import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

export class BoundedWorkspaceCreateProviderError extends Error{
  constructor(code){super(code);this.code=code;}
}
function fail(ok,code){if(!ok)throw new BoundedWorkspaceCreateProviderError(code);}
function inside(root,target){
  const relative=path.relative(root,target);
  return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));
}
function sha256(value){return createHash('sha256').update(value).digest('hex');}

export function createBoundedWorkspaceCreateProvider({
  workspaceRoot,
  resourcePrefix='workspace/project',
  maxBytes=256*1024,
}={}){
  fail(typeof workspaceRoot==='string'&&workspaceRoot.length>0,'WORKSPACE_ROOT_REQUIRED');
  fail(typeof resourcePrefix==='string'&&resourcePrefix.length>0,'WORKSPACE_RESOURCE_PREFIX_REQUIRED');
  fail(Number.isSafeInteger(maxBytes)&&maxBytes>0,'WORKSPACE_MAX_BYTES_INVALID');
  const rootInput=path.resolve(workspaceRoot);
  const prefix=resourcePrefix.replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');

  return async function boundedWorkspaceCreate({name,arguments:args}={}){
    fail(name==='workspace.create','WORKSPACE_TOOL_UNSUPPORTED');
    fail(args&&typeof args==='object'&&!Array.isArray(args),'WORKSPACE_ARGUMENTS_REQUIRED');
    const resource=args.path;
    const content=args.content;
    fail(typeof resource==='string'&&resource.length>0,'WORKSPACE_PATH_REQUIRED');
    fail(typeof content==='string','WORKSPACE_CONTENT_REQUIRED');
    const bytes=Buffer.from(content,'utf8');
    fail(bytes.length<=maxBytes,'WORKSPACE_CONTENT_TOO_LARGE');

    const normalized=resource.replace(/\\/g,'/');
    fail(normalized===prefix||normalized.startsWith(prefix+'/'),'WORKSPACE_RESOURCE_PREFIX_MISMATCH');
    const suffix=normalized.slice(prefix.length).replace(/^\/+/, '');
    fail(suffix.length>0,'WORKSPACE_FILE_REQUIRED');
    fail(!suffix.split('/').includes('..'),'WORKSPACE_TRAVERSAL_REJECTED');

    const root=await fs.realpath(rootInput);
    const lexical=path.resolve(root,...suffix.split('/'));
    fail(inside(root,lexical),'WORKSPACE_TRAVERSAL_REJECTED');
    const parent=await fs.realpath(path.dirname(lexical));
    fail(inside(root,parent),'WORKSPACE_PARENT_ESCAPE_REJECTED');

    const temp=path.join(parent,`.tinp-create-${randomUUID()}.tmp`);
    let handle;
    try{
      handle=await fs.open(temp,'wx',0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close();
      handle=null;
      await fs.link(temp,lexical);
      await fs.unlink(temp);
    }catch(error){
      if(handle)await handle.close().catch(()=>{});
      await fs.unlink(temp).catch(()=>{});
      if(error?.code==='EEXIST')throw new BoundedWorkspaceCreateProviderError('WORKSPACE_TARGET_EXISTS');
      throw error;
    }

    return {
      mcp:{
        content:[{type:'text',text:`created ${normalized}`}],
        structuredContent:{created:true,path:normalized,bytes:bytes.length,sha256:sha256(bytes)},
        isError:false,
      },
      observation:{
        effects:['filesystem.write'],
        resources:{filesystem:[normalized]},
        source:'tinp.bounded-workspace-create.v1',
      },
    };
  };
}
