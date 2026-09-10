import { parseReality } from '../parser.mjs';
import { sealNativeUiProgram } from './ui-ir.mjs';
import { normalizeUILayout } from './ui-layout.mjs';
import { normalizeUiLifecycle } from './ui-lifecycle.mjs';
import { lowerUiExpression, uiExpressionReferences } from './ui-reactive.mjs';
import {
  RCL_NATIVE_UI_FORMAT,
  RCL_NATIVE_UI_DEVICE_ADAPTATION_FORMAT,
  RCL_NATIVE_UI_NAVIGATION_FORMAT,
  RCL_NATIVE_UI_VERSION,
  UI_BINDABLE_PROPERTIES_BY_ROLE,
  UI_CONTENT_PROPERTIES_BY_ROLE,
  UI_EVENT_PARAMETER_TYPES,
  UI_EVENT_TYPES,
  UI_PROPERTY_TYPES,
  UI_ROLES,
  UI_STYLE_PROPERTIES,
} from './ui-schema.mjs';
import { compileUiStyleSheet, resolveUiStyles } from './ui-style.mjs';
import { validateCanonicalNativeUi } from './ui-validator.mjs';

function literalValue(expr, label) {
  if (!expr || expr.kind !== 'LiteralExpr') throw new Error(`RCL_UI_LITERAL_REQUIRED:${label}`);
  return expr.value;
}

function valueType(value) {
  if (typeof value === 'number') return 'Number';
  if (typeof value === 'string') return 'Text';
  if (typeof value === 'boolean') return 'Truth';
  return 'Unknown';
}

function assertUnique(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (ids.has(item.name)) throw new Error(`RCL_UI_${label}_DUPLICATE:${item.name}`);
    ids.add(item.name);
  }
  return ids;
}

function verifyDerivedAcyclic(derived) {
  const graph = new Map(derived.map((item) => [
    item.id,
    uiExpressionReferences(item.expression).filter((ref) => ref.scope === 'derived').map((ref) => ref.id),
  ]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`RCL_UI_DERIVED_CYCLE:${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of graph.get(id) ?? []) visit(next);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of graph.keys()) visit(id);
}

function compileNode(node, context, path = []) {
  if (!node.id) throw new Error('RCL_UI_NODE_ID_REQUIRED');
  if (context.nodeIds.has(node.id)) throw new Error(`RCL_UI_NODE_ID_DUPLICATE:${node.id}`);
  if (!UI_ROLES.includes(node.role)) throw new Error(`RCL_UI_NODE_ROLE:${node.role}`);
  context.nodeIds.add(node.id);
  for (const className of node.classes) context.classes.add(className);

  const localProperties = node.properties.map((item) => ({
    property: item.name,
    value: literalValue(item.expression, `${node.id}.${item.name}`),
    valueType: item.expression.valueType,
  }));
  const allowedLocalProperties = new Set([...UI_STYLE_PROPERTIES, ...UI_CONTENT_PROPERTIES_BY_ROLE[node.role]]);
  for (const item of localProperties) {
    if (!allowedLocalProperties.has(item.property)) throw new Error(`RCL_UI_NODE_PROPERTY:${node.id}:${node.role}:${item.property}`);
    if (UI_PROPERTY_TYPES[item.property] !== item.valueType) throw new Error(`RCL_UI_NODE_PROPERTY_TYPE:${node.id}:${item.property}:${item.valueType}`);
  }
  if (new Set(localProperties.map((item) => item.property)).size !== localProperties.length) {
    throw new Error(`RCL_UI_NODE_PROPERTY_DUPLICATE:${node.id}`);
  }
  const bindings = node.bindings.map((item) => ({
    id: `${node.id}.binding.${item.property}`,
    property: item.property,
    expression: lowerUiExpression(item.expression, context.symbols),
  }));
  if (new Set(bindings.map((item) => item.property)).size !== bindings.length) throw new Error(`RCL_UI_BINDING_DUPLICATE:${node.id}`);
  for (const binding of bindings) {
    if (!UI_BINDABLE_PROPERTIES_BY_ROLE[node.role].includes(binding.property)) {
      throw new Error(`RCL_UI_BINDING_PROPERTY:${node.id}:${node.role}:${binding.property}`);
    }
    if (binding.expression.valueType !== UI_PROPERTY_TYPES[binding.property]) {
      throw new Error(`RCL_UI_BINDING_TYPE:${node.id}:${binding.property}:${binding.expression.valueType}`);
    }
  }

  const events = node.events.map((event, eventIndex) => {
    if (!UI_EVENT_TYPES.includes(event.eventType)) throw new Error(`RCL_UI_EVENT_TYPE:${node.id}:${event.eventType}`);
    const expectedParameters = UI_EVENT_PARAMETER_TYPES[event.eventType] ?? null;
    const parameters = new Map();
    for (const parameter of event.parameters) {
      if (parameters.has(parameter.name)) throw new Error(`RCL_UI_EVENT_PARAMETER_DUPLICATE:${node.id}:${event.eventType}:${parameter.name}`);
      const inferredType = expectedParameters?.[parameter.name] ?? null;
      if (expectedParameters && !Object.hasOwn(expectedParameters, parameter.name)) throw new Error(`RCL_UI_EVENT_PARAMETER_UNKNOWN:${node.id}:${event.eventType}:${parameter.name}`);
      const parameterType = parameter.valueType ?? inferredType;
      if (!parameterType) throw new Error(`RCL_UI_EVENT_PARAMETER_TYPE_REQUIRED:${node.id}:${event.eventType}:${parameter.name}`);
      if (inferredType && parameterType !== inferredType) throw new Error(`RCL_UI_EVENT_PARAMETER_TYPE:${node.id}:${event.eventType}:${parameter.name}:${parameterType}`);
      parameters.set(parameter.name, parameterType);
    }
    let localCount = 0;
    let realityCount = 0;
    let navigateCount = 0;
    const statements = event.statements.map((statement) => {
      if (statement.kind === 'UISetState') {
        localCount += 1;
        if (!context.symbols.states.has(statement.target)) throw new Error(`RCL_UI_EVENT_TARGET_UNKNOWN:${node.id}:${statement.target}`);
        const expression = lowerUiExpression(statement.expression, context.symbols, parameters);
        const expectedType = context.symbols.states.get(statement.target);
        if (expression.valueType !== expectedType) throw new Error(`RCL_UI_EVENT_MUTATION_TYPE:${node.id}:${statement.target}:${expectedType}:${expression.valueType}`);
        return {
          kind: 'set-state',
          target: statement.target,
          expression,
        };
      }
      if (statement.kind === 'UIRealizeReality') {
        realityCount += 1;
        if (!context.realityRules.has(statement.rule)) throw new Error(`RCL_UI_REALITY_RULE_UNKNOWN:${node.id}:${statement.rule}`);
        return { kind: 'realize-reality', rule: statement.rule };
      }
      if (statement.kind === 'UINavigate') {
        localCount += 1;
        navigateCount += 1;
        return { kind: 'navigate', route: statement.route };
      }
      throw new Error(`RCL_UI_EVENT_STATEMENT:${statement.kind}`);
    });
    if (localCount > 0 && realityCount > 0) throw new Error(`RCL_UI_EVENT_MIXED_AUTHORITY:${node.id}:${event.eventType}`);
    if (navigateCount > 1) throw new Error(`RCL_UI_EVENT_MULTIPLE_NAVIGATION:${node.id}:${event.eventType}`);
    return {
      id: `${node.id}.event.${event.eventType}.${eventIndex}`,
      type: event.eventType,
      parameters: [...parameters].map(([id, valueType]) => ({ id, valueType })),
      authority: realityCount > 0 ? 'reality-transaction' : 'ui-local',
      statements,
      source: event.location ?? null,
    };
  });
  if (new Set(events.map((item) => item.type)).size !== events.length) throw new Error(`RCL_UI_EVENT_DUPLICATE:${node.id}`);

  const hasValue = localProperties.some((item) => item.property === 'value') || bindings.some((item) => item.property === 'value');
  const hasLabel = localProperties.some((item) => item.property === 'label') || bindings.some((item) => item.property === 'label');
  if (node.role === 'text' && !hasValue) throw new Error(`RCL_UI_TEXT_VALUE_REQUIRED:${node.id}`);
  if (node.role === 'action' && !hasLabel) throw new Error(`RCL_UI_ACTION_LABEL_REQUIRED:${node.id}`);
  if (node.role === 'action' && !events.some((item) => item.type === 'activate')) throw new Error(`RCL_UI_ACTION_ACTIVATE_REQUIRED:${node.id}`);

  const canonical = {
    kind: 'UIViewNode',
    id: node.id,
    identityPath: [...path, node.id].join('/'),
    role: node.role,
    classes: [...node.classes],
    localProperties,
    bindings,
    events,
    layout: normalizeUILayout(node.layout),
    adaptiveLayouts: node.adaptiveLayouts.map((item) => ({ profile: item.profile, mode: item.mode })),
    accessibility: {
      label: localProperties.find((item) => item.property === 'accessibility_label')?.value ?? null,
    },
    source: node.location ?? null,
    children: node.children.map((child) => compileNode(child, context, [...path, node.id])),
  };
  return canonical;
}

function compileDeviceAdaptation(declaration, viewTree) {
  const overrides = collectUiNodes(viewTree).flatMap((node) => node.adaptiveLayouts.map((item) => ({ nodeId: node.id, ...item })));
  if (!declaration) {
    if (overrides.length > 0) throw new Error(`RCL_UI_DEVICE_ADAPTATION_REQUIRED:${overrides[0].nodeId}:${overrides[0].profile}`);
    return null;
  }
  if (declaration.defaultProfile === null) throw new Error('RCL_UI_DEVICE_ADAPTATION_DEFAULT_REQUIRED');
  if (declaration.profiles.length === 0) throw new Error('RCL_UI_DEVICE_ADAPTATION_PROFILE_REQUIRED');
  const ids = new Set();
  const profiles = declaration.profiles.map((profile) => {
    if (ids.has(profile.id)) throw new Error(`RCL_UI_DEVICE_ADAPTATION_PROFILE_DUPLICATE:${profile.id}`);
    const minWidth = profile.minWidth ?? 0;
    const maxWidth = profile.maxWidth ?? null;
    if (!Number.isInteger(minWidth) || minWidth < 0) throw new Error(`RCL_UI_DEVICE_ADAPTATION_MIN_WIDTH:${profile.id}`);
    if (maxWidth !== null && (!Number.isInteger(maxWidth) || maxWidth < minWidth)) throw new Error(`RCL_UI_DEVICE_ADAPTATION_MAX_WIDTH:${profile.id}`);
    ids.add(profile.id);
    return { id: profile.id, minWidth, maxWidth };
  });
  if (!ids.has(declaration.defaultProfile)) throw new Error(`RCL_UI_DEVICE_ADAPTATION_DEFAULT_UNKNOWN:${declaration.defaultProfile}`);
  for (let left = 0; left < profiles.length; left += 1) for (let right = left + 1; right < profiles.length; right += 1) {
    const a = profiles[left];
    const b = profiles[right];
    const aMax = a.maxWidth ?? Number.POSITIVE_INFINITY;
    const bMax = b.maxWidth ?? Number.POSITIVE_INFINITY;
    if (a.minWidth <= bMax && b.minWidth <= aMax) throw new Error(`RCL_UI_DEVICE_ADAPTATION_PROFILE_OVERLAP:${a.id}:${b.id}`);
  }
  for (const node of collectUiNodes(viewTree)) {
    const seen = new Set();
    for (const override of node.adaptiveLayouts) {
      if (!ids.has(override.profile)) throw new Error(`RCL_UI_DEVICE_ADAPTATION_PROFILE_UNKNOWN:${node.id}:${override.profile}`);
      if (seen.has(override.profile)) throw new Error(`RCL_UI_DEVICE_ADAPTATION_LAYOUT_DUPLICATE:${node.id}:${override.profile}`);
      if (node.role !== 'container' || !['vertical', 'horizontal'].includes(node.layout.mode) || !['vertical', 'horizontal'].includes(override.mode)) {
        throw new Error(`RCL_UI_DEVICE_ADAPTATION_LAYOUT_MODE:${node.id}:${override.mode}`);
      }
      seen.add(override.profile);
    }
  }
  return Object.freeze({
    format: RCL_NATIVE_UI_DEVICE_ADAPTATION_FORMAT,
    axis: 'available-width',
    unit: 'dp',
    defaultProfile: declaration.defaultProfile,
    profiles,
  });
}

function compileNavigation(declaration, viewTree) {
  const events = collectUiNodes(viewTree).flatMap((node) => node.events.map((event) => ({ nodeId: node.id, ...event })));
  const navigationStatements = events.flatMap((event) => event.statements
    .filter((statement) => statement.kind === 'navigate')
    .map((statement) => ({ nodeId: event.nodeId, eventType: event.type, route: statement.route })));
  if (!declaration) {
    if (navigationStatements.length > 0) throw new Error(`RCL_UI_NAVIGATION_REQUIRED:${navigationStatements[0].nodeId}:${navigationStatements[0].eventType}`);
    return null;
  }
  if (declaration.initial === null) throw new Error('RCL_UI_NAVIGATION_INITIAL_REQUIRED');
  if (declaration.routes.length === 0) throw new Error('RCL_UI_NAVIGATION_ROUTE_REQUIRED');
  const routeIds = new Set();
  const routeTargets = new Set();
  const directTargets = new Set(viewTree.children.map((node) => node.id));
  const routes = declaration.routes.map((route) => {
    if (routeIds.has(route.id)) throw new Error(`RCL_UI_NAVIGATION_ROUTE_DUPLICATE:${route.id}`);
    if (routeTargets.has(route.target)) throw new Error(`RCL_UI_NAVIGATION_TARGET_DUPLICATE:${route.target}`);
    if (!directTargets.has(route.target)) throw new Error(`RCL_UI_NAVIGATION_TARGET_UNKNOWN:${route.id}:${route.target}`);
    routeIds.add(route.id);
    routeTargets.add(route.target);
    return { id: route.id, target: route.target };
  });
  if (!routeIds.has(declaration.initial)) throw new Error(`RCL_UI_NAVIGATION_INITIAL_UNKNOWN:${declaration.initial}`);
  for (const statement of navigationStatements) {
    if (!routeIds.has(statement.route)) throw new Error(`RCL_UI_NAVIGATION_ROUTE_UNKNOWN:${statement.nodeId}:${statement.eventType}:${statement.route}`);
  }
  return Object.freeze({ format: RCL_NATIVE_UI_NAVIGATION_FORMAT, initialRoute: declaration.initial, routes });
}

function compileOne(realityProgram, uiDecl) {
  if (uiDecl.viewTrees.length !== 1) throw new Error(`RCL_UI_VIEW_TREE_COUNT:${uiDecl.name}:${uiDecl.viewTrees.length}`);
  const stateIds = assertUnique(uiDecl.states, 'STATE');
  const derivedIds = assertUnique(uiDecl.derivedStates, 'DERIVED');
  for (const id of derivedIds) if (stateIds.has(id)) throw new Error(`RCL_UI_REACTIVE_ID_DUPLICATE:${id}`);
  const symbols = {
    states: new Map(uiDecl.states.map((item) => [item.name, item.valueType])),
    derived: new Map(uiDecl.derivedStates.map((item) => [item.name, item.valueType])),
  };
  const state = uiDecl.states.map((item) => {
    const initial = literalValue(item.expression, `state.${item.name}`);
    const actualType = valueType(initial);
    if (actualType !== item.valueType) throw new Error(`RCL_UI_STATE_TYPE:${item.name}:${item.valueType}:${actualType}`);
    return { kind: 'UIState', id: item.name, valueType: item.valueType, initial, mutable: true, source: item.location ?? null };
  });
  const derivedState = uiDecl.derivedStates.map((item) => {
    const expression = lowerUiExpression(item.expression, symbols);
    if (expression.valueType !== item.valueType) throw new Error(`RCL_UI_DERIVED_TYPE:${item.name}:${item.valueType}:${expression.valueType}`);
    return { kind: 'UIDerivedState', id: item.name, valueType: item.valueType, expression, source: item.location ?? null };
  });
  verifyDerivedAcyclic(derivedState);
  const realityRules = new Set(realityProgram.body.filter((item) => item.kind === 'Emergence' || item.kind === 'Resonance').map((item) => item.name));
  const context = { symbols, realityRules, nodeIds: new Set(), classes: new Set() };
  let viewTree = compileNode(uiDecl.viewTrees[0], context);
  const styleSheet = compileUiStyleSheet(uiDecl);
  for (const rule of styleSheet.rules) {
    if (rule.selector.kind === 'node' && !context.nodeIds.has(rule.selector.value)) throw new Error(`RCL_UI_STYLE_NODE_UNKNOWN:${rule.selector.value}`);
    if (rule.selector.kind === 'class' && !context.classes.has(rule.selector.value)) throw new Error(`RCL_UI_STYLE_CLASS_UNKNOWN:${rule.selector.value}`);
  }
  viewTree = resolveUiStyles(viewTree, styleSheet);
  const navigation = compileNavigation(uiDecl.navigation, viewTree);
  const deviceAdaptation = compileDeviceAdaptation(uiDecl.deviceAdaptation, viewTree);
  const lifecycle = normalizeUiLifecycle(uiDecl.lifecycle, stateIds);
  const draft = {
    format: RCL_NATIVE_UI_FORMAT,
    version: RCL_NATIVE_UI_VERSION,
    kind: 'UIProgram',
    id: uiDecl.name,
    reality: realityProgram.name,
    identityNamespace: `${realityProgram.name}.${uiDecl.name}`,
    state,
    derivedState,
    viewTree,
    styleSheet,
    lifecycle,
    eventGraph: {
      format: 'rcl.native-ui.event-graph.v0.1',
      events: collectUiNodes(viewTree).flatMap((node) => node.events.map((event) => ({ nodeId: node.id, ...event }))),
    },
    extensionPoints: { navigation, resources: [], deviceAdaptation },
    source: uiDecl.location ?? null,
  };
  const sealed = sealNativeUiProgram(draft);
  validateCanonicalNativeUi(sealed);
  return sealed;
}

export function collectUiNodes(root, result = []) {
  result.push(root);
  for (const child of root.children) collectUiNodes(child, result);
  return result;
}

export function compileNativeUiDeclarations(realityProgram) {
  const declarations = realityProgram.body.filter((item) => item.kind === 'NativeUIDecl');
  assertUnique(declarations, 'PROGRAM');
  return declarations.map((item) => compileOne(realityProgram, item));
}

export function compileNativeUiProgram(source, uiId = null) {
  const ast = parseReality(source);
  const programs = compileNativeUiDeclarations(ast);
  if (programs.length === 0) throw new Error('RCL_UI_PROGRAM_MISSING');
  if (uiId === null) {
    if (programs.length !== 1) throw new Error(`RCL_UI_PROGRAM_AMBIGUOUS:${programs.length}`);
    return programs[0];
  }
  const match = programs.find((item) => item.id === uiId);
  if (!match) throw new Error(`RCL_UI_PROGRAM_UNKNOWN:${uiId}`);
  return match;
}
