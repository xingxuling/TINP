# Read-only Provider SDK candidate — surface v1

This exposes the existing bounded HTTPS provider, local OPP negotiation and offline
receipt checks through one documented import. It is not a general registerProvider
API, a production stability declaration or a network authority service.

```powershell
npm pack --pack-destination C:/packages
# In the consumer's own directory:
npm install --ignore-scripts C:/packages/taowind-tinp-suite-0.1.0-alpha.29.tgz
python -m pip install jsonschema
```

The current package remains private and unreleased, with the inherited candidate
version; identify a build by its SHA-256. Node 22+ and Python 3.10+ are required for
live OPP negotiation. Set NEXT_INTERNET_PYTHON if Python is not on PATH. Pure offline
native receipt verification needs only Node.

```javascript
import {
  makeOppHttpReadonlyPolicy, makeOppHttpReadonlyRequest,
  runOppHttpConsumerLive, validateOppHttpConsumerLiveResult,
} from '@taowind/tinp-suite/sdk/v1.mjs';

const policy = makeOppHttpReadonlyPolicy({
  policyId: 'my-weather-observer',
  allowedHosts: ['api.open-meteo.com'],
  allowedPathPrefixes: ['/v1/forecast'],
  responseFields: ['latitude', 'longitude', 'timezone'],
});
const request = makeOppHttpReadonlyRequest({
  policy, requestId: 'weather-1',
  url: 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41',
});
const result = await runOppHttpConsumerLive({ policy, request });
validateOppHttpConsumerLiveResult(result, { policy, request });
console.log(result.status, result.observation?.receipt.error);
```

OPP owns CHP/RCP agreement; TINP owns the HTTP policy and observation binding.
Negotiation is local between the adapter's declarations. Open-Meteo does not claim
to implement either protocol. This path does not enter the three-node authorized
suite or inherit its routing/failover guarantees.

The default transport now reuses the previously audited explicit Node HTTPS
implementation instead of global fetch. The live orchestration no longer silently
supplies global fetch either. Existing explicit fetchImpl test injection remains
supported. Test injection is caller-controlled and is not a security boundary.

Requests are explicit HTTPS GETs, with bounded timeout/response size, host/path
allowlists, projection, no ambient credentials, no redirects or automatic retries.
Invalid policy/request inputs throw. A network/service failure is returned as
FAIL_CLOSED with diagnostic receipt. Verification PASS can mean a failure artifact
was internally consistent: always inspect resultStatus before accepting success.

## Offline review

Use `makeOppHttpConsumerLiveVerification` and
`validateOppHttpConsumerLiveVerification` with separately retained policy/request/
result bytes, or the existing `opp-http-consumer-live` verify CLI. These preserve
the current exact-shape, input-file-hash and semantic-root rules.

For successful OPP native interop evidence exported by the OPP experiment:

```powershell
node scripts/external-verify.mjs C:/opp-evidence/boltons-run.json C:/review/boltons.json
```

This makes a TINP receipt with the input file hash and uses the existing independent
JavaScript implementation. It makes zero target calls and zero network requests.
The input directory and output parent must already exist; output creation is
exclusive. A malformed/tampered result exits nonzero. The same TaoWind operator
running another implementation is not an independent third-party attestation.

## Repeat live external probes

```powershell
node scripts/verify-external-http.mjs --out C:/new-live-evidence
```

The new directory's parent must exist. This intentionally makes six public GETs
across go-httpbin/httpbingo and Open-Meteo, retaining success, failure and explicit
stateless recovery probes. No credentials or private user data are sent. Public
endpoint availability may change. The command exits nonzero if a scenario is
incomplete and preserves failure evidence; do not replace it with a fixture.

SDK_API_VERSION is 1; incompatible supported-surface changes will require a new
major surface. Existing deep imports and protocol formats remain available. We
have not added an exports map that would break existing integrations.
