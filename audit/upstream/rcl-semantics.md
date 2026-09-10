# RCL / RNCS / RFE current-source audit and executable admission profile

Audit date: 2026-09-10. Scope: independent bounded source audit plus the requested RCL admission adapter. No push, Actions dispatch, merge, old working-tree modification, native-VM execution, or RNCS runtime execution occurred.

## Source identity and reality audit

- RCL fresh shallow clone: `deps/RCL`, `https://github.com/xingxuling/RCL`, main `a7d6f7b0844323df50c91fd807ad3ee76e24f90d`; clean working tree after verification. Package `@taowind/rcl-reality-forge@0.94.0-alpha.1`, Apache-2.0. No repository AGENTS.md was found. Read `CURRENT-STATUS.md`, compiler, runtime, provider runtime, tests, typed examples, RNCS bridges and K400 matrix source.
- Current open PR listing includes #168 canonical Number round-trip, #57 dominance arena, #39 RBC domain-call, #36 K04 game. None are merged source for this implementation. In particular the native numeric round-trip frontier is outside this JS execution profile.
- RCL status document reports 24 admitted cells / 376 untested, K400 INCOMPLETE. This is a repository status claim; this audit neither revalidated all existing admissions nor creates a new one.
- Actual RNCS repository is `https://github.com/xingxuling/RNCS-Unified-Platform-`, default `main-95`, read head `09f11a88e56c93f3b295c767ff71f62f7e4f890f`. Bounded source copies are under `rncs-source/`; checked root registry, package layout, core contract, RFE SDK, access/transport/sovereignty and network protocol/authority code. No RNCS source was copied into the implementation.

## Canonical ownership decisions

| Surface | Existing source and capability | Decision |
|---|---|---|
| Authority predicates, governed transitions, evidence roots | RCL `src/compiler.mjs`, `src/runtime.mjs`; `subject`, `warrant`, `needs`, `when`, `alter`, `preserve`, `witness`; compiler/runtime reject invalid authority | REUSE RCL semantics and its existing JS runtime |
| Typed Shared IR definitions | RCL `src/type-module-kernel.mjs`, compiler typed-module linkage, `examples/typed-compiler/types/core.rcltype` record/union definitions | Existing expression support. Network Shared IR is a bounded interoperability profile, not proof of a missing RCL primitive |
| Host/provider execution | RCL `src/provider-runtime-v2.mjs` `createProviderRuntimeV2`, runtime actor policy, offers, authority needs, timeout/byte/concurrency controls and receipts | REUSE candidate provider organ; existing provider regression exercised 7/7 |
| RNCS world transition envelope | `packages/kernel/rncs-core-contract/src/index.mjs`: `newProposal`, `authorize`, `commit`, `proposalPayload`, roots | KEEP_SEPARATE. Internet admission does not create or own RNCS canonical world commits |
| RFE durable world fact store | `packages/kernel/rfe-core-sdk/src/index.mjs`: `RealityStore`, generations, identities/facts/relations, stale-base rejection, receipts, recovery/federation candidate | KEEP_SEPARATE. Do not reimplement this as an Internet P00 state store |
| RNCS access and interest query | `reality-access.mjs`: detail vector, horizon, interest graph, query; canonical_owner RNCS and nonauthoritative query outputs | ADAPT reference boundary; no world-state authority from discovery/ranking |
| RNCS transport/discovery/roaming | `reality-transport.mjs` v0.3: profile, packet, admission, node discovery/association/roaming; authority lease and committed receipt checks | ADAPT profile references when integrating RNCS. Existing source disproves a blank-slate network assumption; runtime is not validated here |
| Server pseudo-sovereignty | `server-sovereignty.mjs`: lease scope, canonical world root, migration constraints; canonical_write_authorized false | Preserve RNCS owner. Revocable execution lease does not transfer sovereignty |
| Game network sessions | `packages/network/reality-network-runtime/src/protocol.mjs` v0.2 snapshot/delta/correction; `authority.mjs` AAF player delegation, session/player/character/action/time checks | KEEP_SEPARATE domain profile; not sufficient evidence for a general Internet transport |

RCL `src/rncs-bridge.mjs::toRncsProposalInput` already converts realized RCL transitions into RNCS proposal input while leaving authorization and commit to RNCS. `src/rncs-runtime-binding.mjs` verifies shared world/state roots and authority/presentation packet binding. These are direct adapter precedents.

The inspected RCL `examples/rncs-rcl-control-plane/rcl/rfe.rcl` still includes static truth facets such as `commit.atomic : Truth = true`; those declarations alone are not runnable proof of atomic commit. The implemented admission profile below executes its predicate, rather than relying on similar declarative assertions.

## Delivered executable profile

Implementation paths in `../TaoWind-Next-Internet/`:

- `rcl/transaction.rcl`: one fixed RCL source program; 20 typed observation facets, authorized observation rule, actual RCL admission predicate and state transition.
- `adapters/rcl-guard.mjs`: `evaluateTransactionGuard(input)`. It validates and snapshots input data, compiles fixed source once, runs the RCL program with a restricted observation adapter, and projects `gate.allowed` plus program/state/source/facts roots and runtime history. It never computes the admission conjunction in JavaScript.
- `vendor/rcl/`: unmodified recursive static dependency closure of compiler/runtime, 25 files / 446,793 source bytes, Apache license and per-file SHA-256 `PROVENANCE.json` pinned to the source commit.
- `tests/rcl-guard.test.mjs`: semantic rejection, malformed input, injection-as-data, concurrency isolation and snapshot tests.

Usage:

```js
import { evaluateTransactionGuard } from './adapters/rcl-guard.mjs';
const decision = await evaluateTransactionGuard(authenticatedFacts);
if (!decision.allowed) return reject(decision.code);
// Dispatch only after this result and the surrounding authenticated runtime checks.
```

Required input fields:

```text
subjectId sessionSubjectId leaseSubjectId
worldId leaseWorldId capabilityId leaseCapabilityId
capabilityVersion providerCapabilityVersion contractRoot providerContractRoot
nowMs notBeforeMs expiresAtMs
signatureVerified sessionVerified revoked scopeAllowed securityFloorMet evidenceContinuous
```

Strings must be nonempty and bounded; timestamps must be nonnegative safe integers; Truth facts must be real booleans. Missing fields, accessors or invalid values fail closed before dispatch. RCL itself checks subject/world/capability/version/contract binding, `notBeforeMs <= nowMs < expiresAtMs`, verified identity/lease, revocation, scope, security floor and evidence continuity.

Return codes: `RCL_GUARD_ALLOWED`, `RCL_GUARD_DENIED`, `RCL_GUARD_INPUT_INVALID`, `RCL_GUARD_EXECUTION_FAILED`. Provider faults and compilation/runtime errors fail closed. Source is fixed, so facts cannot inject grammar and do not change `programRoot`.

Trust boundary: signature/session verification, server time, revocation lookup, scope observation and evidence continuity facts must come from authenticated server state. Passing client-provided booleans directly is an integration defect. The guard grants only this bounded protocol admission result: no durable-world commit, host process capability, production authorization, RCL Core promotion, or K400 admission. JS remains the explicitly named execution runtime. Fixed source has not been compiled through the native VM or self-hosted compiler in this audit.

## Actual verification and evidence

Run `node work/next-internet-audit/verify-rcl-audit.mjs` from the workspace root. Evidence is in `rcl-audit-evidence.json` with test transcripts `provider-runtime-v2.test.log` and `transaction-guard.test.log`.

- Provider Runtime v2 current-source tests: 7/7 passed.
- New RCL guard tests: 4/4 passed, including 15 independently denied semantic mutations and omission of every required field.
- Positive observation executes load/admit transitions; mismatched lease subject is denied by the same compiled RCL program.
- All 25 copied source SHA-256 values verified against provenance.
- Warm in-process guard 50 rounds: approximately 0.815 ms median and 1.449 ms p95 on this Windows Node v24.15.0 run. This excludes signature verification, network transport, disk receipt persistence, cold compilation and production load.
- Full RCL regression, RNCS execution, native compiler/VM, external-device, WAN and hosted CI: NOT_RUN.

## RCL stress / lowering / candidate ledger

Task: next-Internet signed-lease admission before provider dispatch.

Missing capability: no established missing RCL grammar/IR primitive was found for the bounded admission predicate. Current runtime has no generic initial-state override in `runReality`; existing typed host observation is reused to inject data. This is a provider/input binding need, not a proven Core gap.

Workaround/lowering: existing canonical compiler + JavaScript semantic runtime, byte-identical vendored source. Node crypto/HTTP and authenticated server context remain auxiliary providers. Donor advantage is the host's mature networking and cryptography, not authority ownership.

Gap type: candidate integration/profile stress case; generality unproven; candidate absorption requires independent repeated cross-project failures and Primitive/IR/Runtime/Profile comparison. No formal RCL_GAP claim or kernel change is made by this bounded audit.

Regression cases: missing evidence continuity, revoked lease, wrong world/subject/version/contract root, inclusive not-before and exclusive expiry boundaries, downgraded security facts, malformed data and concurrent requests. Candidate semantic artifact: fixed `rcl/transaction.rcl`; candidate only, no automatic Core absorption.

K400 IDs are derived by executing authoritative `src/universal-program-stress.mjs::campaignCellIdFor`, not invented labels:

| Cell | Environment | Program family | This audit |
|---|---|---|---|
| K057 | windows | security-sensitive | bounded guard stress, NOT_ADMITTED |
| K110 | server | distributed | integration target, NOT_ADMITTED |
| K117 | server | security-sensitive | admission target, NOT_ADMITTED |
| K250 | distributed-runtime | distributed | future cross-node target, NOT_ADMITTED |
| K257 | distributed-runtime | security-sensitive | future cross-node authority target, NOT_ADMITTED |

Nine gates remain separate. EXPRESS/COMPILE/LOWER/EXECUTE/CORRECT/ROBUST have bounded local evidence here; PERFORMANCE has only the declared local micro-measurement; independent AI_GENERATE and full cell EVIDENCE admission are not established. None of these partial facts close a K400 cell.

Memory quick pass: registry was used only to identify old provider/ownership audit leads (MEMORY.md lines 119, 302, 385-389); actual source identities and claims above were freshly inspected. Historical version counts were not used as current evidence.
