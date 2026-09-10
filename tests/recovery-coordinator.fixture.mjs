import {InternetSuite} from '../src/suite.mjs';

// A separate coordinator lets the parent kill the actual owner process. The
// execution response is intercepted only after a real network execution.
const directory=process.argv[2],mode=process.argv[3]??'normal';
let suite;
try {
  suite=await InternetSuite.start({directory,durable:true,timeoutMs:3000});
  if(mode==='crash-after-receipt'||mode==='crash-before-send') {
    const wire=suite.wire.bind(suite);
    suite.wire=async (...args)=>{
      if(args[1]==='INTENT'&&mode==='crash-before-send') {
        process.send({event:'pending-before-send',request:args[2],
          pids:[...suite.nodes.values()].map(node=>node.child.pid)});
        await new Promise(()=>{});
      }
      const receipt=await wire(...args);
      if(args[1]==='INTENT') {
        process.send({event:'receipt-before-commit',receipt,request:args[2],
          nodePublicKey:suite.nodes.get(args[0]).info.publicKey,
          pids:[...suite.nodes.values()].map(node=>node.child.pid)});
        await new Promise(()=>{});
      }
      return receipt;
    };
    await suite.use('crash recovery 中文🙂');
  } else {
    process.send({event:'ready',stats:await suite.stats(),
      events:suite.ledger.events,authorityPublicKey:suite.authority.publicKey,
      subjectPublicKey:suite.subjectIdentity.publicKey,
      nodeKeys:Object.fromEntries([...suite.nodes].map(([id,node])=>[id,node.info.publicKey])),
      revoked:suite.revoked,lease:suite.lease,session:suite.session});
    process.on('message',async message=>{
      if(message.command==='close') {
        await suite.close();process.exit(0);
      }
    });
  }
} catch(error) {
  process.send?.({event:'error',code:error.code,message:error.message,stack:error.stack});
  await suite?.close();process.exit(1);
}
