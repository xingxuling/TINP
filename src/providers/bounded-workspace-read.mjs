import fs from 'node:fs/promises';
import path from 'node:path';

export class BoundedWorkspaceProviderError extends Error{
  constructor(code){super(code);this.code=code;}
}
function fail(ok,code){if(!ok)throw new BoundedWorkspaceProviderError(code);}
function inside(root,target){
  const relative=path.relative(root,target);
  return relative===''||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative));
}

export function createBoundedWorkspaceReadProvider({
  workspaceRoot,
  resourcePrefix='workspace/project',
  maxBytes=1024*1024,
}={}){
  fail(typeof workspaceRoot==='string'&&workspaceRoot.length>0,'WORKSPACE_ROOT_REQUIRED');
  fail(typeof resourcePrefix==='string'&&resourcePrefix.length>0,'WORKSPACE_RESOURCE_PREFIX_REQUIRED');
  fail(Number.isSafeInteger(maxBytes)&&maxBytes>0,'WORKSPACE_MAX_BYTES_INVALID');
  const rootInput=path.resolve(workspaceRoot);
  const prefix=resourcePrefix.replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');

  return async function boundedWorkspaceRead({name,arguments:args}={}){
    fail(name==='workspace.read','WORKSPACE_TOOL_UNSUPPORTED');
    fail(args&&typeof args==='object'&&!Array.isArray(args),'WORKSPACE_ARGUMENTS_REQUIRED');
    const resource=args.path;
    fail(typeof resource==='string'&&resource.length>0,'WORKSPACE_PATH_REQUIRED');
    const normalized=resource.replace(/\\/g,'/');
    fail(normalized===prefix||normalized.startsWith(prefix+'/'),'WORKSPACE_RESOURCE_PREFIX_MISMATCH');
    const suffix=normalized.slice(prefix.length).replace(/^\/+/, '');
    fail(suffix.length>0,'WORKSPACE_FILE_REQUIRED');
    fail(!suffix.split('/').includes('..'),'WORKSPACE_TRAVERSAL_REJECTED');

    const root=await fs.realpath(rootInput);
    const lexical=path.resolve(root,...suffix.split('/'));
    fail(inside(root,lexical),'WORKSPACE_TRAVERSAL_REJECTED');
    let target;
    try{target=await fs.realpath(lexical);}
    catch(error){
      if(error?.code==='ENOENT')throw new BoundedWorkspaceProviderError('WORKSPACE_FILE_NOT_FOUND');
      throw error;
    }
    fail(inside(root,target),'WORKSPACE_SYMLINK_ESCAPE_REJECTED');
    const stat=await fs.stat(target);
    fail(stat.isFile(),'WORKSPACE_NOT_FILE');
    fail(stat.size<=maxBytes,'WORKSPACE_FILE_TOO_LARGE');
    const text=await fs.readFile(target,'utf8');
    return {
      mcp:{
        content:[{type:'text',text}],
        structuredContent:{text},
        isError:false,
      },
      observation:{
        effects:['filesystem.read'],
        resources:{filesystem:[normalized]},
        source:'tinp.bounded-workspace-read.v1',
      },
    };
  };
}
