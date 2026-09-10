/** RCL compiler-construction primitives shared by the reference runtime. */

export function span(offset, line, column, length) {
  for (const [name, value] of Object.entries({ offset, line, column, length })) {
    if (!Number.isInteger(value) || value < 0 || (name !== 'offset' && name !== 'length' && value < 1)) {
      throw new TypeError(`Span ${name} must be a non-negative integer (line/column begin at 1)`);
    }
  }
  return Object.freeze({ kind: 'Span', offset, line, column, length });
}

export function token(tokenType, text, sourceSpan) {
  if (typeof tokenType !== 'string' || typeof text !== 'string' || sourceSpan?.kind !== 'Span') {
    throw new TypeError('token() expects token type Text, lexeme Text and Span');
  }
  return Object.freeze({ kind: 'Token', tokenType, text, span: sourceSpan });
}

export function facetAst(path, valueType, literalKind, literalText, sourceSpan) {
  if (![path, valueType, literalKind, literalText].every(value => typeof value === 'string') || sourceSpan?.kind !== 'Span') {
    throw new TypeError('facet_ast() expects Text fields and Span');
  }
  let value;
  if (literalKind === 'Number') {
    value = Number(literalText);
    if (!Number.isFinite(value)) throw new TypeError(`Invalid Number literal '${literalText}'`);
  } else if (literalKind === 'Truth') {
    if (!['true', 'false'].includes(literalText)) throw new TypeError(`Invalid Truth literal '${literalText}'`);
    value = literalText === 'true';
  } else if (literalKind === 'Text') value = literalText;
  else throw new TypeError(`Unsupported literal kind '${literalKind}'`);
  return Object.freeze({
    kind: 'FacetDecl', path, valueType,
    value: Object.freeze({ kind: 'LiteralExpr', value, valueType: literalKind }),
    span: sourceSpan,
  });
}

export function parseState(index, nodes) {
  if (!Number.isInteger(index) || index < 0 || !Array.isArray(nodes)) throw new TypeError('parse_state() expects index and Sequence');
  return Object.freeze({ kind: 'ParseState', index, nodes: Object.freeze([...nodes]) });
}

export function isSpan(value) { return Boolean(value) && value.kind === 'Span'; }
export function isToken(value) { return Boolean(value) && value.kind === 'Token'; }
export function isAstNode(value) { return Boolean(value) && value.kind === 'FacetDecl'; }
export function isParseState(value) { return Boolean(value) && value.kind === 'ParseState'; }


export function symbolValue(path, valueType, slot, sourceSpan) {
  if (typeof path !== 'string' || typeof valueType !== 'string' || !Number.isInteger(slot) || slot < 0 || sourceSpan?.kind !== 'Span') {
    throw new TypeError('make_symbol() expects path Text, type Text, non-negative slot Number and Span');
  }
  return Object.freeze({ kind: 'Symbol', path, valueType, slot, span: sourceSpan });
}

export function semanticFacet(path, valueType, literalKind, literalText, slot, sourceSpan) {
  if (![path, valueType, literalKind, literalText].every(value => typeof value === 'string') || !Number.isInteger(slot) || slot < 0 || sourceSpan?.kind !== 'Span') {
    throw new TypeError('make_semantic_facet() expects Text fields, non-negative slot and Span');
  }
  return Object.freeze({ kind: 'SemanticFacet', path, valueType, literalKind, literalText, slot, span: sourceSpan });
}

export function irStore(op, path, valueType, literalKind, literalText, slot, sourceSpan) {
  if (![op, path, valueType, literalKind, literalText].every(value => typeof value === 'string') || !Number.isInteger(slot) || slot < 0 || sourceSpan?.kind !== 'Span') {
    throw new TypeError('make_ir_store() expects Text fields, non-negative slot and Span');
  }
  return Object.freeze({ kind: 'IRStore', op, path, valueType, literalKind, literalText, slot, span: sourceSpan });
}

export function isSymbolValue(value) { return Boolean(value) && value.kind === 'Symbol'; }
export function isSemanticNode(value) { return Boolean(value) && value.kind === 'SemanticFacet'; }
export function isIrNode(value) { return Boolean(value) && value.kind === 'IRStore'; }
