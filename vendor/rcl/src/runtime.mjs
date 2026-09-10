import { compileReality } from './compiler.mjs';
import { createHash } from 'node:crypto';
import { RCLRuntimeError } from './errors.mjs';
import { canonicalReality, realityRoot } from './canonical.mjs';
import {
  applyBinary,
  quantity,
  isQuantity,
  measurement,
  isMeasurement,
  lowerBound,
  upperBound,
  quantityConstructors,
} from './quantity.mjs';
import { foundationSummary } from './foundation.mjs';
import { buildFoundationRuntimeResults } from './foundation-contract.mjs';
import { knowledgeClaim, isKnowledge, reviseKnowledge, decayKnowledge } from './knowledge.mjs';
import { buildInnerReality, buildExecutionReality, buildNaturalLanguageReality, buildUnderstandingReality, buildCreativeReality } from './planes.mjs';
import {
  spacetimePoint, isSpacetimePoint, advanceSpacetimePoint, spacetimeDistance, validateCausalRelations,
  createCompressionCapsule, restoreCompressionCapsule,
  buildSpacetimeReality, buildAccelerationReality, buildCompressionReality,
} from './meta-planes.mjs';
import {
  utterance, isUtterance, intent, isIntent, understanding, isUnderstanding,
  creationCandidate, selectCreation, isCreation, evidenceConfidence,
} from './cognition.mjs';
import {
  elementEntity, isElementEntity, scientificClaim, isScientificClaim,
  experimentResult, isExperimentResult, bodyState, isBodyState, spiritState, isSpiritState,
  valuesEquivalent, multiplyEnergy,
} from './final-foundation.mjs';
import { span, token, facetAst, parseState, symbolValue, semanticFacet, irStore, isSpan, isToken, isAstNode, isParseState, isSymbolValue, isSemanticNode, isIrNode } from './compiler-primitives.mjs';

const MAX_RECKON_DEPTH = 4096;

// Trampoline sentinel: returned from tail-call sites to avoid stack overflow.
// evaluateExpressionCore returns this instead of recursing; the trampoline loop unwinds it.
class _TailCall {
  constructor(expr, context, cacheEntry) { this.expr = expr; this.context = context; this.cacheEntry = cacheEntry; }
}

function getPath(state, path) {
  if (!Object.prototype.hasOwnProperty.call(state, path)) throw new RCLRuntimeError('RCL_STATE_MISSING', `Facet '${path}' does not exist`, { path });
  return state[path];
}

function compareValues(left, right) {
  if (isQuantity(left) && isQuantity(right)) return left.value - right.value;
  return left - right;
}

function _evalCore(expr, context) {
  const { state, locals, functions, providers = {}, depth = 0 } = context;
  if (depth > MAX_RECKON_DEPTH) throw new RCLRuntimeError('RCL_RECKON_DEPTH_EXCEEDED', `Reckoning recursion exceeded ${MAX_RECKON_DEPTH} frames`);
  switch (expr.kind) {
    case 'LiteralExpr': return expr.value;
    case 'RecordConstructExpr': {
      const fields = {};
      for (const field of expr.fields ?? []) fields[field.name] = evaluateExpression(field.value, { ...context, depth: depth + 1 });
      return Object.freeze({ __rclKind: 'Record', __rclType: expr.canonicalType, __rclRecord: expr.typeName, ...fields });
    }
    case 'UnionConstructExpr': {
      const payload = (expr.payload ?? []).map(item => evaluateExpression(item.value, { ...context, depth: depth + 1 }));
      return Object.freeze({ __rclKind: 'Union', __rclType: expr.canonicalType, __rclUnion: expr.typeName, variant: expr.variant, payload });
    }
    case 'FieldAccessExpr': {
      const object = evaluateExpression(expr.object, { ...context, depth: depth + 1 });
      if (!object || typeof object !== 'object') throw new RCLRuntimeError('RCL_FIELD_ACCESS_TARGET', `Field '${expr.field}' requires a record-like object`);
      if (!Object.prototype.hasOwnProperty.call(object, expr.field)) throw new RCLRuntimeError('RCL_FIELD_ACCESS_MISSING', `Field '${expr.field}' does not exist on typed record`, { field: expr.field });
      return object[expr.field];
    }
    case 'MatchUnionExpr': {
      const value = evaluateExpression(expr.target, { ...context, depth: depth + 1 });
      if (!value || value.__rclKind !== 'Union') throw new RCLRuntimeError('RCL_MATCH_EXPECTED_UNION', 'match requires a typed union value');
      const selected = (expr.cases ?? []).find(item => item.wildcard || item.variant === value.variant);
      if (!selected) throw new RCLRuntimeError('RCL_MATCH_NON_EXHAUSTIVE', `No match case for variant '${value.variant}'`);
      const branchLocals = new Map(locals);
      selected.bindings.forEach((name, index) => branchLocals.set(name, value.payload?.[index]));
      return new _TailCall(selected.expression, { ...context, locals: branchLocals, depth: depth + 1 }, null);
    }
    case 'RecordLiteralExpr': {
      const fields = {};
      for (const field of expr.fields ?? []) fields[field.name] = evaluateExpression(field.expression, { ...context, depth: depth + 1 });
      return Object.freeze(fields);
    }
    case 'PathExpr':
      if (locals.has(expr.path)) return locals.get(expr.path);
      return getPath(state, expr.path);
    case 'UnaryExpr': {
      const value = evaluateExpression(expr.expression, { ...context, depth: depth + 1 });
      if (expr.operator === 'not') return !value;
      if (isQuantity(value)) return quantity(value.type, -value.value, value.unit);
      return -value;
    }
    case 'BinaryExpr': {
      if (expr.operator === 'and') {
        const left = evaluateExpression(expr.left, { ...context, depth: depth + 1 });
        return Boolean(left) && Boolean(evaluateExpression(expr.right, { ...context, depth: depth + 1 }));
      }
      if (expr.operator === 'or') {
        const left = evaluateExpression(expr.left, { ...context, depth: depth + 1 });
        return Boolean(left) || Boolean(evaluateExpression(expr.right, { ...context, depth: depth + 1 }));
      }
      const left = evaluateExpression(expr.left, { ...context, depth: depth + 1 });
      const right = evaluateExpression(expr.right, { ...context, depth: depth + 1 });
      return applyBinary(expr.operator, left, right);
    }
    case 'CallExpr': {
      if (expr.name === 'provider_call') {
        const providerId = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const capability = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        const requestJson = evaluateExpression(expr.args[2], { ...context, depth: depth + 1 });
        const provider = providers[providerId];
        if (typeof provider !== 'function') throw new RCLRuntimeError('RCL_PROVIDER_MISSING', `Provider '${providerId}' is not registered`);
        return provider(capability, requestJson);
      }
      if (expr.name === 'choose') {
        const condition = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        return new _TailCall(condition ? expr.args[1] : expr.args[2], { ...context, depth: depth + 1 }, null);
      }
      if (quantityConstructors[expr.name]) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        return quantityConstructors[expr.name](value);
      }
      if (expr.name === 'point' || expr.name === 'spacetime_point') {
        const values = expr.args.map(arg => evaluateExpression(arg, { ...context, depth: depth + 1 }));
        return spacetimePoint(values[0], values[1], values[2], values[3], values[4]);
      }
      if (['space_x', 'space_y', 'space_z', 'time_of'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isSpacetimePoint(value)) throw new RCLRuntimeError('RCL_EXPECTED_SPACETIME_POINT', `${expr.name}() expects SpacetimePoint`);
        if (expr.name === 'space_x') return value.x;
        if (expr.name === 'space_y') return value.y;
        if (expr.name === 'space_z') return value.z;
        return value.t;
      }
      if (expr.name === 'same_frame') {
        const left = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const right = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        if (!isSpacetimePoint(left) || !isSpacetimePoint(right)) throw new RCLRuntimeError('RCL_EXPECTED_SPACETIME_POINT', 'same_frame() expects SpacetimePoint values');
        return left.frame === right.frame;
      }
      if (expr.name === 'distance') {
        const left = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const right = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        return spacetimeDistance(left, right);
      }
      if (expr.name === 'measure_value') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isMeasurement(value)) throw new RCLRuntimeError('RCL_EXPECTED_MEASUREMENT', 'measure_value() expects a measurement');
        return value.value;
      }
      if (expr.name === 'uncertainty') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isMeasurement(value)) throw new RCLRuntimeError('RCL_EXPECTED_MEASUREMENT', 'uncertainty() expects a measurement');
        return value.uncertainty;
      }
      if (expr.name === 'confidence' || expr.name === 'certainty') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (isMeasurement(value) || isKnowledge(value) || isScientificClaim(value)) return value.confidence;
        return evidenceConfidence(value);
      }
      if (expr.name === 'knowledge_value' || expr.name === 'belief') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isKnowledge(value)) throw new RCLRuntimeError('RCL_EXPECTED_KNOWLEDGE', `${expr.name}() expects a knowledge claim`);
        return value.value;
      }
      if (expr.name === 'known' || expr.name === 'supported') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isKnowledge(value)) throw new RCLRuntimeError('RCL_EXPECTED_KNOWLEDGE', `${expr.name}() expects a knowledge claim`);
        const threshold = expr.args[1] ? Number(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 })) : 0.5;
        return value.status !== 'forgotten' && value.confidence >= threshold;
      }
      if (expr.name === 'knowledge_status') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isKnowledge(value)) throw new RCLRuntimeError('RCL_EXPECTED_KNOWLEDGE', 'knowledge_status() expects a knowledge claim');
        return value.status;
      }
      if (expr.name === 'contradicts') {
        const left = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const right = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        if (!isKnowledge(left) || !isKnowledge(right)) throw new RCLRuntimeError('RCL_EXPECTED_KNOWLEDGE', 'contradicts() expects two knowledge claims');
        return left.baseType === right.baseType && JSON.stringify(left.value) !== JSON.stringify(right.value);
      }
      if (expr.name === 'evidence_count') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!value || !Array.isArray(value.evidence)) throw new RCLRuntimeError('RCL_EXPECTED_EVIDENCE_OBJECT', 'evidence_count() expects an evidence-bearing object');
        return value.evidence.length;
      }
      if (expr.name === 'utterance_text' || expr.name === 'utterance_speaker' || expr.name === 'utterance_locale') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isUtterance(value)) throw new RCLRuntimeError('RCL_EXPECTED_UTTERANCE', `${expr.name}() expects an utterance`);
        if (expr.name === 'utterance_text') return value.text;
        if (expr.name === 'utterance_speaker') return value.speaker;
        return value.locale;
      }
      if (['intent_name', 'intent_action', 'intent_target', 'intent_confidence'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isIntent(value)) throw new RCLRuntimeError('RCL_EXPECTED_INTENT', `${expr.name}() expects an intent`);
        if (expr.name === 'intent_name') return value.name;
        if (expr.name === 'intent_action') return value.action;
        if (expr.name === 'intent_target') return value.target;
        return value.confidence;
      }
      if (expr.name === 'intent_matches') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isIntent(value)) throw new RCLRuntimeError('RCL_EXPECTED_INTENT', 'intent_matches() expects an intent');
        const action = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        const target = evaluateExpression(expr.args[2], { ...context, depth: depth + 1 });
        return value.active && value.action === action && value.target === target;
      }
      if (expr.name === 'understanding_value' || expr.name === 'understanding_confidence' || expr.name === 'understanding_coverage' || expr.name === 'understanding_coherence' || expr.name === 'understanding_explanation') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isUnderstanding(value)) throw new RCLRuntimeError('RCL_EXPECTED_UNDERSTANDING', `${expr.name}() expects understanding`);
        if (expr.name === 'understanding_value') return value.value;
        if (expr.name === 'understanding_confidence') return value.confidence;
        if (expr.name === 'understanding_coverage') return value.coverage;
        if (expr.name === 'understanding_coherence') return value.coherence;
        return value.explanation;
      }
      if (expr.name === 'understood') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isUnderstanding(value)) throw new RCLRuntimeError('RCL_EXPECTED_UNDERSTANDING', 'understood() expects understanding');
        const threshold = expr.args[1] ? Number(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 })) : 0.5;
        return value.status !== 'rejected' && value.confidence >= threshold && value.coherence >= threshold;
      }
      if (['creation_value', 'creation_score', 'creation_novelty', 'creation_utility', 'creation_feasibility', 'creation_risk', 'creation_target'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isCreation(value)) throw new RCLRuntimeError('RCL_EXPECTED_CREATION', `${expr.name}() expects a creation candidate`);
        if (expr.name === 'creation_value') return value.value;
        if (expr.name === 'creation_score') return value.score;
        if (expr.name === 'creation_novelty') return value.novelty;
        if (expr.name === 'creation_utility') return value.utility;
        if (expr.name === 'creation_feasibility') return value.feasibility;
        if (expr.name === 'creation_risk') return value.risk;
        return value.target;
      }
      if (expr.name === 'selected') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isCreation(value)) throw new RCLRuntimeError('RCL_EXPECTED_CREATION', 'selected() expects a creation candidate');
        return value.status === 'selected';
      }
      if (expr.name === 'scientific_value') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isScientificClaim(value)) throw new RCLRuntimeError('RCL_EXPECTED_SCIENCE', 'scientific_value() expects a scientific claim');
        return value.value;
      }
      if (expr.name === 'reproducible') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (isScientificClaim(value)) return value.reproducibility >= 1 && !value.falsified;
        if (isExperimentResult(value)) return value.consistent;
        throw new RCLRuntimeError('RCL_EXPECTED_SCIENCE', 'reproducible() expects a scientific claim or experiment');
      }
      if (expr.name === 'falsified') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        return isScientificClaim(value) ? value.falsified : false;
      }
      if (expr.name === 'replications') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (isScientificClaim(value)) return value.replications;
        if (isExperimentResult(value)) return value.repeats;
        throw new RCLRuntimeError('RCL_EXPECTED_SCIENCE', 'replications() expects a scientific claim or experiment');
      }
      if (expr.name === 'is_element') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        return isElementEntity(value);
      }
      if (expr.name === 'element_symbol') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isElementEntity(value)) throw new RCLRuntimeError('RCL_EXPECTED_ELEMENT', 'element_symbol() expects Element');
        return value.symbol ?? value.name;
      }
      if (expr.name === 'atomic_number') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isElementEntity(value)) throw new RCLRuntimeError('RCL_EXPECTED_ELEMENT', 'atomic_number() expects Element');
        return value.atomicNumber ?? 0;
      }
      if (expr.name === 'component_count') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isElementEntity(value)) throw new RCLRuntimeError('RCL_EXPECTED_ELEMENT', 'component_count() expects Element');
        return Object.keys(value.components ?? {}).length;
      }
      if (expr.name === 'body_coherence' || expr.name === 'body_maintained') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isBodyState(value)) throw new RCLRuntimeError('RCL_EXPECTED_BODY_STATE', `${expr.name}() expects BodyState`);
        return expr.name === 'body_coherence' ? value.coherence : value.maintained;
      }
      if (expr.name === 'spirit_coherence' || expr.name === 'spirit_integrated') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isSpiritState(value)) throw new RCLRuntimeError('RCL_EXPECTED_SPIRIT_STATE', `${expr.name}() expects SpiritState`);
        return expr.name === 'spirit_coherence' ? value.coherence : value.integrated;
      }
      if (['contains', 'starts_with', 'ends_with'].includes(expr.name)) {
        const left = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
        const right = String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 }));
        if (expr.name === 'contains') return left.includes(right);
        if (expr.name === 'starts_with') return left.startsWith(right);
        return left.endsWith(right);
      }
      if (expr.name === 'lower_text' || expr.name === 'upper_text' || expr.name === 'trim') {
        const value = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
        if (expr.name === 'lower_text') return value.toLocaleLowerCase();
        if (expr.name === 'upper_text') return value.toLocaleUpperCase();
        return value.trim();
      }
      if (expr.name === 'split_before' || expr.name === 'split_after') {
        const value = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
        const separator = String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 }));
        const index = value.indexOf(separator);
        if (index < 0) return expr.name === 'split_before' ? value : '';
        return expr.name === 'split_before' ? value.slice(0, index) : value.slice(index + separator.length);
      }
      if (expr.name === 'number_from_text') {
        const value = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 })).trim();
        const number = Number(value);
        if (!Number.isFinite(number)) throw new RCLRuntimeError('RCL_TEXT_NUMBER_INVALID', `Cannot parse Number from '${value}'`);
        return number;
      }
      if (expr.name === 'empty_sequence') return Object.freeze([]);
      if (expr.name === 'sequence_append') {
        const sequence = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const value = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        if (!Array.isArray(sequence)) throw new RCLRuntimeError('RCL_EXPECTED_SEQUENCE', 'sequence_append() expects Sequence');
        return Object.freeze([...sequence, structuredClone(value)]);
      }
      if (expr.name === 'sequence_get') {
        const sequence = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const index = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        if (!Array.isArray(sequence) || !Number.isInteger(index) || index < 0 || index >= sequence.length) throw new RCLRuntimeError('RCL_SEQUENCE_RANGE', 'sequence_get() index out of range');
        return structuredClone(sequence[index]);
      }
      if (expr.name === 'sequence_concat') {
        const left = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const right = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        if (!Array.isArray(left) || !Array.isArray(right)) throw new RCLRuntimeError('RCL_EXPECTED_SEQUENCE', 'sequence_concat() expects two Sequences');
        return Object.freeze([...left.map(item => structuredClone(item)), ...right.map(item => structuredClone(item))]);
      }
      if (['bytes_u8', 'bytes_u16le', 'bytes_u32le', 'bytes_i32le', 'bytes_f64le'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new RCLRuntimeError('RCL_BYTE_ENCODING_TYPE', `${expr.name}() expects a finite Number`);
        let buffer;
        if (expr.name === 'bytes_u8') {
          if (!Number.isInteger(value) || value < 0 || value > 255) throw new RCLRuntimeError('RCL_BYTE_ENCODING_RANGE', 'bytes_u8() expects 0..255');
          buffer = Buffer.from([value]);
        } else if (expr.name === 'bytes_u16le') {
          if (!Number.isInteger(value) || value < 0 || value > 0xffff) throw new RCLRuntimeError('RCL_BYTE_ENCODING_RANGE', 'bytes_u16le() expects 0..65535');
          buffer = Buffer.alloc(2); buffer.writeUInt16LE(value);
        } else if (expr.name === 'bytes_u32le') {
          if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new RCLRuntimeError('RCL_BYTE_ENCODING_RANGE', 'bytes_u32le() expects 0..4294967295');
          buffer = Buffer.alloc(4); buffer.writeUInt32LE(value);
        } else if (expr.name === 'bytes_i32le') {
          if (!Number.isInteger(value) || value < -0x80000000 || value > 0x7fffffff) throw new RCLRuntimeError('RCL_BYTE_ENCODING_RANGE', 'bytes_i32le() expects signed 32-bit integer');
          buffer = Buffer.alloc(4); buffer.writeInt32LE(value);
        } else {
          buffer = Buffer.alloc(8); buffer.writeDoubleLE(value);
        }
        return Object.freeze([...buffer]);
      }
      if (expr.name === 'utf8_bytes') {
        const value = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
        return Object.freeze([...Buffer.from(value, 'utf8')]);
      }
      if (expr.name === 'hex_bytes') {
        const value = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 })).trim();
        if (value.length % 2 !== 0 || /[^0-9a-f]/i.test(value)) throw new RCLRuntimeError('RCL_HEX_BYTES_INVALID', 'hex_bytes() expects even-length hexadecimal Text');
        return Object.freeze([...Buffer.from(value, 'hex')]);
      }
      if (expr.name === 'sha256_text') {
        const value = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
        return createHash('sha256').update(value).digest('hex');
      }
      if (expr.name === 'char_at') {
        const text = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
        const index = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        if (!Number.isInteger(index) || index < 0 || index >= text.length) return '';
        return text[index];
      }
      if (expr.name === 'slice_text') {
        const text = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
        const start = evaluateExpression(expr.args[1], { ...context, depth: depth + 1 });
        const length = evaluateExpression(expr.args[2], { ...context, depth: depth + 1 });
        if (![start, length].every(Number.isInteger) || start < 0 || length < 0) throw new RCLRuntimeError('RCL_TEXT_SLICE', 'slice_text() expects non-negative integer start/length');
        return text.slice(start, start + length);
      }
      if (['is_whitespace', 'is_digit', 'is_identifier_start', 'is_identifier_part'].includes(expr.name)) {
        const ch = String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
        if (expr.name === 'is_whitespace') return /^\s$/u.test(ch);
        if (expr.name === 'is_digit') return /^[0-9]$/.test(ch);
        if (expr.name === 'is_identifier_start') return /^[_\p{L}]$/u.test(ch);
        return /^[_\p{L}\p{N}]$/u.test(ch);
      }
      if (expr.name === 'make_span') return span(
        evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }),
        evaluateExpression(expr.args[1], { ...context, depth: depth + 1 }),
        evaluateExpression(expr.args[2], { ...context, depth: depth + 1 }),
        evaluateExpression(expr.args[3], { ...context, depth: depth + 1 }),
      );
      if (expr.name === 'make_token') return token(
        String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 })),
        evaluateExpression(expr.args[2], { ...context, depth: depth + 1 }),
      );
      if (expr.name === 'expect_token') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const expectedKind = String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 }));
        const expectedText = String(evaluateExpression(expr.args[2], { ...context, depth: depth + 1 }));
        if (!isToken(value) || value.tokenType !== expectedKind || (expectedText !== '' && value.text !== expectedText)) {
          throw new RCLRuntimeError('RCL_PARSE_EXPECTATION', `Expected ${expectedKind} ${expectedText || '<any>'}`);
        }
        return value;
      }
      if (['token_kind', 'token_text', 'token_span'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isToken(value)) throw new RCLRuntimeError('RCL_EXPECTED_TOKEN', `${expr.name}() expects Token`);
        if (expr.name === 'token_kind') return value.tokenType;
        if (expr.name === 'token_text') return value.text;
        return value.span;
      }
      if (['span_offset', 'span_line', 'span_column', 'span_length'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isSpan(value)) throw new RCLRuntimeError('RCL_EXPECTED_SPAN', `${expr.name}() expects Span`);
        return value[expr.name.slice(5)];
      }
      if (expr.name === 'facet_ast') return facetAst(
        String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[2], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[3], { ...context, depth: depth + 1 })),
        evaluateExpression(expr.args[4], { ...context, depth: depth + 1 }),
      );
      if (['ast_kind', 'ast_path', 'ast_value_type', 'ast_literal_kind', 'ast_literal_text', 'ast_span'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isAstNode(value)) throw new RCLRuntimeError('RCL_EXPECTED_AST', `${expr.name}() expects AstNode`);
        if (expr.name === 'ast_kind') return value.kind;
        if (expr.name === 'ast_path') return value.path;
        if (expr.name === 'ast_value_type') return value.valueType;
        if (expr.name === 'ast_literal_kind') return value.value.valueType;
        if (expr.name === 'ast_literal_text') return String(value.value.value);
        return value.span;
      }
      if (expr.name === 'make_symbol') return symbolValue(
        String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 })),
        evaluateExpression(expr.args[2], { ...context, depth: depth + 1 }),
        evaluateExpression(expr.args[3], { ...context, depth: depth + 1 }),
      );
      if (['symbol_path', 'symbol_type', 'symbol_slot', 'symbol_span'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isSymbolValue(value)) throw new RCLRuntimeError('RCL_EXPECTED_SYMBOL', `${expr.name}() expects Symbol`);
        return expr.name === 'symbol_path' ? value.path : expr.name === 'symbol_type' ? value.valueType : expr.name === 'symbol_slot' ? value.slot : value.span;
      }
      if (expr.name === 'semantic_assert') {
        const condition = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        const code = String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 }));
        const detail = String(evaluateExpression(expr.args[2], { ...context, depth: depth + 1 }));
        const sourceSpan = evaluateExpression(expr.args[3], { ...context, depth: depth + 1 });
        if (!condition) throw new RCLRuntimeError(code, `${detail} at ${sourceSpan?.line ?? '?'}:${sourceSpan?.column ?? '?'}`);
        return true;
      }
      if (expr.name === 'make_semantic_facet') return semanticFacet(
        String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[2], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[3], { ...context, depth: depth + 1 })),
        evaluateExpression(expr.args[4], { ...context, depth: depth + 1 }),
        evaluateExpression(expr.args[5], { ...context, depth: depth + 1 }),
      );
      if (['semantic_path', 'semantic_type', 'semantic_literal_kind', 'semantic_literal_text', 'semantic_slot', 'semantic_span'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isSemanticNode(value)) throw new RCLRuntimeError('RCL_EXPECTED_SEMANTIC_NODE', `${expr.name}() expects SemanticNode`);
        if (expr.name === 'semantic_path') return value.path;
        if (expr.name === 'semantic_type') return value.valueType;
        if (expr.name === 'semantic_literal_kind') return value.literalKind;
        if (expr.name === 'semantic_literal_text') return value.literalText;
        if (expr.name === 'semantic_slot') return value.slot;
        return value.span;
      }
      if (expr.name === 'make_ir_store') return irStore(
        String(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[1], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[2], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[3], { ...context, depth: depth + 1 })),
        String(evaluateExpression(expr.args[4], { ...context, depth: depth + 1 })),
        evaluateExpression(expr.args[5], { ...context, depth: depth + 1 }),
        evaluateExpression(expr.args[6], { ...context, depth: depth + 1 }),
      );
      if (['ir_op', 'ir_path', 'ir_type', 'ir_literal_kind', 'ir_literal_text', 'ir_slot', 'ir_span'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isIrNode(value)) throw new RCLRuntimeError('RCL_EXPECTED_IR_NODE', `${expr.name}() expects IrNode`);
        if (expr.name === 'ir_op') return value.op;
        if (expr.name === 'ir_path') return value.path;
        if (expr.name === 'ir_type') return value.valueType;
        if (expr.name === 'ir_literal_kind') return value.literalKind;
        if (expr.name === 'ir_literal_text') return value.literalText;
        if (expr.name === 'ir_slot') return value.slot;
        return value.span;
      }
      if (expr.name === 'make_parse_state') return parseState(
        evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }),
        evaluateExpression(expr.args[1], { ...context, depth: depth + 1 }),
      );
      if (['parse_index', 'parse_nodes'].includes(expr.name)) {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        if (!isParseState(value)) throw new RCLRuntimeError('RCL_EXPECTED_PARSE_STATE', `${expr.name}() expects ParseState`);
        return expr.name === 'parse_index' ? value.index : value.nodes;
      }
      if (expr.name === 'lower') return lowerBound(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
      if (expr.name === 'upper') return upperBound(evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }));
      if (expr.name === 'abs') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        return isQuantity(value) ? quantity(value.type, Math.abs(value.value), value.unit) : Math.abs(value);
      }
      if (expr.name === 'min' || expr.name === 'max') {
        const values = expr.args.map(arg => evaluateExpression(arg, { ...context, depth: depth + 1 }));
        return values.reduce((best, value) => {
          const comparison = compareValues(value, best);
          return expr.name === 'min' ? (comparison < 0 ? value : best) : (comparison > 0 ? value : best);
        });
      }
      if (expr.name === 'text') {
        const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 });
        return typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
      if (expr.name === 'length') { const value = evaluateExpression(expr.args[0], { ...context, depth: depth + 1 }); return Array.isArray(value) ? value.length : String(value).length; }
      const fn = functions.get(expr.name);
      if (!fn) throw new RCLRuntimeError('RCL_RECKON_UNKNOWN', `Unknown reckoning '${expr.name}'`);
      const values = expr.args.map(arg => evaluateExpression(arg, { ...context, depth: depth + 1 }));
      fn.__rclMetrics ??= { requests: 0, evaluations: 0, cacheHits: 0 };
      fn.__rclMetrics.requests += 1;
      const acceleration = fn.__rclAcceleration;
      const cacheKey = acceleration?.strategy === 'memoize'
        ? realityRoot({ args: values, stateRoot: realityRoot(state) })
        : null;
      if (cacheKey && acceleration.cache.has(cacheKey)) {
        fn.__rclMetrics.cacheHits += 1;
        return structuredClone(acceleration.cache.get(cacheKey));
      }
      fn.__rclMetrics.evaluations += 1;
      const childLocals = new Map();
      fn.params.forEach((param, index) => childLocals.set(param.name, values[index]));
      const _cacheEntry = cacheKey ? { cacheKey, acceleration } : null;
      return new _TailCall(fn.expression, { state, locals: childLocals, functions, depth: depth + 1 }, _cacheEntry);
    }
    default: throw new RCLRuntimeError('RCL_EXPRESSION_UNKNOWN', `Unknown expression kind '${expr.kind}'`);
  }
}

// Trampoline wrapper: converts _TailCall returns from _evalCore into a loop,
// eliminating deep recursion from RCL tail-call patterns (choose chains, reckon calls).
function evaluateExpression(expr, context) {
  let result = _evalCore(expr, context);
  let pendingCaches = null;
  while (result instanceof _TailCall) {
    if (result.cacheEntry) {
      pendingCaches = (pendingCaches ?? []).concat(result.cacheEntry);
    }
    result = _evalCore(result.expr, result.context);
  }
  if (pendingCaches) {
    for (const pc of pendingCaches) pc.acceleration.cache.set(pc.cacheKey, structuredClone(result));
  }
  return result;
}

function evaluateCount(expr, runtime, label) {
  const value = evaluateExpression(expr, { state: runtime.state, locals: new Map(), functions: runtime.functions });
  if (!Number.isInteger(value) || value < 0 || value > 100000) {
    throw new RCLRuntimeError('RCL_STEP_COUNT', `${label} count must be an integer between 0 and 100000`, { value });
  }
  return value;
}

function scopeMatches(granted, required) {
  return granted === required || required.startsWith(`${granted}.`) || granted === '*';
}

function actorFor(rule) { return rule.kind === 'Emergence' ? rule.cause : rule.from; }

async function invokeHost(call, state, functions, adapters, rule, mode) {
  const [hostName, ...parts] = call.capability.split('.');
  const capability = parts.join('.');
  const adapter = adapters[hostName];
  if (!adapter) throw new RCLRuntimeError('RCL_HOST_ADAPTER_MISSING', `No runtime adapter is registered for host '${hostName}'`, { hostName, rule: rule.name });
  const args = call.args.map(arg => evaluateExpression(arg, { state, locals: new Map(), functions }));
  const request = {
    host: hostName,
    capability,
    fullCapability: call.capability,
    args,
    rule: rule.name,
    actor: actorFor(rule),
    authorityNeeds: structuredClone(rule.needs ?? []),
    witnesses: structuredClone(rule.witnesses ?? []),
    mode,
    state: structuredClone(state),
  };
  let result;
  if (mode === 'foresee') {
    if (typeof adapter === 'object' && typeof adapter.simulate === 'function') result = await adapter.simulate(request);
    else throw new RCLRuntimeError('RCL_HOST_SIMULATOR_MISSING', `Foreseeing '${rule.name}' requires a simulator for host '${hostName}'`, { hostName, rule: rule.name });
  } else {
    result = typeof adapter === 'function' ? await adapter(request) : await adapter.invoke(request);
  }
  return { target: call.target, value: result, request };
}

function activeWarrant(warrant, state, functions) {
  if (!warrant.condition) return true;
  return Boolean(evaluateExpression(warrant.condition, { state, locals: new Map(), functions }));
}

function verifyAuthority(rule, program, state, functions) {
  const actor = actorFor(rule);
  const grants = program.warrants.filter(warrant => warrant.subject === actor && activeWarrant(warrant, state, functions));
  for (const need of rule.needs) {
    const granted = grants.some(warrant => warrant.capability === need.capability && scopeMatches(warrant.target, need.target));
    if (!granted) {
      throw new RCLRuntimeError('RCL_AUTHORITY_DENIED', `Subject '${actor}' is not currently warranted for '${need.capability}' on '${need.target}'`, {
        actor, capability: need.capability, target: need.target, rule: rule.name,
      });
    }
  }
  return grants;
}

function evaluateChanges(changes, before, functions, locals = new Map(), sourcePrefix = 'change') {
  return changes.map(change => ({
    target: change.target,
    before: before[change.target],
    after: evaluateExpression(change.expression, { state: before, locals, functions }),
    source: change.mode ? `${sourcePrefix}:${change.mode}` : sourcePrefix,
  }));
}

function applyProposed(before, changes) {
  const proposed = structuredClone(before);
  for (const change of changes) proposed[change.target] = change.after;
  return proposed;
}

function verifyPreserves(preserves, proposed, functions, locals, code, label) {
  for (const preserve of preserves) {
    const valid = evaluateExpression(preserve, { state: proposed, locals, functions });
    if (!valid) throw new RCLRuntimeError(code, `${label} violates a preserve/boundary clause`, { proposed });
  }
}

function commitState(state, proposed) {
  for (const key of Object.keys(state)) if (!Object.prototype.hasOwnProperty.call(proposed, key)) delete state[key];
  for (const [key, value] of Object.entries(proposed)) state[key] = value;
}

function domainRecord(kind, name, before, proposed, changes, extra = {}) {
  return {
    kind: 'DomainTransition',
    domainKind: kind,
    name,
    status: 'realized',
    beforeRoot: realityRoot(before),
    afterRoot: realityRoot(proposed),
    changes,
    ...extra,
  };
}

function recordHistory(runtime, record) {
  if (runtime.currentSpacetime) record.spacetime = structuredClone(runtime.currentSpacetime);
  runtime.history.push(record);
  return record;
}

async function executeRule(rule, mode, runtime) {
  const { program, state, functions, hostAdapters } = runtime;
  const before = structuredClone(state);
  const beforeRoot = realityRoot(before);
  const condition = evaluateExpression(rule.when, { state: before, locals: new Map(), functions });
  if (!condition) {
    return {
      kind: mode === 'foresee' ? 'Projection' : 'Transition', rule: rule.name, mode,
      status: 'not-triggered', beforeRoot, afterRoot: beforeRoot,
      changes: [], witnesses: rule.witnesses,
    };
  }

  const grants = verifyAuthority(rule, program, before, functions);
  const changes = evaluateChanges(rule.alters, before, functions, new Map(), 'alter');
  let proposed = applyProposed(before, changes);

  const hostResults = [];
  for (const call of rule.calls) {
    const result = await invokeHost(call, before, functions, hostAdapters, rule, mode);
    hostResults.push(result.request);
    changes.push({ target: result.target, before: proposed[result.target], after: result.value, source: `host:${call.capability}` });
    proposed[result.target] = result.value;
  }

  verifyPreserves(rule.preserves, proposed, functions, new Map(), 'RCL_REALITY_BOUND_BROKEN', `Rule '${rule.name}'`);

  const record = {
    kind: mode === 'foresee' ? 'Projection' : 'Transition',
    rule: rule.name, ruleKind: rule.kind, mode,
    status: mode === 'foresee' ? 'projected' : 'realized',
    actor: actorFor(rule), from: rule.from, into: rule.into,
    beforeRoot, afterRoot: realityRoot(proposed), changes,
    authority: {
      needs: rule.needs,
      activeWarrants: grants.map(grant => ({ subject: grant.subject, capability: grant.capability, target: grant.target })),
    },
    witnesses: [...rule.witnesses], hostCalls: hostResults,
  };

  if (mode === 'realize') {
    commitState(state, proposed);
    recordHistory(runtime, record);
  } else runtime.projections.push({ ...record, projectedState: proposed });
  return record;
}

function reflectMeta(domain, runtime) {
  const before = structuredClone(runtime.state);
  const changes = evaluateChanges(domain.revisions, before, runtime.functions, new Map(), 'meta:revise');
  const proposed = applyProposed(before, changes);
  verifyPreserves(domain.preserves, proposed, runtime.functions, new Map(), 'RCL_META_BOUND_BROKEN', `Meta reality '${domain.name}'`);
  commitState(runtime.state, proposed);
  const record = domainRecord('meta-computational', domain.name, before, proposed, changes, {
    inspections: [...domain.inspections],
    foundation: foundationSummary(runtime.program),
    authorityClass: 'metacomputational-self-inspection',
  });
  recordHistory(runtime, record);
  return record;
}

function advancePhysical(law, directive, runtime) {
  const count = evaluateCount(directive.count, runtime, 'Advance');
  const dt = evaluateExpression(directive.dt, { state: runtime.state, locals: new Map(), functions: runtime.functions });
  const records = [];
  for (let index = 0; index < count; index += 1) {
    const before = structuredClone(runtime.state);
    const locals = new Map([[law.step.name, dt]]);
    const active = evaluateExpression(law.when, { state: before, locals, functions: runtime.functions });
    if (!active) continue;
    const changes = evaluateChanges(law.evolves, before, runtime.functions, locals, 'physical:evolve');
    const proposed = applyProposed(before, changes);
    verifyPreserves(law.conserves, proposed, runtime.functions, locals, 'RCL_PHYSICAL_LAW_BROKEN', `Physical law '${law.name}'`);
    commitState(runtime.state, proposed);
    const record = domainRecord('physical', law.name, before, proposed, changes, {
      step: index + 1, dt, witnesses: [...law.witnesses], authorityClass: 'natural-law',
    });
    recordHistory(runtime, record); records.push(record);
  }
  return { kind: 'DomainRun', domainKind: 'physical', name: law.name, steps: count, records };
}

function observePerception(perception, runtime) {
  const before = structuredClone(runtime.state);
  const changes = perception.channels.map(channel => ({
    target: channel.path,
    before: before[channel.path],
    after: evaluateExpression(channel.expression, { state: before, locals: new Map(), functions: runtime.functions }),
    source: 'perception:observe',
  }));
  const proposed = applyProposed(before, changes);
  verifyPreserves(perception.preserves, proposed, runtime.functions, new Map(), 'RCL_PERCEPTION_BOUND_BROKEN', `Perception '${perception.name}'`);
  commitState(runtime.state, proposed);
  const record = domainRecord('perceptual', perception.name, before, proposed, changes, {
    observer: perception.observer, sourceReality: perception.source, authorityClass: 'observation',
  });
  recordHistory(runtime, record);
  return record;
}

function propagateNeural(neural, directive, runtime) {
  const count = evaluateCount(directive.count, runtime, 'Propagate');
  const records = [];
  for (let step = 0; step < count; step += 1) {
    for (const pathway of neural.pathways) {
      const before = structuredClone(runtime.state);
      if (!evaluateExpression(pathway.when, { state: before, locals: new Map(), functions: runtime.functions })) continue;
      const changes = evaluateChanges(pathway.changes, before, runtime.functions, new Map(), 'neural');
      const proposed = applyProposed(before, changes);
      verifyPreserves(pathway.preserves, proposed, runtime.functions, new Map(), 'RCL_NEURAL_BOUND_BROKEN', `Neural pathway '${pathway.name}'`);
      commitState(runtime.state, proposed);
      const record = domainRecord('neural', pathway.name, before, proposed, changes, {
        step: step + 1, witnesses: [...pathway.witnesses], authorityClass: 'intrinsic-neural-dynamics',
      });
      recordHistory(runtime, record); records.push(record);
    }
  }
  return { kind: 'DomainRun', domainKind: 'neural', name: neural.name, steps: count, records };
}

function updateSenses(living, runtime) {
  const changes = [];
  for (const sense of living.senses) {
    const value = getPath(runtime.state, sense.source);
    if (runtime.state[sense.path] !== value) changes.push({ target: sense.path, before: runtime.state[sense.path], after: value, source: 'living:sense' });
  }
  for (const change of changes) runtime.state[change.target] = change.after;
  return changes;
}

function liveLife(living, directive, runtime) {
  const count = evaluateCount(directive.count, runtime, 'Live');
  const records = [];
  for (let step = 0; step < count; step += 1) {
    const senseChanges = updateSenses(living, runtime);
    for (const cycle of living.cycles) {
      const before = structuredClone(runtime.state);
      if (!evaluateExpression(cycle.when, { state: before, locals: new Map(), functions: runtime.functions })) continue;
      const changes = [...senseChanges, ...evaluateChanges(cycle.changes, before, runtime.functions, new Map(), 'living')];
      const proposed = applyProposed(before, changes.filter(change => change.source !== 'living:sense'));
      verifyPreserves(living.maintains, proposed, runtime.functions, new Map(), 'RCL_LIFE_MAINTENANCE_BROKEN', `Living reality '${living.name}'`);
      commitState(runtime.state, proposed);
      const record = domainRecord('living', cycle.name, before, proposed, changes, {
        step: step + 1, body: living.body, needs: living.needs, witnesses: [...cycle.witnesses], authorityClass: 'intrinsic-life-cycle',
      });
      recordHistory(runtime, record); records.push(record);
    }
  }
  return { kind: 'DomainRun', domainKind: 'living', name: living.name, steps: count, records };
}

function inheritGenetic(genetic, directive, runtime) {
  const count = evaluateCount(directive.count, runtime, 'Inherit');
  const records = [];
  for (let generation = 0; generation < count; generation += 1) {
    const before = structuredClone(runtime.state);
    const mutationChanges = genetic.mutations.map(mutation => {
      const delta = evaluateExpression(mutation.expression, { state: before, locals: new Map(), functions: runtime.functions });
      return {
        target: mutation.target,
        before: before[mutation.target],
        after: applyBinary('+', before[mutation.target], delta),
        source: 'genetic:mutation',
      };
    });
    const mutated = applyProposed(before, mutationChanges);
    const expressionChanges = genetic.expressions.map(expression => ({
      target: expression.target,
      before: mutated[expression.target],
      after: evaluateExpression(expression.expression, { state: mutated, locals: new Map(), functions: runtime.functions }),
      source: 'genetic:expression',
    }));
    const proposed = applyProposed(mutated, expressionChanges);
    verifyPreserves(genetic.preserves, proposed, runtime.functions, new Map(), 'RCL_GENETIC_BOUND_BROKEN', `Genetic reality '${genetic.name}'`);
    commitState(runtime.state, proposed);
    const changes = [...mutationChanges, ...expressionChanges];
    const record = domainRecord('genetic', genetic.name, before, proposed, changes, {
      generation: generation + 1, witnesses: [...genetic.witnesses], authorityClass: 'lineage-transformation',
    });
    recordHistory(runtime, record); records.push(record);
  }
  return { kind: 'DomainRun', domainKind: 'genetic', name: genetic.name, generations: count, records };
}

function evaluateMeasurementDecl(decl, state, functions) {
  const value = evaluateExpression(decl.value, { state, locals: new Map(), functions });
  const uncertainty = decl.uncertainty
    ? evaluateExpression(decl.uncertainty, { state, locals: new Map(), functions })
    : undefined;
  const confidence = decl.confidence
    ? evaluateExpression(decl.confidence, { state, locals: new Map(), functions })
    : 1;
  return measurement(decl.baseType, value, {
    uncertainty, confidence, unit: decl.unit, scale: decl.scale,
    evidence: decl.evidence, calibratedBy: decl.calibratedBy,
  });
}

function quantifyDomain(domain, runtime) {
  const before = structuredClone(runtime.state);
  const measureChanges = [];
  const measured = structuredClone(before);
  for (const decl of domain.measures) {
    const value = evaluateMeasurementDecl(decl, before, runtime.functions);
    const change = { target: decl.path, before: before[decl.path], after: value, source: 'quantitative:measure' };
    measureChanges.push(change); measured[decl.path] = value;
  }
  const deriveChanges = domain.derives.map(derive => ({
    target: derive.path,
    before: measured[derive.path],
    after: evaluateExpression(derive.expression, { state: measured, locals: new Map(), functions: runtime.functions }),
    source: 'quantitative:derive',
  }));
  const proposed = applyProposed(measured, deriveChanges);
  verifyPreserves(domain.preserves, proposed, runtime.functions, new Map(), 'RCL_QUANTITATIVE_BOUND_BROKEN', `Quantitative reality '${domain.name}'`);
  commitState(runtime.state, proposed);
  const changes = [...measureChanges, ...deriveChanges];
  const record = domainRecord('quantitative', domain.name, before, proposed, changes, {
    measurements: domain.measures.map(decl => ({ path: decl.path, scale: decl.scale, evidence: decl.evidence, calibratedBy: decl.calibratedBy })),
    authorityClass: 'evidentiary-measurement',
  });
  recordHistory(runtime, record);
  return record;
}

function dependencyConfidence(paths, state) {
  if (!paths || paths.length === 0) return 1;
  const confidences = paths.map(path => {
    const value = getPath(state, path);
    if (!isKnowledge(value)) throw new RCLRuntimeError('RCL_EXPECTED_KNOWLEDGE', `Knowledge dependency '${path}' is not a knowledge claim`);
    return value.confidence;
  });
  return Math.min(...confidences);
}

function evaluateKnowledgeSpec(spec, state, functions, options = {}) {
  const value = evaluateExpression(spec.expression, { state, locals: new Map(), functions });
  const dependencyLimit = dependencyConfidence(spec.dependencies ?? [], state);
  const explicit = spec.confidence
    ? Number(evaluateExpression(spec.confidence, { state, locals: new Map(), functions }))
    : 1;
  const confidence = Math.min(explicit, dependencyLimit);
  const dependencyEvidence = (spec.dependencies ?? []).flatMap(path => {
    const dependency = state[path];
    return isKnowledge(dependency) ? dependency.evidence : [];
  });
  return knowledgeClaim(options.baseType ?? spec.baseType, value, {
    confidence,
    evidence: [...(spec.evidence ?? []), ...dependencyEvidence],
    source: spec.source,
    scope: spec.scope,
    status: options.status ?? spec.status,
    dependencies: spec.dependencies,
    revision: options.revision ?? 1,
    formedAtRoot: realityRoot(state),
  });
}

function learnKnowledge(domain, runtime) {
  const before = structuredClone(runtime.state);
  const working = structuredClone(before);
  const changes = [];

  for (const claim of domain.claims) {
    const value = evaluateKnowledgeSpec(claim, working, runtime.functions, { status: claim.status ?? 'provisional' });
    changes.push({ target: claim.path, before: working[claim.path] ?? null, after: value, source: 'knowledge:claim' });
    working[claim.path] = value;
  }

  for (const revision of domain.revisions) {
    const current = getPath(working, revision.target);
    if (!isKnowledge(current)) throw new RCLRuntimeError('RCL_EXPECTED_KNOWLEDGE', `Revision target '${revision.target}' is not knowledge`);
    const candidate = evaluateKnowledgeSpec(revision, working, runtime.functions, {
      baseType: current.baseType,
      status: revision.status ?? 'revision',
      revision: current.revision + 1,
    });
    const revised = reviseKnowledge(current, candidate);
    changes.push({ target: revision.target, before: current, after: revised, source: 'knowledge:revision' });
    working[revision.target] = revised;
  }

  const pending = [...domain.derives];
  let passes = 0;
  while (pending.length > 0 && passes <= domain.derives.length + 1) {
    passes += 1;
    let progressed = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const derive = pending[index];
      try {
        const value = evaluateKnowledgeSpec(derive, working, runtime.functions, { status: 'derived' });
        changes.push({ target: derive.path, before: working[derive.path] ?? null, after: value, source: 'knowledge:derive' });
        working[derive.path] = value;
        pending.splice(index, 1);
        progressed = true;
      } catch (error) {
        if (!(error instanceof RCLRuntimeError) || !['RCL_STATE_MISSING', 'RCL_EXPECTED_KNOWLEDGE'].includes(error.code)) throw error;
      }
    }
    if (!progressed) break;
  }
  if (pending.length > 0) {
    throw new RCLRuntimeError('RCL_KNOWLEDGE_DEPENDENCY', `Could not resolve knowledge dependencies in '${domain.name}'`, {
      pending: pending.map(item => item.path),
    });
  }

  for (const decay of domain.decays) {
    const current = getPath(working, decay.target);
    const amount = evaluateExpression(decay.amount, { state: working, locals: new Map(), functions: runtime.functions });
    const decayed = decayKnowledge(current, amount);
    changes.push({ target: decay.target, before: current, after: decayed, source: 'knowledge:forget' });
    working[decay.target] = decayed;
  }

  verifyPreserves(domain.preserves, working, runtime.functions, new Map(), 'RCL_KNOWLEDGE_BOUND_BROKEN', `Knowledge reality '${domain.name}'`);
  commitState(runtime.state, working);
  const record = domainRecord('knowledge', domain.name, before, working, changes, {
    knowledgeClaims: changes.map(change => ({
      path: change.target,
      confidence: change.after.confidence,
      evidence: change.after.evidence,
      source: change.after.source,
      status: change.after.status,
      dependencies: change.after.dependencies,
    })),
    conflicts: changes
      .filter(change => ['contested', 'revised'].includes(change.after.status) && change.after.alternatives.length > 0)
      .map(change => ({ path: change.target, status: change.after.status, alternatives: change.after.alternatives })),
    authorityClass: 'epistemic-formation',
  });
  recordHistory(runtime, record);
  return record;
}


function dependencyEvidence(paths, state) {
  return (paths ?? []).flatMap(path => {
    const value = getPath(state, path);
    return Array.isArray(value?.evidence) ? value.evidence : [];
  });
}

function dependencyConfidenceAny(paths, state) {
  if (!paths || paths.length === 0) return 1;
  return Math.min(...paths.map(path => evidenceConfidence(getPath(state, path))));
}

function interpretNaturalLanguage(domain, runtime) {
  const before = structuredClone(runtime.state);
  const working = structuredClone(before);
  const changes = [];

  for (const spec of domain.utterances) {
    const text = evaluateExpression(spec.expression, { state: working, locals: new Map(), functions: runtime.functions });
    const value = utterance(text, {
      speaker: spec.speaker, locale: spec.locale, channel: spec.channel,
      evidence: spec.evidence, formedAtRoot: realityRoot(working),
    });
    changes.push({ target: spec.path, before: working[spec.path] ?? null, after: value, source: 'language:utterance' });
    working[spec.path] = value;
  }

  for (const spec of domain.intents) {
    const active = Boolean(evaluateExpression(spec.when, { state: working, locals: new Map(), functions: runtime.functions }));
    const confidence = spec.confidence
      ? Number(evaluateExpression(spec.confidence, { state: working, locals: new Map(), functions: runtime.functions }))
      : (active ? 1 : 0);
    const slots = Object.fromEntries(spec.slots.map(slot => [slot.name, evaluateExpression(slot.expression, {
      state: working, locals: new Map(), functions: runtime.functions,
    })]));
    const value = intent(spec.name, {
      active, action: spec.action, target: spec.target, confidence: active ? confidence : 0,
      evidence: [...spec.evidence, ...dependencyEvidence(spec.utterances, working)],
      utterances: spec.utterances, slots, formedAtRoot: realityRoot(working),
    });
    changes.push({ target: spec.path, before: working[spec.path] ?? null, after: value, source: 'language:intent' });
    working[spec.path] = value;
  }

  verifyPreserves(domain.preserves, working, runtime.functions, new Map(), 'RCL_LANGUAGE_BOUND_BROKEN', `Natural-language plane '${domain.name}'`);
  commitState(runtime.state, working);
  const record = domainRecord('natural-language-plane', domain.name, before, working, changes, {
    utterances: domain.utterances.map(item => item.path),
    intents: domain.intents.map(item => item.path),
    authorityClass: 'symbolic-interpretation',
  });
  recordHistory(runtime, record);
  return record;
}

function runUnderstanding(domain, runtime) {
  const before = structuredClone(runtime.state);
  const working = structuredClone(before);
  const changes = [];
  const pending = [...domain.hypotheses];
  let passes = 0;

  while (pending.length > 0 && passes <= domain.hypotheses.length + 1) {
    passes += 1;
    let progressed = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const spec = pending[index];
      try {
        const value = evaluateExpression(spec.expression, { state: working, locals: new Map(), functions: runtime.functions });
        const dependencyLimit = dependencyConfidenceAny(spec.dependencies, working);
        const explicit = spec.confidence
          ? Number(evaluateExpression(spec.confidence, { state: working, locals: new Map(), functions: runtime.functions }))
          : 1;
        const coverage = spec.coverage
          ? Number(evaluateExpression(spec.coverage, { state: working, locals: new Map(), functions: runtime.functions }))
          : (spec.dependencies.length ? 1 : 0.75);
        const coherence = spec.coherence
          ? Number(evaluateExpression(spec.coherence, { state: working, locals: new Map(), functions: runtime.functions }))
          : Math.min(explicit, dependencyLimit);
        const result = understanding(spec.baseType, value, {
          confidence: Math.min(explicit, dependencyLimit), coverage, coherence,
          explanation: spec.explanation, evidence: [...spec.evidence, ...dependencyEvidence(spec.dependencies, working)],
          dependencies: spec.dependencies, status: spec.status, formedAtRoot: realityRoot(working),
        });
        changes.push({ target: spec.path, before: working[spec.path] ?? null, after: result, source: 'understanding:model' });
        working[spec.path] = result;
        pending.splice(index, 1);
        progressed = true;
      } catch (error) {
        if (!(error instanceof RCLRuntimeError) || !['RCL_STATE_MISSING', 'RCL_EXPECTED_COGNITIVE_OBJECT'].includes(error.code)) throw error;
      }
    }
    if (!progressed) break;
  }
  if (pending.length) throw new RCLRuntimeError('RCL_UNDERSTANDING_DEPENDENCY', `Could not resolve understanding dependencies in '${domain.name}'`, { pending: pending.map(item => item.path) });

  verifyPreserves(domain.preserves, working, runtime.functions, new Map(), 'RCL_UNDERSTANDING_BOUND_BROKEN', `Understanding plane '${domain.name}'`);
  commitState(runtime.state, working);
  const record = domainRecord('understanding-plane', domain.name, before, working, changes, {
    explanations: changes.map(change => ({ path: change.target, explanation: change.after.explanation, confidence: change.after.confidence })),
    authorityClass: 'world-model-formation',
  });
  recordHistory(runtime, record);
  return record;
}

function runCreation(domain, runtime) {
  const before = structuredClone(runtime.state);
  const working = structuredClone(before);
  const changes = [];

  for (const spec of domain.candidates) {
    const active = Boolean(evaluateExpression(spec.when, { state: working, locals: new Map(), functions: runtime.functions }));
    const value = evaluateExpression(spec.expression, { state: working, locals: new Map(), functions: runtime.functions });
    const metric = (name, fallback) => spec[name]
      ? Number(evaluateExpression(spec[name], { state: working, locals: new Map(), functions: runtime.functions }))
      : fallback;
    const candidate = creationCandidate(spec.baseType, value, {
      active, target: spec.target,
      novelty: metric('novelty', 0.5), utility: metric('utility', 0.5),
      feasibility: metric('feasibility', 0.5), risk: metric('risk', 0.5),
      evidence: [...spec.evidence, ...dependencyEvidence(spec.basedOn, working)],
      basedOn: spec.basedOn, formedAtRoot: realityRoot(working),
    });
    changes.push({ target: spec.path, before: working[spec.path] ?? null, after: candidate, source: 'creation:candidate' });
    working[spec.path] = candidate;
  }

  const candidates = domain.selection.candidates.map(path => getPath(working, path)).filter(item => isCreation(item) && item.active);
  if (candidates.length === 0) throw new RCLRuntimeError('RCL_CREATION_NO_CANDIDATE', `Creative plane '${domain.name}' has no active candidates`);
  const best = candidates.reduce((winner, item) => item.score > winner.score ? item : winner);
  const selectedValue = selectCreation(best, domain.selection.candidates);
  changes.push({ target: domain.selection.path, before: working[domain.selection.path] ?? null, after: selectedValue, source: 'creation:select' });
  working[domain.selection.path] = selectedValue;

  verifyPreserves(domain.preserves, working, runtime.functions, new Map(), 'RCL_CREATION_BOUND_BROKEN', `Creative plane '${domain.name}'`);
  commitState(runtime.state, working);
  const record = domainRecord('creative-plane', domain.name, before, working, changes, {
    candidates: domain.candidates.map(item => ({ path: item.path, score: working[item.path].score, active: working[item.path].active })),
    selected: { path: domain.selection.path, value: selectedValue.value, score: selectedValue.score, target: selectedValue.target },
    authorityClass: 'bounded-novelty-generation',
  });
  recordHistory(runtime, record);
  return record;
}



function energizeEnergy(domain, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_ENERGY_UNKNOWN', 'Unknown energy reality');
  const before = structuredClone(runtime.state); const proposed = structuredClone(before); const changes = []; const flows = [];
  for (const flow of domain.flows) {
    const source = getPath(proposed, flow.from); const target = getPath(proposed, flow.to);
    const amount = evaluateExpression(flow.amount, { state: proposed, locals: new Map(), functions: runtime.functions });
    const efficiency = Number(evaluateExpression(flow.efficiency, { state: proposed, locals: new Map(), functions: runtime.functions }));
    if (!Number.isFinite(efficiency) || efficiency < 0 || efficiency > 1) throw new RCLRuntimeError('RCL_ENERGY_EFFICIENCY', `Energy flow '${flow.name}' efficiency must be in [0,1]`);
    if (!isQuantity(source) || source.type !== 'Energy' || !isQuantity(target) || target.type !== 'Energy' || !isQuantity(amount) || amount.type !== 'Energy') throw new RCLRuntimeError('RCL_EXPECTED_ENERGY', `Energy flow '${flow.name}' requires Energy reservoirs and amount`);
    if (source.value < amount.value) throw new RCLRuntimeError('RCL_ENERGY_INSUFFICIENT', `Energy flow '${flow.name}' exceeds source reservoir`);
    const delivered = multiplyEnergy(amount, efficiency); const loss = multiplyEnergy(amount, 1 - efficiency);
    const sourceAfter = applyBinary('-', source, amount); const targetAfter = applyBinary('+', target, delivered);
    changes.push({ target: flow.from, before: source, after: sourceAfter, source: `energy:${flow.localName}:out` });
    changes.push({ target: flow.to, before: target, after: targetAfter, source: `energy:${flow.localName}:in` });
    proposed[flow.from] = sourceAfter; proposed[flow.to] = targetAfter;
    flows.push({ name: flow.name, from: flow.from, to: flow.to, amount, delivered, loss, efficiency, evidence: flow.evidence });
  }
  verifyPreserves(domain.preserves, proposed, runtime.functions, new Map(), 'RCL_ENERGY_BOUND_BROKEN', `Energy reality '${domain.name}'`);
  commitState(runtime.state, proposed);
  const record = domainRecord('energy', domain.name, before, proposed, changes, { flows, witnesses: domain.witnesses, authorityClass: 'energy-budget-flow' });
  recordHistory(runtime, record); return record;
}

function constituteElements(domain, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_ELEMENT_UNKNOWN', 'Unknown element reality');
  const before = structuredClone(runtime.state); const proposed = structuredClone(before); const changes = [];
  for (const spec of domain.species) {
    const value = elementEntity(spec.localName, {
      category: 'species', symbol: spec.symbol,
      atomicNumber: spec.atomicNumber ? Number(evaluateExpression(spec.atomicNumber, { state: proposed, locals: new Map(), functions: runtime.functions })) : null,
      atomicMass: spec.atomicMass ? Number(evaluateExpression(spec.atomicMass, { state: proposed, locals: new Map(), functions: runtime.functions })) : null,
      charge: spec.charge ? Number(evaluateExpression(spec.charge, { state: proposed, locals: new Map(), functions: runtime.functions })) : 0,
      phase: spec.phase, evidence: spec.evidence,
    });
    changes.push({ target: spec.path, before: proposed[spec.path] ?? null, after: value, source: 'element:species' }); proposed[spec.path] = value;
  }
  for (const spec of domain.compounds) {
    const components = {};
    for (const item of spec.components) {
      const component = getPath(proposed, item.component);
      if (!isElementEntity(component)) throw new RCLRuntimeError('RCL_EXPECTED_ELEMENT', `Compound '${spec.path}' component '${item.component}' is not Element`);
      const coefficient = Number(evaluateExpression(item.coefficient, { state: proposed, locals: new Map(), functions: runtime.functions }));
      if (!Number.isFinite(coefficient) || coefficient <= 0) throw new RCLRuntimeError('RCL_ELEMENT_COEFFICIENT', 'Component coefficient must be positive');
      components[item.component] = coefficient;
    }
    const value = elementEntity(spec.localName, { category: 'compound', components, bond: spec.bond, evidence: spec.evidence });
    changes.push({ target: spec.path, before: proposed[spec.path] ?? null, after: value, source: 'element:compound' }); proposed[spec.path] = value;
  }
  verifyPreserves(domain.preserves, proposed, runtime.functions, new Map(), 'RCL_ELEMENT_BOUND_BROKEN', `Element reality '${domain.name}'`);
  commitState(runtime.state, proposed);
  const record = domainRecord('element', domain.name, before, proposed, changes, { species: domain.species.length, compounds: domain.compounds.length, authorityClass: 'constituent-composition' });
  recordHistory(runtime, record); return record;
}

function investigateScience(domain, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_SCIENCE_UNKNOWN', 'Unknown science reality');
  const before = structuredClone(runtime.state); const working = structuredClone(before); const changes = [];
  const hypothesisSpecs = new Map(domain.hypotheses.map(item => [item.path, item]));
  for (const spec of domain.hypotheses) {
    const value = evaluateExpression(spec.expression, { state: working, locals: new Map(), functions: runtime.functions });
    const confidence = spec.confidence ? Number(evaluateExpression(spec.confidence, { state: working, locals: new Map(), functions: runtime.functions })) : 0.5;
    const claim = scientificClaim(spec.baseType, value, { confidence, status: 'hypothesis', evidence: spec.evidence, source: spec.path });
    changes.push({ target: spec.path, before: working[spec.path] ?? null, after: claim, source: 'science:hypothesis' }); working[spec.path] = claim;
  }
  for (const spec of domain.experiments) {
    const hypothesis = hypothesisSpecs.get(spec.hypothesis); if (!hypothesis) throw new RCLRuntimeError('RCL_SCIENCE_HYPOTHESIS_UNKNOWN', `Unknown hypothesis '${spec.hypothesis}'`);
    const repeats = Math.max(1, Math.floor(Number(evaluateExpression(spec.repeats, { state: working, locals: new Map(), functions: runtime.functions }))));
    const tolerance = Number(evaluateExpression(spec.tolerance, { state: working, locals: new Map(), functions: runtime.functions }));
    const observed = Array.from({ length: repeats }, () => evaluateExpression(hypothesis.expression, { state: working, locals: new Map(), functions: runtime.functions }));
    const matches = observed.filter(value => valuesEquivalent(value, observed[0], tolerance)).length;
    const result = experimentResult(spec.localName, { hypothesis: spec.hypothesis, method: spec.method, repeats, consistent: matches === repeats, reproducibility: matches / repeats, observed, evidence: spec.evidence });
    changes.push({ target: spec.path, before: working[spec.path] ?? null, after: result, source: 'science:experiment' }); working[spec.path] = result;
    const oldClaim = working[spec.hypothesis];
    const supported = scientificClaim(oldClaim.baseType, oldClaim.value, { confidence: oldClaim.confidence, status: result.consistent ? 'supported' : 'contested', evidence: [...oldClaim.evidence, ...result.evidence], method: result.method, replications: repeats, reproducibility: result.reproducibility, falsified: !result.consistent, source: oldClaim.source });
    changes.push({ target: spec.hypothesis, before: oldClaim, after: supported, source: 'science:replication' }); working[spec.hypothesis] = supported;
  }
  for (const spec of domain.conclusions) {
    const source = getPath(working, spec.source); if (!isScientificClaim(source)) throw new RCLRuntimeError('RCL_EXPECTED_SCIENCE', `Conclusion source '${spec.source}' is not scientific claim`);
    const confidence = spec.confidence ? Number(evaluateExpression(spec.confidence, { state: working, locals: new Map(), functions: runtime.functions })) : source.confidence * source.reproducibility;
    const conclusion = scientificClaim('Truth', source.status === 'supported' && !source.falsified, { confidence, status: 'conclusion', evidence: [...source.evidence, ...spec.evidence], method: source.method, replications: source.replications, reproducibility: source.reproducibility, falsified: source.falsified, source: spec.source });
    changes.push({ target: spec.path, before: working[spec.path] ?? null, after: conclusion, source: 'science:conclusion' }); working[spec.path] = conclusion;
  }
  verifyPreserves(domain.preserves, working, runtime.functions, new Map(), 'RCL_SCIENCE_BOUND_BROKEN', `Science reality '${domain.name}'`);
  commitState(runtime.state, working);
  const record = domainRecord('science', domain.name, before, working, changes, { hypotheses: domain.hypotheses.length, experiments: domain.experiments.length, conclusions: domain.conclusions.length, authorityClass: 'falsifiable-evidence-method' });
  recordHistory(runtime, record); return record;
}

function embodyReality(domain, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_BODY_UNKNOWN', 'Unknown embodiment reality');
  const before = structuredClone(runtime.state); const proposed = structuredClone(before);
  const maintained = domain.maintains.map(expr => Boolean(evaluateExpression(expr, { state: proposed, locals: new Map(), functions: runtime.functions })));
  const coherence = maintained.length ? maintained.filter(Boolean).length / maintained.length : 1;
  const value = bodyState(domain.name, { systems: domain.systems.map(item => item.path), organs: domain.organs.map(item => item.path), bindings: domain.bindings, maintained: maintained.every(Boolean), coherence, evidence: domain.evidence });
  const target = `${domain.name}.state`; const changes = [{ target, before: proposed[target] ?? null, after: value, source: 'body:embodiment' }]; proposed[target] = value;
  if (!value.maintained) throw new RCLRuntimeError('RCL_BODY_HOMEOSTASIS', `Embodiment '${domain.name}' failed maintain clauses`);
  commitState(runtime.state, proposed);
  const record = domainRecord('body', domain.name, before, proposed, changes, { systems: value.systems, organs: value.organs, bindings: value.bindings, coherence, authorityClass: 'embodied-boundary-homeostasis' });
  recordHistory(runtime, record); return record;
}

function integrateSpirit(domain, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_SPIRIT_UNKNOWN', 'Unknown spirit reality');
  const before = structuredClone(runtime.state); const proposed = structuredClone(before);
  const makeMap = items => Object.fromEntries(items.map(item => [item.localName, { value: getPath(proposed, item.path), weight: Number(evaluateExpression(item.weight, { state: proposed, locals: new Map(), functions: runtime.functions })) }]));
  const values = makeMap(domain.values); const purposes = makeMap(domain.purposes); const affects = makeMap(domain.affects);
  const weights = [...domain.values, ...domain.purposes, ...domain.affects].map(item => Number(evaluateExpression(item.weight, { state: proposed, locals: new Map(), functions: runtime.functions })));
  const normalized = weights.length ? weights.filter(value => Number.isFinite(value) && value >= 0).reduce((a,b)=>a+b,0) / weights.length : 1;
  const preserves = domain.preserves.map(expr => Boolean(evaluateExpression(expr, { state: proposed, locals: new Map(), functions: runtime.functions })));
  const coherence = Math.max(0, Math.min(1, (preserves.length ? preserves.filter(Boolean).length / preserves.length : 1) * Math.min(1, normalized || 1)));
  const identityFacet = domain.facets.find(item => item.path.endsWith('.identity'));
  const value = spiritState(domain.name, { identity: identityFacet ? proposed[identityFacet.path] : domain.name, values, purposes, affects, coherence, integrated: preserves.every(Boolean), evidence: domain.evidence });
  const target = `${domain.name}.state`; const changes = [{ target, before: proposed[target] ?? null, after: value, source: 'spirit:integration' }]; proposed[target] = value;
  verifyPreserves(domain.preserves, proposed, runtime.functions, new Map(), 'RCL_SPIRIT_BOUND_BROKEN', `Spirit reality '${domain.name}'`);
  commitState(runtime.state, proposed);
  const record = domainRecord('spirit', domain.name, before, proposed, changes, { coherence, identity: value.identity, authorityClass: 'identity-meaning-will-integration' });
  recordHistory(runtime, record); return record;
}

function synchronizeSpacetime(domain, directive, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_SPACETIME_UNKNOWN', 'Unknown spacetime reality');
  validateCausalRelations(domain.relations);
  const count = evaluateCount(directive.count, runtime, 'Synchronize');
  const records = [];
  if (domain.clocks.length === 0) throw new RCLRuntimeError('RCL_SPACETIME_CLOCK_REQUIRED', `Spacetime '${domain.name}' requires at least one clock`);

  for (let step = 0; step < count; step += 1) {
    const before = structuredClone(runtime.state);
    const changes = [];
    const clockDeltas = new Map();
    const proposed = structuredClone(before);

    for (const clock of domain.clocks) {
      const tick = evaluateExpression(clock.tick, { state: before, locals: new Map(), functions: runtime.functions });
      const rate = Number(evaluateExpression(clock.rate, { state: before, locals: new Map(), functions: runtime.functions }));
      if (!isQuantity(tick) || tick.type !== 'Time') throw new RCLRuntimeError('RCL_SPACETIME_CLOCK_TICK', `Clock '${clock.path}' tick must be Time`);
      if (!Number.isFinite(rate) || rate <= 0) throw new RCLRuntimeError('RCL_SPACETIME_CLOCK_RATE', `Clock '${clock.path}' rate must be positive`, { rate });
      const delta = quantity('Time', tick.value * rate, tick.unit);
      const current = before[clock.path];
      if (!isQuantity(current) || current.type !== 'Time') throw new RCLRuntimeError('RCL_SPACETIME_CLOCK_STATE', `Clock '${clock.path}' state must be Time`);
      const after = applyBinary('+', current, delta);
      clockDeltas.set(clock.path, { delta, after });
      changes.push({ target: clock.path, before: current, after, source: 'meta-spacetime:clock' });
      proposed[clock.path] = after;
    }

    const defaultClock = domain.clocks[0]?.path;
    for (const coordinate of domain.coordinates) {
      const current = before[coordinate.path];
      if (!isSpacetimePoint(current)) throw new RCLRuntimeError('RCL_SPACETIME_COORDINATE_STATE', `Coordinate '${coordinate.path}' must be SpacetimePoint`);
      const clockPath = coordinate.clock ?? defaultClock;
      const clock = clockDeltas.get(clockPath);
      if (!clock) throw new RCLRuntimeError('RCL_SPACETIME_COORDINATE_CLOCK', `Coordinate '${coordinate.path}' cannot resolve clock '${clockPath}'`);
      const after = spacetimePoint(current.frame, current.x, current.y, current.z, clock.after, coordinate.target ?? current.target);
      changes.push({ target: coordinate.path, before: current, after, source: 'meta-spacetime:coordinate' });
      proposed[coordinate.path] = after;
    }

    verifyPreserves(domain.preserves, proposed, runtime.functions, new Map(), 'RCL_SPACETIME_BOUND_BROKEN', `Spacetime reality '${domain.name}'`);
    commitState(runtime.state, proposed);
    runtime.currentSpacetime = {
      domain: domain.name,
      step: step + 1,
      clocks: Object.fromEntries(domain.clocks.map(clock => [clock.path, structuredClone(proposed[clock.path])])),
      frameRoots: Object.fromEntries(domain.frames.map(frame => [frame.name, realityRoot(frame)])),
      causalRoot: realityRoot(domain.relations),
    };
    const record = domainRecord('meta-spacetime', domain.name, before, proposed, changes, {
      step: step + 1,
      frames: domain.frames,
      relations: domain.relations,
      authorityClass: 'meta-location-and-causal-order',
    });
    recordHistory(runtime, record);
    records.push(record);
  }
  return { kind: 'MetaPlaneRun', plane: 'meta-spacetime', name: domain.name, steps: count, records };
}

function activateAcceleration(domain, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_ACCELERATION_UNKNOWN', 'Unknown acceleration reality');
  const factor = Number(evaluateExpression(domain.factor, { state: runtime.state, locals: new Map(), functions: runtime.functions }));
  const fidelity = Number(evaluateExpression(domain.fidelity, { state: runtime.state, locals: new Map(), functions: runtime.functions }));
  const budget = domain.budget
    ? evaluateExpression(domain.budget, { state: runtime.state, locals: new Map(), functions: runtime.functions })
    : null;
  if (!Number.isFinite(factor) || factor < 1) throw new RCLRuntimeError('RCL_ACCELERATION_FACTOR', 'Acceleration factor must be at least 1', { factor });
  if (!Number.isFinite(fidelity) || fidelity < 0 || fidelity > 1) throw new RCLRuntimeError('RCL_ACCELERATION_FIDELITY', 'Acceleration fidelity must be between 0 and 1', { fidelity });
  if (fidelity < 1) throw new RCLRuntimeError('RCL_ACCELERATION_REFERENCE_FIDELITY', 'The v0.5 reference runtime only enables exact acceleration with fidelity 1');
  verifyPreserves(domain.preserves, runtime.state, runtime.functions, new Map(), 'RCL_ACCELERATION_BOUND_BROKEN', `Acceleration reality '${domain.name}'`);

  const fn = runtime.functions.get(domain.target);
  if (!fn) throw new RCLRuntimeError('RCL_ACCELERATION_TARGET_UNKNOWN', `Unknown reckoning '${domain.target}'`);
  fn.__rclMetrics = { requests: 0, evaluations: 0, cacheHits: 0 };
  fn.__rclAcceleration = { strategy: domain.strategy, cache: new Map(), factor, fidelity };
  const profile = {
    name: domain.name,
    target: domain.target,
    strategy: domain.strategy,
    factor,
    fidelity,
    budget,
    evidence: [...domain.evidence],
    activatedAtRoot: realityRoot(runtime.state),
    cache: fn.__rclAcceleration.cache,
  };
  runtime.accelerationProfiles.set(domain.name, profile);
  const before = structuredClone(runtime.state);
  const record = domainRecord('meta-acceleration', domain.name, before, before, [], {
    profile: { ...profile, cache: undefined },
    authorityClass: 'meta-execution-optimization',
  });
  recordHistory(runtime, record);
  return record;
}

function compressReality(domain, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_COMPRESSION_UNKNOWN', 'Unknown compression reality');
  const fidelity = domain.fidelity
    ? Number(evaluateExpression(domain.fidelity, { state: runtime.state, locals: new Map(), functions: runtime.functions }))
    : 1;
  const maxRatio = domain.maxRatio
    ? Number(evaluateExpression(domain.maxRatio, { state: runtime.state, locals: new Map(), functions: runtime.functions }))
    : 1;
  if (domain.mode === 'lossless' && fidelity !== 1) throw new RCLRuntimeError('RCL_COMPRESSION_FIDELITY', 'Lossless compression requires fidelity 1');
  verifyPreserves(domain.preserves, runtime.state, runtime.functions, new Map(), 'RCL_COMPRESSION_BOUND_BROKEN', `Compression reality '${domain.name}'`);
  const capsule = createCompressionCapsule(runtime.state, { ...domain, fidelity });
  if (capsule.ratio > maxRatio) {
    throw new RCLRuntimeError('RCL_COMPRESSION_RATIO_EXCEEDED', `Compression '${domain.name}' ratio ${capsule.ratio} exceeds ${maxRatio}`, {
      ratio: capsule.ratio,
      maxRatio,
    });
  }
  runtime.compressionCapsules.set(domain.name, capsule);
  const before = structuredClone(runtime.state);
  const proposed = structuredClone(before);
  const changes = [];
  if (domain.discard) {
    for (const key of capsule.keys) {
      changes.push({ target: key, before: proposed[key], after: null, source: 'meta-compression:discard' });
      delete proposed[key];
    }
    commitState(runtime.state, proposed);
  }
  const record = domainRecord('meta-compression', domain.name, before, proposed, changes, {
    capsule: {
      target: capsule.target,
      codec: capsule.codec,
      mode: capsule.mode,
      reversible: capsule.reversible,
      fidelity: capsule.fidelity,
      originalRoot: capsule.originalRoot,
      originalBytes: capsule.originalBytes,
      compressedBytes: capsule.compressedBytes,
      ratio: capsule.ratio,
      evidence: capsule.evidence,
    },
    authorityClass: 'meta-representation-compression',
  });
  recordHistory(runtime, record);
  return record;
}

function restoreReality(domain, runtime) {
  if (!domain) throw new RCLRuntimeError('RCL_COMPRESSION_UNKNOWN', 'Unknown compression reality');
  const capsule = runtime.compressionCapsules.get(domain.name);
  if (!capsule) throw new RCLRuntimeError('RCL_COMPRESSION_CAPSULE_MISSING', `Compression '${domain.name}' has no capsule to restore`);
  const restored = restoreCompressionCapsule(capsule);
  const before = structuredClone(runtime.state);
  const proposed = structuredClone(before);
  const changes = [];
  for (const [key, value] of Object.entries(restored)) {
    changes.push({ target: key, before: proposed[key] ?? null, after: value, source: 'meta-compression:restore' });
    proposed[key] = value;
  }
  commitState(runtime.state, proposed);
  const record = domainRecord('meta-compression-restore', domain.name, before, proposed, changes, {
    originalRoot: capsule.originalRoot,
    restoredRoot: realityRoot(restored),
    authorityClass: 'meta-representation-restoration',
  });
  recordHistory(runtime, record);
  return record;
}

function initializeState(program, functions, providers = {}) {
  const state = {};
  const pending = program.facets.filter(facet => !facet.deferred);
  let passes = 0;
  while (pending.length > 0 && passes <= program.facets.length + 1) {
    passes += 1;
    let progressed = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const facet = pending[index];
      try {
        let value = facet.measure
          ? evaluateMeasurementDecl(facet.measure, state, functions)
          : evaluateExpression(facet.value, { state, locals: new Map(), functions, providers });
        if (facet.spacetimeCoordinate) {
          if (!isSpacetimePoint(value)) throw new RCLRuntimeError('RCL_SPACETIME_COORDINATE_STATE', `Coordinate '${facet.path}' must initialize from point()`);
          value = spacetimePoint(value.frame, value.x, value.y, value.z, value.t, facet.spacetimeCoordinate.target ?? value.target);
        }
        state[facet.path] = value;
        pending.splice(index, 1);
        progressed = true;
      } catch (error) {
        if (!(error instanceof RCLRuntimeError) || error.code !== 'RCL_STATE_MISSING') throw error;
      }
    }
    if (!progressed) break;
  }
  if (pending.length > 0) {
    throw new RCLRuntimeError('RCL_INITIALIZATION_DEPENDENCY', 'Could not resolve initial facet dependencies', {
      pending: pending.map(facet => facet.path),
    });
  }
  return state;
}

export async function runReality(compiledOrSource, options = {}) {
  const program = typeof compiledOrSource === 'string' ? compileReality(compiledOrSource, options.compilerOptions ?? options) : compiledOrSource;
  const functions = new Map(program.reckons.map(fn => [fn.name, fn]));
  const state = initializeState(program, functions, options.providers ?? {});
  const runtime = {
    program, state, functions,
    hostAdapters: options.hostAdapters ?? {},
    providers: options.providers ?? {},
    history: [], projections: [],
    currentSpacetime: null,
    accelerationProfiles: new Map(),
    compressionCapsules: new Map(),
  };
  const outputs = [];
  const ruleMap = new Map(program.rules.map(rule => [rule.name, rule]));
  const metaMap = new Map(program.metaDomains.map(domain => [domain.name, domain]));
  const lawMap = new Map(program.physicals.flatMap(domain => domain.laws.map(law => [law.name, law])));
  const perceptionMap = new Map(program.perceptions.map(domain => [domain.name, domain]));
  const neuralMap = new Map(program.neurals.map(domain => [domain.name, domain]));
  const livingMap = new Map(program.livings.map(domain => [domain.name, domain]));
  const geneticMap = new Map(program.genetics.map(domain => [domain.name, domain]));
  const quantitativeMap = new Map(program.quantitatives.map(domain => [domain.name, domain]));
  const knowledgeMap = new Map(program.knowledges.map(domain => [domain.name, domain]));
  const naturalLanguageMap = new Map(program.naturalLanguages.map(domain => [domain.name, domain]));
  const understandingMap = new Map(program.understandings.map(domain => [domain.name, domain]));
  const creationMap = new Map(program.creations.map(domain => [domain.name, domain]));
  const spacetimeMap = new Map(program.spacetimes.map(domain => [domain.name, domain]));
  const accelerationMap = new Map(program.accelerations.map(domain => [domain.name, domain]));
  const compressionMap = new Map(program.compressions.map(domain => [domain.name, domain]));
  const energyMap = new Map(program.energies.map(domain => [domain.name, domain]));
  const elementMap = new Map(program.elements.map(domain => [domain.name, domain]));
  const scienceMap = new Map(program.sciences.map(domain => [domain.name, domain]));
  const embodimentMap = new Map(program.embodiments.map(domain => [domain.name, domain]));
  const spiritMap = new Map(program.spirits.map(domain => [domain.name, domain]));

  for (const directive of program.directives) {
    if (directive.kind === 'Foresee' || directive.kind === 'Realize') {
      const rule = ruleMap.get(directive.rule);
      if (!rule) throw new RCLRuntimeError('RCL_RULE_UNKNOWN', `Unknown rule '${directive.rule}'`);
      outputs.push(await executeRule(rule, directive.kind === 'Foresee' ? 'foresee' : 'realize', runtime));
    } else if (directive.kind === 'Reflect') outputs.push(reflectMeta(metaMap.get(directive.name), runtime));
    else if (directive.kind === 'Advance') outputs.push(advancePhysical(lawMap.get(directive.name), directive, runtime));
    else if (directive.kind === 'Observe') outputs.push(observePerception(perceptionMap.get(directive.name), runtime));
    else if (directive.kind === 'Propagate') outputs.push(propagateNeural(neuralMap.get(directive.name), directive, runtime));
    else if (directive.kind === 'Live') outputs.push(liveLife(livingMap.get(directive.name), directive, runtime));
    else if (directive.kind === 'Inherit') outputs.push(inheritGenetic(geneticMap.get(directive.name), directive, runtime));
    else if (directive.kind === 'Quantify') outputs.push(quantifyDomain(quantitativeMap.get(directive.name), runtime));
    else if (directive.kind === 'Learn') outputs.push(learnKnowledge(knowledgeMap.get(directive.name), runtime));
    else if (directive.kind === 'Interpret') outputs.push(interpretNaturalLanguage(naturalLanguageMap.get(directive.name), runtime));
    else if (directive.kind === 'Understand') outputs.push(runUnderstanding(understandingMap.get(directive.name), runtime));
    else if (directive.kind === 'Create') outputs.push(runCreation(creationMap.get(directive.name), runtime));
    else if (directive.kind === 'Synchronize') outputs.push(synchronizeSpacetime(spacetimeMap.get(directive.name), directive, runtime));
    else if (directive.kind === 'Accelerate') outputs.push(activateAcceleration(accelerationMap.get(directive.name), runtime));
    else if (directive.kind === 'Compress') outputs.push(compressReality(compressionMap.get(directive.name), runtime));
    else if (directive.kind === 'Restore') outputs.push(restoreReality(compressionMap.get(directive.name), runtime));
    else if (directive.kind === 'Energize') outputs.push(energizeEnergy(energyMap.get(directive.name), runtime));
    else if (directive.kind === 'Constitute') outputs.push(constituteElements(elementMap.get(directive.name), runtime));
    else if (directive.kind === 'Investigate') outputs.push(investigateScience(scienceMap.get(directive.name), runtime));
    else if (directive.kind === 'Embody') outputs.push(embodyReality(embodimentMap.get(directive.name), runtime));
    else if (directive.kind === 'Integrate') outputs.push(integrateSpirit(spiritMap.get(directive.name), runtime));
  }

  return {
    format: 'rcl.reality-run.v0.6',
    program: program.name,
    programRoot: program.programRoot,
    foundation: foundationSummary(program),
    state: structuredClone(state),
    stateRoot: realityRoot(state),
    history: runtime.history,
    projections: runtime.projections,
    naturalLanguageReality: buildNaturalLanguageReality(program, state, runtime.history),
    understandingReality: buildUnderstandingReality(program, state, runtime.history),
    creativeReality: buildCreativeReality(program, state, runtime.history),
    spacetimeReality: buildSpacetimeReality(program, state, runtime.history, runtime),
    accelerationReality: buildAccelerationReality(program, runtime),
    compressionReality: buildCompressionReality(program, runtime),
    energyReality: runtime.history.filter(item => item.domainKind === 'energy'),
    elementReality: runtime.history.filter(item => item.domainKind === 'element'),
    scienceReality: runtime.history.filter(item => item.domainKind === 'science'),
    bodyReality: runtime.history.filter(item => item.domainKind === 'body'),
    spiritReality: runtime.history.filter(item => item.domainKind === 'spirit'),
    innerReality: buildInnerReality(program, state),
    executionReality: buildExecutionReality(program, runtime.history, runtime.projections),
    foundationRuntime: buildFoundationRuntimeResults({ history: runtime.history, projections: runtime.projections, programRoot: program.programRoot }),
    outputs,
  };
}
