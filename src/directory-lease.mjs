import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ProtocolError} from './identity.mjs';
export async function acquireDirectoryLease(directory){
  fs.mkdirSync(directory,{recursive:true});
  const file=path.join(fs.realpathSync(directory),'coordinator.lock');
  const child=spawn(process.env.NEXT_INTERNET_PYTHON||'python',['-X','utf8',fileURLToPath(new URL('../adapters/directory-lock.py',import.meta.url)),file],{
    windowsHide:true,stdio:['pipe','pipe','pipe']});
  await new Promise((resolve,reject)=>{
    let output='',settled=false;
    const finish=(e)=>{if(settled)return;settled=true;clearTimeout(timer);e?reject(e):resolve();};
    const timer=setTimeout(()=>{child.kill();finish(new ProtocolError('DIRECTORY_LOCK_TIMEOUT'));},10000);
    child.stdout.on('data',bytes=>{output+=bytes.toString('utf8');if(output.includes('\n')){
      try{const result=JSON.parse(output);if(result.acquired)finish();else{child.kill();finish(new ProtocolError(result.error));}}
      catch{child.kill();finish(new ProtocolError('DIRECTORY_LOCK_INVALID'));}
    }});
    child.stderr.on('data',()=>{});
    child.once('error',()=>finish(new ProtocolError('DIRECTORY_LOCK_UNAVAILABLE')));
    child.once('exit',()=>finish(new ProtocolError('DIRECTORY_IN_USE')));
  });
  let released=false;
  return {assertHeld(){if(released||child.exitCode!==null||child.signalCode!==null)throw new ProtocolError('DIRECTORY_LOCK_LOST');},
    async release(){if(released)return;released=true;if(child.exitCode!==null||child.signalCode!==null)return;
      await new Promise(resolve=>{child.once('exit',resolve);child.stdin.end();});}};
}
