import { RCLSyntaxError } from './errors.mjs';

const TWO_CHAR = new Set(['<-', '->', '==', '!=', '<=', '>=']);
const ONE_CHAR = new Set(['{', '}', '(', ')', ':', ',', '.', '=', '+', '-', '*', '/', '%', '<', '>']);

function isDigit(ch) { return ch >= '0' && ch <= '9'; }
function isIdStart(ch) { return Boolean(ch) && (/[_\p{L}]/u).test(ch); }
function isIdPart(ch) { return Boolean(ch) && (/[_\p{L}\p{N}]/u).test(ch); }

export function lexReality(source) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let column = 1;

  const push = (type, value, startLine = line, startColumn = column) => {
    tokens.push({ type, value, line: startLine, column: startColumn });
  };

  const advance = () => {
    const ch = source[i++];
    if (ch === '\n') { line += 1; column = 1; }
    else column += 1;
    return ch;
  };

  while (i < source.length) {
    const ch = source[i];

    if (/\s/u.test(ch)) { advance(); continue; }

    if (ch === '#' || (ch === '/' && source[i + 1] === '/')) {
      while (i < source.length && source[i] !== '\n') advance();
      continue;
    }

    const startLine = line;
    const startColumn = column;

    if (ch === '"') {
      let raw = '';
      advance();
      let closed = false;
      while (i < source.length) {
        const current = advance();
        if (current === '"') { closed = true; break; }
        if (current === '\\') {
          if (i >= source.length) break;
          const escaped = advance();
          const map = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' };
          raw += map[escaped] ?? escaped;
        } else raw += current;
      }
      if (!closed) throw new RCLSyntaxError('Unterminated text literal', { line: startLine, column: startColumn, value: raw });
      push('STRING', raw, startLine, startColumn);
      continue;
    }

    if (isDigit(ch) || (ch === '.' && isDigit(source[i + 1]))) {
      let raw = '';
      let dots = 0;
      while (i < source.length && (isDigit(source[i]) || source[i] === '.')) {
        if (source[i] === '.') dots += 1;
        if (dots > 1) break;
        raw += advance();
      }
      push('NUMBER', raw, startLine, startColumn);
      continue;
    }

    if (isIdStart(ch)) {
      let raw = '';
      while (i < source.length && isIdPart(source[i])) raw += advance();
      push('IDENT', raw, startLine, startColumn);
      continue;
    }

    const pair = source.slice(i, i + 2);
    if (TWO_CHAR.has(pair)) {
      advance(); advance();
      push('SYMBOL', pair, startLine, startColumn);
      continue;
    }

    if (ONE_CHAR.has(ch)) {
      advance();
      push('SYMBOL', ch, startLine, startColumn);
      continue;
    }

    throw new RCLSyntaxError(`Unexpected character ${JSON.stringify(ch)}`, { line: startLine, column: startColumn, value: ch });
  }

  tokens.push({ type: 'EOF', value: '<eof>', line, column });
  return tokens;
}
