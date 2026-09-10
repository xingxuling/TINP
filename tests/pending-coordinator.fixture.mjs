import {InternetSuite} from '../src/suite.mjs';

// Deliberately stop progress at either real retirement commit boundary. The
// parent kills this independent coordinator after receiving the durable roots.
const [directory,mode]=process.argv.slice(2);
let suite;
try {
  suite=await InternetSuite.start({directory,durable:true,recoveryMode:'maintenance',timeoutMs:3000});
  const original=mode==='suffix'?suite.ledger.append.bind(suite.ledger):suite.record.bind(suite);
  const halt=(type,detail)=>{
    const event=original(type,detail);
    if(type==='pending.retired')throw Object.assign(new Error('fixture-retirement-boundary'),{boundary:true,event});
    return event;
  };
  if(mode==='suffix')suite.ledger.append=halt;else suite.record=halt;
  await suite.retirePending({requestRoot:suite.pending.request.root,confirmed:true});
  throw new Error('retirement boundary not reached');
} catch(error) {
  if(error.boundary){
    process.send({event:'retirement-before-clear',commitBoundary:mode,terminalRoot:error.event.eventRoot,
      requestRoot:suite.pending.request.root,leaseRoot:suite.lease.root,
      nodePids:[...suite.nodes.values()].map(node=>node.child.pid),stats:await suite.stats()});
    await new Promise(()=>{});
  }else{
    process.send?.({event:'error',code:error.code,message:error.message});
    await suite?.close();process.exit(1);
  }
}
