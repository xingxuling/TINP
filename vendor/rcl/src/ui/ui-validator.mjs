import {
  RCL_NATIVE_UI_FORMAT,
  RCL_NATIVE_UI_DEVICE_ADAPTATION_FORMAT,
  RCL_NATIVE_UI_NAVIGATION_FORMAT,
  UI_BINDABLE_PROPERTIES_BY_ROLE,
  UI_EVENT_TYPES,
  UI_PROPERTY_TYPES,
  UI_ROLES,
} from './ui-schema.mjs';
import { nativeUiRoot, nativeUiSemanticGenome } from './ui-ir.mjs';

function assert(condition, code) {
  if (!condition) throw new Error(code);
}

export function validateCanonicalNativeUi(program) {
  assert(program && program.format === RCL_NATIVE_UI_FORMAT, 'RCL_UI_SCHEMA_FORMAT');
  assert(typeof program.id === 'string' && program.id.length > 0, 'RCL_UI_SCHEMA_ID');
  assert(Array.isArray(program.state), 'RCL_UI_SCHEMA_STATE');
  assert(program.viewTree && typeof program.viewTree === 'object', 'RCL_UI_SCHEMA_VIEW_TREE');
  assert(program.styleSheet?.format === 'rcl.native-ui.style-sheet.v0.1', 'RCL_UI_SCHEMA_STYLE_FORMAT');
  const stateIds = new Set();
  const stateTypes = new Map();
  for (const state of program.state) {
    assert(typeof state.id === 'string' && state.id.length > 0, 'RCL_UI_SCHEMA_STATE_ID');
    assert(!stateIds.has(state.id), `RCL_UI_STATE_DUPLICATE:${state.id}`);
    stateIds.add(state.id);
    assert(['Number', 'Text', 'Truth'].includes(state.valueType), `RCL_UI_SCHEMA_STATE_TYPE:${state.id}`);
    stateTypes.set(state.id, state.valueType);
  }
  const nodeIds = new Set();
  const navigationStatements = [];
  const adaptiveLayouts = [];
  const walk = (node, identityPath = node.id) => {
    assert(typeof node.id === 'string' && node.id.length > 0, 'RCL_UI_NODE_ID_REQUIRED');
    assert(!nodeIds.has(node.id), `RCL_UI_NODE_ID_DUPLICATE:${node.id}`);
    assert(UI_ROLES.includes(node.role), `RCL_UI_NODE_ROLE:${node.role}`);
    assert(node.identityPath === identityPath, `RCL_UI_NODE_IDENTITY_PATH:${node.id}`);
    assert(Array.isArray(node.localProperties), `RCL_UI_NODE_PROPERTIES:${node.id}`);
    assert(Array.isArray(node.bindings), `RCL_UI_NODE_BINDINGS:${node.id}`);
    assert(Array.isArray(node.events), `RCL_UI_NODE_EVENTS:${node.id}`);
    assert(Array.isArray(node.children), `RCL_UI_NODE_CHILDREN:${node.id}`);
    assert(Array.isArray(node.adaptiveLayouts), `RCL_UI_DEVICE_ADAPTATION_LAYOUTS:${node.id}`);
    nodeIds.add(node.id);
    for (const override of node.adaptiveLayouts) adaptiveLayouts.push({ nodeId: node.id, role: node.role, baseMode: node.layout?.mode, ...override });
    for (const property of node.localProperties) {
      assert(UI_PROPERTY_TYPES[property.property] === property.valueType, `RCL_UI_SCHEMA_PROPERTY_TYPE:${node.id}:${property.property}`);
    }
    const expectedAccessibilityLabel = node.localProperties.find((property) => property.property === 'accessibility_label')?.value ?? null;
    assert(node.accessibility?.label === expectedAccessibilityLabel, `RCL_UI_SCHEMA_ACCESSIBILITY:${node.id}`);
    for (const binding of node.bindings) {
      assert(UI_BINDABLE_PROPERTIES_BY_ROLE[node.role].includes(binding.property), `RCL_UI_SCHEMA_BINDING_PROPERTY:${node.id}:${binding.property}`);
      assert(binding.expression?.valueType === UI_PROPERTY_TYPES[binding.property], `RCL_UI_SCHEMA_BINDING_TYPE:${node.id}:${binding.property}`);
    }
    for (const event of node.events ?? []) {
      assert(UI_EVENT_TYPES.includes(event.type), `RCL_UI_EVENT_TYPE:${event.type}`);
      const parameterIds = new Set();
      for (const parameter of event.parameters ?? []) {
        assert(typeof parameter.id === 'string' && parameter.id.length > 0, `RCL_UI_SCHEMA_EVENT_PARAMETER:${node.id}:${event.type}`);
        assert(!parameterIds.has(parameter.id), `RCL_UI_SCHEMA_EVENT_PARAMETER_DUPLICATE:${node.id}:${event.type}:${parameter.id}`);
        assert(['Number', 'Text', 'Truth'].includes(parameter.valueType), `RCL_UI_SCHEMA_EVENT_PARAMETER_TYPE:${node.id}:${event.type}:${parameter.id}`);
        parameterIds.add(parameter.id);
      }
      let localCount = 0;
      let realityCount = 0;
      let navigateCount = 0;
      for (const statement of event.statements ?? []) {
        if (statement.kind === 'set-state') {
          localCount += 1;
          assert(stateTypes.has(statement.target), `RCL_UI_SCHEMA_EVENT_TARGET:${node.id}:${statement.target}`);
          assert(statement.expression?.valueType === stateTypes.get(statement.target), `RCL_UI_SCHEMA_EVENT_MUTATION_TYPE:${node.id}:${statement.target}`);
        } else if (statement.kind === 'realize-reality') realityCount += 1;
        else if (statement.kind === 'navigate') {
          localCount += 1;
          navigateCount += 1;
          navigationStatements.push({ nodeId: node.id, eventType: event.type, route: statement.route });
        } else assert(false, `RCL_UI_SCHEMA_EVENT_STATEMENT:${node.id}:${event.type}:${statement.kind}`);
      }
      assert(!(localCount > 0 && realityCount > 0), `RCL_UI_EVENT_MIXED_AUTHORITY:${node.id}:${event.type}`);
      assert(navigateCount <= 1, `RCL_UI_EVENT_MULTIPLE_NAVIGATION:${node.id}:${event.type}`);
      assert(event.authority === (realityCount > 0 ? 'reality-transaction' : 'ui-local'), `RCL_UI_SCHEMA_EVENT_AUTHORITY:${node.id}:${event.type}`);
    }
    for (const child of node.children ?? []) walk(child, `${identityPath}/${child.id}`);
  };
  walk(program.viewTree);
  const navigation = program.extensionPoints?.navigation ?? null;
  if (navigation === null) assert(navigationStatements.length === 0, 'RCL_UI_NAVIGATION_REQUIRED');
  else {
    assert(navigation.format === RCL_NATIVE_UI_NAVIGATION_FORMAT, 'RCL_UI_NAVIGATION_FORMAT');
    assert(Array.isArray(navigation.routes) && navigation.routes.length > 0, 'RCL_UI_NAVIGATION_ROUTE_REQUIRED');
    const routeIds = new Set();
    const routeTargets = new Set();
    const directTargets = new Set(program.viewTree.children.map((node) => node.id));
    for (const route of navigation.routes) {
      assert(typeof route.id === 'string' && route.id.length > 0, 'RCL_UI_NAVIGATION_ROUTE_ID');
      assert(!routeIds.has(route.id), `RCL_UI_NAVIGATION_ROUTE_DUPLICATE:${route.id}`);
      assert(!routeTargets.has(route.target), `RCL_UI_NAVIGATION_TARGET_DUPLICATE:${route.target}`);
      assert(directTargets.has(route.target), `RCL_UI_NAVIGATION_TARGET_UNKNOWN:${route.id}:${route.target}`);
      routeIds.add(route.id);
      routeTargets.add(route.target);
    }
    assert(routeIds.has(navigation.initialRoute), `RCL_UI_NAVIGATION_INITIAL_UNKNOWN:${navigation.initialRoute}`);
    for (const statement of navigationStatements) assert(routeIds.has(statement.route), `RCL_UI_NAVIGATION_ROUTE_UNKNOWN:${statement.nodeId}:${statement.eventType}:${statement.route}`);
  }
  const deviceAdaptation = program.extensionPoints?.deviceAdaptation ?? null;
  if (deviceAdaptation === null) assert(adaptiveLayouts.length === 0, 'RCL_UI_DEVICE_ADAPTATION_REQUIRED');
  else {
    assert(deviceAdaptation.format === RCL_NATIVE_UI_DEVICE_ADAPTATION_FORMAT, 'RCL_UI_DEVICE_ADAPTATION_FORMAT');
    assert(deviceAdaptation.axis === 'available-width' && deviceAdaptation.unit === 'dp', 'RCL_UI_DEVICE_ADAPTATION_AXIS');
    assert(Array.isArray(deviceAdaptation.profiles) && deviceAdaptation.profiles.length > 0, 'RCL_UI_DEVICE_ADAPTATION_PROFILE_REQUIRED');
    const profileIds = new Set();
    for (const profile of deviceAdaptation.profiles) {
      assert(typeof profile.id === 'string' && profile.id.length > 0, 'RCL_UI_DEVICE_ADAPTATION_PROFILE_ID');
      assert(!profileIds.has(profile.id), `RCL_UI_DEVICE_ADAPTATION_PROFILE_DUPLICATE:${profile.id}`);
      assert(Number.isInteger(profile.minWidth) && profile.minWidth >= 0, `RCL_UI_DEVICE_ADAPTATION_MIN_WIDTH:${profile.id}`);
      assert(profile.maxWidth === null || (Number.isInteger(profile.maxWidth) && profile.maxWidth >= profile.minWidth), `RCL_UI_DEVICE_ADAPTATION_MAX_WIDTH:${profile.id}`);
      for (const prior of deviceAdaptation.profiles.filter((item) => profileIds.has(item.id))) {
        const priorMax = prior.maxWidth ?? Number.POSITIVE_INFINITY;
        const currentMax = profile.maxWidth ?? Number.POSITIVE_INFINITY;
        assert(!(prior.minWidth <= currentMax && profile.minWidth <= priorMax), `RCL_UI_DEVICE_ADAPTATION_PROFILE_OVERLAP:${prior.id}:${profile.id}`);
      }
      profileIds.add(profile.id);
    }
    assert(profileIds.has(deviceAdaptation.defaultProfile), `RCL_UI_DEVICE_ADAPTATION_DEFAULT_UNKNOWN:${deviceAdaptation.defaultProfile}`);
    const perNode = new Set();
    for (const override of adaptiveLayouts) {
      assert(profileIds.has(override.profile), `RCL_UI_DEVICE_ADAPTATION_PROFILE_UNKNOWN:${override.nodeId}:${override.profile}`);
      const key = `${override.nodeId}:${override.profile}`;
      assert(!perNode.has(key), `RCL_UI_DEVICE_ADAPTATION_LAYOUT_DUPLICATE:${key}`);
      assert(override.role === 'container' && ['vertical', 'horizontal'].includes(override.baseMode) && ['vertical', 'horizontal'].includes(override.mode), `RCL_UI_DEVICE_ADAPTATION_LAYOUT_MODE:${override.nodeId}:${override.mode}`);
      perNode.add(key);
    }
  }
  assert(typeof program.semanticRoot === 'string' && /^[0-9a-f]{64}$/u.test(program.semanticRoot), 'RCL_UI_SCHEMA_ROOT');
  const draft = structuredClone(program);
  delete draft.semanticRoot;
  assert(nativeUiRoot(nativeUiSemanticGenome(draft)) === program.semanticRoot, 'RCL_UI_SEMANTIC_ROOT_MISMATCH');
  return true;
}
