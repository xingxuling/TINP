import { runtimeType, isQuantity, quantity } from './quantity.mjs';
import { RCLRuntimeError } from './errors.mjs';

export const FINAL_FOUNDATION_TYPES = new Set(['Element', 'Experiment', 'BodyState', 'SpiritState']);

export function scienceType(baseType) { return `Science<${baseType}>`; }
export function isScienceType(type) { return typeof type === 'string' && /^Science<.+>$/.test(type); }
export function scienceBaseType(type) { return isScienceType(type) ? type.slice(8, -1) : null; }

export function elementEntity(name, options = {}) {
  return Object.freeze({
    kind: 'ElementEntity',
    name,
    category: options.category ?? 'species',
    symbol: options.symbol ?? null,
    atomicNumber: options.atomicNumber ?? null,
    atomicMass: options.atomicMass ?? null,
    charge: options.charge ?? 0,
    phase: options.phase ?? 'unspecified',
    components: Object.freeze({ ...(options.components ?? {}) }),
    bond: options.bond ?? null,
    evidence: Object.freeze([...(options.evidence ?? [])]),
  });
}

export function isElementEntity(value) { return Boolean(value) && value.kind === 'ElementEntity'; }

export function scientificClaim(baseType, value, options = {}) {
  const confidence = Number(options.confidence ?? 1);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RCLRuntimeError('RCL_SCIENCE_CONFIDENCE', 'Scientific confidence must be between 0 and 1');
  }
  return Object.freeze({
    kind: 'ScientificClaim', baseType, value, confidence,
    status: options.status ?? 'hypothesis',
    evidence: Object.freeze([...(options.evidence ?? [])]),
    method: options.method ?? null,
    replications: Number(options.replications ?? 0),
    reproducibility: Number(options.reproducibility ?? 0),
    falsified: Boolean(options.falsified ?? false),
    source: options.source ?? null,
  });
}
export function isScientificClaim(value) { return Boolean(value) && value.kind === 'ScientificClaim'; }

export function experimentResult(name, options = {}) {
  return Object.freeze({
    kind: 'ExperimentResult', name,
    hypothesis: options.hypothesis,
    method: options.method ?? 'deterministic',
    repeats: Number(options.repeats ?? 1),
    consistent: Boolean(options.consistent),
    reproducibility: Number(options.reproducibility ?? 0),
    observed: Object.freeze([...(options.observed ?? [])]),
    evidence: Object.freeze([...(options.evidence ?? [])]),
  });
}
export function isExperimentResult(value) { return Boolean(value) && value.kind === 'ExperimentResult'; }

export function bodyState(name, options = {}) {
  return Object.freeze({
    kind: 'BodyState', name,
    systems: Object.freeze([...(options.systems ?? [])]),
    organs: Object.freeze([...(options.organs ?? [])]),
    bindings: Object.freeze({ ...(options.bindings ?? {}) }),
    maintained: Boolean(options.maintained),
    coherence: Number(options.coherence ?? 0),
    evidence: Object.freeze([...(options.evidence ?? [])]),
  });
}
export function isBodyState(value) { return Boolean(value) && value.kind === 'BodyState'; }

export function spiritState(name, options = {}) {
  return Object.freeze({
    kind: 'SpiritState', name,
    identity: options.identity ?? null,
    values: Object.freeze({ ...(options.values ?? {}) }),
    purposes: Object.freeze({ ...(options.purposes ?? {}) }),
    affects: Object.freeze({ ...(options.affects ?? {}) }),
    coherence: Number(options.coherence ?? 0),
    integrated: Boolean(options.integrated),
    evidence: Object.freeze([...(options.evidence ?? [])]),
  });
}
export function isSpiritState(value) { return Boolean(value) && value.kind === 'SpiritState'; }

export function valuesEquivalent(left, right, tolerance = 0) {
  if (isQuantity(left) || isQuantity(right)) {
    if (!isQuantity(left) || !isQuantity(right) || left.type !== right.type) return false;
    return Math.abs(left.value - right.value) <= tolerance;
  }
  if (typeof left === 'number' && typeof right === 'number') return Math.abs(left - right) <= tolerance;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function multiplyEnergy(value, factor) {
  if (!isQuantity(value) || value.type !== 'Energy') {
    throw new RCLRuntimeError('RCL_EXPECTED_ENERGY', `Expected Energy, received ${runtimeType(value)}`);
  }
  return quantity('Energy', value.value * Number(factor), value.unit);
}
