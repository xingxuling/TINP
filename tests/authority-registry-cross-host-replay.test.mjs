import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function runDemo() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/authority-registry-cross-host-replay-demo.mjs'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) reject(new Error(`cross-host replay demo exited ${code}: ${stderr}`));
      else {
        try { resolve(JSON.parse(stdout)); }
        catch (error) { reject(new Error(`cross-host replay demo emitted invalid JSON: ${error.message}\n${stdout}`)); }
      }
    });
  });
}

test('independent local hosts replay public history and retain unresolved conflicts', async () => {
  const result = await runDemo();
  assert.equal(result.status, 'VERIFIED_LOCAL_MULTI_PROCESS_CROSS_HOST_REPLAY');
  assert.equal(result.independentProcesses, true);
  assert.equal(result.independentDirectories, true);
  assert.equal(result.importedOnSecondHost, true);
  assert.equal(result.replayOperation, 'unchanged');
  assert.equal(result.secondHostExtension, 'extended');
  assert.equal(result.lastSequence, 3);
  assert.equal(result.forkDetected, true);
  assert.equal(result.forkRejectionCode, 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH');
  assert.equal(result.mirrorSetDriftDetected, true);
  assert.equal(result.mirrorSetDriftRejectionCode, 'AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT');
  assert.equal(result.sequenceGapDetected, true);
  assert.equal(result.sequenceGapRejectionCode, 'AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP');
  assert.equal(result.rejectedStateRetained, true);
  assert.equal(result.privateMaterialTransferred, false);
});
