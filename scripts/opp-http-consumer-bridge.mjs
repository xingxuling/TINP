import fs from 'node:fs';
import { acceptOppHttpReadonlyConsumer } from '../src/opp-http-consumer-bridge.mjs';

function usage() {
  process.stderr.write('usage: node scripts/opp-http-consumer-bridge.mjs <plan.json> <policy.json> <request.json> <observation.json> <contract.json> [--out <result.json>]\n');
}

function load(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const args = process.argv.slice(2);
if (args.length < 5 || args.length > 7 || (args.length === 7 && args[5] !== '--out')) {
  usage();
  process.exitCode = 2;
} else {
  try {
    const [planFile, policyFile, requestFile, observationFile, contractFile] = args;
    const result = await acceptOppHttpReadonlyConsumer({
      plan: load(planFile),
      policy: load(policyFile),
      request: load(requestFile),
      observation: load(observationFile),
      consumerContract: load(contractFile),
    });
    const output = {
      format: 'twni.opp-http-consumer-bridge-run.v1',
      status: result.status,
      response: result.response,
      receipt: result.receipt,
      boundary: 'The bridge accepts only a supplied OPP negotiation and read-only receipt; it grants no authority or general network access',
    };
    const serialized = `${JSON.stringify(output, null, 2)}\n`;
    if (args.length === 7) fs.writeFileSync(args[6], serialized, { encoding: 'utf8', flag: 'wx' });
    else process.stdout.write(serialized);
    process.exitCode = result.status === 'PASS' ? 0 : 5;
  } catch (error) {
    process.stderr.write(`${error.code ?? 'OPP_HTTP_CONSUMER_BRIDGE_FAILED'}\n`);
    process.exitCode = 1;
  }
}
