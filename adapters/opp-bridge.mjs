import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const adapter = fileURLToPath(new URL('./opp-negotiate.py', import.meta.url));
const LIMIT = 1_048_576;

/** Real upstream CHP/RCP invocation. Acceptance never authorizes execution. */
export async function negotiateOpp(request) {
  const input = Buffer.from(JSON.stringify(request), 'utf8');
  if (input.length > LIMIT) throw new Error('OPP_INPUT_LIMIT');
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.NEXT_INTERNET_PYTHON || 'python', ['-X', 'utf8', adapter], {
      windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const chunks = [], errors = [];
    let bytes = 0, settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('OPP_TIMEOUT')); }, 15000);
    child.on('error', error => finish(error));
    child.stdin.on('error', error => finish(error));
    for (const [stream, target] of [[child.stdout, chunks], [child.stderr, errors]]) {
      stream.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > LIMIT) { child.kill(); finish(new Error('OPP_OUTPUT_LIMIT')); }
        else target.push(chunk);
      });
    }
    child.on('close', code => {
      if (code !== 0) return finish(new Error(`OPP_FAILED: ${Buffer.concat(errors).toString('utf8')}`));
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { finish(new Error('OPP_INVALID_JSON')); }
    });
    child.stdin.end(input);
  });
}
