# Native receipt canonical v0.2 — local review candidate

This additive candidate fixes cross-language numeric roots without rewriting v0.1 evidence. It is not a published protocol change. Adoption of the new profile requires explicit producer configuration and a v0.2-aware consumer.

Legacy behavior is unchanged: Python `content_root(value)` keeps its existing `json.dumps` encoding; TINP's global `rootHash` and vendored canonical code are untouched. Receipts with format v0.1 are validated with exactly the legacy hash, never by trying several digests. Some legacy floating-point results still cannot be imported through the parsed-object TINP API because their original Python numeric representation is lost. They must be regenerated with v0.2 or imported through a separately designed raw-byte interface; this candidate does not silently migrate them.

The new profile identifier is `opp.json-binary64.v1`. Native invocation and interop receipts use `taowind.opp.invocation-receipt.v0.2` and `taowind.opp.interop-receipt.v0.2`, and require an exact `canonicalProfile` equal to that identifier. All invocations in an interop receipt use the same profile. Unknown profiles, missing declarations, mixed versions and legacy hash substitution fail closed. No default, authority gate, retry policy or execution context is relaxed.

Canonical UTF-8 bytes are compact JSON for `{"profile":"opp.json-binary64.v1","value":NODE}`, in exactly that wrapper order. NODE is a typed representation:

| JSON value | NODE |
| --- | --- |
| null | ["null"] |
| boolean | ["boolean", true or false] |
| number | ["number", 16 lowercase hexadecimal digits] |
| string | ["string", original string] |
| array | ["array", [each encoded NODE, in original order]] |
| object | ["object", [[key, encoded NODE], ...]] |

Numbers use the eight IEEE-754 binary64 bytes in big-endian order. Integral floats and integers representing the same numeric value encode identically. Both signs of zero encode as positive zero. Nonfinite values and integral values outside [-9007199254740991, 9007199254740991] are rejected by this profile; arbitrary precision integers are not rounded into accepted evidence. Strings must be well-formed Unicode without lone surrogates. Object keys sort by unsigned UTF-16 code units; encoded key/value pairs avoid JavaScript's integer-key enumeration reordering. Strings use ordinary JSON escaping without ASCII-only escaping. The wrapper and all-node type tags prevent collisions between strings, numbers, ordinary objects and representation tags. This is a specified profile for this candidate, not a claim of RFC 8785 compliance.

Roots are SHA-256 of those exact UTF-8 bytes. Invocation `receiptRoot` still excludes `durationMs`, as in v0.1. Result, request, transformed and native receipt roots use the selected profile. The existing invocation/run specifications and bridge plan remain v0.1; `bridgePlanRoot` continues to bind its existing legacy plan encoding, with no rehash or mutation of historical plans. TINP's local acceptance envelope remains v1 and binds the validated native receipt root using its existing canonical mechanism.

Python APIs `run_invocation`, `run_interop` and `verify_interop_result` accept `canonical_profile=BINARY64_CANONICAL_PROFILE`. Their default remains `LEGACY_CANONICAL_PROFILE`; the verifier must be explicitly configured for the same profile as the producer. CLI `invoke run`, `interop run` and `interop verify` accept `--canonical-profile opp.json-binary64.v1`. TINP chooses a single hash mechanism from the exact incoming receipt format/profile and validates the complete graph before hashing. The v0.2 schema copies are bundled beside the untouched v0.1 schemas.

`tests/fixtures/native-canonical-vectors.json` contains fixed canonical bytes and SHA-256 roots, independently checked by Python and JavaScript. Separate real native results cover 20, 20.0, -0.0, 1e-7, 20.5, the safe integer boundary and Unicode. Invocation `authority.required` must be present as an array of strings; empty arrays are valid. Invocation `boundary` must be a string, including the empty string allowed by the shared schema. These fields declare shape, not a grant of execution authority.

Hash consistency remains an integrity check, not proof of business truth, authorization or execution. TINP's result-only API is not extended with original input/spec/runId/plan context. Fully rehashed forged business results and the context-scope differences reported in the combined benchmark are outside this fix.
