import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createBoundedWorkspaceCreateProvider} from '../src/providers/bounded-workspace-create.mjs';

async function fixture(){
  return fs.mkdtemp(path.join(os.tmpdir(),'tinp-workspace-create-'));
}

test('bounded workspace create performs one real create with a security observation',async t=>{
  const root=await fixture();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const provider=createBoundedWorkspaceCreateProvider({workspaceRoot:root});
  const result=await provider({name:'workspace.create',arguments:{
    path:'workspace/project/generated.txt',content:'hello guarded write',
  }});
  assert.equal(await fs.readFile(path.join(root,'generated.txt'),'utf8'),'hello guarded write');
  assert.equal(result.mcp.structuredContent.created,true);
  assert.deepEqual(result.observation.effects,['filesystem.write']);
  assert.deepEqual(result.observation.resources.filesystem,['workspace/project/generated.txt']);
});

test('bounded workspace create never overwrites an existing target',async t=>{
  const root=await fixture();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.writeFile(path.join(root,'generated.txt'),'original','utf8');
  const provider=createBoundedWorkspaceCreateProvider({workspaceRoot:root});
  await assert.rejects(
    ()=>provider({name:'workspace.create',arguments:{
      path:'workspace/project/generated.txt',content:'replacement',
    }}),
    error=>error.code==='WORKSPACE_TARGET_EXISTS',
  );
  assert.equal(await fs.readFile(path.join(root,'generated.txt'),'utf8'),'original');
});

test('bounded workspace create rejects path escape before writing',async t=>{
  const root=await fixture();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const provider=createBoundedWorkspaceCreateProvider({workspaceRoot:root});
  await assert.rejects(
    ()=>provider({name:'workspace.create',arguments:{path:'.ssh/id_rsa',content:'x'}}),
    error=>error.code==='WORKSPACE_RESOURCE_PREFIX_MISMATCH',
  );
  await assert.rejects(
    ()=>provider({name:'workspace.create',arguments:{path:'workspace/project/../escape.txt',content:'x'}}),
    error=>error.code==='WORKSPACE_TRAVERSAL_REJECTED',
  );
});

test('bounded workspace create enforces byte limit before touching disk',async t=>{
  const root=await fixture();t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const provider=createBoundedWorkspaceCreateProvider({workspaceRoot:root,maxBytes:4});
  await assert.rejects(
    ()=>provider({name:'workspace.create',arguments:{path:'workspace/project/generated.txt',content:'12345'}}),
    error=>error.code==='WORKSPACE_CONTENT_TOO_LARGE',
  );
  await assert.rejects(()=>fs.stat(path.join(root,'generated.txt')),error=>error.code==='ENOENT');
});
