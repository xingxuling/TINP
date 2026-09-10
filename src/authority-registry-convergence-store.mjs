import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { acquireDirectoryLease } from './directory-lease.mjs';
import { ProtocolError, rootHash } from './identity.mjs';
import { verifyAuthorityRegistryDistribution } from './authority-registry-distribution.mjs';
import { CONVERGENCE_FORMAT, makeAuthorityRegistryConvergenceBundle,
  validateAuthorityRegistryConvergenceBundle, verifyAuthorityRegistryConvergence } from './authority-registry-convergence.mjs';

export const CONVERGENCE_STORE_FORMAT = 'twni.authority-registry-convergence-store.v1';
export const CONVERGENCE_STORE_MAX_BYTES = 32 * 1024 * 1024;

const HASH = /^[a-f0-9]{64}$/;
const STORE_KEYS = ['format', 'distributionId', 'distributionPolicyRoot', 'registryId',
  'historyRoot', 'firstSequence', 'lastSequence', 'bundles', 'updatedAtMs'];

const fail = code => { throw new ProtocolError(code); };
const check = (ok, code) => { if (!ok) fail(code); };

function plain(value) {
  try {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  } catch { return false; }
}

function exact(value, fields, code) {
  check(plain(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key)), code);
  for (const key of fields) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { fail(code); }
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function strictArray(value, code) {
  check(Array.isArray(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(Object.getPrototypeOf(value) === Array.prototype && keys.length === value.length + 1
    && keys.includes('length') && keys.every(key => key === 'length' || (typeof key === 'string' && /^\d+$/.test(key) && Number(key) < value.length)), code);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function hash(value) { return typeof value === 'string' && HASH.test(value); }
function safeNonNegative(value) { return Number.isSafeInteger(value) && value >= 0; }

function noPrivateMaterial(value) {
  if (typeof value === 'string') return !/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(value);
  if (Array.isArray(value)) return value.every(noPrivateMaterial);
  if (plain(value)) return Reflect.ownKeys(value).every(key => noPrivateMaterial(value[key]));
  return true;
}

function childRoot(bundle) { return rootHash(bundle); }

function storeBundle(state) {
  return { format: CONVERGENCE_FORMAT, distributionId: state.distributionId,
    distributionPolicyRoot: state.distributionPolicyRoot, registryId: state.registryId,
    bundles: state.bundles, historyRoot: state.historyRoot };
}

export function validateAuthorityRegistryConvergenceStoreState(state) {
  exact(state, STORE_KEYS, 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_INVALID');
  check(state.format === CONVERGENCE_STORE_FORMAT && identifier(state.distributionId)
    && hash(state.distributionPolicyRoot) && identifier(state.registryId)
    && Number.isSafeInteger(state.firstSequence) && state.firstSequence > 0
    && Number.isSafeInteger(state.lastSequence) && state.lastSequence >= state.firstSequence
    && safeNonNegative(state.updatedAtMs), 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_INVALID');
  strictArray(state.bundles, 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_BUNDLES_INVALID');
  check(state.bundles.length > 0, 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_BUNDLES_INVALID');
  const bundle = storeBundle(state);
  try { validateAuthorityRegistryConvergenceBundle(bundle); } catch { fail('AUTHORITY_REGISTRY_CONVERGENCE_STORE_BUNDLES_INVALID'); }
  check(state.firstSequence === bundle.bundles[0].registry.body.sequence
    && state.lastSequence === bundle.bundles.at(-1).registry.body.sequence,
  'AUTHORITY_REGISTRY_CONVERGENCE_STORE_INVALID');
  check(bundle.historyRoot === state.historyRoot && noPrivateMaterial(state),
    'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PRIVATE_MATERIAL');
  return true;
}

export function makeAuthorityRegistryConvergenceStoreState({ convergenceBundle, updatedAtMs = Date.now() } = {}) {
  validateAuthorityRegistryConvergenceBundle(convergenceBundle);
  check(safeNonNegative(updatedAtMs), 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_INVALID');
  const state = { format: CONVERGENCE_STORE_FORMAT, distributionId: convergenceBundle.distributionId,
    distributionPolicyRoot: convergenceBundle.distributionPolicyRoot, registryId: convergenceBundle.registryId,
    historyRoot: convergenceBundle.historyRoot, firstSequence: convergenceBundle.bundles[0].registry.body.sequence,
    lastSequence: convergenceBundle.bundles.at(-1).registry.body.sequence,
    bundles: convergenceBundle.bundles, updatedAtMs };
  validateAuthorityRegistryConvergenceStoreState(state);
  return state;
}

export function convergenceBundleFromStoreState(state) {
  validateAuthorityRegistryConvergenceStoreState(state);
  return storeBundle(state);
}

function verifyLatestCurrent({ distributionPolicy, convergenceBundle, registryPolicy, issuerKeyring,
  mirrorKeyring, nowMs }) {
  const latestIndex = convergenceBundle.bundles.length - 1;
  const latest = convergenceBundle.bundles[latestIndex];
  const previousRegistry = latestIndex > 0 ? convergenceBundle.bundles[latestIndex - 1].registry : null;
  return verifyAuthorityRegistryDistribution({ distributionPolicy, bundle: latest, registryPolicy,
    issuerKeyring, previousRegistry, mirrorKeyring, nowMs, requireCurrent: true });
}

/** Verify a durable store while allowing older receipts to age out; the latest snapshot must be current when requested. */
export function verifyAuthorityRegistryConvergenceStore({ state, distributionPolicy, registryPolicy,
  issuerKeyring, mirrorKeyring, nowMs = Date.now(), requireCurrent = true } = {}) {
  validateAuthorityRegistryConvergenceStoreState(state);
  const convergenceBundle = convergenceBundleFromStoreState(state);
  const verification = verifyAuthorityRegistryConvergence({ distributionPolicy, convergenceBundle,
    registryPolicy, issuerKeyring, mirrorKeyring, nowMs, requireCurrent: false });
  if (requireCurrent) verifyLatestCurrent({ distributionPolicy, convergenceBundle, registryPolicy,
    issuerKeyring, mirrorKeyring, nowMs });
  return { ...verification, storeFormat: CONVERGENCE_STORE_FORMAT, updatedAtMs: state.updatedAtMs,
    currentLatest: requireCurrent };
}

function assertSamePrefix(existing, candidate) {
  check(candidate.bundles.length >= existing.bundles.length,
    'AUTHORITY_REGISTRY_CONVERGENCE_STORE_ROLLBACK');
  for (let index = 0; index < existing.bundles.length; index++) {
    check(childRoot(candidate.bundles[index]) === childRoot(existing.bundles[index]),
      'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH');
  }
}

export function appendAuthorityRegistryConvergenceStore({ existingState = null, convergenceBundle,
  distributionPolicy, registryPolicy, issuerKeyring, mirrorKeyring, nowMs = Date.now(),
  updatedAtMs = nowMs, requireCurrent = true } = {}) {
  validateAuthorityRegistryConvergenceBundle(convergenceBundle);
  const candidateVerification = verifyAuthorityRegistryConvergenceStore({
    state: makeAuthorityRegistryConvergenceStoreState({ convergenceBundle, updatedAtMs }),
    distributionPolicy, registryPolicy, issuerKeyring, mirrorKeyring, nowMs, requireCurrent,
  });
  if (existingState === null) {
    return { status: 'appended', appendedBundles: convergenceBundle.bundles.length,
      state: makeAuthorityRegistryConvergenceStoreState({ convergenceBundle, updatedAtMs }),
      verification: candidateVerification };
  }
  validateAuthorityRegistryConvergenceStoreState(existingState);
  check(existingState.distributionId === convergenceBundle.distributionId
    && existingState.distributionPolicyRoot === convergenceBundle.distributionPolicyRoot
    && existingState.registryId === convergenceBundle.registryId,
  'AUTHORITY_REGISTRY_CONVERGENCE_STORE_POLICY_MISMATCH');
  const existingBundle = convergenceBundleFromStoreState(existingState);
  verifyAuthorityRegistryConvergenceStore({ state: existingState, distributionPolicy, registryPolicy,
    issuerKeyring, mirrorKeyring, nowMs, requireCurrent: false });
  assertSamePrefix(existingBundle, convergenceBundle);
  if (convergenceBundle.bundles.length === existingBundle.bundles.length) {
    check(convergenceBundle.historyRoot === existingBundle.historyRoot,
      'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PREFIX_MISMATCH');
    return { status: 'unchanged', appendedBundles: 0, state: existingState,
      verification: candidateVerification };
  }
  const state = makeAuthorityRegistryConvergenceStoreState({ convergenceBundle, updatedAtMs });
  return { status: 'extended', appendedBundles: state.bundles.length - existingState.bundles.length,
    state, verification: candidateVerification };
}

export function readAuthorityRegistryConvergenceStore(file) {
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.size > CONVERGENCE_STORE_MAX_BYTES) throw new Error();
    const state = JSON.parse(fs.readFileSync(file, 'utf8'));
    validateAuthorityRegistryConvergenceStoreState(state);
    return state;
  } catch (error) {
    if (error instanceof ProtocolError) throw error;
    fail('AUTHORITY_REGISTRY_CONVERGENCE_STORE_LOAD_FAILED');
  }
}

export function writeAuthorityRegistryConvergenceStore(file, state) {
  validateAuthorityRegistryConvergenceStoreState(state);
  let payload;
  try { payload = JSON.stringify(state); } catch { fail('AUTHORITY_REGISTRY_CONVERGENCE_STORE_SAVE_FAILED'); }
  check(typeof payload === 'string' && Buffer.byteLength(payload) <= CONVERGENCE_STORE_MAX_BYTES,
    'AUTHORITY_REGISTRY_CONVERGENCE_STORE_SAVE_FAILED');
  check(noPrivateMaterial(state), 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PRIVATE_MATERIAL');
  const target = path.resolve(file);
  const directory = path.dirname(target);
  const temporary = path.join(directory, `.authority-registry-convergence.${randomUUID()}.tmp`);
  let fd;
  try {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    fd = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(fd, payload, 'utf8');
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, target);
  } catch { fail('AUTHORITY_REGISTRY_CONVERGENCE_STORE_SAVE_FAILED'); }
  finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    if (fs.existsSync(temporary)) { try { fs.unlinkSync(temporary); } catch {} }
  }
  return true;
}

export class AuthorityRegistryConvergenceStore {
  constructor(file) {
    check(typeof file === 'string' && file.length > 0, 'AUTHORITY_REGISTRY_CONVERGENCE_STORE_PATH_INVALID');
    this.file = path.resolve(file);
    this.directory = path.dirname(this.file);
  }

  get exists() { return fs.existsSync(this.file); }
  load() { return readAuthorityRegistryConvergenceStore(this.file); }

  verify(options = {}) {
    return verifyAuthorityRegistryConvergenceStore({ ...options, state: this.load() });
  }

  async append({ convergenceBundle, distributionPolicy, registryPolicy, issuerKeyring,
    mirrorKeyring, nowMs = Date.now(), updatedAtMs = nowMs, requireCurrent = true } = {}) {
    const lease = await acquireDirectoryLease(this.directory);
    try {
      const existingState = this.exists ? this.load() : null;
      const result = appendAuthorityRegistryConvergenceStore({ existingState, convergenceBundle,
        distributionPolicy, registryPolicy, issuerKeyring, mirrorKeyring, nowMs, updatedAtMs, requireCurrent });
      if (result.status !== 'unchanged') writeAuthorityRegistryConvergenceStore(this.file, result.state);
      return { ...result, file: this.file };
    } finally { await lease.release(); }
  }
}

export const authorityRegistryConvergenceStoreFormats = Object.freeze({
  store: CONVERGENCE_STORE_FORMAT,
});
