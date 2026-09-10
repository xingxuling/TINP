# Owner boundaries and session migration court

This decision reviews the current `src/routing.mjs`, `src/suite.mjs`, `src/node-process.mjs`, RCL admission adapter and the previously inspected RNCS source. It does not declare a new universal protocol owner or an RNCS runtime integration.

## Decision

The suite may define a namespaced `twni.session.v0.1` and `twni.authority-lease.v0.1` as its bounded Internet execution profile. That profile binds an authenticated subject to an existing world reference, a scoped read-only capability, a session lifetime and continuity evidence. It must not create RNCS world facts, approve an RNCS transition, mutate an RNCS generation or transfer world ownership. RCL remains the source of executable admission and migration invariants; network and cryptographic implementations remain auxiliary providers.

Referencing an RNCS world or lease is a reasonable ADAPT design decision, but a reference string alone is not an implemented RNCS adapter. The current fixture uses its own pinned ephemeral authority and world identifier. No runtime resolver, signed RNCS lease translation, authority receipt import or RNCS commit verification has been exercised here. The precise present classification is **independent Internet profile with an ADAPT mapping candidate; RNCS runtime integration NOT_IMPLEMENTED**.

## Current source ownership

| Source | Real behavior | Owner and evidence limit |
|---|---|---|
| `routing.mjs` | Reuses TINP `RouteGraph`; enumerates candidate paths and filters cost, latency, energy, region, hops and bandwidth in JavaScript | TINP topology reuse; specialized path search provider. Trusted metric aggregation feeds the separate fixed RCL route admission guard before dispatch |
| `suite.mjs` | Local orchestration, node trust fixture, capability negotiation, signed Internet lease/session, fallback and source migration | Product/profile composition. Ephemeral key signing does not prove production enrollment or RNCS authority |
| `node-process.mjs` | Verifies request/session/lease signatures, binds actual forwarding path, invokes RCL transaction guard, executes one pure capability, signs a receipt | Node crypto/transport/provider execution; RCL owns bounded transaction admission. World writes are rejected by the read-only profile |
| `rcl/transaction.rcl` | Executable subject/world/capability/version/contract/time/authority/evidence admission | RCL source, canonical compiler and JS runtime; local lowered-execution evidence |
| `rcl/migration.rcl` | Executable preservation of subject, continuity root and world; no lifetime increase or scope expansion | RCL source and JS runtime. The scope subset relation is an explicitly named host observation |
| `rcl/route.rcl` | Executable total cost, latency, energy, region, reachability and security admission | RCL source and JS runtime. Graph search and trusted topology measurements remain auxiliary provider work |

RNCS has overlapping domain-specific surfaces: `rncs-core-contract/src/reality-transport.mjs` v0.3 verifies packets against authority leases and committed authority receipts; `server-sovereignty.mjs` preserves world root and lease-scoped revocable execution during migration; `reality-access.mjs` marks queries as nonauthoritative. These are reference contracts for a future RNCS adapter, not vacant semantics to redefine as TWNI-owned world authority.

The RNCS transport lease uses authority/shard/semantic-scope/node/tick/current-lease concepts. The Internet profile uses subject/capability/world/session and wall-clock expiry under a local trust fixture. Field renaming cannot establish equivalence. A future adapter needs explicit scope attenuation, time-domain conversion, issuer/key pinning, current lease/revocation checks, receipt-root verification and negative controls. Where equivalence is unproven, it must deny or return UNKNOWN rather than issuing a stronger local lease.

## Executable migration contract

API exported from `adapters/rcl-guard.mjs`:

```js
await evaluateSessionMigrationGuard({
  oldSubjectId, newSubjectId,
  oldContinuityRoot, newContinuityRoot,
  oldWorldId, newWorldId,
  oldExpiresAtMs, newExpiresAtMs,
  oldScopes, newScopes,
});
```

The adapter snapshots bounded primitive data and unique scope arrays. Empty scope sets are allowed as attenuation. It computes only the set relation `newScopes ⊆ oldScopes` and supplies that relation as an observation; callers cannot override it by passing `scopeSubset`. The fixed RCL program loads facts and admits only if all four identity/time comparisons and the subset fact hold. Changing observed values cannot change the compiled program root.

Call this before signing or replacing a previous session. Bind its program/state/source/facts roots to the migration evidence. Inputs must be the authenticated previous session and proposed replacement. If no previous session exists, first-session admission is a separate lease-binding operation. An expiry that is not extended may still already be expired; transaction admission must continue checking `notBefore <= now < expiry` before execution. This migration guard grants no session signature or world mutation by itself.

Codes: `RCL_MIGRATION_ALLOWED`, `RCL_MIGRATION_DENIED`, `RCL_MIGRATION_INPUT_INVALID`, `RCL_MIGRATION_EXECUTION_FAILED`.

## Explicit gap and stress record

**RCL_INTEGRATION_GAP_ROUTE_POLICY_ADMISSION**: at review start, route policy comparisons existed only in host code. Fixed `rcl/route.rcl` and `adapters/rcl-route-guard.mjs::evaluateRouteAdmissionGuard` now execute final policy admission using the existing RCL compiler/runtime. Status: **GUARD_IMPLEMENTED / CANDIDATE_CLOSURE_AFTER_INTEGRATION**. Closure requires trusted topology metric aggregation, authenticated lease/provider facts, caller wiring before execution and integrated negative controls. Host graph search remains a specialized provider; no missing Core grammar/primitive is established, and this candidate profile is not a complete RCL routing engine.

**RCL_INTEGRATION_GAP_SESSION_MIGRATION**: at review start, `suite.mjs::bindSession` performed the migration conjunction in JS. The new fixed RCL guard provides the executable replacement. Closure requires caller wiring before session signing and an integrated denied-migration regression; the guard unit tests alone do not establish integration closure.

These are project integration gaps, not proven missing Primitive/IR/Runtime/Profile capabilities and not automatically promotable RCL Core gaps. A future schema/primitive proposal needs independent cross-project evidence and a governed owner decision. RNCS semantic equivalence remains a separate adapter question.

Tests added: `tests/rcl-migration.test.mjs`, four cases covering positive attenuation, each independently denied identity/continuity/world/expiry/scope mutation, missing or malformed inputs, accessor/sparse/duplicate scopes, concurrent runs and asynchronous input mutation. Combined with the transaction guard, 8/8 local tests passed when added. Full product integration is verified by the enclosing suite, not inferred here.

The route extension adds `tests/rcl-route.test.mjs` with four cases: fractional and inclusive budget boundaries, zero local route, each budget/region/reachability/security failure, missing/malformed data and concurrent snapshot isolation. All three guard files passed **12/12 local tests** when this extension was added.

Route API:

```js
await evaluateRouteAdmissionGuard({
  routeCost, providerCost, maxCost,
  routeLatencyMs, maxLatencyMs,
  routeEnergy, maxEnergy,
  routeRegion, leaseRegion,
  routeReachable, securityFloorMet,
});
```

Metrics are nonnegative finite numbers up to `Number.MAX_SAFE_INTEGER`, with fractions allowed under the existing RCL JS Number semantics; no exact-decimal accounting claim is made. Regions are bounded nonempty strings and observations are strict booleans. RCL itself decides `routeCost + providerCost <= maxCost`, latency/energy limits, region equality, reachability and security floor. Codes are `RCL_ROUTE_ALLOWED`, `RCL_ROUTE_DENIED`, `RCL_ROUTE_INPUT_INVALID`, `RCL_ROUTE_EXECUTION_FAILED`. The caller must use trusted topology aggregation, not signed client assertions about route cost or region.

Candidate K400 mapping remains K057/K117 for bounded security-sensitive execution and K250/K257 for future distributed integration. No cell is admitted by this document. The RCL runtime path remains lowered-execution, with no native-VM or hosted-CI claim.
