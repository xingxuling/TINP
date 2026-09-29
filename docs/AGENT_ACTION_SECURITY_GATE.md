# TINP Agent Action Security Gate v0.1

This vertical slice tests one concrete security claim:

> A Code Agent may receive hostile or prompt-injected instructions, but a governed execution path rejects an action whose OPP-declared authority vector exceeds the authenticated TINP lease.

## Candidate execution path

```text
OPP agent-action contract
  -> TINP verifies profile + contractRoot
  -> RCL AgentActionAuthorityGate
  -> DENY: executor is not called
  -> ALLOW: bounded business executor runs
  -> observed effects
  -> RCL AgentActionEffectGate
  -> verified result / effect-violation
```

`runGovernedAgentAction()` is the candidate vertical-slice enforcement path. It proves that the supplied business callback is not called when contract acceptance or RCL authority admission fails. It is exported from the candidate SDK.

The RCL programs own authority admission and effect acceptance. JavaScript validates bounded input shape, verifies the OPP profile root, maps the fixed vocabulary to typed observations, invokes the RCL compiler/runtime, and projects the resulting gate state.

Current authority vocabulary:

- `workspace.read`
- `workspace.write`
- `process.spawn`
- `network.egress`
- `credential.read`
- `package.install`
- `scm.write`

Unknown authority is fail-closed.

## Covered negative cases

- prompt-injected credential read while only workspace read is leased;
- npm lifecycle script when `process.spawn` is not leased;
- Git push when `scm.write` is not leased;
- unknown authority;
- tampered OPP contract root;
- observed effect outside the accepted contract;
- denied action leaves business executor call count at zero.

## Integration boundary

This slice is **not yet inserted into the existing `src/node-process.mjs` count-service execution path**. It is a separate governed executor candidate so the security semantics can be tested without silently expanding the existing read-only protocol. Wiring real MCP / shell / npm / GitHub providers into it is the next integration step.

Post-action rejection is **not rollback** and does not prove that an already-completed external side effect was undone.

## Non-claims

This candidate does not prove OS-level non-bypassability, strong sandboxing, production key custody, trusted time, exactly-once external writes, or resistance to a compromised enforcement host. Those remain separate production gates.
