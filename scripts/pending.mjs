import fs from 'node:fs';
import {InternetSuite} from '../src/suite.mjs';
import {inspectPending} from '../src/pending-management.mjs';
import {requireThat} from '../src/identity.mjs';
const [action,directory,...args]=process.argv.slice(2);let suite;
try{
  const allowed={status:['keyring'],reconcile:['keyring','transport'],retire:['keyring','approval','request-root','confirm-retire-lease','transport'],
    'operator-pin':['signer-id','public-key','confirm-pin-operator','transport'],'operator-request':['keyring']};
  requireThat(Object.hasOwn(allowed,action)&&directory,'PENDING_COMMAND_INVALID');const options={};
  for(let i=0;i<args.length;i++){
    const flag=args[i].slice(2);requireThat(args[i].startsWith('--')&&allowed[action].includes(flag)&&!Object.hasOwn(options,flag),'PENDING_COMMAND_INVALID');
    if(flag.startsWith('confirm-'))options[flag]=true;
    else{requireThat(args[i+1]&&!args[i+1].startsWith('--'),'PENDING_COMMAND_INVALID');options[flag]=args[++i];}
  }
  if(action==='retire')requireThat(options['confirm-retire-lease']&&/^[a-f0-9]{64}$/.test(options['request-root']??''),'OPERATOR_CONFIRMATION_REQUIRED');
  if(action==='operator-pin')requireThat(options['confirm-pin-operator']&&options['signer-id']&&options['public-key'],'OPERATOR_CONFIRMATION_REQUIRED');
  requireThat(['udp','tcp'].includes(options.transport??'udp'),'PENDING_COMMAND_INVALID');
  const readJson=file=>JSON.parse(fs.readFileSync(file,'utf8'));
  const operatorKeyring=options.keyring?readJson(options.keyring):undefined;
  const view=await inspectPending(directory,{operatorKeyring});
  if(action==='status')console.log(JSON.stringify({说明:'只读摘要；不输出原文或私钥，节点缓存未在此入口验证。',...view},null,2));
  else if(action==='operator-request'){
    requireThat(view.operatorChallenge,'OPERATOR_POLICY_OR_PENDING_REQUIRED');
    console.log(JSON.stringify({说明:'将此挑战交给独立签署方。网络运行端不会生成签章；必须明确批准停用整个旧租约。',
      challenge:view.operatorChallenge,requiredSignerId:view.operatorPolicy.signerId,
      approvalProfile:{format:'aaf.approval-receipt.v0.1',proposal_root:view.operatorChallenge.challengeRoot,
        approver_id:view.operatorPolicy.signerId,approver_roles:['tinp.operator'],scopes:['tinp.pending.retire'],conditions:[],decision:'approved'},
      signingRequirements:'AAF sealApproval + signObject; signer supplies approval_id and canonical ISO issued_at/expires_at, maximum 10 minutes.'},null,2));
  }else{
    if(action==='retire'){
      requireThat(view.requestRoot===options['request-root'],'PENDING_ROOT_MISMATCH');
      if(view.operatorPolicy)requireThat(options.approval&&operatorKeyring,'EXTERNAL_OPERATOR_APPROVAL_REQUIRED');
    }
    suite=await InternetSuite.start({directory,durable:true,recoveryMode:'maintenance',operatorKeyring,transport:options.transport??'udp'});
    if(action==='operator-pin'){
      const policy=await suite.pinOperator({signerId:options['signer-id'],publicKeyPem:fs.readFileSync(options['public-key'],'utf8'),confirmed:true});
      console.log(JSON.stringify({说明:'已固定外部公钥指纹，不能降级为本地确认。此步骤是本机信任引导，不是生产身份注册。',policy},null,2));
    }else{
      const result=action==='reconcile'?await suite.reconcilePending():await suite.retirePending({requestRoot:options['request-root'],confirmed:true,approval:options.approval?readJson(options.approval):undefined});
      console.log(JSON.stringify({说明:action==='retire'?'已停用原租约并关闭未决记录；执行结果未知，不创建新权限。':'只查询已有回执，没有重发执行请求。',
        status:result.status,executionResent:false,executionOutcome:result.executionOutcome??(result.receipt?'executed':null),
        result:result.receipt?.body.result??null,requestRoot:result.requestRoot??view.requestRoot},null,2));
    }
  }
}catch(error){console.error(JSON.stringify({status:'blocked',code:error.code??'PENDING_COMMAND_FAILED',说明:'失败不会自动清除未决请求或更换密钥；已固定外部操作员时，明确确认不能代替有效外部签章。'},null,2));process.exitCode=2;}
finally{await suite?.close();}
