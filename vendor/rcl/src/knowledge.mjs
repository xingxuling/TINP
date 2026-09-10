import { RCLRuntimeError } from './errors.mjs';
import { runtimeType } from './quantity.mjs';

/**
 * Knowledge Reality kernel.
 *
 * A value is not automatically knowledge. Knowledge binds a typed claim to
 * confidence, evidence, provenance, scope, dependencies, revision and conflict
 * history. This lets RCL distinguish "the system contains a value" from
 * "a subject may rely on this claim when changing reality".
 */
export function knowledgeType(baseType) { return `Know<${baseType}>`; }
export function isKnowledgeType(type) { return typeof type === 'string' && /^Know<.+>$/.test(type); }
export function knowledgeBaseType(type) { return isKnowledgeType(type) ? type.slice(5, -1) : null; }

export function knowledgeClaim(baseType, value, options = {}) {
  const actual = runtimeType(value);
  if (actual !== baseType) {
    throw new RCLRuntimeError('RCL_KNOWLEDGE_TYPE', `Knowledge ${baseType} received ${actual}`, {
      baseType, actual,
    });
  }
  const confidence = Number(options.confidence ?? 1);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new RCLRuntimeError('RCL_KNOWLEDGE_CONFIDENCE_RANGE', 'Knowledge confidence must be between 0 and 1', { confidence });
  }
  return Object.freeze({
    kind: 'Knowledge',
    baseType,
    value,
    confidence,
    evidence: [...new Set(options.evidence ?? [])],
    source: options.source ?? null,
    scope: options.scope ?? 'local',
    status: options.status ?? 'provisional',
    dependencies: [...new Set(options.dependencies ?? [])],
    revision: Number(options.revision ?? 1),
    alternatives: structuredClone(options.alternatives ?? []),
    formedAtRoot: options.formedAtRoot ?? null,
  });
}

export function isKnowledge(value) {
  return Boolean(value) && typeof value === 'object' && value.kind === 'Knowledge'
    && typeof value.baseType === 'string' && typeof value.confidence === 'number';
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function reviseKnowledge(current, candidate) {
  if (!isKnowledge(current)) return candidate;
  if (!isKnowledge(candidate) || current.baseType !== candidate.baseType) {
    throw new RCLRuntimeError('RCL_KNOWLEDGE_REVISION_TYPE', 'Knowledge revision must preserve the claim base type', {
      current: current.baseType, candidate: candidate?.baseType,
    });
  }

  if (sameValue(current.value, candidate.value)) {
    const combinedConfidence = 1 - ((1 - current.confidence) * (1 - candidate.confidence));
    return knowledgeClaim(current.baseType, current.value, {
      confidence: combinedConfidence,
      evidence: [...current.evidence, ...candidate.evidence],
      source: candidate.source ?? current.source,
      scope: candidate.scope ?? current.scope,
      status: 'reinforced',
      dependencies: [...current.dependencies, ...candidate.dependencies],
      revision: current.revision + 1,
      alternatives: current.alternatives,
      formedAtRoot: candidate.formedAtRoot ?? current.formedAtRoot,
    });
  }

  const alternative = {
    value: candidate.value,
    confidence: candidate.confidence,
    evidence: candidate.evidence,
    source: candidate.source,
  };
  if (candidate.confidence > current.confidence) {
    return knowledgeClaim(candidate.baseType, candidate.value, {
      ...candidate,
      status: 'revised',
      revision: current.revision + 1,
      alternatives: [
        ...current.alternatives,
        { value: current.value, confidence: current.confidence, evidence: current.evidence, source: current.source },
      ],
    });
  }
  return knowledgeClaim(current.baseType, current.value, {
    ...current,
    status: 'contested',
    revision: current.revision + 1,
    alternatives: [...current.alternatives, alternative],
  });
}

export function decayKnowledge(current, amount) {
  if (!isKnowledge(current)) throw new RCLRuntimeError('RCL_EXPECTED_KNOWLEDGE', 'Knowledge decay expects a knowledge claim');
  const decay = Number(amount);
  if (!Number.isFinite(decay) || decay < 0 || decay > 1) {
    throw new RCLRuntimeError('RCL_KNOWLEDGE_DECAY_RANGE', 'Knowledge decay must be between 0 and 1', { amount });
  }
  const confidence = Math.max(0, current.confidence - decay);
  return knowledgeClaim(current.baseType, current.value, {
    ...current,
    confidence,
    status: confidence === 0 ? 'forgotten' : 'decayed',
    revision: current.revision + 1,
  });
}
