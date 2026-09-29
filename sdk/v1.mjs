/** Public v1 surface for bounded read-only providers, offline verification and local-first bearer candidates.
 * Existing TINP policy and OPP negotiation remain the implementations/owners.
 * Physical multi-host Wi-Fi execution is enabled at the bearer API boundary but is not claimed verified until tested on real devices.
 */
export const SDK_API_VERSION = 1;
export {
  makeOppHttpReadonlyPolicy, makeOppHttpReadonlyRequest,
  runOppHttpReadonly, validateOppHttpReadonlyPolicy,
  validateOppHttpReadonlyRequest, validateOppHttpReadonlyReceipt,
} from '../src/opp-http-readonly.mjs';
export {
  runOppHttpConsumerLive, validateOppHttpConsumerLiveResult,
  makeOppHttpConsumerLiveVerification, validateOppHttpConsumerLiveVerification,
} from '../src/opp-http-consumer-live.mjs';
export {
  makeOppNativeInteropAcceptance, validateOppNativeInteropResult,
  validateOppNativeInteropAcceptance,
} from '../src/opp-native-interop.mjs';
export {
  LOCAL_FIRST_POLICY, classifyNetworkHost, inferBearerKind, endpointPolicy,
  enumerateLocalBearers, bearerScore, selectLocalBearer, makeBearerAdmissionFacts,
} from '../src/bearer-policy.mjs';
export {bindLocalNetworkTransport} from '../src/local-bearer.mjs';
export {
  DEFAULT_DISCOVERY_GROUP, DEFAULT_DISCOVERY_PORT, LanPeerDiscovery,
  createLanAdvertisement, verifyLanAdvertisement, admitDiscoveredPeer,
} from '../src/lan-discovery.mjs';
export {
  AGENT_ACTION_AUTHORITIES, evaluateAgentActionGuard,
} from '../adapters/rcl-agent-action-guard.mjs';
export {
  AGENT_ACTION_EFFECTS, evaluateAgentEffectGuard,
} from '../adapters/rcl-agent-effect-guard.mjs';
export {
  OPP_AGENT_ACTION_PROFILE, verifyOppAgentActionContract,
} from '../src/opp-agent-action-acceptance.mjs';
export {runGovernedAgentAction} from '../src/agent-action-executor.mjs';
