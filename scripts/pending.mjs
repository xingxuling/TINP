import {InternetSuite} from '../src/suite.mjs';
import {inspectPending} from '../src/pending-management.mjs';
import {requireThat} from '../src/identity.mjs';

const [action,directory,...options]=process.argv.slice(2);let suite;
try{
  requireThat(['status','reconcile','retire'].includes(action)&&directory,'PENDING_COMMAND_INVALID');
  let requestRoot;
  if(action==='retire'){
    requireThat(options.length===3&&options[0]==='--request-root'&&/^[a-f0-9]{64}$/.test(options[1])&&options[2]==='--confirm-retire-lease','OPERATOR_CONFIRMATION_REQUIRED');
    requestRoot=options[1];
  }else requireThat(options.length===0,'PENDING_COMMAND_INVALID');
  const view=await inspectPending(directory);
  if(action==='status')console.log(JSON.stringify({说明:'只读查看已认证的协调器记录；未决请求的执行结果仍未知，节点缓存未在此入口验证。',...view},null,2));
  else{
    if(action==='retire')requireThat(view.requestRoot===requestRoot,'PENDING_ROOT_MISMATCH');
    suite=await InternetSuite.start({directory,durable:true,recoveryMode:'maintenance'});
    const result=action==='reconcile'?await suite.reconcilePending():await suite.retirePending({requestRoot,confirmed:true});
    // Only a verified result summary, never the signed original input or private state.
    console.log(JSON.stringify({说明:action==='retire'?'已关闭未决记录并停用原租约；这不代表从未执行，也不创建新权限。':'只查询已有回执，没有重发执行请求。',
      status:result.status,executionResent:false,executionOutcome:result.executionOutcome??(result.receipt?'executed':null),
      result:result.receipt?.body.result??null,requestRoot:result.requestRoot??view.requestRoot},null,2));
  }
}catch(error){
  console.error(JSON.stringify({status:'blocked',code:error.code??'PENDING_COMMAND_FAILED',说明:'未决状态不会因失败自动清除。status 为只读查看；reconcile 仅查询原回执；retire 必须提供完整请求根并明确确认停用整个原租约。'},null,2));process.exitCode=2;
}finally{await suite?.close();}
