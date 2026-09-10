import { createHash } from 'node:crypto';
import { RCL_NATIVE_UI_FORMAT } from './ui-schema.mjs';

export function canonicalUiJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalUiJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalUiJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function nativeUiRoot(value) {
  return createHash('sha256').update(canonicalUiJson(value)).digest('hex');
}

function semanticEvent(event) {
  const { source: _source, ...semantic } = event;
  return semantic;
}

function semanticNode(node) {
  return {
    id: node.id,
    identityPath: node.identityPath,
    role: node.role,
    classes: node.classes,
    localProperties: node.localProperties,
    bindings: node.bindings,
    events: node.events.map(semanticEvent),
    layout: node.layout,
    adaptiveLayouts: node.adaptiveLayouts,
    accessibility: node.accessibility,
    resolvedStyle: node.resolvedStyle,
    children: node.children.map(semanticNode),
  };
}

function semanticStyleSheet(styleSheet) {
  return [
    styleSheet.activeTheme,
    styleSheet.themes.map((theme) => [
      theme.id,
      theme.declarations.map((declaration) => [declaration.property, declaration.value, declaration.inherited]),
    ]),
    styleSheet.rules.map((rule) => [
      rule.id,
      [rule.selector.kind, rule.selector.value],
      rule.priority,
      rule.specificity,
      rule.order,
      rule.declarations.map((declaration) => [declaration.property, declaration.value, declaration.inherited]),
    ]),
  ];
}

export function nativeUiSemanticProjection(program) {
  return {
    format: program.format,
    version: program.version,
    kind: program.kind,
    id: program.id,
    reality: program.reality,
    state: program.state.map(({ source: _source, ...item }) => item),
    derivedState: program.derivedState.map(({ source: _source, ...item }) => item),
    viewTree: semanticNode(program.viewTree),
    styleSheet: program.styleSheet,
    lifecycle: program.lifecycle,
    extensionPoints: program.extensionPoints,
  };
}

export function nativeUiSemanticGenome(program) {
  const projected = nativeUiSemanticProjection(program);
  const nodeGenome = (node) => [
    node.id,
    node.role,
    node.classes,
    node.localProperties.map((property) => [property.property, property.value, property.valueType]),
    node.bindings.map((binding) => [binding.id, binding.property, binding.expression]),
    node.events.map((event) => [event.id, event.type, event.parameters, event.authority, event.statements]),
    [
      node.layout.mode,
      [node.layout.width.mode, node.layout.width.value ?? null],
      [node.layout.height.mode, node.layout.height.value ?? null],
      node.layout.gap,
      node.layout.padding,
      node.layout.alignment,
      node.layout.distribution,
      node.layout.overflow,
      node.layout.columns,
    ],
    node.adaptiveLayouts.map((item) => [item.profile, item.mode]),
    [node.resolvedStyle.values, node.resolvedStyle.provenance],
    node.children.map(nodeGenome),
  ];
  return [
    'rcl.native-ui.semantic-genome.v0.1',
    projected.format,
    projected.version,
    projected.kind,
    projected.id,
    projected.reality,
    projected.state.map((item) => [item.kind, item.id, item.valueType, item.initial, item.mutable]),
    projected.derivedState.map((item) => [item.kind, item.id, item.valueType, item.expression]),
    nodeGenome(projected.viewTree),
    semanticStyleSheet(projected.styleSheet),
    [projected.lifecycle.stages, projected.lifecycle.restore],
    [projected.extensionPoints.navigation, projected.extensionPoints.resources, projected.extensionPoints.deviceAdaptation],
  ];
}

export function sealNativeUiProgram(program) {
  const draft = structuredClone(program);
  delete draft.semanticRoot;
  return Object.freeze({ ...draft, semanticRoot: nativeUiRoot(nativeUiSemanticGenome(draft)) });
}

export function serializeNativeUiProgram(program, spacing = 2) {
  if (program?.format !== RCL_NATIVE_UI_FORMAT) throw new Error('RCL_UI_SERIALIZE_FORMAT');
  return `${JSON.stringify(program, null, spacing)}\n`;
}

export function deserializeNativeUiProgram(source, validate) {
  const value = JSON.parse(source);
  if (value?.format !== RCL_NATIVE_UI_FORMAT) throw new Error('RCL_UI_DESERIALIZE_FORMAT');
  if (typeof validate === 'function') validate(value);
  const expected = value.semanticRoot;
  const draft = structuredClone(value);
  delete draft.semanticRoot;
  if (nativeUiRoot(nativeUiSemanticGenome(draft)) !== expected) throw new Error('RCL_UI_SEMANTIC_ROOT_MISMATCH');
  return Object.freeze(value);
}
