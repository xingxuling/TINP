export function lowerUiExpression(expr, symbols, eventParameters = new Map()) {
  if (!expr) return null;
  if (expr.kind === 'LiteralExpr') return { kind: 'literal', value: expr.value, valueType: expr.valueType };
  if (expr.kind === 'PathExpr') {
    if (symbols.states.has(expr.path)) return { kind: 'reference', scope: 'state', id: expr.path, valueType: symbols.states.get(expr.path) };
    if (symbols.derived.has(expr.path)) return { kind: 'reference', scope: 'derived', id: expr.path, valueType: symbols.derived.get(expr.path) };
    if (eventParameters.has(expr.path)) return { kind: 'reference', scope: 'event', id: expr.path, valueType: eventParameters.get(expr.path) };
    throw new Error(`RCL_UI_REFERENCE_UNKNOWN:${expr.path}`);
  }
  if (expr.kind === 'UnaryExpr') {
    const expression = lowerUiExpression(expr.expression, symbols, eventParameters);
    const expected = expr.operator === 'not' ? 'Truth' : 'Number';
    if (expression.valueType !== expected) throw new Error(`RCL_UI_EXPRESSION_TYPE:unary:${expr.operator}:${expression.valueType}`);
    return { kind: 'unary', operator: expr.operator, expression, valueType: expected };
  }
  if (expr.kind === 'BinaryExpr') {
    const left = lowerUiExpression(expr.left, symbols, eventParameters);
    const right = lowerUiExpression(expr.right, symbols, eventParameters);
    let valueType;
    if (expr.operator === '+') {
      if (left.valueType === 'Text' || right.valueType === 'Text') valueType = 'Text';
      else if (left.valueType === 'Number' && right.valueType === 'Number') valueType = 'Number';
      else throw new Error(`RCL_UI_EXPRESSION_TYPE:binary:${expr.operator}:${left.valueType}:${right.valueType}`);
    } else if (['-', '*', '/', '%'].includes(expr.operator)) {
      if (left.valueType !== 'Number' || right.valueType !== 'Number') throw new Error(`RCL_UI_EXPRESSION_TYPE:binary:${expr.operator}:${left.valueType}:${right.valueType}`);
      valueType = 'Number';
    } else if (['and', 'or'].includes(expr.operator)) {
      if (left.valueType !== 'Truth' || right.valueType !== 'Truth') throw new Error(`RCL_UI_EXPRESSION_TYPE:binary:${expr.operator}:${left.valueType}:${right.valueType}`);
      valueType = 'Truth';
    } else if (['==', '!='].includes(expr.operator)) {
      if (left.valueType !== right.valueType) throw new Error(`RCL_UI_EXPRESSION_TYPE:binary:${expr.operator}:${left.valueType}:${right.valueType}`);
      valueType = 'Truth';
    } else if (['<', '<=', '>', '>='].includes(expr.operator)) {
      if (left.valueType !== right.valueType || !['Number', 'Text'].includes(left.valueType)) throw new Error(`RCL_UI_EXPRESSION_TYPE:binary:${expr.operator}:${left.valueType}:${right.valueType}`);
      valueType = 'Truth';
    } else throw new Error(`RCL_UI_OPERATOR:${expr.operator}`);
    return { kind: 'binary', operator: expr.operator, left, right, valueType };
  }
  if (expr.kind === 'CallExpr' && expr.name === 'choose' && expr.args.length === 3) {
    const args = expr.args.map((arg) => lowerUiExpression(arg, symbols, eventParameters));
    if (args[0].valueType !== 'Truth' || args[1].valueType !== args[2].valueType) {
      throw new Error(`RCL_UI_EXPRESSION_TYPE:choose:${args.map((item) => item.valueType).join(':')}`);
    }
    return { kind: 'choose', args, valueType: args[1].valueType };
  }
  throw new Error(`RCL_UI_EXPRESSION_UNSUPPORTED:${expr.kind}${expr.name ? `:${expr.name}` : ''}`);
}

function truthy(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value.length > 0;
  return true;
}

function binary(operator, left, right) {
  if (operator === 'and') return truthy(left) && truthy(right);
  if (operator === 'or') return truthy(left) || truthy(right);
  if (operator === '+') return typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : left + right;
  if (operator === '-') return left - right;
  if (operator === '*') return left * right;
  if (operator === '/') return left / right;
  if (operator === '%') return left % right;
  if (operator === '==') return left === right;
  if (operator === '!=') return left !== right;
  if (operator === '<') return left < right;
  if (operator === '<=') return left <= right;
  if (operator === '>') return left > right;
  if (operator === '>=') return left >= right;
  throw new Error(`RCL_UI_OPERATOR:${operator}`);
}

export function evaluateUiExpression(expr, context) {
  if (!expr) return null;
  if (expr.kind === 'literal') return expr.value;
  if (expr.kind === 'reference') {
    if (expr.scope === 'state') {
      if (!Object.prototype.hasOwnProperty.call(context.state, expr.id)) throw new Error(`RCL_UI_STATE_MISSING:${expr.id}`);
      return context.state[expr.id];
    }
    if (expr.scope === 'derived') return context.derived(expr.id);
    if (expr.scope === 'event') return context.event?.[expr.id];
  }
  if (expr.kind === 'unary') {
    const value = evaluateUiExpression(expr.expression, context);
    if (expr.operator === 'not') return !truthy(value);
    if (expr.operator === '-') return -value;
    throw new Error(`RCL_UI_UNARY:${expr.operator}`);
  }
  if (expr.kind === 'choose') return truthy(evaluateUiExpression(expr.args[0], context))
    ? evaluateUiExpression(expr.args[1], context)
    : evaluateUiExpression(expr.args[2], context);
  if (expr.kind === 'binary') return binary(
    expr.operator,
    evaluateUiExpression(expr.left, context),
    evaluateUiExpression(expr.right, context),
  );
  throw new Error(`RCL_UI_EVAL_EXPRESSION:${expr.kind}`);
}

export function uiExpressionReferences(expr, result = []) {
  if (!expr) return result;
  if (expr.kind === 'reference') result.push({ scope: expr.scope, id: expr.id });
  if (expr.expression) uiExpressionReferences(expr.expression, result);
  if (expr.left) uiExpressionReferences(expr.left, result);
  if (expr.right) uiExpressionReferences(expr.right, result);
  for (const arg of expr.args ?? []) uiExpressionReferences(arg, result);
  return result;
}
