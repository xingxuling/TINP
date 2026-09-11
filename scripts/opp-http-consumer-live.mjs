import fs from 'node:fs';
import { runOppHttpConsumerLive, validateOppHttpConsumerLiveResult } from '../src/opp-http-consumer-live.mjs';

function usage() {
  process.stderr.write('usage: node scripts/opp-http-consumer-live.mjs <policy.json> <request.json> [--out <result.json>]\n');
  process.stderr.write('       node scripts/opp-http-consumer-live.mjs --verify <policy.json> <request.json> <result.json>\n');
}

function load(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const args = process.argv.slice(2);
const verifyMode = args[0] === '--verify';
const validArgs = verifyMode
  ? args.length === 4
  : args.length >= 2 && args.length <= 4 && (args.length !== 4 || args[2] === '--out');
if (!validArgs) {
  usage();
  process.exitCode = 2;
} else {
  try {
    if (verifyMode) {
      const policy = load(args[1]);
      const request = load(args[2]);
      const result = load(args[3]);
      validateOppHttpConsumerLiveResult(result, { policy, request });
      process.stdout.write(`${JSON.stringify({
        format: 'twni.opp-http-consumer-live-verify.v1',
        status: 'PASS',
        resultStatus: result.status,
        networkRequests: 0,
        authorityGranted: false,
        boundary: 'Offline validation of a saved live consumer result; no network request or authority grant',
      }, null, 2)}\n`);
      process.exitCode = 0;
    } else {
    const policy = load(args[0]);
    const request = load(args[1]);
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
