import {InternetSuite} from '../src/suite.mjs';
import {generateEd25519Keypair,signObject} from '../vendor/aaf/src/signatures.mjs';
import {sealApproval} from '../vendor/aaf/src/contracts.mjs';

const [mode,directory]=process.argv.slice(2);
if(mode==='signer'){
  // The external signing key exists only in this independent test process.
  const keys=generateEd25519Keypair(),signerId='operator:external-test';
  process.send({event:'signer-ready',signerId,publicKeyPem:keys.public_key_pem,pid:process.pid});
  process.on('message',message=>{
    if(message.command==='sign'){
      try{
        const approval=signObject(sealApproval(message.body),keys.private_key_pem,message.signerId??signerId);
        process.send({callId:message.callId,approval});
      }catch(error){process.send({callId:message.callId,error:error.code??error.message});}
    }else if(message.command==='close')process.exit(0);
  });
}else if(mode==='crash'){
  process.once('message',async message=>{
    let suite;
    try{
      suite=await InternetSuite.start({directory,durable:true,recoveryMode:'maintenance',operatorKeyring:message.operatorKeyring,timeoutMs:3000});
      const record=suite.record.bind(suite);
      suite.record=(type,detail,...options)=>{
        const event=record(type,detail,...options);
        if(type==='pending.retired')throw Object.assign(new Error('operator-crash-after-terminal'),{boundary:true,event});
        return event;
      };
      await suite.retirePending({requestRoot:suite.pending.request.root,confirmed:true,approval:message.approval});
      throw new Error('operator retirement crash boundary not reached');
    }catch(error){
      if(error.boundary){
        process.send({event:'terminal-before-clear',terminalRoot:error.event.eventRoot,requestRoot:suite.pending.request.root,
          leaseRoot:suite.lease.root,nodePids:[...suite.nodes.values()].map(node=>node.child.pid),stats:await suite.stats()});
        await new Promise(()=>{});
      }else{
        process.send({event:'error',code:error.code,message:error.message});await suite?.close();process.exit(1);
      }
    }
  });
}else throw new Error('unknown operator test fixture mode');
