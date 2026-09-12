/** Verify a transferred OPP evidence directory against an out-of-band summary hash. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { rootHash } from '../src/identity.mjs';
import { makeOppNativeInteropAcceptance } from '../sdk/v1.mjs';

const [input, output, expectedHash] = process.argv.slice(2);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
try {
  if (!input || !output || !/^[a-f0-9]{64}$/.test(expectedHash ?? '')) throw new Error('INPUT_OUTPUT_EXPECTED_SUMMARY_SHA256_REQUIRED');
  const directory = resolve(input);
  const summaryBytes = readFileSync(join(directory, 'summary.json'));
  if (hash(summaryBytes) !== expectedHash) throw new Error('SUMMARY_HASH_MISMATCH');
  const summary = JSON.parse(summaryBytes);
  if (rootHash(summary.artifacts) !== summary.artifactRoot) throw new Error('ARTIFACT_ROOT_MISMATCH');
  for (const artifact of summary.artifacts) {
    if (!/^[a-zA-Z0-9._-]+$/.test(artifact.path)) throw new Error('ARTIFACT_PATH_REJECTED');
    if (hash(readFileSync(join(directory, artifact.path))) !== artifact.sha256) throw new Error('ARTIFACT_HASH_MISMATCH');
  }
  const rows = [];
  for (const project of ['boltons', 'more-itertools', 'jmespath']) {
    if (!summary.artifacts.some(artifact => artifact.path === `${project}-run.json`)) throw new Error('RUN_NOT_IN_MANIFEST');
    const run = JSON.parse(readFileSync(join(directory, `${project}-run.json`)));
    const acceptance = makeOppNativeInteropAcceptance({ interopResult: run.result });
    const recovery = makeOppNativeInteropAcceptance({ interopResult: run.recovered });
    if (run.negative?.receipt.status !== 'FAIL' || run.negative.consumer !== null) throw new Error('NEGATIVE_BOUNDARY_MISSING');
    const tampered = structuredClone(run.result);
    tampered.result = { replaced: true };
    let tamperRejected = false;
    try { makeOppNativeInteropAcceptance({ interopResult: tampered }); } catch { tamperRejected = true; }
    if (!tamperRejected) throw new Error('TAMPER_ACCEPTED');
    rows.push({ project, acceptance, recovery, tamperRejected });
  }
  const result = { status: 'PASS', summarySha256: expectedHash, rows, targetExecutions: 0, networkRequests: 0,
    platform: process.platform, nodeVersion: process.version,
    githubRunId: process.env.GITHUB_RUN_ID ?? null, githubSha: process.env.GITHUB_SHA ?? null,
    runnerOs: process.env.RUNNER_OS ?? null,
    boundary: 'Artifact handoff and cross-platform verification; no direct TINP transport, physical-host attestation, independent operator, trusted time or authority claim.' };
  writeFileSync(resolve(output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: result.status, projects: rows.length, platform: result.platform }));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAIL_CLOSED', error: error.code ?? error.message }));
  process.exitCode = 1;
}
