/** Opt-in live public HTTPS probes; six GETs, no credentials or hidden retries. */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import {
  makeOppHttpReadonlyPolicy, makeOppHttpReadonlyRequest,
  runOppHttpConsumerLive, validateOppHttpConsumerLiveResult,
  makeOppHttpConsumerLiveVerification,
} from '../sdk/v1.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out') throw new Error('Usage: node scripts/verify-external-http.mjs --out <new directory>');
const out = resolve(args[1]);
mkdirSync(out, { recursive: false });
const save = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
const projects = [
  { id: 'go-httpbin', source: 'https://github.com/mccutchen/go-httpbin', host: 'httpbingo.org',
    paths: ['/get', '/status/503'], fields: ['args', 'url'],
    good: 'https://httpbingo.org/get?opp=external-probe', bad: 'https://httpbingo.org/status/503', failureStatus: 503 },
  { id: 'open-meteo', source: 'https://github.com/open-meteo/open-meteo', host: 'api.open-meteo.com',
    paths: ['/v1/forecast'], fields: ['latitude', 'longitude', 'timezone'],
    good: 'https://api.open-meteo.com/v1/forecast?latitude=52.52&longitude=13.41',
    bad: 'https://api.open-meteo.com/v1/forecast?latitude=999&longitude=13.41', failureStatus: 400 },
];
const rows = [];
for (const project of projects) {
  const started = performance.now();
  const policy = makeOppHttpReadonlyPolicy({ policyId: project.id, allowedHosts: [project.host],
    allowedPathPrefixes: project.paths, responseFields: project.fields, timeoutMs: 12000, maxResponseBytes: 65536 });
  save(`${project.id}-policy.json`, policy);
  const steps = [];
  for (const [step, url] of [['initial', project.good], ['failure', project.bad], ['recovery', project.good]]) {
    const request = makeOppHttpReadonlyRequest({ policy, requestId: `${project.id}-${step}`, url });
    const result = await runOppHttpConsumerLive({ policy, request });
    validateOppHttpConsumerLiveResult(result, { policy, request });
    const prefix = `${project.id}-${step}`;
    save(`${prefix}-request.json`, request);
    save(`${prefix}-result.json`, result);
    const verification = makeOppHttpConsumerLiveVerification({ policy, request, result,
      policyBytes: readFileSync(join(out, `${project.id}-policy.json`)),
      requestBytes: readFileSync(join(out, `${prefix}-request.json`)),
      resultBytes: readFileSync(join(out, `${prefix}-result.json`)) });
    save(`${prefix}-verification.json`, verification);
    steps.push({ step, status: result.status, httpStatus: result.observation?.receipt.httpStatus ?? null,
      error: result.observation?.receipt.error ?? result.error, offlineVerified: verification.status });
  }
  const passed = steps[0].status === 'PASS' && steps[1].httpStatus === project.failureStatus
    && steps[1].status === 'FAIL_CLOSED' && steps[2].status === 'PASS';
  rows.push({ project: project.id, source: project.source, status: passed ? 'OBSERVED_FAILURE_AND_RECOVERY' : 'INCOMPLETE_EXTERNAL_RUN',
    steps, automatedRunSeconds: (performance.now() - started) / 1000,
    manualInterventions: ['read public API documentation', 'declare allowed host/paths and response fields'],
    humanMinutes: null, humanTimingStatus: 'NOT_MEASURED',
    automatic: ['OPP local CHP/RCP negotiation', 'bounded native HTTPS GET', 'projection and receipt binding', 'offline verification'],
    recovery: 'EXPLICIT_STATELESS_GET_AFTER_FAILURE', failover: 'NOT_RUN', independentOperator: false });
  console.log(JSON.stringify(rows.at(-1)));
}
save('summary.json', { status: rows.every(row => row.status === 'OBSERVED_FAILURE_AND_RECOVERY') ? 'PASS_BOUNDED_LIVE_PROBES' : 'INCOMPLETE', rows,
  boundary: 'Real remote services observed by a local TaoWind consumer. Negotiation is local; remote services do not speak OPP/TINP. No multi-hop routing, independent acceptance, authority, trusted time or production claim.' });
if (rows.some(row => row.status !== 'OBSERVED_FAILURE_AND_RECOVERY')) process.exitCode = 1;
