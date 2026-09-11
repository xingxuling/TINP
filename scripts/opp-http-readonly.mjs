import fs from 'node:fs';
import { makeOppHttpReadonlyRequest, runOppHttpReadonly } from '../src/opp-http-readonly.mjs';

function usage() {
  process.stderr.write('usage: node scripts/opp-http-readonly.mjs <policy.json> <request.json> [--out <result.json>]\n');
}

function load(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 4 || (args.length === 4 && args[2] !== '--out')) {
  usage();
  process.exitCode = 2;
} else {
  try {
    const policy = load(args[0]);
    const requestFile = load(args[1]);
    const request = requestFile.requestRoot
      ? requestFile
      : makeOppHttpReadonlyRequest({ policy, ...requestFile });
    const result = await runOppHttpReadonly({ policy, request });
    const output = {
      format: 'twni.opp-http-readonly-run.v1',
      status: result.status,
      policyRoot: policy.policyRoot,
      requestRoot: request.requestRoot,
      response: result.response,
      receipt: result.receipt,
      boundary: 'The adapter proves only this explicit read-only request; it grants no authority or general network access',
    };
    const serialized = `${JSON.stringify(output, null, 2)}\n`;
    if (args.length === 4) fs.writeFileSync(args[3], serialized, { encoding: 'utf8', flag: 'wx' });
    else process.stdout.write(serialized);
    process.exitCode = result.status === 'PASS' ? 0 : 5;
  } catch (error) {
    process.stderr.write(`${error.code ?? 'OPP_HTTP_READONLY_FAILED'}\n`);
    process.exitCode = 1;
  }
}
