import {LocalTransport} from './transport.mjs';
import {LOCAL_FIRST_POLICY,enumerateLocalBearers,selectLocalBearer,makeBearerAdmissionFacts} from './bearer-policy.mjs';
import {evaluateBearerAdmissionGuard} from '../adapters/rcl-bearer-guard.mjs';
import {requireThat} from './identity.mjs';

export async function bindLocalNetworkTransport({nodeId,identity,kind='udp',tlsOptions=null,interfaces,policy=LOCAL_FIRST_POLICY,
  preferKinds=['wifi','ethernet','network','overlay'],securityFloorMet=true,privacyFloorMet=true}={}){
  const candidates=enumerateLocalBearers(interfaces);
  const bearer=selectLocalBearer({candidates,preferKinds});
  const endpoint={host:bearer.address,metered:bearer.metered};
  const facts=makeBearerAdmissionFacts({endpoint,policy,reachable:true,securityFloorMet,privacyFloorMet});
  const guard=await evaluateBearerAdmissionGuard(facts);requireThat(guard.allowed,guard.code);
  const transport=await new LocalTransport({nodeId,identity,kind,tlsOptions,bindHost:bearer.address,advertiseHost:bearer.address,networkPolicy:policy}).bind();
  return {transport,bearer,guard,candidates};
}
