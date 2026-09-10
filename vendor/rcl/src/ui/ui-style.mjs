import { UI_INHERITED_PROPERTIES, UI_PROPERTY_TYPES, UI_ROLES, UI_SELECTOR_KINDS, UI_STYLE_PROPERTIES } from './ui-schema.mjs';

const SPECIFICITY = Object.freeze({ role: 1, class: 10, node: 100 });

function literalValue(expr, label) {
  if (!expr || expr.kind !== 'LiteralExpr') throw new Error(`RCL_UI_STYLE_LITERAL_REQUIRED:${label}`);
  return expr.value;
}

function assertStyleProperty(name, label) {
  if (!UI_STYLE_PROPERTIES.includes(name)) throw new Error(`RCL_UI_STYLE_PROPERTY:${label}:${name}`);
}

function assertStyleType(item, label) {
  if (item.expression?.valueType !== UI_PROPERTY_TYPES[item.name]) throw new Error(`RCL_UI_STYLE_PROPERTY_TYPE:${label}:${item.name}:${item.expression?.valueType}`);
}

export function compileUiStyleSheet(uiDecl) {
  const themes = (uiDecl.themes ?? []).map((theme) => ({
    id: theme.name,
    declarations: theme.declarations.map((item) => {
      assertStyleProperty(item.name, `theme:${theme.name}`);
      assertStyleType(item, `theme:${theme.name}`);
      return {
        property: item.name,
        value: literalValue(item.expression, `${theme.name}.${item.name}`),
        inherited: Boolean(item.inherited || UI_INHERITED_PROPERTIES.includes(item.name)),
      };
    }),
  }));
  const rules = (uiDecl.styles ?? []).map((rule, order) => {
    if (!rule.selector || !UI_SELECTOR_KINDS.includes(rule.selector.kind)) throw new Error(`RCL_UI_STYLE_SELECTOR:${rule.name}`);
    if (rule.selector.kind === 'role' && !UI_ROLES.includes(rule.selector.value)) throw new Error(`RCL_UI_STYLE_ROLE:${rule.selector.value}`);
    return {
      id: rule.name,
      selector: structuredClone(rule.selector),
      priority: rule.priority ?? 0,
      specificity: SPECIFICITY[rule.selector.kind],
      order,
      declarations: rule.declarations.map((item) => {
        assertStyleProperty(item.name, `rule:${rule.name}`);
        assertStyleType(item, `rule:${rule.name}`);
        return {
          property: item.name,
          value: literalValue(item.expression, `${rule.name}.${item.name}`),
          inherited: Boolean(item.inherited || UI_INHERITED_PROPERTIES.includes(item.name)),
        };
      }),
    };
  });
  return { format: 'rcl.native-ui.style-sheet.v0.1', activeTheme: themes[0]?.id ?? null, themes, rules };
}

function selectorMatches(selector, node) {
  if (selector.kind === 'node') return selector.value === node.id;
  if (selector.kind === 'role') return selector.value === node.role;
  return node.classes.includes(selector.value);
}

export function resolveUiStyles(viewTree, styleSheet) {
  const inheritedNames = new Set(UI_INHERITED_PROPERTIES);
  for (const theme of styleSheet.themes) for (const item of theme.declarations) if (item.inherited) inheritedNames.add(item.property);
  for (const rule of styleSheet.rules) for (const item of rule.declarations) if (item.inherited) inheritedNames.add(item.property);
  const theme = styleSheet.themes.find((item) => item.id === styleSheet.activeTheme);

  const resolveNode = (node, parentStyle = {}) => {
    const values = {};
    const provenance = {};
    for (const name of inheritedNames) {
      if (Object.prototype.hasOwnProperty.call(parentStyle, name)) {
        values[name] = parentStyle[name];
        provenance[name] = 'inherited';
      }
    }
    for (const item of theme?.declarations ?? []) {
      values[item.property] = item.value;
      provenance[item.property] = `theme:${theme.id}`;
    }
    const matching = styleSheet.rules.filter((rule) => selectorMatches(rule.selector, node))
      .sort((a, b) => a.priority - b.priority || a.specificity - b.specificity || a.order - b.order);
    for (const rule of matching) for (const item of rule.declarations) {
      values[item.property] = item.value;
      provenance[item.property] = `rule:${rule.id}`;
    }
    for (const item of node.localProperties.filter((property) => UI_STYLE_PROPERTIES.includes(property.property))) {
      values[item.property] = item.value;
      provenance[item.property] = `node:${node.id}`;
    }
    const children = node.children.map((child) => resolveNode(child, values));
    return { ...node, resolvedStyle: { values, provenance }, children };
  };
  return resolveNode(viewTree);
}
