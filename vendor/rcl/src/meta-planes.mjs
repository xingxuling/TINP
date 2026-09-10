import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { RCLRuntimeError } from './errors.mjs';
import { canonicalReality, realityRoot } from './canonical.mjs';
import { isQuantity, quantity } from './quantity.mjs';

function assertQuantity(value, type, label) {
  if (!isQuantity(value) || value.type !== type) {
    throw new RCLRuntimeError('RCL_SPACETIME_DIMENSION', `${label} must be ${type}`, {
      expected: type,
      actual: value?.type ?? typeof value,
    });
  }
}

export function spacetimePoint(frame, x, y, z, t, target = null) {
  if (typeof frame !== 'string' || frame.length === 0) {
    throw new RCLRuntimeError('RCL_SPACETIME_FRAME', 'A spacetime point requires a non-empty frame');
  }
  assertQuantity(x, 'Length', 'x');
  assertQuantity(y, 'Length', 'y');
  assertQuantity(z, 'Length', 'z');
  assertQuantity(t, 'Time', 't');
  return Object.freeze({ kind: 'SpacetimePoint', frame, x, y, z, t, target });
}

export function isSpacetimePoint(value) {
  return Boolean(value) && value.kind === 'SpacetimePoint'
    && typeof value.frame === 'string'
    && ['x', 'y', 'z'].every(axis => isQuantity(value[axis]) && value[axis].type === 'Length')
    && isQuantity(value.t) && value.t.type === 'Time';
}

export function advanceSpacetimePoint(point, delta) {
  if (!isSpacetimePoint(point)) throw new RCLRuntimeError('RCL_EXPECTED_SPACETIME_POINT', 'Expected SpacetimePoint');
  assertQuantity(delta, 'Time', 'spacetime delta');
  return spacetimePoint(point.frame, point.x, point.y, point.z, quantity('Time', point.t.value + delta.value, point.t.unit), point.target);
}

export function spacetimeDistance(left, right) {
  if (!isSpacetimePoint(left) || !isSpacetimePoint(right)) {
    throw new RCLRuntimeError('RCL_EXPECTED_SPACETIME_POINT', 'distance() expects two SpacetimePoint values');
  }
  if (left.frame !== right.frame) {
    throw new RCLRuntimeError('RCL_SPACETIME_FRAME_MISMATCH', 'distance() requires points in the same frame', {
      leftFrame: left.frame,
      rightFrame: right.frame,
    });
  }
  const dx = left.x.value - right.x.value;
  const dy = left.y.value - right.y.value;
  const dz = left.z.value - right.z.value;
  return quantity('Length', Math.sqrt(dx * dx + dy * dy + dz * dz));
}

export function validateCausalRelations(relations) {
  const graph = new Map();
  for (const relation of relations) {
    let before = relation.left;
    let after = relation.right;
    if (relation.relation === 'after') [before, after] = [after, before];
    if (relation.relation === 'simultaneous') continue;
    if (!graph.has(before)) graph.set(before, new Set());
    graph.get(before).add(after);
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = node => {
    if (visiting.has(node)) throw new RCLRuntimeError('RCL_SPACETIME_CAUSAL_CYCLE', 'Spacetime causal relations contain a cycle', { node });
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) visit(next);
    visiting.delete(node);
    visited.add(node);
  };
  for (const node of graph.keys()) visit(node);
  return true;
}

function stateSubset(state, target) {
  const entries = Object.entries(state).filter(([key]) => key === target || key.startsWith(`${target}.`));
  if (entries.length === 0) {
    throw new RCLRuntimeError('RCL_COMPRESSION_TARGET_MISSING', `Compression target '${target}' has no state`, { target });
  }
  return Object.fromEntries(entries);
}

export function createCompressionCapsule(state, spec) {
  if (spec.mode !== 'lossless') {
    throw new RCLRuntimeError('RCL_COMPRESSION_MODE_UNSUPPORTED', `Reference runtime only implements lossless compression, received '${spec.mode}'`);
  }
  if (spec.codec !== 'deflate') {
    throw new RCLRuntimeError('RCL_COMPRESSION_CODEC_UNSUPPORTED', `Reference runtime only implements deflate, received '${spec.codec}'`);
  }
  const subset = stateSubset(state, spec.target);
  const serialized = canonicalReality(subset);
  const source = Buffer.from(serialized, 'utf8');
  const compressed = deflateRawSync(source, { level: 9 });
  const ratio = source.byteLength === 0 ? 1 : compressed.byteLength / source.byteLength;
  return Object.freeze({
    kind: 'CompressionCapsule',
    name: spec.name,
    target: spec.target,
    mode: spec.mode,
    codec: spec.codec,
    reversible: spec.reversible,
    fidelity: spec.fidelity,
    evidence: [...spec.evidence],
    originalRoot: realityRoot(subset),
    originalBytes: source.byteLength,
    compressedBytes: compressed.byteLength,
    ratio,
    payload: compressed.toString('base64'),
    keys: Object.keys(subset).sort(),
  });
}

export function restoreCompressionCapsule(capsule) {
  if (!capsule || capsule.kind !== 'CompressionCapsule') {
    throw new RCLRuntimeError('RCL_EXPECTED_COMPRESSION_CAPSULE', 'restore requires a CompressionCapsule');
  }
  if (!capsule.reversible) {
    throw new RCLRuntimeError('RCL_COMPRESSION_NOT_REVERSIBLE', `Compression '${capsule.name}' is not reversible`);
  }
  const decoded = inflateRawSync(Buffer.from(capsule.payload, 'base64')).toString('utf8');
  const restored = JSON.parse(decoded);
  const root = realityRoot(restored);
  if (root !== capsule.originalRoot) {
    throw new RCLRuntimeError('RCL_COMPRESSION_ROOT_MISMATCH', 'Restored reality does not match the original root', {
      expected: capsule.originalRoot,
      actual: root,
    });
  }
  return restored;
}

export function buildSpacetimeReality(program, state, history, runtimeMeta = {}) {
  return {
    format: 'rcl.meta-spacetime-reality.v0.1',
    programs: program.spacetimes.map(domain => ({
      name: domain.name,
      frames: domain.frames,
      clocks: Object.fromEntries(domain.clocks.map(clock => [clock.path, state[clock.path]])),
      coordinates: Object.fromEntries(domain.coordinates.map(point => [point.path, state[point.path]])),
      relations: domain.relations,
    })),
    current: runtimeMeta.currentSpacetime ?? null,
    stampedTransitions: history.filter(item => item.spacetime).length,
  };
}

export function buildAccelerationReality(program, runtimeMeta = {}) {
  const metrics = {};
  for (const fn of program.reckons) {
    if (fn.__rclMetrics) metrics[fn.name] = { ...fn.__rclMetrics };
  }
  return {
    format: 'rcl.meta-acceleration-reality.v0.1',
    profiles: [...(runtimeMeta.accelerationProfiles?.values?.() ?? [])].map(item => ({ ...item, cache: undefined })),
    metrics,
  };
}

export function buildCompressionReality(program, runtimeMeta = {}) {
  const capsules = [...(runtimeMeta.compressionCapsules?.values?.() ?? [])].map(capsule => ({
    name: capsule.name,
    target: capsule.target,
    mode: capsule.mode,
    codec: capsule.codec,
    reversible: capsule.reversible,
    fidelity: capsule.fidelity,
    originalRoot: capsule.originalRoot,
    originalBytes: capsule.originalBytes,
    compressedBytes: capsule.compressedBytes,
    ratio: capsule.ratio,
    keys: capsule.keys,
    evidence: capsule.evidence,
  }));
  return {
    format: 'rcl.meta-compression-reality.v0.1',
    definitions: program.compressions.map(item => ({
      name: item.name,
      target: item.target,
      mode: item.mode,
      codec: item.codec,
      reversible: item.reversible,
      discard: item.discard,
    })),
    capsules,
  };
}
