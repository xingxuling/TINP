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
  AGENT_ACTION_FORMAT, KNOWN_AGENT_EFFECTS, AgentActionPolicyError,
  verifyOppActionContract, makeAgentActionAdmissionFacts, verifyObservedAgentAction,
} from '../src/agent-action-policy.mjs';
export {
  LOCAL_FIRST_POLICY, classifyNetworkHost, inferBearerKind, endpointPolicy,
  enumerateLocalBearers, bearerScore, selectLocalBearer, makeBearerAdmissionFacts,
} from '../src/bearer-policy.mjs';
export {bindLocalNetworkTransport} from '../src/local-bearer.mjs';
export {
  DEFAULT_DISCOVERY_GROUP, DEFAULT_DISCOVERY_PORT, LanPeerDiscovery,
  createLanAdvertisement, verifyLanAdvertisement, admitDiscoveredPeer,
} from '../src/lan-discovery.mjs';

export {admitAgentAction} from '../src/agent-action-admission.mjs';

export {
  OPP_MCP_ACTION_BINDING_FORMAT, McpActionBindingError,
  normalizeMcpToolDescriptor, verifyOppMcpActionBinding, verifyListedMcpToolAgainstBinding,
} from '../src/mcp-action-binding.mjs';
export {GuardedMcpToolGateway, GuardedToolGatewayError} from '../src/guarded-tool-gateway.mjs';
export {GuardedMcpRegistry, GuardedMcpRegistryError} from '../src/guarded-mcp-registry.mjs';
export {createBoundedWorkspaceReadProvider, BoundedWorkspaceProviderError} from '../src/providers/bounded-workspace-read.mjs';
export {createBoundedWorkspaceCreateProvider, BoundedWorkspaceCreateProviderError} from '../src/providers/bounded-workspace-create.mjs';
export {
  createGuardedOfficialMcpServer, createDefaultGuardedOfficialMcpServer,
  loadWorkspaceReadBinding, loadWorkspaceCreateBinding, GuardedOfficialMcpServerError,
} from '../src/official-mcp-server.mjs';
export {GuardedMcpAuditLedger} from '../src/guarded-mcp-audit.mjs';
