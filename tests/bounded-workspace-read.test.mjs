import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBoundedWorkspaceReadProvider} from '../src/providers/bounded-workspace-read.mjs';

async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'tinp-workspace-'));
  await fs.writeFile(path.join(root,'readme.md'),'hello guarded world','utf8');
  return root;
}

test('bounded workspace provider performs a real local file read with observation',async t=>{
  const root=await fixture();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const provider=createBoundedWorkspaceReadProvider({workspaceRoot:root});
  const result=await provider({name:'workspace.read',arguments:{path:'workspace/project/readme.md'}});
  assert.equal(result.mcp.structuredContent.text,'hello guarded world');
  assert.deepEqual(result.observation.effects,['filesystem.read']);
  assert.deepEqual(result.observation.resources.filesystem,['workspace/project/readme.md']);
});

test('bounded workspace provider rejects traversal and wrong logical prefix',async t=>{
  const root=await fixture();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const provider=createBoundedWorkspaceReadProvider({workspaceRoot:root});
  await assert.rejects(
    ()=>provider({name:'workspace.read',arguments:{path:'workspace/project/../secret.txt'}}),
    error=>error.code==='WORKSPACE_TRAVERSAL_REJECTED',
  );
  await assert.rejects(
    ()=>provider({name:'workspace.read',arguments:{path:'.ssh/id_rsa'}}),
    error=>error.code==='WORKSPACE_RESOURCE_PREFIX_MISMATCH',
  );
});

test('bounded workspace provider enforces file size before read',async t=>{
  const root=await fixture();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const provider=createBoundedWorkspaceReadProvider({workspaceRoot:root,maxBytes:4});
  await assert.rejects(
    ()=>provider({name:'workspace.read',arguments:{path:'workspace/project/readme.md'}}),
    error=>error.code==='WORKSPACE_FILE_TOO_LARGE',
  );
});

test('bounded workspace provider rejects symlink escape when platform permits symlinks',async t=>{
  const root=await fixture();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'tinp-outside-'));t.after(()=>fs.rm(outside,{recursive:true,force:true}));
  const secret=path.join(outside,'secret.txt');await fs.writeFile(secret,'secret','utf8');
  const link=path.join(root,'link.txt');
  try{await fs.symlink(secret,link,'file');}
  catch(error){
    if(['EPERM','EACCES'].includes(error?.code)){t.skip('symlink privilege unavailable');return;}
    throw error;
  }
  const provider=createBoundedWorkspaceReadProvider({workspaceRoot:root});
  await assert.rejects(
    ()=>provider({name:'workspace.read',arguments:{path:'workspace/project/link.txt'}}),
    error=>error.code==='WORKSPACE_SYMLINK_ESCAPE_REJECTED',
  );
});
