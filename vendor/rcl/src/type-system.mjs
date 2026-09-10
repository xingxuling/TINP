import {
  SIMPLE_TYPES,
  QUANTITY_TYPES,
  isKnownBaseType,
  measurementType,
  isMeasurementType,
  measurementBaseType,
  inferBinaryType,
  quantityConstructorTypes,
} from './quantity.mjs';
import { knowledgeType, isKnowledgeType, knowledgeBaseType } from './knowledge.mjs';
import { understandingType, isUnderstandingType, understandingBaseType, creationType, isCreationType, creationBaseType } from './cognition.mjs';
import { scienceType, isScienceType, scienceBaseType } from './final-foundation.mjs';

export function isKnownType(type) {
  return isKnownBaseType(type) || isMeasurementType(type) || isKnowledgeType(type)
    || isUnderstandingType(type) || isCreationType(type) || isScienceType(type) || ['Utterance', 'Intent', 'Sequence', 'Span', 'Token', 'AstNode', 'ParseState', 'Symbol', 'SemanticNode', 'IrNode'].includes(type);
}

function isEvidenceType(type) {
  return isMeasurementType(type) || isKnowledgeType(type) || isUnderstandingType(type)
    || isCreationType(type) || isScienceType(type) || ['Utterance', 'Intent'].includes(type);
}
export function valueType(value) {
  if (typeof value === 'number') return 'Number';
  if (typeof value === 'string') return 'Text';
  if (typeof value === 'boolean') return 'Truth';
  return 'Unknown';
}

const SCALE_TYPES = new Set(['nominal', 'ordinal', 'interval', 'ratio', 'probabilistic']);

function diagnostic(code, message, node) {
  return { code, message, nodeKind: node?.kind ?? null };
}

function scopeMatches(granted, required) {
  return granted === required || required.startsWith(`${granted}.`) || granted === '*';
}

function arraysFromPhysical(node) {
  return [
    ...node.facets,
    ...node.bodies.flatMap(body => body.facets),
    ...node.fields.flatMap(field => field.facets),
  ];
}

export function checkReality(program, options = {}) {
  const diagnostics = [];
  const externalTypeResolver = options.externalTypeResolver ?? null;
  const externalTypeCache = new Map();
  const resolveExternalType = (type) => {
    if (!externalTypeResolver) return { ok: false, diagnostics: [] };
    if (!externalTypeCache.has(type)) externalTypeCache.set(type, externalTypeResolver(type));
    return externalTypeCache.get(type);
  };
  const isKnown = (type) => isKnownType(type) || Boolean(resolveExternalType(type).ok);
  const isExternal = (type) => Boolean(resolveExternalType(type).ok);
  const substituteTypeParams = (typeText, substitutions = {}) => String(typeText).replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (name) => substitutions[name] ?? name);
  const constructorLabel = (node) => node?.path ? `Facet '${node.path}'` : 'Typed constructor';

  const followRecordFields = (baseType, fields, ownerNode) => {
    let currentType = baseType;
    const trace = [];
    for (const fieldName of fields) {
      const resolved = resolveExternalType(currentType);
      if (!resolved.ok || resolved.declaration?.kind !== 'Record') {
        diagnostics.push(diagnostic('RCL_FIELD_ACCESS_EXPECTED_RECORD', `Field '${fieldName}' requires a linked record type, received ${currentType}`, ownerNode));
        return null;
      }
      const field = (resolved.declaration.fields ?? []).find(item => item.name === fieldName);
      if (!field) {
        diagnostics.push(diagnostic('RCL_FIELD_ACCESS_UNKNOWN', `Record '${resolved.canonical}' has no field '${fieldName}'`, ownerNode));
        return null;
      }
      currentType = substituteTypeParams(field.canonicalType, resolved.typeParamMap ?? {});
      trace.push({ name: fieldName, canonicalType: currentType, ownerType: resolved.canonical });
    }
    return { type: currentType, trace };
  };

  const resolveFieldPath = (path, locals = new Map(), ownerNode = null) => {
    const parts = String(path).split('.');
    if (parts.length < 2) return null;
    for (let index = parts.length - 1; index >= 1; index -= 1) {
      const prefix = parts.slice(0, index).join('.');
      let baseType = null;
      if (locals.has(prefix)) baseType = locals.get(prefix);
      else if (facets.has(prefix)) baseType = facets.get(prefix);
      if (!baseType) continue;
      const fields = parts.slice(index);
      const followed = followRecordFields(baseType, fields, ownerNode);
      if (!followed) return { ok: false };
      return { ok: true, basePath: prefix, fields: followed.trace, type: followed.type };
    }
    return null;
  };

  const validateTypedConstructor = (expression, expectedType, node, locals = new Map()) => {
    if (!expression) return { handled: false, type: 'Unknown' };
    const expected = resolveExternalType(expectedType);
    if (!expected.ok || !expected.declaration) {
      if (expression.kind === 'RecordLiteralExpr') diagnostics.push(diagnostic('RCL_RECORD_LITERAL_EXPECTED_RECORD', `${constructorLabel(node)} uses a record literal but '${expectedType}' is not a linked record type`, expression));
      return { handled: expression.kind === 'RecordLiteralExpr', type: expectedType };
    }
    const declaration = expected.declaration;
    const substitutions = expected.typeParamMap ?? {};

    if (expression.kind === 'RecordLiteralExpr') {
      if (declaration.kind !== 'Record') {
        diagnostics.push(diagnostic('RCL_RECORD_LITERAL_EXPECTED_RECORD', `${constructorLabel(node)} uses a record literal but '${expectedType}' resolves to ${declaration.kind}`, expression));
        return { handled: true, type: expectedType };
      }
      const declaredFields = new Map((declaration.fields ?? []).map(field => [field.name, field]));
      const seen = new Set();
      for (const field of expression.fields ?? []) {
        if (seen.has(field.name)) diagnostics.push(diagnostic('RCL_RECORD_FIELD_DUPLICATE', `Record '${expected.canonical}' repeats field '${field.name}'`, field));
        seen.add(field.name);
        const declared = declaredFields.get(field.name);
        if (!declared) {
          diagnostics.push(diagnostic('RCL_RECORD_FIELD_UNKNOWN', `Record '${expected.canonical}' has no field '${field.name}'`, field));
          infer(field.expression, locals);
          continue;
        }
        const fieldType = substituteTypeParams(declared.canonicalType, substitutions);
        const nested = validateTypedConstructor(field.expression, fieldType, field, locals);
        const actual = nested.handled ? nested.type : infer(field.expression, locals);
        if (actual !== fieldType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_RECORD_FIELD_TYPE', `Record field '${field.name}' expects ${fieldType}, received ${actual}`, field));
      }
      for (const declared of declaration.fields ?? []) {
        if (!seen.has(declared.name)) diagnostics.push(diagnostic('RCL_RECORD_FIELD_MISSING', `Record '${expected.canonical}' is missing field '${declared.name}'`, expression));
      }
      return { handled: true, type: expectedType };
    }

    if (expression.kind === 'CallExpr' && declaration.kind === 'Union') {
      const variant = (declaration.variants ?? []).find(item => item.name === expression.name);
      if (!variant) {
        diagnostics.push(diagnostic('RCL_UNION_VARIANT_UNKNOWN', `Union '${expected.canonical}' has no variant '${expression.name}'`, expression));
        expression.args.forEach(arg => infer(arg, locals));
        return { handled: true, type: expectedType };
      }
      if (expression.args.length !== variant.payload.length) diagnostics.push(diagnostic('RCL_UNION_VARIANT_ARITY', `Union variant '${expression.name}' expects ${variant.payload.length} payload value(s), got ${expression.args.length}`, expression));
      expression.args.forEach((arg, index) => {
        const payload = variant.payload[index];
        if (!payload) { infer(arg, locals); return; }
        const payloadType = substituteTypeParams(payload.canonicalType, substitutions);
        const nested = validateTypedConstructor(arg, payloadType, expression, locals);
        const actual = nested.handled ? nested.type : infer(arg, locals);
        if (actual !== payloadType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_UNION_PAYLOAD_TYPE', `Union variant '${expression.name}' payload ${index + 1} expects ${payloadType}, received ${actual}`, expression));
      });
      return { handled: true, type: expectedType };
    }

    return { handled: false, type: 'Unknown' };
  };
  const reportUnknownType = (type, message, node) => {
    if (isKnown(type)) return;
    const external = resolveExternalType(type);
    if (external.diagnostics?.length) {
      for (const item of external.diagnostics) diagnostics.push({ ...item, nodeKind: node?.kind ?? null });
    } else diagnostics.push(diagnostic('RCL_TYPE_UNKNOWN', message, node));
  };
  const facets = new Map();
  const facetDecls = new Map();
  const subjects = new Map();
  const reckons = new Map();
  const hosts = new Map();
  const rules = new Map();
  const metaDomains = new Map();
  const physicals = new Map();
  const physicalLaws = new Map();
  const perceptions = new Map();
  const neurals = new Map();
  const neuralPathways = new Map();
  const livings = new Map();
  const lifeCycles = new Map();
  const genetics = new Map();
  const quantitatives = new Map();
  const knowledges = new Map();
  const naturalLanguages = new Map();
  const understandings = new Map();
  const creations = new Map();
  const spacetimes = new Map();
  const accelerations = new Map();
  const compressions = new Map();
  const energies = new Map();
  const elements = new Map();
  const sciences = new Map();
  const embodiments = new Map();
  const spirits = new Map();

  const addFacet = (decl, typeOverride = null) => {
    const type = typeOverride ?? decl.valueType;
    reportUnknownType(type, `Unknown type '${type}' for ${decl.path}`, decl);
    if (facets.has(decl.path)) diagnostics.push(diagnostic('RCL_FACET_DUPLICATE', `Facet '${decl.path}' is declared more than once`, decl));
    facets.set(decl.path, type);
    facetDecls.set(decl.path, decl);
  };

  const addNamed = (map, name, node, code, label) => {
    if (map.has(name)) diagnostics.push(diagnostic(code, `${label} '${name}' is declared more than once`, node));
    map.set(name, node);
  };

  for (const node of program.body) {
    if (node.kind === 'FacetDecl') addFacet(node);
    else if (node.kind === 'SubjectDecl') {
      addNamed(subjects, node.name, node, 'RCL_SUBJECT_DUPLICATE', 'Subject');
      node.facets.forEach(facet => addFacet(facet));
    } else if (node.kind === 'ReckonDecl') addNamed(reckons, node.name, node, 'RCL_RECKON_DUPLICATE', 'Reckoning');
    else if (node.kind === 'HostDecl') addNamed(hosts, node.name, node, 'RCL_HOST_DUPLICATE', 'Host');
    else if (node.kind === 'MetaDecl') {
      addNamed(metaDomains, node.name, node, 'RCL_META_DUPLICATE', 'Meta reality');
      node.facets.forEach(facet => addFacet(facet));
    } else if (node.kind === 'PhysicalDecl') {
      addNamed(physicals, node.name, node, 'RCL_PHYSICAL_DUPLICATE', 'Physical reality');
      arraysFromPhysical(node).forEach(facet => addFacet(facet));
      node.laws.forEach(law => addNamed(physicalLaws, law.name, law, 'RCL_PHYSICAL_LAW_DUPLICATE', 'Physical law'));
    } else if (node.kind === 'PerceptionDecl') {
      addNamed(perceptions, node.name, node, 'RCL_PERCEPTION_DUPLICATE', 'Perception');
      node.channels.forEach(channel => addFacet({ ...channel, value: channel.expression }));
    } else if (node.kind === 'NeuralDecl') {
      addNamed(neurals, node.name, node, 'RCL_NEURAL_DUPLICATE', 'Neural reality');
      node.facets.forEach(facet => addFacet(facet));
      node.pathways.forEach(pathway => addNamed(neuralPathways, pathway.name, pathway, 'RCL_NEURAL_PATHWAY_DUPLICATE', 'Neural pathway'));
    } else if (node.kind === 'LivingDecl') {
      addNamed(livings, node.name, node, 'RCL_LIVING_DUPLICATE', 'Living reality');
      node.facets.forEach(facet => addFacet(facet));
      node.senses.forEach(sense => addFacet({ ...sense, value: { kind: 'PathExpr', path: sense.source } }));
      node.cycles.forEach(cycle => addNamed(lifeCycles, cycle.name, cycle, 'RCL_LIFE_CYCLE_DUPLICATE', 'Life cycle'));
    } else if (node.kind === 'GeneticDecl') {
      addNamed(genetics, node.name, node, 'RCL_GENETIC_DUPLICATE', 'Genetic reality');
      node.facets.forEach(facet => addFacet(facet));
      node.genes.forEach(gene => addFacet(gene));
    } else if (node.kind === 'QuantitativeDecl') {
      addNamed(quantitatives, node.name, node, 'RCL_QUANTITATIVE_DUPLICATE', 'Quantitative reality');
      node.measures.forEach(measure => addFacet(measure, measurementType(measure.baseType)));
      node.derives.forEach(derive => addFacet({ ...derive, value: derive.expression }));
    } else if (node.kind === 'KnowledgeDecl') {
      addNamed(knowledges, node.name, node, 'RCL_KNOWLEDGE_DUPLICATE', 'Knowledge reality');
      node.claims.forEach(claim => addFacet({ ...claim, valueType: knowledgeType(claim.baseType), value: claim.expression }, knowledgeType(claim.baseType)));
      node.derives.forEach(derive => addFacet({ ...derive, valueType: knowledgeType(derive.baseType), value: derive.expression }, knowledgeType(derive.baseType)));
    } else if (node.kind === 'NaturalLanguageDecl') {
      addNamed(naturalLanguages, node.name, node, 'RCL_LANGUAGE_DUPLICATE', 'Natural-language plane');
      node.utterances.forEach(item => addFacet({ ...item, valueType: 'Utterance', value: item.expression }, 'Utterance'));
      node.intents.forEach(item => addFacet({ ...item, valueType: 'Intent', value: item.when }, 'Intent'));
    } else if (node.kind === 'UnderstandingDecl') {
      addNamed(understandings, node.name, node, 'RCL_UNDERSTANDING_DUPLICATE', 'Understanding plane');
      node.hypotheses.forEach(item => addFacet({ ...item, valueType: understandingType(item.baseType), value: item.expression }, understandingType(item.baseType)));
    } else if (node.kind === 'CreationDecl') {
      addNamed(creations, node.name, node, 'RCL_CREATION_DUPLICATE', 'Creative plane');
      node.candidates.forEach(item => addFacet({ ...item, valueType: creationType(item.baseType), value: item.expression }, creationType(item.baseType)));
      if (node.selection) {
        const candidateTypes = node.selection.candidates.map(path => node.candidates.find(item => item.path === path)?.baseType).filter(Boolean);
        const selectedType = candidateTypes[0] ? creationType(candidateTypes[0]) : 'Unknown';
        addFacet({ ...node.selection, valueType: selectedType, value: null }, selectedType);
      }
    } else if (node.kind === 'EnergyDecl') {
      addNamed(energies, node.name, node, 'RCL_ENERGY_DUPLICATE', 'Energy reality');
      node.reservoirs.forEach(item => addFacet({ ...item, value: item.value }));
    } else if (node.kind === 'ElementDecl') {
      addNamed(elements, node.name, node, 'RCL_ELEMENT_DUPLICATE', 'Element reality');
      [...node.species, ...node.compounds].forEach(item => addFacet({ ...item, valueType: 'Element', value: null }, 'Element'));
    } else if (node.kind === 'ScienceDecl') {
      addNamed(sciences, node.name, node, 'RCL_SCIENCE_DUPLICATE', 'Science reality');
      node.hypotheses.forEach(item => addFacet({ ...item, valueType: scienceType(item.baseType), value: item.expression }, scienceType(item.baseType)));
      node.experiments.forEach(item => addFacet({ ...item, valueType: 'Experiment', value: null }, 'Experiment'));
      node.conclusions.forEach(item => addFacet({ ...item, valueType: 'Science<Truth>', value: null }, 'Science<Truth>'));
    } else if (node.kind === 'EmbodimentDecl') {
      addNamed(embodiments, node.name, node, 'RCL_EMBODIMENT_DUPLICATE', 'Embodiment reality');
      node.facets.forEach(item => addFacet(item));
      node.systems.forEach(part => part.facets.forEach(item => addFacet(item)));
      node.organs.forEach(part => part.facets.forEach(item => addFacet(item)));
      addFacet({ kind: 'FacetDecl', path: `${node.name}.state`, valueType: 'BodyState', value: null }, 'BodyState');
    } else if (node.kind === 'SpiritDecl') {
      addNamed(spirits, node.name, node, 'RCL_SPIRIT_DUPLICATE', 'Spirit reality');
      node.facets.forEach(item => addFacet(item));
      [...node.values, ...node.purposes, ...node.affects].forEach(item => addFacet({ ...item, value: item.expression }));
      addFacet({ kind: 'FacetDecl', path: `${node.name}.state`, valueType: 'SpiritState', value: null }, 'SpiritState');
    } else if (node.kind === 'SpacetimeDecl') {
      addNamed(spacetimes, node.name, node, 'RCL_SPACETIME_DUPLICATE', 'Meta-spacetime reality');
      node.clocks.forEach(clock => addFacet({ ...clock, value: clock.value }));
      node.coordinates.forEach(coordinate => addFacet({ ...coordinate, valueType: 'SpacetimePoint', value: coordinate.expression }, 'SpacetimePoint'));
    } else if (node.kind === 'AccelerationDecl') {
      addNamed(accelerations, node.name, node, 'RCL_ACCELERATION_DUPLICATE', 'Meta-acceleration reality');
    } else if (node.kind === 'CompressionDecl') {
      addNamed(compressions, node.name, node, 'RCL_COMPRESSION_DUPLICATE', 'Meta-compression reality');
    } else if (node.kind === 'Emergence' || node.kind === 'Resonance') {
      addNamed(rules, node.name, node, 'RCL_RULE_DUPLICATE', 'Rule');
    }
  }

  const infer = (expr, locals = new Map()) => {
    if (!expr) return 'Unknown';
    switch (expr.kind) {
      case 'LiteralExpr': return expr.valueType;
      case 'PathExpr': {
        if (locals.has(expr.path)) return locals.get(expr.path);
        if (facets.has(expr.path)) return facets.get(expr.path);
        const projection = resolveFieldPath(expr.path, locals, expr);
        if (projection?.ok) return projection.type;
        if (!projection) diagnostics.push(diagnostic('RCL_NAME_UNKNOWN', `Unknown facet or local '${expr.path}'`, expr));
        return 'Unknown';
      }
      case 'FieldAccessExpr': {
        const base = infer(expr.object, locals);
        const followed = followRecordFields(base, [expr.field], expr);
        return followed?.type ?? 'Unknown';
      }
      case 'MatchUnionExpr': {
        const targetType = infer(expr.target, locals);
        const resolved = resolveExternalType(targetType);
        if (!resolved.ok || resolved.declaration?.kind !== 'Union') {
          diagnostics.push(diagnostic('RCL_MATCH_EXPECTED_UNION', `match requires a linked union type, received ${targetType}`, expr));
          expr.cases.forEach(item => infer(item.expression, locals));
          return 'Unknown';
        }
        const variants = new Map((resolved.declaration.variants ?? []).map(item => [item.name, item]));
        const covered = new Set();
        const branchTypes = [];
        for (const item of expr.cases ?? []) {
          const branchLocals = new Map(locals);
          if (item.wildcard) {
            if (item.bindings.length) diagnostics.push(diagnostic('RCL_MATCH_WILDCARD_BINDINGS', 'Wildcard match case cannot bind payload values', item));
          } else {
            const variant = variants.get(item.variant);
            if (!variant) diagnostics.push(diagnostic('RCL_MATCH_VARIANT_UNKNOWN', `Union '${resolved.canonical}' has no variant '${item.variant}'`, item));
            else {
              covered.add(item.variant);
              if (item.bindings.length !== variant.payload.length) diagnostics.push(diagnostic('RCL_MATCH_BINDING_ARITY', `Variant '${item.variant}' exposes ${variant.payload.length} payload value(s), got ${item.bindings.length} binding(s)`, item));
              item.bindings.forEach((name, index) => {
                const payload = variant.payload[index];
                if (payload) branchLocals.set(name, substituteTypeParams(payload.canonicalType, resolved.typeParamMap ?? {}));
              });
            }
          }
          branchTypes.push(infer(item.expression, branchLocals));
        }
        if (!expr.cases?.some(item => item.wildcard)) {
          const missing = [...variants.keys()].filter(name => !covered.has(name));
          if (missing.length) diagnostics.push(diagnostic('RCL_MATCH_NON_EXHAUSTIVE', `match on '${resolved.canonical}' is missing variant(s): ${missing.join(', ')}`, expr));
        }
        const first = branchTypes.find(type => type !== 'Unknown') ?? 'Unknown';
        for (const type of branchTypes) if (type !== first && type !== 'Unknown' && first !== 'Unknown') diagnostics.push(diagnostic('RCL_MATCH_BRANCH_TYPE', `match branches disagree: ${first} vs ${type}`, expr));
        return first;
      }
      case 'UnaryExpr': {
        const type = infer(expr.expression, locals);
        if (expr.operator === 'not') {
          if (type !== 'Truth' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_TYPE_UNARY', `'not' requires Truth, received ${type}`, expr));
          return 'Truth';
        }
        if (type !== 'Number' && !QUANTITY_TYPES.has(type) && type !== 'Unknown') diagnostics.push(diagnostic('RCL_TYPE_UNARY', `Unary '-' requires Number or a quantity, received ${type}`, expr));
        return type;
      }
      case 'BinaryExpr': {
        const left = infer(expr.left, locals);
        const right = infer(expr.right, locals);
        if (['and', 'or'].includes(expr.operator)) {
          if (![left, right].every(type => type === 'Truth' || type === 'Unknown')) diagnostics.push(diagnostic('RCL_TYPE_LOGIC', `${expr.operator} requires Truth operands`, expr));
          return 'Truth';
        }
        if (left === 'Unknown' || right === 'Unknown') return ['==', '!=', '<', '<=', '>', '>='].includes(expr.operator) ? 'Truth' : 'Unknown';
        const result = inferBinaryType(expr.operator, left, right);
        if (!result) diagnostics.push(diagnostic('RCL_TYPE_BINARY', `Operator '${expr.operator}' cannot combine ${left} and ${right}`, expr));
        return result ?? 'Unknown';
      }
      case 'CallExpr': {
        if (expr.name === 'choose') {
          if (expr.args.length !== 3) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'choose requires three arguments', expr));
          const condition = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          const yes = expr.args[1] ? infer(expr.args[1], locals) : 'Unknown';
          const no = expr.args[2] ? infer(expr.args[2], locals) : 'Unknown';
          if (condition !== 'Truth' && condition !== 'Unknown') diagnostics.push(diagnostic('RCL_TYPE_CHOOSE', 'choose condition must be Truth', expr));
          if (yes !== no && yes !== 'Unknown' && no !== 'Unknown') diagnostics.push(diagnostic('RCL_TYPE_CHOOSE', `choose branches disagree: ${yes} vs ${no}`, expr));
          return yes === 'Unknown' ? no : yes;
        }
        if (quantityConstructorTypes[expr.name]) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one Number`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Number' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Number, received ${actual}`, expr));
          return quantityConstructorTypes[expr.name];
        }
        if (expr.name === 'point' || expr.name === 'spacetime_point') {
          if (expr.args.length !== 5) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects frame Text, x Length, y Length, z Length and t Time`, expr));
          const types = expr.args.map(arg => infer(arg, locals));
          const expected = ['Text', 'Length', 'Length', 'Length', 'Time'];
          types.forEach((type, index) => {
            if (type !== expected[index] && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} argument ${index + 1} expects ${expected[index]}, received ${type}`, expr));
          });
          return 'SpacetimePoint';
        }
        if (['space_x', 'space_y', 'space_z', 'time_of'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one SpacetimePoint`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'SpacetimePoint' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects SpacetimePoint, received ${actual}`, expr));
          return expr.name === 'time_of' ? 'Time' : 'Length';
        }
        if (expr.name === 'distance') {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'distance expects two SpacetimePoint values', expr));
          expr.args.forEach(arg => { const type = infer(arg, locals); if (type !== 'SpacetimePoint' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `distance expects SpacetimePoint, received ${type}`, expr)); });
          return 'Length';
        }
        if (expr.name === 'same_frame') {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'same_frame expects two SpacetimePoint values', expr));
          expr.args.forEach(arg => { const type = infer(arg, locals); if (type !== 'SpacetimePoint' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `same_frame expects SpacetimePoint, received ${type}`, expr)); });
          return 'Truth';
        }
        if (['measure_value', 'uncertainty', 'lower', 'upper'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one measurement`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isMeasurementType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects a measurement, received ${actual}`, expr));
          return measurementBaseType(actual) ?? 'Unknown';
        }
        if (expr.name === 'confidence' || expr.name === 'certainty') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one evidence-bearing object`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isEvidenceType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects an evidence-bearing object, received ${actual}`, expr));
          return 'Number';
        }
        if (expr.name === 'knowledge_value' || expr.name === 'belief') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one knowledge claim`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isKnowledgeType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects knowledge, received ${actual}`, expr));
          return knowledgeBaseType(actual) ?? 'Unknown';
        }
        if (expr.name === 'known' || expr.name === 'supported') {
          if (expr.args.length < 1 || expr.args.length > 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects knowledge and optional threshold`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isKnowledgeType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects knowledge, received ${actual}`, expr));
          if (expr.args[1]) {
            const thresholdType = infer(expr.args[1], locals);
            if (thresholdType !== 'Number' && thresholdType !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} threshold must be Number`, expr));
          }
          return 'Truth';
        }
        if (expr.name === 'knowledge_status') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'knowledge_status expects one knowledge claim', expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isKnowledgeType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `knowledge_status expects knowledge, received ${actual}`, expr));
          return 'Text';
        }
        if (expr.name === 'contradicts') {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'contradicts expects two knowledge claims', expr));
          const left = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          const right = expr.args[1] ? infer(expr.args[1], locals) : 'Unknown';
          if (left !== 'Unknown' && !isKnowledgeType(left)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `contradicts expects knowledge, received ${left}`, expr));
          if (right !== 'Unknown' && !isKnowledgeType(right)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `contradicts expects knowledge, received ${right}`, expr));
          if (isKnowledgeType(left) && isKnowledgeType(right) && knowledgeBaseType(left) !== knowledgeBaseType(right)) diagnostics.push(diagnostic('RCL_CALL_TYPE', 'contradicts requires matching knowledge base types', expr));
          return 'Truth';
        }
        if (expr.name === 'evidence_count') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'evidence_count expects one evidence-bearing object', expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isEvidenceType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `evidence_count expects an evidence-bearing object, received ${actual}`, expr));
          return 'Number';
        }
        if (['utterance_text', 'utterance_speaker', 'utterance_locale'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one Utterance`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Utterance' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Utterance, received ${actual}`, expr));
          return 'Text';
        }
        if (['intent_name', 'intent_action', 'intent_target'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one Intent`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Intent' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Intent, received ${actual}`, expr));
          return 'Text';
        }
        if (expr.name === 'intent_confidence') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Intent' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `intent_confidence expects Intent, received ${actual}`, expr));
          return 'Number';
        }
        if (expr.name === 'intent_matches') {
          if (expr.args.length !== 3) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'intent_matches expects Intent, action Text and target Text', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          if (types[0] !== 'Intent' && types[0] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `intent_matches expects Intent, received ${types[0]}`, expr));
          if (types[1] !== 'Text' && types[1] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'intent_matches action must be Text', expr));
          if (types[2] !== 'Text' && types[2] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'intent_matches target must be Text', expr));
          return 'Truth';
        }
        if (expr.name === 'understanding_value') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isUnderstandingType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `understanding_value expects Understanding, received ${actual}`, expr));
          return understandingBaseType(actual) ?? 'Unknown';
        }
        if (['understanding_confidence', 'understanding_coverage', 'understanding_coherence'].includes(expr.name)) {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isUnderstandingType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Understanding, received ${actual}`, expr));
          return 'Number';
        }
        if (expr.name === 'understanding_explanation') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isUnderstandingType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `understanding_explanation expects Understanding, received ${actual}`, expr));
          return 'Text';
        }
        if (expr.name === 'understood') {
          if (expr.args.length < 1 || expr.args.length > 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'understood expects Understanding and optional threshold', expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isUnderstandingType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `understood expects Understanding, received ${actual}`, expr));
          if (expr.args[1]) { const threshold = infer(expr.args[1], locals); if (threshold !== 'Number' && threshold !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'understood threshold must be Number', expr)); }
          return 'Truth';
        }
        if (expr.name === 'creation_value') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isCreationType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `creation_value expects Creation, received ${actual}`, expr));
          return creationBaseType(actual) ?? 'Unknown';
        }
        if (['creation_score', 'creation_novelty', 'creation_utility', 'creation_feasibility', 'creation_risk'].includes(expr.name)) {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isCreationType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Creation, received ${actual}`, expr));
          return 'Number';
        }
        if (expr.name === 'creation_target') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isCreationType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `creation_target expects Creation, received ${actual}`, expr));
          return 'Text';
        }
        if (expr.name === 'selected') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isCreationType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `selected expects Creation, received ${actual}`, expr));
          return 'Truth';
        }
        if (expr.name === 'scientific_value') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isScienceType(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `scientific_value expects Science, received ${actual}`, expr));
          return scienceBaseType(actual) ?? 'Unknown';
        }
        if (['reproducible', 'falsified'].includes(expr.name)) {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Unknown' && !isScienceType(actual) && actual !== 'Experiment') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Science or Experiment, received ${actual}`, expr));
          return 'Truth';
        }
        if (expr.name === 'replications' || expr.name === 'body_coherence' || expr.name === 'spirit_coherence' || expr.name === 'component_count' || expr.name === 'atomic_number') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one argument`, expr));
          return 'Number';
        }
        if (expr.name === 'element_symbol') return 'Text';
        if (expr.name === 'is_element' || expr.name === 'body_maintained' || expr.name === 'spirit_integrated') return 'Truth';
        if (expr.name === 'typed_ref') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'typed_ref expects one typed object', expr));
          if (expr.args[0]) infer(expr.args[0], locals);
          return 'TypedRef';
        }
        if (expr.name === 'typed_deref') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'typed_deref expects one TypedRef', expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'TypedRef' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `typed_deref expects TypedRef, received ${actual}`, expr));
          return 'Unknown';
        }
        if (expr.name === 'typed_ref_id') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'typed_ref_id expects one TypedRef', expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'TypedRef' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `typed_ref_id expects TypedRef, received ${actual}`, expr));
          return 'Number';
        }
        if (expr.name === 'provider_call') {
          if (expr.args.length !== 3) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'provider_call expects provider id, capability and request JSON', expr));
          expr.args.forEach(arg => { const type = infer(arg, locals); if (type !== 'Text' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'provider_call arguments must be Text', expr)); });
          return 'Text';
        }
        if (expr.name === 'empty_sequence') {
          if (expr.args.length !== 0) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'empty_sequence expects no arguments', expr));
          return 'Sequence';
        }
        if (expr.name === 'sequence_append') {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'sequence_append expects Sequence and value', expr));
          const sequenceType = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (sequenceType !== 'Sequence' && sequenceType !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `sequence_append expects Sequence, received ${sequenceType}`, expr));
          if (expr.args[1]) infer(expr.args[1], locals);
          return 'Sequence';
        }
        if (expr.name === 'sequence_get') {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'sequence_get expects Sequence and Number index', expr));
          const sequenceType = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          const indexType = expr.args[1] ? infer(expr.args[1], locals) : 'Unknown';
          if (sequenceType !== 'Sequence' && sequenceType !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `sequence_get expects Sequence, received ${sequenceType}`, expr));
          if (indexType !== 'Number' && indexType !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `sequence_get index expects Number, received ${indexType}`, expr));
          return 'Unknown';
        }
        if (expr.name === 'char_at') {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'char_at expects Text and Number index', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          if (types[0] !== 'Text' && types[0] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'char_at source must be Text', expr));
          if (types[1] !== 'Number' && types[1] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'char_at index must be Number', expr));
          return 'Text';
        }
        if (expr.name === 'slice_text') {
          if (expr.args.length !== 3) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'slice_text expects Text, start and length', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          if (types[0] !== 'Text' && types[0] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'slice_text source must be Text', expr));
          for (const type of types.slice(1)) if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'slice_text indexes must be Number', expr));
          return 'Text';
        }
        if (['is_whitespace', 'is_digit', 'is_identifier_start', 'is_identifier_part'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one Text character`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Text' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Text`, expr));
          return 'Truth';
        }
        if (expr.name === 'make_span') {
          if (expr.args.length !== 4) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'make_span expects offset, line, column and length', expr));
          expr.args.forEach(arg => { const type = infer(arg, locals); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_span arguments must be Number', expr)); });
          return 'Span';
        }
        if (expr.name === 'make_token') {
          if (expr.args.length !== 3) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'make_token expects kind, text and span', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          if (types[0] !== 'Text' && types[0] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_token kind must be Text', expr));
          if (types[1] !== 'Text' && types[1] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_token text must be Text', expr));
          if (types[2] !== 'Span' && types[2] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_token span must be Span', expr));
          return 'Token';
        }
        if (expr.name === 'expect_token') {
          if (expr.args.length !== 3) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'expect_token expects Token, kind Text and expected text Text', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          if (types[0] !== 'Token' && types[0] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'expect_token first argument must be Token', expr));
          if (types[1] !== 'Text' && types[1] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'expect_token kind must be Text', expr));
          if (types[2] !== 'Text' && types[2] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'expect_token text must be Text', expr));
          return 'Token';
        }
        if (['token_kind', 'token_text', 'token_span'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one Token`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Token' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Token, received ${actual}`, expr));
          return expr.name === 'token_span' ? 'Span' : 'Text';
        }
        if (['span_offset', 'span_line', 'span_column', 'span_length'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one Span`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Span' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Span, received ${actual}`, expr));
          return 'Number';
        }
        if (expr.name === 'facet_ast') {
          if (expr.args.length !== 5) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'facet_ast expects path, value type, literal kind, literal text and span', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          for (const type of types.slice(0, 4)) if (type !== 'Text' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'facet_ast first four arguments must be Text', expr));
          if (types[4] !== 'Span' && types[4] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'facet_ast final argument must be Span', expr));
          return 'AstNode';
        }
        if (['ast_kind', 'ast_path', 'ast_value_type', 'ast_literal_kind', 'ast_literal_text', 'ast_span'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one AstNode`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'AstNode' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects AstNode, received ${actual}`, expr));
          return expr.name === 'ast_span' ? 'Span' : 'Text';
        }
        if (expr.name === 'make_symbol') {
          if (expr.args.length !== 4) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'make_symbol expects path, type, slot and span', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          if (types[0] !== 'Text' && types[0] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_symbol path must be Text', expr));
          if (types[1] !== 'Text' && types[1] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_symbol type must be Text', expr));
          if (types[2] !== 'Number' && types[2] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_symbol slot must be Number', expr));
          if (types[3] !== 'Span' && types[3] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_symbol span must be Span', expr));
          return 'Symbol';
        }
        if (['symbol_path', 'symbol_type', 'symbol_slot', 'symbol_span'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one Symbol`, expr));
          const actual = infer(expr.args[0], locals);
          if (actual !== 'Symbol' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Symbol, received ${actual}`, expr));
          return expr.name === 'symbol_slot' ? 'Number' : expr.name === 'symbol_span' ? 'Span' : 'Text';
        }
        if (expr.name === 'semantic_assert') {
          if (expr.args.length !== 4) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'semantic_assert expects condition, code, detail and span', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          if (types[0] !== 'Truth' && types[0] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'semantic_assert condition must be Truth', expr));
          if (types[1] !== 'Text' && types[1] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'semantic_assert code must be Text', expr));
          if (types[2] !== 'Text' && types[2] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'semantic_assert detail must be Text', expr));
          if (types[3] !== 'Span' && types[3] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'semantic_assert span must be Span', expr));
          return 'Truth';
        }
        if (expr.name === 'make_semantic_facet') {
          if (expr.args.length !== 6) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'make_semantic_facet expects path, type, literal kind, literal text, slot and span', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          for (const type of types.slice(0, 4)) if (type !== 'Text' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_semantic_facet first four arguments must be Text', expr));
          if (types[4] !== 'Number' && types[4] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_semantic_facet slot must be Number', expr));
          if (types[5] !== 'Span' && types[5] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_semantic_facet span must be Span', expr));
          return 'SemanticNode';
        }
        if (['semantic_path', 'semantic_type', 'semantic_literal_kind', 'semantic_literal_text', 'semantic_slot', 'semantic_span'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one SemanticNode`, expr));
          const actual = infer(expr.args[0], locals);
          if (actual !== 'SemanticNode' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects SemanticNode, received ${actual}`, expr));
          return expr.name === 'semantic_slot' ? 'Number' : expr.name === 'semantic_span' ? 'Span' : 'Text';
        }
        if (expr.name === 'make_ir_store') {
          if (expr.args.length !== 7) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'make_ir_store expects op, path, type, literal kind, literal text, slot and span', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          for (const type of types.slice(0, 5)) if (type !== 'Text' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_ir_store first five arguments must be Text', expr));
          if (types[5] !== 'Number' && types[5] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_ir_store slot must be Number', expr));
          if (types[6] !== 'Span' && types[6] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_ir_store span must be Span', expr));
          return 'IrNode';
        }
        if (['ir_op', 'ir_path', 'ir_type', 'ir_literal_kind', 'ir_literal_text', 'ir_slot', 'ir_span'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one IrNode`, expr));
          const actual = infer(expr.args[0], locals);
          if (actual !== 'IrNode' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects IrNode, received ${actual}`, expr));
          return expr.name === 'ir_slot' ? 'Number' : expr.name === 'ir_span' ? 'Span' : 'Text';
        }
        if (expr.name === 'sequence_concat') {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'sequence_concat expects two Sequences', expr));
          for (const arg of expr.args) {
            const actual = infer(arg, locals);
            if (actual !== 'Sequence' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `sequence_concat expects Sequence, received ${actual}`, expr));
          }
          return 'Sequence';
        }
        if (['bytes_u8', 'bytes_u16le', 'bytes_u32le', 'bytes_i32le', 'bytes_f64le'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects one Number`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Number' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Number, received ${actual}`, expr));
          return 'Sequence';
        }
        if (expr.name === 'utf8_bytes') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'utf8_bytes expects one Text', expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Text' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `utf8_bytes expects Text, received ${actual}`, expr));
          return 'Sequence';
        }
        if (expr.name === 'hex_bytes') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'hex_bytes expects one Text', expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Text' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `hex_bytes expects Text, received ${actual}`, expr));
          return 'Sequence';
        }
        if (expr.name === 'sha256_text') {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'sha256_text expects one Text', expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Text' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `sha256_text expects Text, received ${actual}`, expr));
          return 'Text';
        }
        if (expr.name === 'make_parse_state') {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', 'make_parse_state expects next index and nodes Sequence', expr));
          const types = expr.args.map(arg => infer(arg, locals));
          if (types[0] !== 'Number' && types[0] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_parse_state index must be Number', expr));
          if (types[1] !== 'Sequence' && types[1] !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', 'make_parse_state nodes must be Sequence', expr));
          return 'ParseState';
        }
        if (['parse_index', 'parse_nodes'].includes(expr.name)) {
          if (expr.args.length !== 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects ParseState`, expr));
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'ParseState' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects ParseState, received ${actual}`, expr));
          return expr.name === 'parse_index' ? 'Number' : 'Sequence';
        }
        if (['contains', 'starts_with', 'ends_with'].includes(expr.name)) {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects two Text arguments`, expr));
          expr.args.forEach(arg => { const type = infer(arg, locals); if (type !== 'Text' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Text, received ${type}`, expr)); });
          return 'Truth';
        }
        if (['lower_text', 'upper_text', 'trim'].includes(expr.name)) {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Text' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Text, received ${actual}`, expr));
          return 'Text';
        }
        if (['split_before', 'split_after'].includes(expr.name)) {
          if (expr.args.length !== 2) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects two Text arguments`, expr));
          expr.args.forEach(arg => { const type = infer(arg, locals); if (type !== 'Text' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} expects Text, received ${type}`, expr)); });
          return 'Text';
        }
        if (expr.name === 'number_from_text') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Text' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `number_from_text expects Text, received ${actual}`, expr));
          return 'Number';
        }
        if (expr.name === 'abs') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (actual !== 'Number' && !QUANTITY_TYPES.has(actual) && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `abs expects Number or quantity, received ${actual}`, expr));
          return actual;
        }
        if (expr.name === 'min' || expr.name === 'max') {
          if (expr.args.length < 1) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects at least one argument`, expr));
          const types = expr.args.map(arg => infer(arg, locals));
          const known = types.filter(type => type !== 'Unknown');
          if (known.some(type => type !== known[0])) diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} arguments must have matching types`, expr));
          return known[0] ?? 'Unknown';
        }
        if (expr.name === 'text') {
          expr.args.forEach(arg => infer(arg, locals));
          return 'Text';
        }
        if (expr.name === 'length') {
          const actual = expr.args[0] ? infer(expr.args[0], locals) : 'Unknown';
          if (!['Text', 'Sequence', 'Unknown'].includes(actual)) diagnostics.push(diagnostic('RCL_CALL_TYPE', `length expects Text or Sequence, received ${actual}`, expr));
          return 'Number';
        }
        const fn = reckons.get(expr.name);
        if (!fn) {
          diagnostics.push(diagnostic('RCL_RECKON_UNKNOWN', `Unknown reckoning '${expr.name}'`, expr));
          expr.args.forEach(arg => infer(arg, locals));
          return 'Unknown';
        }
        if (expr.args.length !== fn.params.length) diagnostics.push(diagnostic('RCL_CALL_ARITY', `${expr.name} expects ${fn.params.length} arguments`, expr));
        expr.args.forEach((arg, index) => {
          const actual = infer(arg, locals);
          const expected = fn.params[index]?.valueType;
          if (expected && actual !== expected && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CALL_TYPE', `${expr.name} argument ${index + 1} expects ${expected}, received ${actual}`, expr));
        });
        return fn.returnType;
      }
      case 'RecordLiteralExpr':
        diagnostics.push(diagnostic('RCL_RECORD_LITERAL_CONTEXT_MISSING', 'Record literals require an expected linked record type', expr));
        expr.fields?.forEach(field => infer(field.expression, locals));
        return 'Unknown';
      default:
        diagnostics.push(diagnostic('RCL_EXPRESSION_UNKNOWN', `Unknown expression kind '${expr.kind}'`, expr));
        return 'Unknown';
    }
  };

  const checkInitial = (decl, expression = decl.value, expected = decl.valueType) => {
    const constructor = validateTypedConstructor(expression, expected, decl);
    if (constructor.handled) return;
    const actual = infer(expression);
    if (isExternal(expected) && actual !== expected && actual !== 'Unknown') return;
    if (actual !== expected && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_FACET_INITIAL_TYPE', `Facet '${decl.path}' expects ${expected}, received ${actual}`, decl));
  };

  const checkTruthList = (expressions, code, label, node) => {
    for (const expression of expressions) {
      const actual = infer(expression);
      if (actual !== 'Truth' && actual !== 'Unknown') diagnostics.push(diagnostic(code, `${label} must be Truth, received ${actual}`, node));
    }
  };

  const checkChanges = (changes, label, node, expressionKey = 'expression') => {
    for (const change of changes) {
      const expected = facets.get(change.target);
      if (!expected) diagnostics.push(diagnostic('RCL_CHANGE_TARGET_UNKNOWN', `${label} changes unknown facet '${change.target}'`, node));
      const constructor = expected ? validateTypedConstructor(change[expressionKey], expected, node) : { handled: false };
      const actual = constructor.handled ? constructor.type : infer(change[expressionKey]);
      if (expected && actual !== expected && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CHANGE_TYPE', `${label} assigns ${actual} to ${change.target}:${expected}`, node));
    }
  };

  for (const node of program.body) {
    if (node.kind === 'FacetDecl') checkInitial(node);
    else if (node.kind === 'SubjectDecl') {
      node.facets.forEach(facet => checkInitial(facet));
      for (const warrant of node.warrants) {
        if (warrant.condition) {
          const actual = infer(warrant.condition);
          if (actual !== 'Truth' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_WARRANT_CONDITION_TYPE', `Warrant condition for '${warrant.capability}' must be Truth`, warrant));
        }
      }
    } else if (node.kind === 'ReckonDecl') {
      const locals = new Map();
      for (const param of node.params) {
        reportUnknownType(param.valueType, `Unknown parameter type '${param.valueType}' in ${node.name}`, node);
        locals.set(param.name, param.valueType);
      }
      reportUnknownType(node.returnType, `Unknown return type '${node.returnType}' in ${node.name}`, node);
      const actual = infer(node.expression, locals);
      if (actual !== node.returnType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_RECKON_RETURN_TYPE', `Reckoning '${node.name}' returns ${actual}, declared ${node.returnType}`, node));
    } else if (node.kind === 'HostDecl') {
      const seen = new Set();
      for (const offer of node.offers) {
        if (seen.has(offer.capability)) diagnostics.push(diagnostic('RCL_HOST_OFFER_DUPLICATE', `Host '${node.name}' repeats offer '${offer.capability}'`, node));
        seen.add(offer.capability);
        if (!isKnownBaseType(offer.returnType)) diagnostics.push(diagnostic('RCL_TYPE_UNKNOWN', `Unknown host return type '${offer.returnType}'`, node));
      }
    } else if (node.kind === 'MetaDecl') {
      node.facets.forEach(facet => checkInitial(facet));
      checkChanges(node.revisions, `Meta reality '${node.name}'`, node);
      checkTruthList(node.preserves, 'RCL_META_PRESERVE_TYPE', `Meta preserve in '${node.name}'`, node);
    } else if (node.kind === 'PhysicalDecl') {
      arraysFromPhysical(node).forEach(facet => checkInitial(facet));
      for (const law of node.laws) {
        const locals = new Map();
        if (!law.step) diagnostics.push(diagnostic('RCL_PHYSICAL_STEP_REQUIRED', `Physical law '${law.name}' requires a step declaration`, law));
        else {
          if (!isKnownBaseType(law.step.valueType)) diagnostics.push(diagnostic('RCL_TYPE_UNKNOWN', `Unknown step type '${law.step.valueType}' in ${law.name}`, law));
          locals.set(law.step.name, law.step.valueType);
        }
        if (!law.when) diagnostics.push(diagnostic('RCL_PHYSICAL_WHEN_REQUIRED', `Physical law '${law.name}' requires when`, law));
        else {
          const actual = infer(law.when, locals);
          if (actual !== 'Truth' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_PHYSICAL_WHEN_TYPE', `Physical law '${law.name}' when must be Truth`, law));
        }
        for (const evolve of law.evolves) {
          const expected = facets.get(evolve.target);
          if (!expected) diagnostics.push(diagnostic('RCL_PHYSICAL_TARGET_UNKNOWN', `Physical law '${law.name}' evolves unknown facet '${evolve.target}'`, law));
          const actual = infer(evolve.expression, locals);
          if (expected && actual !== expected && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_PHYSICAL_EVOLVE_TYPE', `Physical law '${law.name}' assigns ${actual} to ${evolve.target}:${expected}`, law));
        }
        for (const conserve of law.conserves) {
          const actual = infer(conserve, locals);
          if (actual !== 'Truth' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_PHYSICAL_CONSERVE_TYPE', `Conserve in '${law.name}' must be Truth`, law));
        }
      }
    } else if (node.kind === 'PerceptionDecl') {
      for (const channel of node.channels) checkInitial(channel, channel.expression, channel.valueType);
      checkTruthList(node.preserves, 'RCL_PERCEPTION_PRESERVE_TYPE', `Perception preserve in '${node.name}'`, node);
    } else if (node.kind === 'NeuralDecl') {
      node.facets.forEach(facet => checkInitial(facet));
      for (const pathway of node.pathways) {
        if (!pathway.when) diagnostics.push(diagnostic('RCL_NEURAL_WHEN_REQUIRED', `Neural pathway '${pathway.name}' requires when`, pathway));
        else {
          const actual = infer(pathway.when);
          if (actual !== 'Truth' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_NEURAL_WHEN_TYPE', `Neural pathway '${pathway.name}' when must be Truth`, pathway));
        }
        checkChanges(pathway.changes, `Neural pathway '${pathway.name}'`, pathway);
        checkTruthList(pathway.preserves, 'RCL_NEURAL_PRESERVE_TYPE', `Neural preserve in '${pathway.name}'`, pathway);
      }
    } else if (node.kind === 'LivingDecl') {
      node.facets.forEach(facet => checkInitial(facet));
      for (const sense of node.senses) {
        const sourceType = facets.get(sense.source);
        if (!sourceType) diagnostics.push(diagnostic('RCL_SENSE_SOURCE_UNKNOWN', `Sense '${sense.path}' reads unknown source '${sense.source}'`, sense));
        else if (sourceType !== sense.valueType) diagnostics.push(diagnostic('RCL_SENSE_SOURCE_TYPE', `Sense '${sense.path}' expects ${sense.valueType}, source is ${sourceType}`, sense));
      }
      for (const need of node.needs) {
        const targetType = infer(need.target); const criticalType = infer(need.critical);
        if (targetType !== criticalType && targetType !== 'Unknown' && criticalType !== 'Unknown') diagnostics.push(diagnostic('RCL_NEED_TYPE', `Need '${need.path}' target and critical types disagree`, need));
      }
      checkTruthList(node.maintains, 'RCL_LIVING_MAINTAIN_TYPE', `Maintain in '${node.name}'`, node);
      for (const cycle of node.cycles) {
        if (!cycle.when) diagnostics.push(diagnostic('RCL_LIFE_WHEN_REQUIRED', `Life cycle '${cycle.name}' requires when`, cycle));
        else {
          const actual = infer(cycle.when);
          if (actual !== 'Truth' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_LIFE_WHEN_TYPE', `Life cycle '${cycle.name}' when must be Truth`, cycle));
        }
        checkChanges(cycle.changes, `Life cycle '${cycle.name}'`, cycle);
      }
    } else if (node.kind === 'GeneticDecl') {
      node.facets.forEach(facet => checkInitial(facet));
      node.genes.forEach(gene => checkInitial(gene));
      checkChanges(node.expressions, `Genetic expression '${node.name}'`, node);
      for (const mutation of node.mutations) {
        const expected = facets.get(mutation.target);
        if (!expected) diagnostics.push(diagnostic('RCL_MUTATION_TARGET_UNKNOWN', `Mutation changes unknown facet '${mutation.target}'`, node));
        const delta = infer(mutation.expression);
        if (expected && delta !== expected && delta !== 'Unknown') diagnostics.push(diagnostic('RCL_MUTATION_TYPE', `Mutation delta ${delta} does not match ${mutation.target}:${expected}`, node));
        if (expected && expected !== 'Number' && !QUANTITY_TYPES.has(expected)) diagnostics.push(diagnostic('RCL_MUTATION_NON_NUMERIC', `Mutation target '${mutation.target}' must be numeric or dimensional`, node));
      }
      checkTruthList(node.preserves, 'RCL_GENETIC_PRESERVE_TYPE', `Genetic preserve in '${node.name}'`, node);
    } else if (node.kind === 'QuantitativeDecl') {
      for (const measure of node.measures) {
        if (measure.baseType !== 'Number' && !QUANTITY_TYPES.has(measure.baseType)) diagnostics.push(diagnostic('RCL_MEASURE_BASE_TYPE', `Measurement '${measure.path}' must use Number or a dimensional quantity, received ${measure.baseType}`, measure));
        const actual = infer(measure.value);
        if (actual !== measure.baseType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_MEASURE_VALUE_TYPE', `Measurement '${measure.path}' expects ${measure.baseType}, received ${actual}`, measure));
        if (measure.uncertainty) {
          const uncertaintyType = infer(measure.uncertainty);
          if (uncertaintyType !== measure.baseType && uncertaintyType !== 'Unknown') diagnostics.push(diagnostic('RCL_MEASURE_UNCERTAINTY_TYPE', `Uncertainty for '${measure.path}' expects ${measure.baseType}, received ${uncertaintyType}`, measure));
        }
        if (measure.confidence) {
          const confidenceType = infer(measure.confidence);
          if (confidenceType !== 'Number' && confidenceType !== 'Unknown') diagnostics.push(diagnostic('RCL_MEASURE_CONFIDENCE_TYPE', `Confidence for '${measure.path}' must be Number`, measure));
        }
        if (!SCALE_TYPES.has(measure.scale)) diagnostics.push(diagnostic('RCL_MEASURE_SCALE', `Unknown measurement scale '${measure.scale}'`, measure));
      }
      node.derives.forEach(derive => checkInitial(derive, derive.expression, derive.valueType));
      checkTruthList(node.preserves, 'RCL_QUANTITATIVE_PRESERVE_TYPE', `Quantitative preserve in '${node.name}'`, node);
    } else if (node.kind === 'KnowledgeDecl') {
      const claimTypes = new Map();
      for (const claim of [...node.claims, ...node.derives]) claimTypes.set(claim.path, claim.baseType);
      for (const claim of node.claims) {
        if (!isKnownBaseType(claim.baseType)) diagnostics.push(diagnostic('RCL_KNOWLEDGE_BASE_TYPE', `Knowledge '${claim.path}' has unknown base type ${claim.baseType}`, claim));
        const actual = infer(claim.expression);
        if (actual !== claim.baseType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_KNOWLEDGE_VALUE_TYPE', `Knowledge '${claim.path}' expects ${claim.baseType}, received ${actual}`, claim));
        if (claim.confidence) {
          const type = infer(claim.confidence);
          if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_KNOWLEDGE_CONFIDENCE_TYPE', `Confidence for '${claim.path}' must be Number`, claim));
        }
      }
      for (const derive of node.derives) {
        if (!isKnownBaseType(derive.baseType)) diagnostics.push(diagnostic('RCL_KNOWLEDGE_BASE_TYPE', `Derived knowledge '${derive.path}' has unknown base type ${derive.baseType}`, derive));
        const actual = infer(derive.expression);
        if (actual !== derive.baseType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_KNOWLEDGE_DERIVE_TYPE', `Derived knowledge '${derive.path}' expects ${derive.baseType}, received ${actual}`, derive));
        for (const dependency of derive.dependencies) {
          const type = facets.get(dependency);
          if (!type) diagnostics.push(diagnostic('RCL_KNOWLEDGE_DEPENDENCY_UNKNOWN', `Derived knowledge '${derive.path}' depends on unknown '${dependency}'`, derive));
          else if (!isKnowledgeType(type)) diagnostics.push(diagnostic('RCL_KNOWLEDGE_DEPENDENCY_TYPE', `Derived knowledge dependency '${dependency}' is ${type}, not knowledge`, derive));
        }
        if (derive.confidence) {
          const type = infer(derive.confidence);
          if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_KNOWLEDGE_CONFIDENCE_TYPE', `Confidence for '${derive.path}' must be Number`, derive));
        }
      }
      for (const revision of node.revisions) {
        const targetType = facets.get(revision.target);
        if (!targetType) diagnostics.push(diagnostic('RCL_KNOWLEDGE_REVISION_TARGET_UNKNOWN', `Knowledge revision targets unknown '${revision.target}'`, revision));
        else if (!isKnowledgeType(targetType)) diagnostics.push(diagnostic('RCL_KNOWLEDGE_REVISION_TARGET_TYPE', `Knowledge revision target '${revision.target}' is not knowledge`, revision));
        const actual = infer(revision.expression);
        const expected = knowledgeBaseType(targetType);
        if (expected && actual !== expected && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_KNOWLEDGE_REVISION_TYPE', `Revision of '${revision.target}' expects ${expected}, received ${actual}`, revision));
        if (revision.confidence) {
          const type = infer(revision.confidence);
          if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_KNOWLEDGE_CONFIDENCE_TYPE', `Revision confidence for '${revision.target}' must be Number`, revision));
        }
      }
      for (const decay of node.decays) {
        const targetType = facets.get(decay.target);
        if (!targetType) diagnostics.push(diagnostic('RCL_KNOWLEDGE_DECAY_TARGET_UNKNOWN', `Knowledge decay targets unknown '${decay.target}'`, decay));
        else if (!isKnowledgeType(targetType)) diagnostics.push(diagnostic('RCL_KNOWLEDGE_DECAY_TARGET_TYPE', `Knowledge decay target '${decay.target}' is not knowledge`, decay));
        const amountType = infer(decay.amount);
        if (amountType !== 'Number' && amountType !== 'Unknown') diagnostics.push(diagnostic('RCL_KNOWLEDGE_DECAY_TYPE', `Knowledge decay for '${decay.target}' must be Number`, decay));
      }
      checkTruthList(node.preserves, 'RCL_KNOWLEDGE_PRESERVE_TYPE', `Knowledge preserve in '${node.name}'`, node);
    } else if (node.kind === 'NaturalLanguageDecl') {
      for (const item of node.utterances) {
        const actual = infer(item.expression);
        if (actual !== 'Text' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_UTTERANCE_TEXT_TYPE', `Utterance '${item.path}' must be Text, received ${actual}`, item));
      }
      for (const item of node.intents) {
        const condition = infer(item.when);
        if (condition !== 'Truth' && condition !== 'Unknown') diagnostics.push(diagnostic('RCL_INTENT_WHEN_TYPE', `Intent '${item.path}' when must be Truth`, item));
        if (item.confidence) { const type = infer(item.confidence); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_INTENT_CONFIDENCE_TYPE', `Intent '${item.path}' confidence must be Number`, item)); }
        for (const dependency of item.utterances) {
          const type = facets.get(dependency);
          if (!type) diagnostics.push(diagnostic('RCL_INTENT_UTTERANCE_UNKNOWN', `Intent '${item.path}' references unknown utterance '${dependency}'`, item));
          else if (type !== 'Utterance') diagnostics.push(diagnostic('RCL_INTENT_UTTERANCE_TYPE', `Intent dependency '${dependency}' is ${type}, not Utterance`, item));
        }
        item.slots.forEach(slot => infer(slot.expression));
      }
      checkTruthList(node.preserves, 'RCL_LANGUAGE_PRESERVE_TYPE', `Natural-language preserve in '${node.name}'`, node);
    } else if (node.kind === 'UnderstandingDecl') {
      for (const item of node.hypotheses) {
        if (!isKnownBaseType(item.baseType)) diagnostics.push(diagnostic('RCL_UNDERSTANDING_BASE_TYPE', `Understanding '${item.path}' has unknown base type ${item.baseType}`, item));
        const actual = infer(item.expression);
        if (actual !== item.baseType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_UNDERSTANDING_VALUE_TYPE', `Understanding '${item.path}' expects ${item.baseType}, received ${actual}`, item));
        for (const metric of ['confidence', 'coverage', 'coherence']) if (item[metric]) { const type = infer(item[metric]); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_UNDERSTANDING_METRIC_TYPE', `${metric} for '${item.path}' must be Number`, item)); }
        for (const dependency of item.dependencies) {
          const type = facets.get(dependency);
          if (!type) diagnostics.push(diagnostic('RCL_UNDERSTANDING_DEPENDENCY_UNKNOWN', `Understanding '${item.path}' depends on unknown '${dependency}'`, item));
          else if (!isEvidenceType(type)) diagnostics.push(diagnostic('RCL_UNDERSTANDING_DEPENDENCY_TYPE', `Understanding dependency '${dependency}' is ${type}, not evidence-bearing`, item));
        }
      }
      checkTruthList(node.preserves, 'RCL_UNDERSTANDING_PRESERVE_TYPE', `Understanding preserve in '${node.name}'`, node);
    } else if (node.kind === 'CreationDecl') {
      const types = new Set();
      for (const item of node.candidates) {
        if (!isKnownBaseType(item.baseType)) diagnostics.push(diagnostic('RCL_CREATION_BASE_TYPE', `Creation '${item.path}' has unknown base type ${item.baseType}`, item));
        types.add(item.baseType);
        const actual = infer(item.expression);
        if (actual !== item.baseType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_CREATION_VALUE_TYPE', `Creation '${item.path}' expects ${item.baseType}, received ${actual}`, item));
        const condition = infer(item.when);
        if (condition !== 'Truth' && condition !== 'Unknown') diagnostics.push(diagnostic('RCL_CREATION_WHEN_TYPE', `Creation '${item.path}' when must be Truth`, item));
        for (const metric of ['novelty', 'utility', 'feasibility', 'risk']) if (item[metric]) { const type = infer(item[metric]); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_CREATION_METRIC_TYPE', `${metric} for '${item.path}' must be Number`, item)); }
        for (const dependency of item.basedOn) if (!facets.has(dependency)) diagnostics.push(diagnostic('RCL_CREATION_DEPENDENCY_UNKNOWN', `Creation '${item.path}' depends on unknown '${dependency}'`, item));
      }
      if (!node.selection) diagnostics.push(diagnostic('RCL_CREATION_SELECTION_REQUIRED', `Creation plane '${node.name}' requires select`, node));
      else {
        for (const path of node.selection.candidates) if (!node.candidates.some(item => item.path === path)) diagnostics.push(diagnostic('RCL_CREATION_SELECTION_UNKNOWN', `Selection '${node.selection.path}' references unknown candidate '${path}'`, node.selection));
        if (types.size > 1) diagnostics.push(diagnostic('RCL_CREATION_SELECTION_TYPE', `Creation plane '${node.name}' candidates must share one base type`, node));
      }
      checkTruthList(node.preserves, 'RCL_CREATION_PRESERVE_TYPE', `Creation preserve in '${node.name}'`, node);
    } else if (node.kind === 'EnergyDecl') {
      for (const reservoir of node.reservoirs) {
        if (reservoir.valueType !== 'Energy') diagnostics.push(diagnostic('RCL_ENERGY_RESERVOIR_TYPE', `Energy reservoir '${reservoir.path}' must have type Energy`, reservoir));
        const actual = infer(reservoir.value); if (actual !== 'Energy' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_ENERGY_INITIAL_TYPE', `Energy reservoir '${reservoir.path}' expects Energy, received ${actual}`, reservoir));
      }
      const paths = new Set(node.reservoirs.map(item => item.path));
      for (const flow of node.flows) {
        if (!paths.has(flow.from) || !paths.has(flow.to)) diagnostics.push(diagnostic('RCL_ENERGY_FLOW_RESERVOIR', `Energy flow '${flow.name}' references unknown reservoir`, flow));
        const amountType = infer(flow.amount); if (amountType !== 'Energy' && amountType !== 'Unknown') diagnostics.push(diagnostic('RCL_ENERGY_FLOW_TYPE', `Energy flow '${flow.name}' amount must be Energy`, flow));
        const efficiencyType = infer(flow.efficiency); if (efficiencyType !== 'Number' && efficiencyType !== 'Unknown') diagnostics.push(diagnostic('RCL_ENERGY_EFFICIENCY_TYPE', `Energy flow '${flow.name}' efficiency must be Number`, flow));
      }
      checkTruthList(node.preserves, 'RCL_ENERGY_PRESERVE_TYPE', `Energy preserve in '${node.name}'`, node);
    } else if (node.kind === 'ElementDecl') {
      const species = new Set(node.species.map(item => item.path));
      for (const item of node.species) {
        for (const expr of [item.atomicNumber, item.atomicMass, item.charge].filter(Boolean)) { const type = infer(expr); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_ELEMENT_NUMBER_TYPE', `Species '${item.path}' numeric property must be Number`, item)); }
      }
      for (const compound of node.compounds) for (const component of compound.components) {
        if (!species.has(component.component)) diagnostics.push(diagnostic('RCL_ELEMENT_COMPONENT_UNKNOWN', `Compound '${compound.path}' references unknown species '${component.component}'`, compound));
        const type = infer(component.coefficient); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_ELEMENT_COEFFICIENT_TYPE', `Compound '${compound.path}' coefficient must be Number`, compound));
      }
      checkTruthList(node.preserves, 'RCL_ELEMENT_PRESERVE_TYPE', `Element preserve in '${node.name}'`, node);
    } else if (node.kind === 'ScienceDecl') {
      const hypotheses = new Set(node.hypotheses.map(item => item.path));
      for (const item of node.hypotheses) {
        if (!isKnownBaseType(item.baseType)) diagnostics.push(diagnostic('RCL_SCIENCE_BASE_TYPE', `Hypothesis '${item.path}' has unknown base type ${item.baseType}`, item));
        const actual = infer(item.expression); if (actual !== item.baseType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_SCIENCE_VALUE_TYPE', `Hypothesis '${item.path}' expects ${item.baseType}, received ${actual}`, item));
      }
      for (const experiment of node.experiments) {
        if (!hypotheses.has(experiment.hypothesis)) diagnostics.push(diagnostic('RCL_SCIENCE_HYPOTHESIS_UNKNOWN', `Experiment '${experiment.path}' references unknown hypothesis '${experiment.hypothesis}'`, experiment));
        for (const expr of [experiment.repeats, experiment.tolerance]) { const type = infer(expr); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_SCIENCE_EXPERIMENT_TYPE', `Experiment '${experiment.path}' repeats/tolerance must be Number`, experiment)); }
      }
      checkTruthList(node.preserves, 'RCL_SCIENCE_PRESERVE_TYPE', `Science preserve in '${node.name}'`, node);
    } else if (node.kind === 'EmbodimentDecl') {
      [...node.facets, ...node.systems.flatMap(part => part.facets), ...node.organs.flatMap(part => part.facets)].forEach(item => checkInitial(item));
      checkTruthList(node.maintains, 'RCL_BODY_MAINTAIN_TYPE', `Embodiment maintain in '${node.name}'`, node);
    } else if (node.kind === 'SpiritDecl') {
      node.facets.forEach(item => checkInitial(item));
      for (const item of [...node.values, ...node.purposes, ...node.affects]) {
        const actual = infer(item.expression); if (actual !== item.valueType && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_SPIRIT_ASPECT_TYPE', `Spirit aspect '${item.path}' expects ${item.valueType}, received ${actual}`, item));
        const weightType = infer(item.weight); if (weightType !== 'Number' && weightType !== 'Unknown') diagnostics.push(diagnostic('RCL_SPIRIT_WEIGHT_TYPE', `Spirit aspect '${item.path}' weight must be Number`, item));
      }
      checkTruthList(node.preserves, 'RCL_SPIRIT_PRESERVE_TYPE', `Spirit preserve in '${node.name}'`, node);
    } else if (node.kind === 'SpacetimeDecl') {
      const frameNames = new Set();
      for (const frame of node.frames) {
        if (frameNames.has(frame.localName)) diagnostics.push(diagnostic('RCL_SPACETIME_FRAME_DUPLICATE', `Frame '${frame.localName}' is declared more than once`, frame));
        frameNames.add(frame.localName);
        if (!Number.isInteger(frame.dimensions) || frame.dimensions < 1 || frame.dimensions > 8) diagnostics.push(diagnostic('RCL_SPACETIME_DIMENSIONS', `Frame '${frame.localName}' dimensions must be an integer from 1 to 8`, frame));
      }
      const clockNames = new Set(node.clocks.map(clock => clock.path));
      for (const clock of node.clocks) {
        if (clock.valueType !== 'Time') diagnostics.push(diagnostic('RCL_SPACETIME_CLOCK_TYPE', `Clock '${clock.path}' must have type Time`, clock));
        const initialType = infer(clock.value);
        const tickType = infer(clock.tick);
        const rateType = infer(clock.rate);
        if (initialType !== 'Time' && initialType !== 'Unknown') diagnostics.push(diagnostic('RCL_SPACETIME_CLOCK_INITIAL', `Clock '${clock.path}' initial value must be Time`, clock));
        if (tickType !== 'Time' && tickType !== 'Unknown') diagnostics.push(diagnostic('RCL_SPACETIME_CLOCK_TICK', `Clock '${clock.path}' tick must be Time`, clock));
        if (rateType !== 'Number' && rateType !== 'Unknown') diagnostics.push(diagnostic('RCL_SPACETIME_CLOCK_RATE', `Clock '${clock.path}' rate must be Number`, clock));
      }
      for (const coordinate of node.coordinates) {
        const actual = infer(coordinate.expression);
        if (actual !== 'SpacetimePoint' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_SPACETIME_COORDINATE_TYPE', `Coordinate '${coordinate.path}' expects SpacetimePoint, received ${actual}`, coordinate));
        if (coordinate.clock && !clockNames.has(coordinate.clock)) diagnostics.push(diagnostic('RCL_SPACETIME_COORDINATE_CLOCK', `Coordinate '${coordinate.path}' references unknown clock '${coordinate.clock}'`, coordinate));
      }
      for (const relation of node.relations) {
        if (!['before', 'after', 'simultaneous'].includes(relation.relation)) diagnostics.push(diagnostic('RCL_SPACETIME_RELATION', `Unknown spacetime relation '${relation.relation}'`, relation));
      }
      checkTruthList(node.preserves, 'RCL_SPACETIME_PRESERVE_TYPE', `Spacetime preserve in '${node.name}'`, node);
    } else if (node.kind === 'AccelerationDecl') {
      if (!node.target) diagnostics.push(diagnostic('RCL_ACCELERATION_TARGET_REQUIRED', `Acceleration '${node.name}' requires target`, node));
      else if (!reckons.has(node.target)) diagnostics.push(diagnostic('RCL_ACCELERATION_TARGET_UNKNOWN', `Acceleration '${node.name}' targets unknown reckoning '${node.target}'`, node));
      if (!['memoize'].includes(node.strategy)) diagnostics.push(diagnostic('RCL_ACCELERATION_STRATEGY', `Reference runtime supports memoize, received '${node.strategy}'`, node));
      for (const metric of ['factor', 'fidelity']) {
        if (!node[metric]) diagnostics.push(diagnostic('RCL_ACCELERATION_METRIC_REQUIRED', `Acceleration '${node.name}' requires ${metric}`, node));
        else { const type = infer(node[metric]); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_ACCELERATION_METRIC_TYPE', `${metric} for '${node.name}' must be Number`, node)); }
      }
      if (node.budget) { const type = infer(node.budget); if (type !== 'Time' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_ACCELERATION_BUDGET_TYPE', `Budget for '${node.name}' must be Time`, node)); }
      checkTruthList(node.preserves, 'RCL_ACCELERATION_PRESERVE_TYPE', `Acceleration preserve in '${node.name}'`, node);
    } else if (node.kind === 'CompressionDecl') {
      if (!node.target) diagnostics.push(diagnostic('RCL_COMPRESSION_TARGET_REQUIRED', `Compression '${node.name}' requires target`, node));
      else if (![...facets.keys()].some(path => path === node.target || path.startsWith(`${node.target}.`))) diagnostics.push(diagnostic('RCL_COMPRESSION_TARGET_UNKNOWN', `Compression '${node.name}' targets unknown state namespace '${node.target}'`, node));
      if (node.mode !== 'lossless') diagnostics.push(diagnostic('RCL_COMPRESSION_MODE', `Reference runtime supports lossless mode, received '${node.mode}'`, node));
      if (node.codec !== 'deflate') diagnostics.push(diagnostic('RCL_COMPRESSION_CODEC', `Reference runtime supports deflate codec, received '${node.codec}'`, node));
      if (node.fidelity) { const type = infer(node.fidelity); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_COMPRESSION_FIDELITY_TYPE', `Fidelity for '${node.name}' must be Number`, node)); }
      if (node.maxRatio) { const type = infer(node.maxRatio); if (type !== 'Number' && type !== 'Unknown') diagnostics.push(diagnostic('RCL_COMPRESSION_RATIO_TYPE', `max_ratio for '${node.name}' must be Number`, node)); }
      if (node.mode === 'lossless' && node.fidelity && node.fidelity.kind === 'LiteralExpr' && node.fidelity.value !== 1) diagnostics.push(diagnostic('RCL_COMPRESSION_LOSSLESS_FIDELITY', `Lossless compression '${node.name}' must declare fidelity 1`, node));
      checkTruthList(node.preserves, 'RCL_COMPRESSION_PRESERVE_TYPE', `Compression preserve in '${node.name}'`, node);
    }
  }

  const actorFor = rule => rule.kind === 'Emergence' ? rule.cause : rule.from;
  const warrantExists = (actor, need) => {
    const subject = subjects.get(actor);
    return Boolean(subject?.warrants.some(warrant => warrant.capability === need.capability && scopeMatches(warrant.target, need.target)));
  };

  for (const rule of rules.values()) {
    const actor = actorFor(rule);
    if (rule.kind === 'Emergence' && !actor) diagnostics.push(diagnostic('RCL_EMERGENCE_CAUSE_REQUIRED', `Emergence '${rule.name}' requires a cause`, rule));
    if (rule.kind === 'Resonance') {
      if (!rule.from) diagnostics.push(diagnostic('RCL_RESONANCE_FROM_REQUIRED', `Resonance '${rule.name}' requires from`, rule));
      if (!rule.into) diagnostics.push(diagnostic('RCL_RESONANCE_INTO_REQUIRED', `Resonance '${rule.name}' requires into`, rule));
      if (rule.from && !subjects.has(rule.from)) diagnostics.push(diagnostic('RCL_SUBJECT_UNKNOWN', `Unknown resonance source '${rule.from}'`, rule));
      if (rule.into && !subjects.has(rule.into)) diagnostics.push(diagnostic('RCL_SUBJECT_UNKNOWN', `Unknown resonance target '${rule.into}'`, rule));
    }
    if (actor && !subjects.has(actor)) diagnostics.push(diagnostic('RCL_SUBJECT_UNKNOWN', `Unknown causing subject '${actor}'`, rule));
    if (!rule.when) diagnostics.push(diagnostic('RCL_RULE_WHEN_REQUIRED', `Rule '${rule.name}' requires a when clause`, rule));
    else {
      const actual = infer(rule.when);
      if (actual !== 'Truth' && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_RULE_WHEN_TYPE', `Rule '${rule.name}' when clause must be Truth`, rule));
    }
    if (rule.alters.length === 0 && rule.calls.length === 0) diagnostics.push(diagnostic('RCL_RULE_EFFECT_REQUIRED', `Rule '${rule.name}' must alter reality or call a host`, rule));
    for (const need of rule.needs) {
      if (actor && !warrantExists(actor, need)) diagnostics.push(diagnostic('RCL_WARRANT_MISSING', `Subject '${actor}' lacks warrant '${need.capability}' on '${need.target}' required by '${rule.name}'`, rule));
    }

    for (const alteration of rule.alters) {
      const expected = facets.get(alteration.target);
      if (!expected) diagnostics.push(diagnostic('RCL_ALTER_TARGET_UNKNOWN', `Rule '${rule.name}' alters unknown facet '${alteration.target}'`, rule));
      const actual = infer(alteration.expression);
      if (expected && actual !== expected && actual !== 'Unknown') diagnostics.push(diagnostic('RCL_ALTER_TYPE', `Rule '${rule.name}' assigns ${actual} to ${alteration.target}:${expected}`, rule));
    }
    checkTruthList(rule.preserves, 'RCL_PRESERVE_TYPE', `Preserve in '${rule.name}'`, rule);
    for (const call of rule.calls) {
      const [hostName, ...offerParts] = call.capability.split('.');
      const host = hosts.get(hostName);
      const offerName = offerParts.join('.');
      if (!host) diagnostics.push(diagnostic('RCL_HOST_UNKNOWN', `Rule '${rule.name}' calls unknown host '${hostName}'`, rule));
      const offer = host?.offers.find(item => item.capability === offerName || item.capability === call.capability);
      if (host && !offer) diagnostics.push(diagnostic('RCL_HOST_CAPABILITY_UNKNOWN', `Host '${hostName}' does not offer '${offerName}'`, rule));
      call.args.forEach(arg => infer(arg));
      const targetType = facets.get(call.target);
      if (!targetType) diagnostics.push(diagnostic('RCL_CALL_TARGET_UNKNOWN', `Host call writes to unknown facet '${call.target}'`, rule));
      if (offer && targetType && offer.returnType !== targetType) diagnostics.push(diagnostic('RCL_CALL_TARGET_TYPE', `Host '${call.capability}' returns ${offer.returnType}, but ${call.target} is ${targetType}`, rule));
    }
  }

  for (const node of program.body) {
    if ((node.kind === 'Foresee' || node.kind === 'Realize') && !rules.has(node.rule)) diagnostics.push(diagnostic('RCL_DIRECTIVE_RULE_UNKNOWN', `${node.kind} references unknown rule '${node.rule}'`, node));
    else if (node.kind === 'Reflect' && !metaDomains.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_META_UNKNOWN', `Reflect references unknown meta reality '${node.name}'`, node));
    else if (node.kind === 'Advance' && !physicalLaws.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_PHYSICAL_UNKNOWN', `Advance references unknown physical law '${node.name}'`, node));
    else if (node.kind === 'Observe' && !perceptions.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_PERCEPTION_UNKNOWN', `Observe references unknown perception '${node.name}'`, node));
    else if (node.kind === 'Propagate' && !neurals.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_NEURAL_UNKNOWN', `Propagate references unknown neural reality '${node.name}'`, node));
    else if (node.kind === 'Live' && !livings.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_LIVING_UNKNOWN', `Live references unknown living reality '${node.name}'`, node));
    else if (node.kind === 'Inherit' && !genetics.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_GENETIC_UNKNOWN', `Inherit references unknown genetic reality '${node.name}'`, node));
    else if (node.kind === 'Quantify' && !quantitatives.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_QUANTITATIVE_UNKNOWN', `Quantify references unknown quantitative reality '${node.name}'`, node));
    else if (node.kind === 'Learn' && !knowledges.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_KNOWLEDGE_UNKNOWN', `Learn references unknown knowledge reality '${node.name}'`, node));
    else if (node.kind === 'Interpret' && !naturalLanguages.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_LANGUAGE_UNKNOWN', `Interpret references unknown natural-language plane '${node.name}'`, node));
    else if (node.kind === 'Understand' && !understandings.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_UNDERSTANDING_UNKNOWN', `Understand references unknown understanding plane '${node.name}'`, node));
    else if (node.kind === 'Create' && !creations.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_CREATION_UNKNOWN', `Create references unknown creative plane '${node.name}'`, node));
    else if (node.kind === 'Synchronize' && !spacetimes.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_SPACETIME_UNKNOWN', `Synchronize references unknown spacetime reality '${node.name}'`, node));
    else if (node.kind === 'Accelerate' && !accelerations.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_ACCELERATION_UNKNOWN', `Accelerate references unknown acceleration reality '${node.name}'`, node));
    else if ((node.kind === 'Compress' || node.kind === 'Restore') && !compressions.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_COMPRESSION_UNKNOWN', `${node.kind} references unknown compression reality '${node.name}'`, node));
    else if (node.kind === 'Energize' && !energies.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_ENERGY_UNKNOWN', `Energize references unknown energy reality '${node.name}'`, node));
    else if (node.kind === 'Constitute' && !elements.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_ELEMENT_UNKNOWN', `Constitute references unknown element reality '${node.name}'`, node));
    else if (node.kind === 'Investigate' && !sciences.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_SCIENCE_UNKNOWN', `Investigate references unknown science reality '${node.name}'`, node));
    else if (node.kind === 'Embody' && !embodiments.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_BODY_UNKNOWN', `Embody references unknown embodiment reality '${node.name}'`, node));
    else if (node.kind === 'Integrate' && !spirits.has(node.name)) diagnostics.push(diagnostic('RCL_DIRECTIVE_SPIRIT_UNKNOWN', `Integrate references unknown spirit reality '${node.name}'`, node));

    if (['Advance', 'Propagate', 'Live', 'Inherit', 'Synchronize'].includes(node.kind)) {
      const countType = infer(node.count);
      if (countType !== 'Number' && countType !== 'Unknown') diagnostics.push(diagnostic('RCL_DIRECTIVE_COUNT_TYPE', `${node.kind} count must be Number`, node));
    }
    if (node.kind === 'Advance') {
      const law = physicalLaws.get(node.name);
      const dtType = infer(node.dt);
      if (law?.step && dtType !== law.step.valueType && dtType !== 'Unknown') diagnostics.push(diagnostic('RCL_DIRECTIVE_DT_TYPE', `Advance dt is ${dtType}; law '${law.name}' expects ${law.step.valueType}`, node));
    }
  }

  return {
    diagnostics,
    symbols: {
      facets, subjects, reckons, hosts, rules,
      metaDomains, physicals, physicalLaws, perceptions,
      neurals, neuralPathways, livings, lifeCycles,
      genetics, quantitatives, knowledges, naturalLanguages, understandings, creations,
      spacetimes, accelerations, compressions,
    },
  };
}
