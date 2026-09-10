import { GENESIS } from './evidence.mjs';
import { ProtocolError, rootHash } from './identity.mjs';
import { validateAuthorityRegistryDistributionPolicy, validateAuthorityRegistryDistributionBundle,
  verifyAuthorityRegistryDistribution } from './authority-registry-distribution.mjs';

export const CONVERGENCE_FORMAT = 'twni.authority-registry-convergence.v1';
export const CONVERGENCE_VERIFICATION_FORMAT = 'twni.authority-registry-convergence-verification.v1';

const HASH = /^[a-f0-9]{64}$/;
const BUNDLE_KEYS = ['format', 'distributionId', 'distributionPolicyRoot', 'registryId', 'bundles', 'historyRoot'];

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
function hex(value) { return typeof value === 'string' && HASH.test(value); }

function compareNumber(left, right) { return left - right; }
function compareText(left, right) { return left < right ? -1 : left > right ? 1 : 0; }
function compareBundle(left, right) {
  const sequence = compareNumber(left?.registry?.body?.sequence ?? -1, right?.registry?.body?.sequence ?? -1);
  if (sequence !== 0) return sequence;
  return compareText(left?.registry?.root ?? '', right?.registry?.root ?? '');
}

function validateBundleBody(bundle) {
  exact(bundle, BUNDLE_KEYS, 'AUTHORITY_REGISTRY_CONVERGENCE_INVALID');
  check(bundle.format === CONVERGENCE_FORMAT && identifier(bundle.distributionId)
    && hex(bundle.distributionPolicyRoot) && identifier(bundle.registryId), 'AUTHORITY_REGISTRY_CONVERGENCE_INVALID');
  strictArray(bundle.bundles, 'AUTHORITY_REGISTRY_CONVERGENCE_BUNDLES_INVALID');
  check(bundle.bundles.length > 0, 'AUTHORITY_REGISTRY_CONVERGENCE_BUNDLES_INVALID');
  let previousSequence = null;
  let previousRoot = null;
  for (const child of bundle.bundles) {
    validateAuthorityRegistryDistributionBundle(child);
    const sequence = child.registry.body.sequence;
    const root = child.registry.root;
    if (previousSequence !== null) {
      check(sequence > previousSequence || (sequence === previousSequence && root >= previousRoot),
        'AUTHORITY_REGISTRY_CONVERGENCE_BUNDLES_UNSORTED');
    }
    previousSequence = sequence;
    previousRoot = root;
  }
  check(hex(bundle.historyRoot), 'AUTHORITY_REGISTRY_CONVERGENCE_ROOT_INVALID');
}

export function makeAuthorityRegistryConvergenceBundle({ distributionPolicy, bundles } = {}) {
  validateAuthorityRegistryDistributionPolicy(distributionPolicy);
  check(Array.isArray(bundles), 'AUTHORITY_REGISTRY_CONVERGENCE_BUNDLES_INVALID');
  const ordered = [...bundles].sort(compareBundle);
  const body = { format: CONVERGENCE_FORMAT, distributionId: distributionPolicy.distributionId,
    distributionPolicyRoot: distributionPolicy.policyRoot, registryId: distributionPolicy.registryId, bundles: ordered };
  const bundle = { ...body, historyRoot: rootHash(body) };
  validateBundleBody(bundle);
  return bundle;
}

export function validateAuthorityRegistryConvergenceBundle(bundle) {
  validateBundleBody(bundle);
  const { historyRoot, ...body } = bundle;
  check(rootHash(body) === historyRoot, 'AUTHORITY_REGISTRY_CONVERGENCE_ROOT_INVALID');
  return true;
}

function sameMirrors(left, right) {
  return left.length === right.length && left.every((mirrorId, index) => mirrorId === right[index]);
}

export function verifyAuthorityRegistryConvergence({ distributionPolicy, convergenceBundle, registryPolicy,
  issuerKeyring, mirrorKeyring, nowMs = Date.now(), requireCurrent = true } = {}) {
  validateAuthorityRegistryDistributionPolicy(distributionPolicy);
  validateAuthorityRegistryConvergenceBundle(convergenceBundle);
  check(convergenceBundle.distributionId === distributionPolicy.distributionId
    && convergenceBundle.distributionPolicyRoot === distributionPolicy.policyRoot
    && convergenceBundle.registryId === distributionPolicy.registryId,
  'AUTHORITY_REGISTRY_CONVERGENCE_POLICY_MISMATCH');

  const snapshots = [];
  const rootsBySequence = new Map();
  let previousRegistry = null;
  let previousSequence = null;
  let stableMirrors = null;
  for (const child of convergenceBundle.bundles) {
    const registry = child.registry;
    const sequence = registry.body.sequence;
    const root = registry.root;
    const priorRoot = rootsBySequence.get(sequence);
    if (priorRoot) {
      if (priorRoot === root) fail('AUTHORITY_REGISTRY_CONVERGENCE_DUPLICATE_SNAPSHOT');
      fail('AUTHORITY_REGISTRY_CONVERGENCE_FORK_DETECTED');
    }
    rootsBySequence.set(sequence, root);
    if (previousRegistry === null) {
      check(sequence === 1 && registry.body.previousRegistryRoot === GENESIS,
        'AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP');
    } else {
      check(sequence === previousSequence + 1, 'AUTHORITY_REGISTRY_CONVERGENCE_CHAIN_GAP');
      check(registry.body.previousRegistryRoot === previousRegistry.root,
        'AUTHORITY_REGISTRY_CONVERGENCE_FORK_DETECTED');
    }
    const verification = verifyAuthorityRegistryDistribution({ distributionPolicy, bundle: child,
      registryPolicy, issuerKeyring, previousRegistry, mirrorKeyring, nowMs, requireCurrent });
    if (stableMirrors === null) stableMirrors = verification.acceptedMirrors;
    else check(sameMirrors(stableMirrors, verification.acceptedMirrors),
      'AUTHORITY_REGISTRY_CONVERGENCE_MIRROR_SET_DRIFT');
    snapshots.push({ sequence, registryRoot: root, acceptedMirrors: verification.acceptedMirrors,
      expiresAtMs: verification.expiresAtMs });
    previousRegistry = registry;
    previousSequence = sequence;
  }
  return {
    format: CONVERGENCE_VERIFICATION_FORMAT,
    historyRoot: convergenceBundle.historyRoot,
    distributionId: distributionPolicy.distributionId,
    registryId: distributionPolicy.registryId,
    distributionPolicyRoot: distributionPolicy.policyRoot,
    firstSequence: snapshots[0].sequence,
    lastSequence: snapshots.at(-1).sequence,
    snapshots,
    stableMirrors: stableMirrors ?? [],
    observedAtMs: nowMs,
  };
}

export const authorityRegistryConvergenceFormats = Object.freeze({
  bundle: CONVERGENCE_FORMAT,
  verification: CONVERGENCE_VERIFICATION_FORMAT,
});
