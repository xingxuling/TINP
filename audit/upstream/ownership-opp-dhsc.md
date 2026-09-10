# OPP / DHSC reality audit and ownership decision

Audit date: 2026-09-10. Read-only upstream inspection, isolated shallow clones, local execution. No Actions, push, merge or public deployment performed. All `sources/` reference files remained untouched.

## Current reality

| Repository | Observed remote main / local HEAD | Worktree | Pull requests | License |
| --- | --- | --- | --- | --- |
| xingxuling/OPP | f7b76582a720d9d18af5153affa0fc2d78bc0410, 2026-09-08, owned capability contract negotiation | clean before and after tests | `gh pr list --state all --limit 8`: empty | Public, no LICENSE found, API licenseInfo null |
| xingxuling/DHSC | b936d4bdeccbbe060bf7b2446ac5840d137f0765, 2026-09-08, ownership correction documentation | clean before and after tests | same query: empty | Private, no LICENSE found, API licenseInfo null |

No repository-local AGENTS.md was present in either clone. Current branch is main, tracking origin/main; snapshots are shallow, so historical exhaustiveness is not claimed. DHSC documents a preceding functional mainline commit; this audit uses its actual current HEAD, not that older narrative.

## Ownership findings with source evidence

All paths below are relative to `work/next-internet-audit/deps/`.

| Existing semantic / runtime | Owner and evidence | New Internet consequence |
| --- | --- | --- |
| RXP/RCP/RAP/REP/RSP/CHP protocol identities and schema family | OPP, `OPP/src/opp/resources/registry/protocols.json:17-22` | REUSE as interop and exchange profiles. Do not redeclare these protocol identities as new P00 ownership. |
| Validated CHP protocol/capability/scope intersection and evidence-policy compatibility | OPP, `OPP/src/opp/handshake.py:8-30`; agreement fields `:46-57` | P04 delegates agreement. Scopes are a declaration intersection, not an authority lease. |
| Exact capability ID + input/output schema contract acceptance | OPP, `OPP/src/opp/capability.py:33-74` | P04 delegates to `negotiate_capability`. It unions authority requirements and explicitly returns authorityGranted=false. |
| Static interface extraction, declarative bridge and real bounded native invocation | OPP, bridge modules; `OPP/src/opp/runtime/invoke.py:23-46`, `:92-152` | Reusable optional interop organ. It does not own subject routing or a distributed network. |
| Ecosystem source-bound registry, unique semantic owner validation, deterministic graph views | DHSC, `DHSC/src/dhsc/control.py:49-145`, `:147-170` | ADAPT as governance/directory donor, not automatic remote discovery or identity authority. |
| Single-target candidate route planning over registered capability declarations | DHSC, `DHSC/src/dhsc/control.py:367-395` | Keep ecosystem control-plane routing distinct from New Internet packet/multihop route semantics. |
| Narrow local execution policy | DHSC, `DHSC/src/dhsc/control.py:119-127`, `:396-415` | Only allowlisted seed-catalog with hash check and candidate.read. Never import registry scopes as a signed permission grant. |
| Model profiles and explicit-consent provider adapters | DHSC, `DHSC/src/dhsc/model_federation.py:766-805`, `:870-977` | Optional provider plane; OPP still owns agreement. Model execution quality and world authority are not established by adapter receipts. |

OPP is demonstrably larger than a handshake helper: six exchange protocols, integrity validation, static bridge tooling, and executed Python producer/consumer interop exist. It is not a demonstrated Internet transport or principal authority system. Native invocation records authority requirements but has no authenticated authority-lease verifier. The caller must provide its own policy gate. Its process environment stripping does not remove operating-system permissions; its code explicitly does not claim strong OS sandboxing (`invoke.py:80-88`).

DHSC already depends on the exact current OPP commit (`DHSC/pyproject.toml:10`). Its model path delegates both CHP and RCP. Its generic ecosystem route path only consumes CHP capability intersection; it must not be mistaken for full typed RCP agreement. New Internet can reuse the narrower primitives without adopting DHSC's entire registry and model lifecycle.

## Formal relationship decision

Original assumption: OPP might be a small handshake protocol; independent New Internet might reproduce capability agreement and evidence interchange.

Observed evidence: OPP owns a broader exchange-protocol family and actual exact RCP contract agreement, while DHSC demonstrably delegates negotiation after correcting duplicated ownership. Neither repository implements the requested Subject A → addressed multihop transport → Subject-preserving transaction loop.

Reasoning: merging repositories would couple exchange tooling, model/ecosystem governance, and network lifecycle without removing a demonstrated runtime gap. Copying agreement logic would create a second canonical owner. New Internet transaction semantics can reference OPP agreement roots and attach its own transport/session/evidence-chain facts without claiming ownership of OPP schemas.

New decision: **KEEP_SEPARATE + ADAPT**, using a thin adapter and a commit-pinned OPP package dependency. Package/dependency describes delivery, adapter describes semantic boundary; these are complementary. No merge or submodule is necessary. OPP versions and New Internet network-profile versions evolve independently; upgrades need differential compatibility tests. DHSC remains an optional control-plane donor/provider.

Impact: P04 invokes OPP CHP/RCP; P06 may wrap/reference REP while owning network event-chain ordering only; P00 contains compact references/transaction constraints, not duplicate exchange protocols. TINP's legacy local `toOppChpAgreement` is excluded from the new authoritative path. Its offer also has a schema-invalid top-level projectionRoot and requires REP without advertising REP; new adapter emits a valid sealed OPP offer with declared supported exchange protocols. No destructive TINP refactor is required.

Rollback: remove the new adapter/profile route and return to the previous isolated TINP candidate; upstream OPP and DHSC remain unchanged. Do not reinterpret legacy TINP projection results as upstream OPP agreement during rollback.

## Actual local validation

Executed on Windows / Python 3.11 using current checked-out source. Commands were run from the project root; PYTHONPATH selected these clones rather than an older global installation.

1. OPP: `python -X utf8 -m unittest discover -s work/next-internet-audit/deps/OPP/tests -v`. **37 pass, 3 fail, 1 error**: CLI child interpreters inherited CP950 and could not encode/decode Chinese text. Parent `-X utf8` alone does not configure those child interpreters.
2. OPP rerun with process-local `PYTHONUTF8=1`: **41/41 pass**. Log: `evidence/opp-tests-utf8.txt`. Covers schema drift, tampering, missing consent, path escape, symlink, timeout, output bounds, real Python interop and CLI.
3. DHSC with unmodified current OPP and `PYTHONUTF8=1`: **41 pass, 2 fail**. Log: `evidence/dhsc-tests-unpatched.txt`. Unicode query returned zero matches and a CLI Chinese result failed. OPP uses `-I`, which ignores Python environment flags; its child reads/writes locale text (`OPP/src/opp/runtime/child_python.py:49-51`, `:71`) while parent transmits UTF-8 bytes (`invoke.py:111-131`).
4. Created `.venv-opp-audit` with system site packages, installed current OPP non-editably using `pip install --no-deps --no-build-isolation`, and ran existing DHSC `scripts/patch_opp_utf8.py`. That script refuses non-venv targets and verifies baseline SHA-256 before editing only the installed child module. Original normalized hash eab6a18858549b9401d5372fdf593a24fea5d88d58096adb364050e48aac66a9; overlay hash 7986cbd964bbfe2069996c91503c31f5ffa0b5e0c68d332ae6e874e7ff10fa92.
5. DHSC under that installed overlay: **43/43 pass**, `evidence/dhsc-tests-overlay.txt`. Includes actual Unicode read-only seed-catalog subprocess/CLI execution, registry mutation, duplicate owner, scope denial, missing source and ambiguous route negatives. Fixture network/model tests do not establish live remote inference. No external provider or model execution was requested or performed by this audit.

Commands used for source reality: `gh repo list xingxuling --limit 200 --json name,url,defaultBranchRef,updatedAt`, shallow `gh repo clone`, `git log -1`, `git status --short`, `gh pr list`, `gh repo view --json isPrivate,licenseInfo`, and focused source/test searches. No GitHub Actions were run.

## Implemented adapter integration

The parent task authorized an internal first-party source snapshot for runnable delivery, rather than relying on an uninstalled package. `work/TaoWind-Next-Internet/vendor/opp/src/opp` is an unchanged byte copy of upstream source excluding caches; `source-manifest.json` binds files to the commit. `LICENSE-NOT-DECLARED.md` grants no license and marks internal-only scope. This is packaging of one owner, not a forked negotiation implementation.

`adapters/opp-negotiate.py` projects TINP Hello and P04 capability declarations into sealed envelopes, then calls upstream CHP and RCP. `adapters/opp-bridge.mjs` uses a bounded real Python process with UTF-8 bytes. `NEXT_INTERNET_PYTHON` optionally selects Python; `adapters/requirements.txt` explicitly declares jsonschema. Exact capability version equality is a profile precondition; upstream OPP does not negotiate that additional version field. Hello/subject authentication remains the transaction layer's responsibility.

Executed `node --test work/TaoWind-Next-Internet/tests/opp-bridge.test.mjs`: **4/4 pass**, including real Unicode identities, exact capability acceptance, schema mismatch, scope intersection, profile-version mismatch and missing schema rejection. Acceptance remains authorityGranted=false. No provider execution occurs inside this adapter.

## Stress and gate boundary

Stress cases: Windows locale corrupts Chinese transport; multiple capabilities/routes must remain explicit; source registration is not liveness; agreement is not authority; duplicated CHP implementation misses required-evidence policy.

Donor advantage: upstream OPP exact contract validation and non-authoritative receipts; DHSC mutation-resistant source registry and execution allowlist. Encoding repair is a host/provider implementation concern, not a new RCL primitive. Existing DHSC RCL ledger proposes K102 server::cli, K117 server::security-sensitive, K250 distributed-runtime::distributed; this audit does not re-adjudicate the matrix mapping or promote any cell.

EXPRESS/COMPILE/LOWER: no new RCL proof in this subtask. EXECUTE: current local Python interop and Node→Python OPP bridge. CORRECT/ROBUST: bounded suites as above, with baseline failures preserved. PERFORMANCE and AI_GENERATE: not evaluated here. EVIDENCE: local logs, exact source commits/hashes. No K400 cell PASS, public networking, military-grade resilience, production security, remote authentication, or deployment claim follows.

Prior-memory lookup was only a search aid to locate the user's OPP repository; current ownership conclusions were verified from source. Relevant registry entry: MEMORY.md:381 (search own GitHub before treating OPP absent).
