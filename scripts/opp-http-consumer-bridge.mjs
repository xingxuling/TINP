import fs from 'node:fs';
import { acceptOppHttpReadonlyConsumer, acceptOppHttpReadonlyConsumerBundle } from '../src/opp-http-consumer-bridge.mjs';

function usage() {
  process.stderr.write('usage: node scripts/opp-http-consumer-bridge.mjs <plan.json> <policy.json> <request.json> <observation.json> <contract.json> [--out <result.json>]\n       node scripts/opp-http-consumer-bridge.mjs --bundle <bundle.json> [--out <result.json>]\n');
}

function load(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const args = process.argv.slice(2);
const bundleMode = args[0] === '--bundle';
const validArgs = bundleMode
  ? (args.length === 2 || (args.length === 4 && args[2] === '--out'))
  : (args.length === 5 || (args.length === 7 && args[5] === '--out'));
if (!validArgs) {
  usage();
  process.exitCode = 2;
} else {
  try {
    let bundle = null;
    if (bundleMode) bundle = load(args[1]);
    const result = bundleMode
      ? acceptOppHttpReadonlyConsumerBundle({ bundle })
      : await acceptOppHttpReadonlyConsumer({
        plan: load(args[0]),
        policy: load(args[1]),
        request: load(args[2]),
        observation: load(args[3]),
        consumerContract: load(args[4]),
      });
    const output = {
      format: 'twni.opp-http-consumer-bridge-run.v1',
      status: result.status,
      bundleRoot: bundle?.bundleRoot ?? null,
      response: result.response,
      receipt: result.receipt,
      boundary: 'The bridge accepts only a supplied OPP negotiation and read-only receipt; it grants no authority or general network access',
    };
    const serialized = `${JSON.stringify(output, null, 2)}\n`;
    const outputFile = bundleMode ? args[3] : args[6];
    if ((bundleMode && args.length === 4) || (!bundleMode && args.length === 7)) {
      fs.writeFileSync(outputFile, serialized, { encoding: 'utf8', flag: 'wx' });
    }
    else process.stdout.write(serialized);
    process.exitCode = result.status === 'PASS' ? 0 : 5;
  } catch (error) {
    process.stderr.write(`${error.code ?? 'OPP_HTTP_CONSUMER_BRIDGE_FAILED'}\n`);
    process.exitCode = 1;
  }
}
