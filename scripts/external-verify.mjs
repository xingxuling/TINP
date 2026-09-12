/** Offline cross-language receipt check. No Python, network, or re-execution. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import {
  makeOppNativeInteropAcceptance, validateOppNativeInteropAcceptance,
} from '../sdk/v1.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/external-verify.mjs <OPP project-run.json> <new receipt.json>');
  process.exitCode = 2;
} else {
  try {
    const bytes = readFileSync(resolve(input));
    const run = JSON.parse(bytes);
    const acceptance = makeOppNativeInteropAcceptance({ interopResult: run.result });
    validateOppNativeInteropAcceptance(acceptance, { interopResult: run.result });
    const receipt = {
      status: 'PASS', project: run.project,
      inputSha256: createHash('sha256').update(bytes).digest('hex'),
      acceptance, networkRequests: 0, targetExecutions: 0,
      boundary: 'Different implementation language, same TaoWind operator. No independent operator or execution attestation.',
    };
    writeFileSync(resolve(output), JSON.stringify(receipt, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify(receipt));
  } catch (error) {
    console.error(JSON.stringify({ status: 'FAIL_CLOSED', error: error.code ?? error.message }));
    process.exitCode = 1;
  }
}
