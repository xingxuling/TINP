# TINP Agent Action Security Gate v0.1

This vertical slice tests one concrete security claim:

> A Code Agent may receive hostile or prompt-injected instructions, but the execution node still rejects any action whose OPP-declared authority vector exceeds the authenticated TINP lease.

## Pre-execution path

```text
OPP agent-action contract
  -> contract root verified by caller/integration adapter
  -> authenticated subject + active lease
  -> RCL AgentActionAuthorityGate
  -> ALLOW / DENY
  -> only ALLOW may enter the business executor
```

The RCL program is the admission owner. JavaScript only validates input shape, maps a bounded authority vocabulary to typed observations, runs the canonical RCL compiler/runtime, and projects the resulting gate state.

Current authority vocabulary:

- `workspace.read`
- `workspace.write`
- `process.spawn`
- `network.egress`
- `credential.read`
- `package.install`
- `scm.write`

Unknown authority is fail-closed.

## Post-execution path

`AgentActionEffectGate` compares observed effects with the side effects declared by the accepted OPP contract. An undeclared effect such as `credential.read` causes the result to be rejected as a contract violation. This is **not rollback** and does not prove that an already-completed external side effect was undone.

## Covered negative cases

- prompt-injected credential read while only workspace read is leased;
- npm lifecycle script when `process.spawn` is not leased;
- Git push when `scm.write` is not leased;
- unknown authority;
- observed effect outside the accepted contract.

## Non-claims

This candidate does not prove OS-level non-bypassability, strong sandboxing, production key custody, trusted time, exactly-once external writes, or resistance to a compromised enforcement host. Those remain separate production gates.
