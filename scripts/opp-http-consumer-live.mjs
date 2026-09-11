import fs from 'node:fs';
import { runOppHttpConsumerLive, validateOppHttpConsumerLiveResult, validateOppHttpConsumerLiveVerification, OPP_HTTP_CONSUMER_LIVE_VERIFY_FORMAT, OPP_HTTP_CONSUMER_LIVE_VERIFY_BOUNDARY } from '../src/opp-http-consumer-live.mjs';
import { createHash } from 'node:crypto';

function usage() {
  process.stderr.write('usage: node scripts/opp-http-consumer-live.mjs <policy.json> <request.json> [--out <result.json>]\n');
  process.stderr.write('       node scripts/opp-http-consumer-live.mjs --verify <policy.json> <request.json> <result.json> [--out <verification.json>]\n');
}

function load(file) {
  const bytes = fs.readFileSync(file);
  return { value: JSON.parse(bytes.toString('utf8')), bytes };
}

const args = process.argv.slice(2);
const verifyMode = args[0] === '--verify';
const validArgs = verifyMode
  ? args.length === 4 || (args.length === 6 && args[4] === '--out')
  : args.length >= 2 && args.length <= 4 && (args.length !== 4 || args[2] === '--out');
if (!validArgs) {
  usage();
  process.exitCode = 2;
} else {
  try {
    if (verifyMode) {
      const policyInput = load(args[1]);
      const requestInput = load(args[2]);
      const resultInput = load(args[3]);
      const policy = policyInput.value;
      const request = requestInput.value;
      const result = resultInput.value;
      validateOppHttpConsumerLiveResult(result, { policy, request });
      const verification = {
        format: OPP_HTTP_CONSUMER_LIVE_VERIFY_FORMAT,
        status: 'PASS',
        resultStatus: result.status,
        networkRequests: 0,
        authorityGranted: false,
        inputs: {
          policyRoot: policy.policyRoot,
          requestRoot: request.requestRoot,
          acceptanceRoot: result.acceptance?.receipt?.acceptanceRoot ?? null,
          policyFileSha256: createHash('sha256').update(policyInput.bytes).digest('hex'),
          requestFileSha256: createHash('sha256').update(requestInput.bytes).digest('hex'),
          resultFileSha256: createHash('sha256').update(resultInput.bytes).digest('hex'),
        },
        boundary: OPP_HTTP_CONSUMER_LIVE_VERIFY_BOUNDARY,
      };
      validateOppHttpConsumerLiveVerification(verification, { policy, request, result, policyBytes: policyInput.bytes, requestBytes: requestInput.bytes, resultBytes: resultInput.bytes });
      const serialized = `${JSON.stringify(verification, null, 2)}\n`;
      if (args.length === 6) fs.writeFileSync(args[5], serialized, { encoding: 'utf8', flag: 'wx' });
      else process.stdout.write(serialized);
      process.exitCode = 0;
    } else {
    const policy = load(args[0]).value;
    const request = load(args[1]).value;
    const result = await runOppHttpConsumerLive({ policy, request });
    validateOppHttpConsumerLiveResult(result, { policy, request });
    const serialized = `${JSON.stringify(result, null, 2)}\n`;
    if (args.length === 4) fs.writeFileSync(args[3], serialized, { encoding: 'utf8', flag: 'wx' });
    else process.stdout.write(serialized);
    process.exitCode = result.status === 'PASS' ? 0 : 5;
    }
  } catch (error) {
    process.stderr.write(`${error.code ?? 'OPP_HTTP_CONSUMER_LIVE_FAILED'}\n`);
    process.exitCode = 1;
  }
}
