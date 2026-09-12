import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  makeOppNativeInteropAcceptance,
  validateOppNativeInteropAcceptance,
  validateOppNativeInteropResult,
} from '../src/opp-native-interop.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixture = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'OPP_NATIVE_INTEROP_2026-09-12.json'), 'utf8'));

test('latest OPP native interop receipt is accepted without granting authority', () => {
  assert.equal(validateOppNativeInteropResult(fixture), true);
  const acceptance = makeOppNativeInteropAcceptance({ interopResult: fixture });
  assert.equal(acceptance.status, 'PASS');
  assert.equal(acceptance.authorityGranted, false);
  assert.equal(acceptance.sideEffects, false);
  assert.equal(validateOppNativeInteropAcceptance(acceptance, { interopResult: fixture }), true);
});

test('native interop receipt root tampering fails closed', () => {
  const forged = structuredClone(fixture);
  forged.receipt.finalResultRoot = '0'.repeat(64);
  assert.throws(() => validateOppNativeInteropResult(forged), /OPP_NATIVE_INTEROP_RECEIPT_ROOT_INVALID|OPP_NATIVE_INTEROP_RESULT_ROOT_INVALID/);
});

test('native interop authority promotion and sandbox overclaims fail closed', () => {
  const forged = structuredClone(fixture);
  forged.receipt.authority.promotionPerformed = true;
  assert.throws(() => validateOppNativeInteropResult(forged), /OPP_NATIVE_INTEROP_RECEIPT_ROOT_INVALID|OPP_NATIVE_INTEROP_RECEIPT_INVALID/);
  const sandbox = structuredClone(fixture);
  sandbox.consumer.receipt.executionBoundary.strongOsSandboxClaimed = true;
  assert.throws(() => validateOppNativeInteropResult(sandbox), /OPP_NATIVE_INTEROP_INVOCATION_ROOT_INVALID|OPP_NATIVE_INTEROP_INVOCATION_INVALID/);
});

test('acceptance root tampering fails closed', () => {
  const acceptance = makeOppNativeInteropAcceptance({ interopResult: fixture });
  acceptance.finalResultRoot = '0'.repeat(64);
  assert.throws(() => validateOppNativeInteropAcceptance(acceptance, { interopResult: fixture }), /OPP_NATIVE_INTEROP_ACCEPTANCE_INVALID|OPP_NATIVE_INTEROP_ACCEPTANCE_ROOT_INVALID/);
});
