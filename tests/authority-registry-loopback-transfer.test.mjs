import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function runDemo() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/authority-registry-loopback-transfer-demo.mjs'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', chunk => { stderr += chunk.toString('utf8'); });
    child.once('error', reject);
    child.once('exit', code => {
      if (code !== 0) reject(new Error(`loopback transfer demo exited ${code}: ${stderr}`));
      else {
        try { resolve(JSON.parse(stdout)); }
        catch (error) { reject(new Error(`loopback transfer demo emitted invalid JSON: ${error.message}\n${stdout}`)); }
      }
    });
  });
}

test('TINP loopback DATA transport transfers public history and retains rejects', async () => {
  const result = await runDemo();
  assert.equal(result.status, 'VERIFIED_LOCAL_TINP_LOOPBACK_STATE_TRANSFER');
  assert.equal(result.transport, 'tcp');
  assert.equal(result.frameType, 'DATA');
  assert.equal(result.independentProcesses, true);
  assert.equal(result.independentDirectories, true);
  assert.equal(result.firstOperation, 'appended');
  assert.equal(result.localExtensionOperation, 'extended');
  assert.equal(result.networkTransferOperation, 'appended');
  assert.equal(result.importedOnSecondNode, true);
  assert.equal(result.networkReplayOperation, 'unchanged');
  assert.equal(result.secondNodeExtension, 'extended');
  assert.equal(result.reverseNetworkTransferOperation, 'extended');
  assert.equal(result.firstSequence, 1);
  assert.equal(result.lastSequence, 3);
  assert.ok(result.senderFrames >= 2);
  assert.ok(result.receiverFrames >= 2);
  assert.ok(result.senderBytes > 0);
  assert.equal(result.receiverInvalidFrames, 0);
  assert.equal(result.peerAuthenticationConfigured, true);
  assert.equal(result.forkDetected, true);
  assert.equal(result.forkRejectionCode, 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH');
  assert.equal(result.mirrorSetDriftDetected, true);
  assert.equal(result.mirrorSetDriftRejectionCode, 'AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT');
  assert.equal(result.sequenceGapDetected, true);
  assert.equal(result.sequenceGapRejectionCode, 'AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP');
  assert.equal(result.tamperedTransferDetected, true);
  assert.equal(result.tamperedTransferRejectionCode, 'AUTHORITY_REGISTRY_LOOPBACK_TRANSFER_INVALID');
  assert.equal(result.rejectedStateRetained, true);
  assert.equal(result.privateMaterialTransferred, false);
});
