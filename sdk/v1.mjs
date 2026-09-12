/** Public v1 surface for the bounded read-only provider and offline verifier.
 * Existing TINP policy and OPP negotiation remain the implementations/owners.
 * General provider registration and physical multi-host execution are not exposed.
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
