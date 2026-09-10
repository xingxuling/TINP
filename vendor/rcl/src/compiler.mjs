import { parseReality } from './parser.mjs';
import { checkReality } from './type-system.mjs';
import { RCLCompileError } from './errors.mjs';
import { realityRoot } from './canonical.mjs';
import { REALITY_DOMAINS, CROSS_DOMAIN_AXES, COMPOSITE_REALITY_PLANES, META_REALITY_PLANES } from './foundation.mjs';
import { compileTypedModuleGraph, parseTypeExpression, readTypedModuleSourcesFromDir } from './type-module-kernel.mjs';
import { compileNativeUiDeclarations } from './ui/ui-compiler.mjs';

export const RCL_LANGUAGE_VERSION = '0.14.0-alpha.1';
export const RCL_TYPED_COMPILER_VERSION = '0.34.0-alpha.1';
export const RCL_TYPED_COMPILER_FORMAT = 'rcl.typed-compiler.semantic-map.v0.34';

const BUILTIN_TYPE_ARITY = new Map([
  ['Number', 0], ['Text', 0], ['Truth', 0], ['Sequence', 0], ['Span', 0], ['Token', 0],
  ['AstNode', 0], ['ParseState', 0], ['Symbol', 0], ['SemanticNode', 0], ['IrNode', 0], ['TypedRef', 0],
  ['Utterance', 0], ['Intent', 0], ['SpacetimePoint', 0], ['Element', 0], ['Experiment', 0],
  ['BodyState', 0], ['SpiritState', 0], ['Length', 0], ['Mass', 0], ['Time', 0], ['Energy', 0],
  ['Temperature', 0], ['Velocity', 0], ['Acceleration', 0], ['Force', 0], ['Probability', 0],
  ['Measure', 1], ['Know', 1], ['Understand', 1], ['Create', 1], ['Science', 1],
  ['Option', 1], ['Array', 1], ['Result', 2], ['Map', 2],
]);

function typeDiagnostic(code, message, typeSource) {
  return {
    code,
    message,
    nodeKind: 'TypeRef',
    typeSource,
  };
}

function compileTypeModulesFromOptions(options = {}) {
  if (options.typeModuleReport) return options.typeModuleReport;
  let sources = options.typeModuleSources ?? null;
  if (!sources && options.typeModuleDir) sources = readTypedModuleSourcesFromDir(options.typeModuleDir);
  if (!sources) return null;
  return compileTypedModuleGraph(sources);
}

function createExternalTypeResolver(typeModuleReport = null) {
  if (!typeModuleReport?.ir) return null;
  const declarations = [];
  for (const module of typeModuleReport.ir.modules ?? []) {
    for (const decl of module.declarations ?? []) declarations.push({ module: module.name, decl });
  }
  const byQualified = new Map();
  const byShort = new Map();
  for (const item of declarations) {
    byQualified.set(`${item.module}.${item.decl.name}`, item);
    byQualified.set(`${item.module}::${item.decl.name}`, item);
    if (!byShort.has(item.decl.name)) byShort.set(item.decl.name, []);
    byShort.get(item.decl.name).push(item);
  }

  const resolveExpr = (expr, diagnostics) => {
    const args = expr.args.map(arg => resolveExpr(arg, diagnostics));
    const builtinArity = BUILTIN_TYPE_ARITY.get(expr.name);
    if (builtinArity !== undefined) {
      if (builtinArity !== args.length) diagnostics.push(typeDiagnostic('RCL_TYPE_ARITY_MISMATCH', `Type '${expr.name}' expects ${builtinArity} argument(s), got ${args.length}`, expr.source));
      return { ok: builtinArity === args.length && args.every(arg => arg.ok), canonical: `${expr.name}${args.length ? `<${args.map(arg => arg.canonical).join(',')}>` : ''}`, external: false };
    }
    let match = null;
    if (expr.name.includes('.') || expr.name.includes('::')) {
      match = byQualified.get(expr.name);
      if (!match) {
        diagnostics.push(typeDiagnostic('RCL_TYPE_REFERENCE_MISSING', `External type '${expr.name}' is not declared in the linked .rcltype graph`, expr.source));
        return { ok: false, canonical: expr.source, external: true };
      }
    } else {
      const matches = byShort.get(expr.name) ?? [];
      if (matches.length === 1) match = matches[0];
      else if (matches.length > 1) {
        diagnostics.push(typeDiagnostic('RCL_TYPE_REFERENCE_AMBIGUOUS', `External type '${expr.name}' is exported by multiple linked modules`, expr.source));
        return { ok: false, canonical: expr.source, external: true };
      } else {
        diagnostics.push(typeDiagnostic('RCL_TYPE_REFERENCE_MISSING', `External type '${expr.name}' is not built in or declared in the linked .rcltype graph`, expr.source));
        return { ok: false, canonical: expr.source, external: true };
      }
    }
    if (match.decl.typeParams.length !== args.length) diagnostics.push(typeDiagnostic('RCL_TYPE_ARITY_MISMATCH', `Type '${expr.name}' expects ${match.decl.typeParams.length} argument(s), got ${args.length}`, expr.source));
    const ok = match.decl.typeParams.length === args.length && args.every(arg => arg.ok);
    const typeArgs = args.map(arg => arg.canonical);
    return {
      ok,
      canonical: `${match.decl.qualifiedName}${args.length ? `<${typeArgs.join(',')}>` : ''}`,
      external: true,
      typeArgs,
      typeParamMap: Object.fromEntries(match.decl.typeParams.map((param, index) => [param, typeArgs[index] ?? param])),
      declaration: {
        module: match.module,
        name: match.decl.name,
        qualifiedName: match.decl.qualifiedName,
        kind: match.decl.kind,
        typeParams: match.decl.typeParams,
        fields: match.decl.fields ?? [],
        variants: match.decl.variants ?? [],
      },
    };
  };

  return function resolveExternalType(typeText) {
    const diagnostics = [];
    try {
      const expr = parseTypeExpression(typeText);
      const resolved = resolveExpr(expr, diagnostics);
      return { ...resolved, diagnostics, source: typeText };
    } catch (error) {
      return {
        ok: false,
        canonical: typeText,
        external: false,
        diagnostics: error.diagnostics?.length ? error.diagnostics : [typeDiagnostic('RCL_TYPE_EXPR_INVALID', error.message, typeText)],
        source: typeText,
      };
    }
  };
}

function buildSourceMap(ast) {
  const facets = {};
  const walkFacet = (facet) => {
    facets[facet.path] = {
      path: facet.path,
      kind: 'FacetDecl',
      declaredType: facet.valueType,
      location: facet.location ?? null,
      owner: facet.owner ?? null,
    };
  };
  for (const node of ast.body) {
    if (node.kind === 'FacetDecl') walkFacet(node);
    else if (node.kind === 'SubjectDecl' || node.kind === 'MetaDecl' || node.kind === 'NeuralDecl' || node.kind === 'LivingDecl' || node.kind === 'GeneticDecl' || node.kind === 'EmbodimentDecl' || node.kind === 'SpiritDecl') {
      node.facets?.forEach(walkFacet);
    } else if (node.kind === 'PhysicalDecl') {
      node.facets.forEach(walkFacet);
      node.bodies.forEach(body => body.facets.forEach(walkFacet));
      node.fields.forEach(field => field.facets.forEach(walkFacet));
    }
  }
  return { format: 'rcl.source-map.v0.30', facets };
}

function buildTypeBindings(facets, resolver = null) {
  const facetBindings = {};
  for (const facet of facets) {
    const resolved = resolver ? resolver(facet.valueType) : null;
    facetBindings[facet.path] = {
      path: facet.path,
      declaredType: facet.valueType,
      canonicalType: resolved?.ok ? resolved.canonical : facet.valueType,
      external: Boolean(resolved?.external),
      owner: facet.owner ?? null,
      location: facet.location ?? null,
    };
  }
  return { format: 'rcl.type-bindings.v0.30', facets: facetBindings };
}

function describeConstructorExpression(expr) {
  if (!expr) return null;
  if (expr.kind === 'RecordConstructExpr') return {
    kind: 'Record',
    canonicalType: expr.canonicalType,
    fieldCount: expr.fields.length,
    fields: expr.fields.map(field => field.name),
  };
  if (expr.kind === 'UnionConstructExpr') return {
    kind: 'Union',
    canonicalType: expr.canonicalType,
    variant: expr.variant,
    payloadCount: expr.payload.length,
  };
  return null;
}

function collectTypedExpressionFeatures(expr, features = { fieldAccesses: [], matches: [] }) {
  if (!expr) return features;
  if (expr.kind === 'FieldAccessExpr') {
    features.fieldAccesses.push({
      basePath: expr.basePath ?? null,
      field: expr.field,
      canonicalType: expr.canonicalType ?? null,
    });
    collectTypedExpressionFeatures(expr.object, features);
    return features;
  }
  if (expr.kind === 'MatchUnionExpr') {
    features.matches.push({
      canonicalType: expr.canonicalType ?? null,
      cases: expr.cases.map(item => ({ variant: item.variant, wildcard: Boolean(item.wildcard), bindingCount: item.bindings.length })),
    });
    collectTypedExpressionFeatures(expr.target, features);
    expr.cases.forEach(item => collectTypedExpressionFeatures(item.expression, features));
    return features;
  }
  if (expr.kind === 'RecordConstructExpr') expr.fields.forEach(field => collectTypedExpressionFeatures(field.value ?? field.expression, features));
  else if (expr.kind === 'UnionConstructExpr') expr.payload.forEach(item => collectTypedExpressionFeatures(item.value ?? item.expression ?? item, features));
  else if (expr.kind === 'RecordLiteralExpr') expr.fields.forEach(field => collectTypedExpressionFeatures(field.expression, features));
  else if (expr.kind === 'CallExpr') expr.args.forEach(arg => collectTypedExpressionFeatures(arg, features));
  else if (expr.kind === 'UnaryExpr') collectTypedExpressionFeatures(expr.expression, features);
  else if (expr.kind === 'BinaryExpr') { collectTypedExpressionFeatures(expr.left, features); collectTypedExpressionFeatures(expr.right, features); }
  return features;
}

function buildSemanticMap(ir, typeBindings, sourceMap) {
  const facets = Object.fromEntries(ir.facets.map(facet => {
    const features = collectTypedExpressionFeatures(facet.value);
    return [facet.path, {
      path: facet.path,
      declaredType: facet.valueType,
      canonicalType: typeBindings?.facets?.[facet.path]?.canonicalType ?? facet.valueType,
      externalType: Boolean(typeBindings?.facets?.[facet.path]?.external),
      location: sourceMap?.facets?.[facet.path]?.location ?? facet.location ?? null,
      owner: facet.owner ?? null,
      deferred: Boolean(facet.deferred),
      constructor: describeConstructorExpression(facet.value),
      fieldAccesses: features.fieldAccesses,
      matches: features.matches,
    }];
  }));
  return {
    format: RCL_TYPED_COMPILER_FORMAT,
    version: RCL_TYPED_COMPILER_VERSION,
    reality: ir.name,
    facetCount: ir.facets.length,
    typedFacetCount: Object.values(typeBindings?.facets ?? {}).filter(item => item.external).length,
    constructorCount: Object.values(facets).filter(item => item.constructor).length,
    fieldAccessCount: Object.values(facets).reduce((sum, item) => sum + item.fieldAccesses.length, 0),
    matchCount: Object.values(facets).reduce((sum, item) => sum + item.matches.length, 0),
    facets,
  };
}

function substituteTypeParams(typeText, substitutions = {}) {
  return String(typeText).replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (name) => substitutions[name] ?? name);
}

function followRecordFieldsForLowering(baseType, fieldNames, resolver) {
  let currentType = baseType;
  const trace = [];
  for (const fieldName of fieldNames) {
    const resolved = resolver?.(currentType);
    if (!resolved?.ok || resolved.declaration?.kind !== 'Record') return null;
    const field = (resolved.declaration.fields ?? []).find(item => item.name === fieldName);
    if (!field) return null;
    currentType = substituteTypeParams(field.canonicalType, resolved.typeParamMap ?? {});
    trace.push({ name: fieldName, canonicalType: currentType, ownerType: resolved.canonical });
  }
  return { type: currentType, trace };
}

function resolveProjectionPathForLowering(path, facetTypes, resolver, locals = new Map()) {
  const parts = String(path).split('.');
  if (parts.length < 2) return null;
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const prefix = parts.slice(0, index).join('.');
    let baseType = null;
    if (locals.has(prefix)) baseType = locals.get(prefix);
    else if (facetTypes?.has(prefix)) baseType = facetTypes.get(prefix);
    if (!baseType) continue;
    const followed = followRecordFieldsForLowering(baseType, parts.slice(index), resolver);
    if (!followed) return null;
    return { basePath: prefix, fields: followed.trace, type: followed.type };
  }
  return null;
}

function inferLoweredType(expr, facetTypes, resolver, locals = new Map()) {
  if (!expr) return 'Unknown';
  if (expr.kind === 'LiteralExpr') return expr.valueType;
  if (expr.kind === 'PathExpr') {
    if (locals.has(expr.path)) return locals.get(expr.path);
    if (facetTypes?.has(expr.path)) return facetTypes.get(expr.path);
    return resolveProjectionPathForLowering(expr.path, facetTypes, resolver, locals)?.type ?? 'Unknown';
  }
  if (expr.kind === 'FieldAccessExpr') return expr.canonicalType ?? 'Unknown';
  if (expr.kind === 'RecordConstructExpr' || expr.kind === 'UnionConstructExpr') return expr.canonicalType ?? expr.declaredType ?? 'Unknown';
  return 'Unknown';
}

function pathProjectionToExpression(expr, facetTypes, resolver, locals = new Map()) {
  if (expr.kind !== 'PathExpr') return expr;
  if (locals.has(expr.path) || facetTypes?.has(expr.path)) return expr;
  const projection = resolveProjectionPathForLowering(expr.path, facetTypes, resolver, locals);
  if (!projection) return expr;
  let current = { kind: 'PathExpr', path: projection.basePath };
  for (const field of projection.fields) {
    current = {
      kind: 'FieldAccessExpr',
      object: current,
      field: field.name,
      canonicalType: field.canonicalType,
      ownerType: field.ownerType,
      basePath: projection.basePath,
    };
  }
  return current;
}

function lowerTypedConstructorExpression(expr, expectedType, resolver, facetTypes = new Map(), locals = new Map()) {
  if (!expr || !resolver) return expr;
  if (expr.kind === 'PathExpr') return pathProjectionToExpression(expr, facetTypes, resolver, locals);
  const expected = expectedType ? resolver(expectedType) : null;
  if (expr.kind === 'RecordLiteralExpr' && expected?.ok && expected.declaration?.kind === 'Record') {
    const fieldsByName = new Map((expected.declaration.fields ?? []).map(field => [field.name, field]));
    const fields = (expr.fields ?? []).map(field => {
      const declared = fieldsByName.get(field.name);
      const fieldExpected = declared ? substituteTypeParams(declared.canonicalType, expected.typeParamMap ?? {}) : null;
      return {
        name: field.name,
        value: lowerTypedConstructorExpression(field.expression, fieldExpected, resolver, facetTypes, locals),
        canonicalType: fieldExpected,
        location: field.location ?? null,
      };
    });
    return {
      kind: 'RecordConstructExpr',
      sourceKind: 'RecordLiteralExpr',
      declaredType: expectedType,
      canonicalType: expected.canonical,
      typeName: expected.declaration.qualifiedName,
      fields,
      location: expr.location ?? null,
    };
  }
  if (expr.kind === 'CallExpr' && expected?.ok && expected.declaration?.kind === 'Union') {
    const variant = (expected.declaration.variants ?? []).find(item => item.name === expr.name);
    if (variant) {
      return {
        kind: 'UnionConstructExpr',
        sourceKind: 'CallExpr',
        declaredType: expectedType,
        canonicalType: expected.canonical,
        typeName: expected.declaration.qualifiedName,
        variant: variant.name,
        payload: expr.args.map((arg, index) => {
          const payloadType = variant.payload[index] ? substituteTypeParams(variant.payload[index].canonicalType, expected.typeParamMap ?? {}) : null;
          return {
            index,
            value: lowerTypedConstructorExpression(arg, payloadType, resolver, facetTypes, locals),
            canonicalType: payloadType,
          };
        }),
      };
    }
  }
  if (expr.kind === 'CallExpr') return { ...expr, args: expr.args.map(arg => lowerTypedConstructorExpression(arg, null, resolver, facetTypes, locals)) };
  if (expr.kind === 'UnaryExpr') return { ...expr, expression: lowerTypedConstructorExpression(expr.expression, null, resolver, facetTypes, locals) };
  if (expr.kind === 'BinaryExpr') return { ...expr, left: lowerTypedConstructorExpression(expr.left, null, resolver, facetTypes, locals), right: lowerTypedConstructorExpression(expr.right, null, resolver, facetTypes, locals) };
  if (expr.kind === 'RecordLiteralExpr') return { ...expr, fields: expr.fields.map(field => ({ ...field, expression: lowerTypedConstructorExpression(field.expression, null, resolver, facetTypes, locals) })) };
  if (expr.kind === 'FieldAccessExpr') return { ...expr, object: lowerTypedConstructorExpression(expr.object, null, resolver, facetTypes, locals) };
  if (expr.kind === 'MatchUnionExpr') {
    const loweredTarget = lowerTypedConstructorExpression(expr.target, null, resolver, facetTypes, locals);
    const targetType = inferLoweredType(loweredTarget, facetTypes, resolver, locals);
    const resolved = resolver(targetType);
    const variants = new Map((resolved?.declaration?.variants ?? []).map(item => [item.name, item]));
    const loweredCases = expr.cases.map(item => {
      const branchLocals = new Map(locals);
      if (!item.wildcard) {
        const variant = variants.get(item.variant);
        item.bindings.forEach((name, index) => {
          const payload = variant?.payload?.[index];
          if (payload) branchLocals.set(name, substituteTypeParams(payload.canonicalType, resolved.typeParamMap ?? {}));
        });
      }
      return { ...item, expression: lowerTypedConstructorExpression(item.expression, null, resolver, facetTypes, branchLocals) };
    });
    return { ...expr, target: loweredTarget, canonicalType: resolved?.ok ? resolved.canonical : targetType, cases: loweredCases };
  }
  return expr;
}

function lower(program, symbols, extras = {}) {
  const facets = [];
  const warrants = [];
  const reckons = [];
  const hosts = [];
  const rules = [];
  const directives = [];
  const metaDomains = [];
  const physicals = [];
  const perceptions = [];
  const neurals = [];
  const livings = [];
  const genetics = [];
  const quantitatives = [];
  const knowledges = [];
  const naturalLanguages = [];
  const understandings = [];
  const creations = [];
  const spacetimes = [];
  const accelerations = [];
  const compressions = [];
  const energies = [];
  const elements = [];
  const sciences = [];
  const embodiments = [];
  const spirits = [];
  const dialects = [];
  const effectDeclarations = [];
  const capabilityPolicies = [];
  const stores = [];
  const absorptionDirectives = [];
  const { constructorResolver = null, ...irExtras } = extras;

  const pushFacet = facet => facets.push(constructorResolver ? {
    ...facet,
    value: lowerTypedConstructorExpression(facet.value, facet.valueType, constructorResolver, symbols.facets),
  } : facet);

  for (const node of program.body) {
    if (node.kind === 'FacetDecl') pushFacet(node);
    else if (node.kind === 'SubjectDecl') {
      node.facets.forEach(pushFacet);
      warrants.push(...node.warrants);
    } else if (node.kind === 'ReckonDecl') reckons.push(node);
    else if (node.kind === 'HostDecl') hosts.push(node);
    else if (node.kind === 'MetaDecl') {
      node.facets.forEach(pushFacet);
      metaDomains.push(node);
    } else if (node.kind === 'PhysicalDecl') {
      node.facets.forEach(pushFacet);
      node.bodies.forEach(body => body.facets.forEach(pushFacet));
      node.fields.forEach(field => field.facets.forEach(pushFacet));
      physicals.push(node);
    } else if (node.kind === 'PerceptionDecl') {
      node.channels.forEach(channel => pushFacet({
        kind: 'FacetDecl', path: channel.path, valueType: channel.valueType,
        value: channel.expression, owner: node.name, derivedBy: 'perception',
      }));
      perceptions.push(node);
    } else if (node.kind === 'NeuralDecl') {
      node.facets.forEach(pushFacet);
      neurals.push(node);
    } else if (node.kind === 'LivingDecl') {
      node.facets.forEach(pushFacet);
      node.senses.forEach(sense => pushFacet({
        kind: 'FacetDecl', path: sense.path, valueType: sense.valueType,
        value: { kind: 'PathExpr', path: sense.source }, owner: node.name,
        derivedBy: 'sense',
      }));
      livings.push(node);
    } else if (node.kind === 'GeneticDecl') {
      node.facets.forEach(pushFacet);
      node.genes.forEach(gene => pushFacet({ ...gene, owner: node.name, genetic: true }));
      genetics.push(node);
    } else if (node.kind === 'QuantitativeDecl') {
      node.measures.forEach(measure => pushFacet({
        kind: 'FacetDecl', path: measure.path,
        valueType: `Measure<${measure.baseType}>`,
        value: measure.value, owner: node.name, measure,
      }));
      node.derives.forEach(derive => pushFacet({
        kind: 'FacetDecl', path: derive.path, valueType: derive.valueType,
        value: derive.expression, owner: node.name, derivedBy: 'quantitative',
      }));
      quantitatives.push(node);
    } else if (node.kind === 'KnowledgeDecl') {
      node.claims.forEach(claim => pushFacet({
        kind: 'FacetDecl', path: claim.path, valueType: `Know<${claim.baseType}>`,
        value: null, owner: node.name, knowledge: claim, deferred: true,
      }));
      node.derives.forEach(derive => pushFacet({
        kind: 'FacetDecl', path: derive.path, valueType: `Know<${derive.baseType}>`,
        value: null, owner: node.name, knowledge: derive, deferred: true,
      }));
      knowledges.push(node);
    } else if (node.kind === 'NaturalLanguageDecl') {
      node.utterances.forEach(utterance => pushFacet({
        kind: 'FacetDecl', path: utterance.path, valueType: 'Utterance',
        value: null, owner: node.name, naturalLanguage: utterance, deferred: true,
      }));
      node.intents.forEach(intent => pushFacet({
        kind: 'FacetDecl', path: intent.path, valueType: 'Intent',
        value: null, owner: node.name, naturalLanguage: intent, deferred: true,
      }));
      naturalLanguages.push(node);
    } else if (node.kind === 'UnderstandingDecl') {
      node.hypotheses.forEach(item => pushFacet({
        kind: 'FacetDecl', path: item.path, valueType: `Understand<${item.baseType}>`,
        value: null, owner: node.name, understanding: item, deferred: true,
      }));
      understandings.push(node);
    } else if (node.kind === 'CreationDecl') {
      node.candidates.forEach(candidate => pushFacet({
        kind: 'FacetDecl', path: candidate.path, valueType: `Create<${candidate.baseType}>`,
        value: null, owner: node.name, creation: candidate, deferred: true,
      }));
      if (node.selection) {
        const selected = node.candidates.find(candidate => node.selection.candidates.includes(candidate.path));
        pushFacet({
          kind: 'FacetDecl', path: node.selection.path,
          valueType: selected ? `Create<${selected.baseType}>` : 'Unknown',
          value: null, owner: node.name, selection: node.selection, deferred: true,
        });
      }
      creations.push(node);
    } else if (node.kind === 'EnergyDecl') {
      node.reservoirs.forEach(item => pushFacet({ kind: 'FacetDecl', path: item.path, valueType: item.valueType, value: item.value, owner: node.name, energyReservoir: item }));
      energies.push(node);
    } else if (node.kind === 'ElementDecl') {
      [...node.species, ...node.compounds].forEach(item => pushFacet({ kind: 'FacetDecl', path: item.path, valueType: 'Element', value: null, owner: node.name, elementEntity: item, deferred: true }));
      elements.push(node);
    } else if (node.kind === 'ScienceDecl') {
      node.hypotheses.forEach(item => pushFacet({ kind: 'FacetDecl', path: item.path, valueType: `Science<${item.baseType}>`, value: null, owner: node.name, science: item, deferred: true }));
      node.experiments.forEach(item => pushFacet({ kind: 'FacetDecl', path: item.path, valueType: 'Experiment', value: null, owner: node.name, experiment: item, deferred: true }));
      node.conclusions.forEach(item => pushFacet({ kind: 'FacetDecl', path: item.path, valueType: 'Science<Truth>', value: null, owner: node.name, scienceConclusion: item, deferred: true }));
      sciences.push(node);
    } else if (node.kind === 'EmbodimentDecl') {
      node.facets.forEach(pushFacet);
      node.systems.forEach(part => part.facets.forEach(pushFacet));
      node.organs.forEach(part => part.facets.forEach(pushFacet));
      pushFacet({ kind: 'FacetDecl', path: `${node.name}.state`, valueType: 'BodyState', value: null, owner: node.name, deferred: true });
      embodiments.push(node);
    } else if (node.kind === 'SpiritDecl') {
      node.facets.forEach(pushFacet);
      [...node.values, ...node.purposes, ...node.affects].forEach(item => pushFacet({ kind: 'FacetDecl', path: item.path, valueType: item.valueType, value: item.expression, owner: node.name, spiritAspect: item }));
      pushFacet({ kind: 'FacetDecl', path: `${node.name}.state`, valueType: 'SpiritState', value: null, owner: node.name, deferred: true });
      spirits.push(node);
    } else if (node.kind === 'SpacetimeDecl') {
      node.clocks.forEach(clock => pushFacet({
        kind: 'FacetDecl', path: clock.path, valueType: clock.valueType,
        value: clock.value, owner: node.name, spacetimeClock: clock,
      }));
      node.coordinates.forEach(coordinate => pushFacet({
        kind: 'FacetDecl', path: coordinate.path, valueType: 'SpacetimePoint',
        value: coordinate.expression, owner: node.name, spacetimeCoordinate: coordinate,
      }));
      spacetimes.push(node);
    } else if (node.kind === 'AccelerationDecl') accelerations.push(node);
    else if (node.kind === 'CompressionDecl') compressions.push(node);
    else if (node.kind === 'DialectDecl') dialects.push(node);
    else if (node.kind === 'EffectDecl') effectDeclarations.push(node);
    else if (node.kind === 'CapabilityPolicyDecl') capabilityPolicies.push(node);
    else if (node.kind === 'StoreDecl') stores.push(node);
    else if (node.kind === 'Emergence' || node.kind === 'Resonance') rules.push(node);
    else if (['VerifyCapabilities', 'SnapshotStore'].includes(node.kind)) absorptionDirectives.push(node);
    else if (['Foresee', 'Realize', 'Reflect', 'Advance', 'Observe', 'Propagate', 'Live', 'Inherit', 'Quantify', 'Learn', 'Interpret', 'Understand', 'Create', 'Synchronize', 'Accelerate', 'Compress', 'Restore', 'Energize', 'Constitute', 'Investigate', 'Embody', 'Integrate'].includes(node.kind)) directives.push(node);
  }

  const ir = {
    format: 'rcl.reality-program.v0.10',
    languageVersion: RCL_LANGUAGE_VERSION,
    foundation: {
      format: 'rcl.reality-foundation.v0.6',
      domains: REALITY_DOMAINS,
      crossDomainAxes: CROSS_DOMAIN_AXES,
      compositePlanes: COMPOSITE_REALITY_PLANES,
      metaRealityPlanes: META_REALITY_PLANES,
    },
    name: program.name,
    facets,
    facetTypes: Object.fromEntries(symbols.facets.entries()),
    subjects: [...symbols.subjects.keys()],
    warrants,
    reckons,
    hosts,
    metaDomains,
    physicals,
    perceptions,
    neurals,
    livings,
    genetics,
    quantitatives,
    knowledges,
    naturalLanguages,
    understandings,
    creations,
    spacetimes,
    accelerations,
    compressions,
    energies,
    elements,
    sciences,
    embodiments,
    spirits,
    rules,
    directives,
    dialects,
    effectDeclarations,
    capabilityPolicies,
    stores,
    absorptionDirectives,
    ...irExtras,
  };
  const rootPayload = ir.nativeUis
    ? { ...ir, nativeUis: ir.nativeUis.map((ui) => ({ id: ui.id, semanticRoot: ui.semanticRoot })) }
    : ir;
  return Object.freeze({ ...ir, programRoot: realityRoot(rootPayload) });
}

export function tryCompileReality(source, options = {}) {
  try {
    const ast = parseReality(source);
    const nativeUis = compileNativeUiDeclarations(ast);
    // Preserve the governed v0.10 IR byte shape for every pre-UI program.
    // An empty feature collection is not semantically neutral once it enters
    // canonical JSON/programRoot and would invalidate self-host fixed points.
    const nativeUiExtras = nativeUis.length > 0 ? { nativeUis } : {};
    const typeModuleReport = compileTypeModulesFromOptions(options);
    const externalTypeResolver = createExternalTypeResolver(typeModuleReport);
    const typeDiagnostics = typeModuleReport?.ok === false ? typeModuleReport.diagnostics : [];
    if (typeDiagnostics.length > 0) return { ok: false, diagnostics: typeDiagnostics, ast, program: null, typeModuleReport };
    const checked = checkReality(ast, { externalTypeResolver });
    if (checked.diagnostics.length > 0) return { ok: false, diagnostics: checked.diagnostics, ast, program: null, typeModuleReport };
    const sourceMap = buildSourceMap(ast);
    const draft = lower(ast, checked.symbols, {
      ...nativeUiExtras,
      constructorResolver: externalTypeResolver,
      typeModules: typeModuleReport ? { format: typeModuleReport.ir.format, version: typeModuleReport.ir.version, irRoot: typeModuleReport.irRoot, modules: typeModuleReport.ir.modules } : null,
    });
    const typeBindings = buildTypeBindings(draft.facets, externalTypeResolver);
    const semanticMap = buildSemanticMap(draft, typeBindings, sourceMap);
    const program = lower(ast, checked.symbols, {
      ...nativeUiExtras,
      constructorResolver: externalTypeResolver,
      typeModules: typeModuleReport ? { format: typeModuleReport.ir.format, version: typeModuleReport.ir.version, irRoot: typeModuleReport.irRoot, modules: typeModuleReport.ir.modules } : null,
      typeBindings,
      sourceMap,
      semanticMap,
    });
    return { ok: true, diagnostics: [], ast, program, typeModuleReport, semanticMap, sourceMap, typeBindings };
  } catch (error) {
    const diagnostic = {
      code: error.code ?? 'RCL_PARSE_FAILURE',
      message: error.message,
      details: error.details ?? {},
    };
    return { ok: false, diagnostics: [diagnostic], ast: null, program: null };
  }
}

export function compileReality(source, options = {}) {
  const result = tryCompileReality(source, options);
  if (!result.ok) throw new RCLCompileError(result.diagnostics);
  return result.program;
}

export function compileRealityWithTypeModules(source, options = {}) {
  return compileReality(source, options);
}

export function tryCompileRealityWithTypeModules(source, options = {}) {
  return tryCompileReality(source, options);
}

export function runTypeLinkedCompilerDemo() {
  const typeModuleSources = {
    'core.rcltype': `module core
export record User<T> {
  id: Text
  payload: T
}
export alias MaybeUser = Option<User<Text>>`,
  };
  const source = `reality TypedLinkedDemo {
  facet app.currentUser : core.User<Text> = "proxy-user"
  facet app.maybeUser : MaybeUser = "proxy-maybe"
}`;
  const result = tryCompileReality(source, { typeModuleSources });
  if (!result.ok) return { stage: 'type-linked-compiler-v0.31', ok: false, diagnostics: result.diagnostics };
  return {
    stage: 'type-linked-compiler-v0.31',
    ok: true,
    programRoot: result.program.programRoot,
    typeModuleRoot: result.typeModuleReport.irRoot,
    typedFacetCount: result.semanticMap.typedFacetCount,
    constructorCount: result.semanticMap.constructorCount,
    currentUserCanonicalType: result.semanticMap.facets['app.currentUser'].canonicalType,
    maybeUserCanonicalType: result.semanticMap.facets['app.maybeUser'].canonicalType,
    sourceLocation: result.semanticMap.facets['app.currentUser'].location,
    boundary: 'P3 vertical slice: .rcl compiler pipeline linked to .rcltype semantic IR with source map, semantic map and typed constructor metadata.',
  };
}

export function runTypeConstructorDemo() {
  const typeModuleSources = {
    'core.rcltype': `module core
export record User<T> {
  id: Text
  payload: T
}
export union LoginResult<T,E> {
  Ok(T)
  Err(E)
}`,
  };
  const source = `reality TypedConstructorDemo {
  facet app.user : core.User<Text> = { id: "u-1", payload: "seed" }
  facet app.login : core.LoginResult<Text, Text> = Ok("accepted")
}`;
  const result = tryCompileReality(source, { typeModuleSources });
  if (!result.ok) return { stage: 'type-constructor-lowering-v0.31', ok: false, diagnostics: result.diagnostics };
  return {
    stage: 'type-constructor-lowering-v0.31',
    ok: true,
    programRoot: result.program.programRoot,
    typeModuleRoot: result.typeModuleReport.irRoot,
    constructorCount: result.semanticMap.constructorCount,
    userConstructor: result.semanticMap.facets['app.user'].constructor,
    loginConstructor: result.semanticMap.facets['app.login'].constructor,
    loweredUserKind: result.program.facets.find(item => item.path === 'app.user').value.kind,
    loweredLoginKind: result.program.facets.find(item => item.path === 'app.login').value.kind,
    boundary: 'P3 constructor slice: record literals and union variant calls lower into typed constructor IR. RBC object layout remains staged.',
  };
}
