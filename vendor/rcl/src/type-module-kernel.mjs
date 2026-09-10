import fs from 'node:fs';
import path from 'node:path';
import { realityRoot, canonicalReality } from './canonical.mjs';

export const RCL_TYPE_MODULE_VERSION = '0.29.0-alpha.1';
export const RCL_TYPE_MODULE_FORMAT = 'rcl.type-module.semantic-ir.v0.29';

const BUILTIN_TYPES = new Map([
  ['Number', { arity: 0, kind: 'builtin' }],
  ['Text', { arity: 0, kind: 'builtin' }],
  ['Truth', { arity: 0, kind: 'builtin' }],
  ['Sequence', { arity: 0, kind: 'builtin' }],
  ['Span', { arity: 0, kind: 'builtin' }],
  ['Token', { arity: 0, kind: 'builtin' }],
  ['AstNode', { arity: 0, kind: 'builtin' }],
  ['SemanticNode', { arity: 0, kind: 'builtin' }],
  ['IrNode', { arity: 0, kind: 'builtin' }],
  ['Option', { arity: 1, kind: 'container' }],
  ['Result', { arity: 2, kind: 'container' }],
  ['Array', { arity: 1, kind: 'container' }],
  ['Map', { arity: 2, kind: 'container' }],
]);

export class RCLTypeModuleError extends Error {
  constructor(message, diagnostics = []) {
    super(message);
    this.name = 'RCLTypeModuleError';
    this.code = diagnostics[0]?.code ?? 'RCL_TYPE_MODULE_ERROR';
    this.diagnostics = diagnostics;
  }
}

function sourceLocation(modulePath, line, column = 1, length = 1) {
  return { modulePath: modulePath ?? null, line, column, length };
}

function diagnostic(code, message, location, severity = 'error', extra = {}) {
  return { code, message, severity, location: location ?? null, ...extra };
}

function stripComment(line) {
  let quote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i - 1] !== '\\') quote = !quote;
    if (!quote && ch === '#') return line.slice(0, i);
    if (!quote && ch === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

function normalizeLines(source) {
  return source.split(/\r?\n/).map((raw, index) => ({ raw, text: stripComment(raw).trim(), line: index + 1 }));
}

function readBlock(lines, start) {
  const first = lines[start];
  let header = first.text;
  let depth = 0;
  let body = [];
  let opened = false;
  for (let i = start; i < lines.length; i += 1) {
    const text = lines[i].text;
    if (!text && !opened) continue;
    for (const ch of text) {
      if (ch === '{') { depth += 1; opened = true; }
      else if (ch === '}') depth -= 1;
    }
    if (i === start) {
      header = text.slice(0, text.indexOf('{')).trim();
      const afterOpen = text.includes('{') ? text.slice(text.indexOf('{') + 1) : '';
      const beforeClose = afterOpen.includes('}') ? afterOpen.slice(0, afterOpen.lastIndexOf('}')) : afterOpen;
      if (beforeClose.trim()) body.push({ text: beforeClose.trim(), line: lines[i].line });
    } else {
      const beforeClose = text.includes('}') ? text.slice(0, text.lastIndexOf('}')) : text;
      if (beforeClose.trim()) body.push({ text: beforeClose.trim(), line: lines[i].line });
    }
    if (opened && depth === 0) return { header, body, next: i + 1, closed: true };
  }
  return { header, body, next: lines.length, closed: false };
}

function splitTopLevel(input, delimiter = ',') {
  const result = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '<' || ch === '(') depth += 1;
    else if (ch === '>' || ch === ')') depth -= 1;
    if (ch === delimiter && depth === 0) {
      result.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function tokenizeType(text, location) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if ('<>,.'.includes(ch)) { tokens.push({ type: ch, value: ch, offset: i }); i += 1; continue; }
    if (ch === ':' && text[i + 1] === ':') { tokens.push({ type: '.', value: '::', offset: i }); i += 2; continue; }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      i += 1;
      while (i < text.length && /[A-Za-z0-9_]/.test(text[i])) i += 1;
      tokens.push({ type: 'IDENT', value: text.slice(start, i), offset: start });
      continue;
    }
    throw new RCLTypeModuleError(`Invalid type token '${ch}'`, [diagnostic('RCL_TYPE_TOKEN_INVALID', `Invalid type token '${ch}'`, { ...location, column: (location?.column ?? 1) + i })]);
  }
  tokens.push({ type: 'EOF', value: '<eof>', offset: text.length });
  return tokens;
}

export function parseTypeExpression(text, location = null) {
  const tokens = tokenizeType(text, location);
  let index = 0;
  const current = () => tokens[index];
  const expect = (type) => {
    if (current().type !== type) {
      throw new RCLTypeModuleError(`Expected '${type}' in type expression '${text}'`, [diagnostic('RCL_TYPE_EXPR_EXPECTED', `Expected '${type}' in type expression '${text}'`, { ...location, column: (location?.column ?? 1) + current().offset })]);
    }
    return tokens[index++];
  };
  const parseName = () => {
    let name = expect('IDENT').value;
    while (current().type === '.') {
      const separator = current().value === '::' ? '::' : '.';
      index += 1;
      name += `${separator}${expect('IDENT').value}`;
    }
    return name;
  };
  const parse = () => {
    const name = parseName();
    const args = [];
    if (current().type === '<') {
      index += 1;
      if (current().type !== '>') {
        while (true) {
          args.push(parse());
          if (current().type === ',') { index += 1; continue; }
          break;
        }
      }
      expect('>');
    }
    return { kind: 'TypeRef', name, args, source: text.trim(), location };
  };
  const expr = parse();
  expect('EOF');
  return expr;
}

function parseNameAndParams(nameText, location) {
  const trimmed = nameText.trim();
  const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:<(.+)>)?$/);
  if (!match) throw new RCLTypeModuleError(`Invalid declaration name '${nameText}'`, [diagnostic('RCL_TYPE_DECL_NAME_INVALID', `Invalid declaration name '${nameText}'`, location)]);
  return {
    name: match[1],
    typeParams: match[2] ? splitTopLevel(match[2]).map(item => item.trim()).filter(Boolean) : [],
  };
}

function parseRecord(header, body, exported, modulePath, line) {
  const nameText = header.replace(/^export\s+/, '').replace(/^record\s+/, '').trim();
  const { name, typeParams } = parseNameAndParams(nameText, sourceLocation(modulePath, line));
  const fields = [];
  for (const item of body) {
    const match = item.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.+)$/);
    if (!match) throw new RCLTypeModuleError(`Invalid record field '${item.text}'`, [diagnostic('RCL_RECORD_FIELD_INVALID', `Invalid record field '${item.text}'`, sourceLocation(modulePath, item.line))]);
    fields.push({ name: match[1], type: parseTypeExpression(match[2], sourceLocation(modulePath, item.line, item.text.indexOf(':') + 2)), location: sourceLocation(modulePath, item.line) });
  }
  return { kind: 'RecordDecl', name, typeParams, exported, fields, location: sourceLocation(modulePath, line) };
}

function parseUnion(header, body, exported, modulePath, line) {
  const nameText = header.replace(/^export\s+/, '').replace(/^union\s+/, '').trim();
  const { name, typeParams } = parseNameAndParams(nameText, sourceLocation(modulePath, line));
  const variants = [];
  for (const item of body.flatMap(entry => splitTopLevel(entry.text, '\n').map(text => ({ text, line: entry.line })))) {
    const text = item.text.trim().replace(/,$/, '');
    if (!text) continue;
    const match = text.match(/^([A-Za-z_][A-Za-z0-9_]*)(?:\((.*)\))?$/);
    if (!match) throw new RCLTypeModuleError(`Invalid union variant '${text}'`, [diagnostic('RCL_UNION_VARIANT_INVALID', `Invalid union variant '${text}'`, sourceLocation(modulePath, item.line))]);
    const payload = match[2] ? splitTopLevel(match[2]).map((part, index) => ({ index, type: parseTypeExpression(part, sourceLocation(modulePath, item.line, text.indexOf('(') + 2)) })) : [];
    variants.push({ name: match[1], payload, location: sourceLocation(modulePath, item.line) });
  }
  return { kind: 'UnionDecl', name, typeParams, exported, variants, location: sourceLocation(modulePath, line) };
}

function parseInterface(header, body, exported, modulePath, line) {
  const nameText = header.replace(/^export\s+/, '').replace(/^interface\s+/, '').trim();
  const { name, typeParams } = parseNameAndParams(nameText, sourceLocation(modulePath, line));
  const methods = [];
  for (const item of body) {
    const match = item.text.match(/^([A-Za-z_][A-Za-z0-9_]*)\((.*)\)\s*->\s*(.+)$/);
    if (!match) throw new RCLTypeModuleError(`Invalid interface method '${item.text}'`, [diagnostic('RCL_INTERFACE_METHOD_INVALID', `Invalid interface method '${item.text}'`, sourceLocation(modulePath, item.line))]);
    methods.push({
      name: match[1],
      params: match[2].trim() ? splitTopLevel(match[2]).map((part, index) => ({ index, type: parseTypeExpression(part, sourceLocation(modulePath, item.line, item.text.indexOf('(') + 2)) })) : [],
      returns: parseTypeExpression(match[3], sourceLocation(modulePath, item.line, item.text.indexOf('->') + 3)),
      location: sourceLocation(modulePath, item.line),
    });
  }
  return { kind: 'InterfaceDecl', name, typeParams, exported, methods, location: sourceLocation(modulePath, line) };
}

function parseAlias(text, exported, modulePath, line) {
  const match = text.replace(/^export\s+/, '').match(/^alias\s+(.+?)\s*=\s*(.+)$/);
  if (!match) throw new RCLTypeModuleError(`Invalid alias declaration '${text}'`, [diagnostic('RCL_ALIAS_INVALID', `Invalid alias declaration '${text}'`, sourceLocation(modulePath, line))]);
  const { name, typeParams } = parseNameAndParams(match[1], sourceLocation(modulePath, line));
  return { kind: 'AliasDecl', name, typeParams, exported, target: parseTypeExpression(match[2], sourceLocation(modulePath, line, text.indexOf('=') + 2)), location: sourceLocation(modulePath, line) };
}

export function parseTypedModuleSource(source, options = {}) {
  const modulePath = options.modulePath ?? '<memory>';
  const lines = normalizeLines(source);
  const diagnostics = [];
  let moduleName = null;
  const imports = [];
  const declarations = [];
  for (let i = 0; i < lines.length;) {
    const item = lines[i];
    const text = item.text;
    if (!text) { i += 1; continue; }
    if (text.startsWith('module ')) {
      if (moduleName) diagnostics.push(diagnostic('RCL_MODULE_HEADER_DUPLICATE', 'Module header is declared more than once', sourceLocation(modulePath, item.line)));
      moduleName = text.slice('module '.length).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(moduleName)) diagnostics.push(diagnostic('RCL_MODULE_NAME_INVALID', `Invalid module name '${moduleName}'`, sourceLocation(modulePath, item.line)));
      i += 1;
      continue;
    }
    if (text.startsWith('import ')) {
      const imported = text.slice('import '.length).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(imported)) diagnostics.push(diagnostic('RCL_IMPORT_NAME_INVALID', `Invalid import name '${imported}'`, sourceLocation(modulePath, item.line)));
      imports.push({ module: imported, location: sourceLocation(modulePath, item.line) });
      i += 1;
      continue;
    }
    const exported = text.startsWith('export ');
    const bare = exported ? text.slice('export '.length).trim() : text;
    if (bare.startsWith('alias ')) {
      declarations.push(parseAlias(text, exported, modulePath, item.line));
      i += 1;
      continue;
    }
    if (bare.startsWith('record ') || bare.startsWith('union ') || bare.startsWith('interface ')) {
      const block = readBlock(lines, i);
      if (!block.closed) diagnostics.push(diagnostic('RCL_TYPE_BLOCK_UNCLOSED', `Unclosed type declaration block '${text}'`, sourceLocation(modulePath, item.line)));
      const headerBare = block.header.startsWith('export ') ? block.header.slice('export '.length).trim() : block.header;
      if (headerBare.startsWith('record ')) declarations.push(parseRecord(block.header, block.body, exported, modulePath, item.line));
      else if (headerBare.startsWith('union ')) declarations.push(parseUnion(block.header, block.body, exported, modulePath, item.line));
      else declarations.push(parseInterface(block.header, block.body, exported, modulePath, item.line));
      i = block.next;
      continue;
    }
    diagnostics.push(diagnostic('RCL_TYPE_MODULE_UNKNOWN_LINE', `Unknown typed module line '${text}'`, sourceLocation(modulePath, item.line)));
    i += 1;
  }
  if (!moduleName) diagnostics.push(diagnostic('RCL_MODULE_HEADER_REQUIRED', 'Typed module source must begin with a module header', sourceLocation(modulePath, 1)));
  return { kind: 'TypedModuleSource', module: moduleName, modulePath, imports, declarations, diagnostics };
}

function typeExprToString(type) {
  return `${type.name}${type.args.length ? `<${type.args.map(typeExprToString).join(',')}>` : ''}`;
}

function qualifiedName(moduleName, declName) { return `${moduleName}::${declName}`; }

function detectCycles(modules) {
  const diagnostics = [];
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  const visit = (moduleName, location) => {
    if (visited.has(moduleName)) return;
    if (visiting.has(moduleName)) {
      const cycleStart = stack.indexOf(moduleName);
      const cycle = [...stack.slice(Math.max(0, cycleStart)), moduleName];
      diagnostics.push(diagnostic('RCL_MODULE_CYCLE', `Module import cycle detected: ${cycle.join(' -> ')}`, location, 'error', { cycle }));
      return;
    }
    visiting.add(moduleName);
    stack.push(moduleName);
    const module = modules.get(moduleName);
    for (const item of module?.imports ?? []) visit(item.module, item.location);
    stack.pop();
    visiting.delete(moduleName);
    visited.add(moduleName);
  };
  for (const name of modules.keys()) visit(name, modules.get(name).location);
  return diagnostics;
}

function declarationSignature(moduleName, decl) {
  return {
    kind: decl.kind.replace('Decl', ''),
    name: decl.name,
    qualifiedName: qualifiedName(moduleName, decl.name),
    exported: decl.exported,
    typeParams: decl.typeParams,
    location: decl.location,
  };
}

function createResolver(modules, moduleName, moduleDecls, diagnostics) {
  const module = modules.get(moduleName);
  const local = moduleDecls.get(moduleName) ?? new Map();
  const importedModules = module.imports.map(item => item.module).filter(name => modules.has(name));
  const importedExports = [];
  for (const imported of importedModules) {
    const decls = moduleDecls.get(imported) ?? new Map();
    for (const decl of decls.values()) if (decl.exported) importedExports.push({ module: imported, decl });
  }
  return function resolveType(type, typeParams = [], ownerLocation = null) {
    const resolveOne = (expr) => {
      const args = expr.args.map(arg => resolveOne(arg));
      const genericParam = typeParams.includes(expr.name);
      if (genericParam) {
        if (args.length) diagnostics.push(diagnostic('RCL_GENERIC_PARAM_ARITY', `Generic parameter '${expr.name}' cannot receive type arguments`, expr.location ?? ownerLocation));
        return { ...expr, args, resolved: { kind: 'generic-param', name: expr.name }, canonical: expr.name };
      }
      const builtin = BUILTIN_TYPES.get(expr.name);
      if (builtin) {
        if (builtin.arity !== args.length) diagnostics.push(diagnostic('RCL_TYPE_ARITY_MISMATCH', `Type '${expr.name}' expects ${builtin.arity} argument(s), got ${args.length}`, expr.location ?? ownerLocation, 'error', { expected: builtin.arity, actual: args.length }));
        return { ...expr, args, resolved: { kind: builtin.kind, name: expr.name }, canonical: typeExprToString({ ...expr, args }) };
      }
      if (expr.name.includes('.') || expr.name.includes('::')) {
        const [rawModule, rawName] = expr.name.includes('::') ? expr.name.split('::') : expr.name.split('.');
        const decl = moduleDecls.get(rawModule)?.get(rawName);
        if (!decl || (!decl.exported && rawModule !== moduleName)) {
          diagnostics.push(diagnostic('RCL_TYPE_REFERENCE_MISSING', `Type '${expr.name}' is not exported by imported module '${rawModule}'`, expr.location ?? ownerLocation));
          return { ...expr, args, resolved: { kind: 'missing', name: expr.name }, canonical: typeExprToString({ ...expr, args }) };
        }
        if (decl.typeParams.length !== args.length) diagnostics.push(diagnostic('RCL_TYPE_ARITY_MISMATCH', `Type '${expr.name}' expects ${decl.typeParams.length} argument(s), got ${args.length}`, expr.location ?? ownerLocation, 'error', { expected: decl.typeParams.length, actual: args.length }));
        return { ...expr, args, resolved: { kind: 'decl', module: rawModule, name: rawName, qualifiedName: qualifiedName(rawModule, rawName) }, canonical: `${qualifiedName(rawModule, rawName)}${args.length ? `<${args.map(arg => arg.canonical).join(',')}>` : ''}` };
      }
      if (local.has(expr.name)) {
        const decl = local.get(expr.name);
        if (decl.typeParams.length !== args.length) diagnostics.push(diagnostic('RCL_TYPE_ARITY_MISMATCH', `Type '${expr.name}' expects ${decl.typeParams.length} argument(s), got ${args.length}`, expr.location ?? ownerLocation, 'error', { expected: decl.typeParams.length, actual: args.length }));
        return { ...expr, args, resolved: { kind: 'decl', module: moduleName, name: expr.name, qualifiedName: qualifiedName(moduleName, expr.name) }, canonical: `${qualifiedName(moduleName, expr.name)}${args.length ? `<${args.map(arg => arg.canonical).join(',')}>` : ''}` };
      }
      const matches = importedExports.filter(item => item.decl.name === expr.name);
      if (matches.length === 1) {
        const { module: imported, decl } = matches[0];
        if (decl.typeParams.length !== args.length) diagnostics.push(diagnostic('RCL_TYPE_ARITY_MISMATCH', `Type '${expr.name}' expects ${decl.typeParams.length} argument(s), got ${args.length}`, expr.location ?? ownerLocation, 'error', { expected: decl.typeParams.length, actual: args.length }));
        return { ...expr, args, resolved: { kind: 'decl', module: imported, name: expr.name, qualifiedName: qualifiedName(imported, expr.name) }, canonical: `${qualifiedName(imported, expr.name)}${args.length ? `<${args.map(arg => arg.canonical).join(',')}>` : ''}` };
      }
      if (matches.length > 1) diagnostics.push(diagnostic('RCL_TYPE_REFERENCE_AMBIGUOUS', `Type '${expr.name}' is exported by multiple imported modules`, expr.location ?? ownerLocation, 'error', { modules: matches.map(item => item.module) }));
      else diagnostics.push(diagnostic('RCL_TYPE_REFERENCE_MISSING', `Type '${expr.name}' is not declared, imported or built in`, expr.location ?? ownerLocation));
      return { ...expr, args, resolved: { kind: matches.length > 1 ? 'ambiguous' : 'missing', name: expr.name }, canonical: typeExprToString({ ...expr, args }) };
    };
    return resolveOne(type);
  };
}

function lowerDeclaration(moduleName, decl, resolveType, diagnostics) {
  const base = declarationSignature(moduleName, decl);
  const typeParams = new Set();
  for (const param of decl.typeParams) {
    if (typeParams.has(param)) diagnostics.push(diagnostic('RCL_GENERIC_PARAM_DUPLICATE', `Generic parameter '${param}' is declared more than once`, decl.location));
    typeParams.add(param);
  }
  const params = decl.typeParams;
  if (decl.kind === 'RecordDecl') {
    const seen = new Set();
    return {
      ...base,
      fields: decl.fields.map(field => {
        if (seen.has(field.name)) diagnostics.push(diagnostic('RCL_RECORD_FIELD_DUPLICATE', `Record '${decl.name}' has duplicate field '${field.name}'`, field.location));
        seen.add(field.name);
        const type = resolveType(field.type, params, field.location);
        return { name: field.name, type, canonicalType: type.canonical, location: field.location };
      }),
    };
  }
  if (decl.kind === 'UnionDecl') {
    const seen = new Set();
    return {
      ...base,
      variants: decl.variants.map(variant => {
        if (seen.has(variant.name)) diagnostics.push(diagnostic('RCL_UNION_VARIANT_DUPLICATE', `Union '${decl.name}' has duplicate variant '${variant.name}'`, variant.location));
        seen.add(variant.name);
        return { name: variant.name, payload: variant.payload.map(item => {
          const type = resolveType(item.type, params, variant.location);
          return { index: item.index, type, canonicalType: type.canonical };
        }), location: variant.location };
      }),
    };
  }
  if (decl.kind === 'InterfaceDecl') {
    const seen = new Set();
    return {
      ...base,
      methods: decl.methods.map(method => {
        if (seen.has(method.name)) diagnostics.push(diagnostic('RCL_INTERFACE_METHOD_DUPLICATE', `Interface '${decl.name}' has duplicate method '${method.name}'`, method.location));
        seen.add(method.name);
        const returns = resolveType(method.returns, params, method.location);
        return { name: method.name, params: method.params.map(item => {
          const type = resolveType(item.type, params, method.location);
          return { index: item.index, type, canonicalType: type.canonical };
        }), returns, canonicalReturnType: returns.canonical, location: method.location };
      }),
    };
  }
  if (decl.kind === 'AliasDecl') {
    const target = resolveType(decl.target, params, decl.location);
    return { ...base, target, canonicalTarget: target.canonical };
  }
  throw new Error(`Unsupported declaration kind '${decl.kind}'`);
}

export function compileTypedModuleGraph(sources, options = {}) {
  const diagnostics = [];
  const parsed = [];
  const entries = Array.isArray(sources)
    ? sources.map((source, index) => [`module-${index}.rcltype`, source])
    : Object.entries(sources);
  for (const [modulePath, source] of entries) {
    try {
      const result = parseTypedModuleSource(source, { modulePath });
      diagnostics.push(...result.diagnostics);
      parsed.push(result);
    } catch (error) {
      if (error instanceof RCLTypeModuleError) diagnostics.push(...error.diagnostics);
      else throw error;
    }
  }
  const modules = new Map();
  const moduleDecls = new Map();
  for (const item of parsed) {
    if (!item.module) continue;
    if (modules.has(item.module)) diagnostics.push(diagnostic('RCL_MODULE_DUPLICATE', `Module '${item.module}' is declared more than once`, sourceLocation(item.modulePath, 1)));
    modules.set(item.module, { ...item, location: sourceLocation(item.modulePath, 1) });
  }
  for (const module of modules.values()) {
    for (const item of module.imports) {
      if (!modules.has(item.module)) diagnostics.push(diagnostic('RCL_MODULE_MISSING', `Imported module '${item.module}' does not exist`, item.location));
    }
  }
  diagnostics.push(...detectCycles(modules));
  for (const module of modules.values()) {
    const decls = new Map();
    for (const decl of module.declarations) {
      if (decls.has(decl.name)) diagnostics.push(diagnostic('RCL_TYPE_DECL_DUPLICATE', `Type '${decl.name}' is declared more than once in module '${module.module}'`, decl.location));
      decls.set(decl.name, decl);
    }
    moduleDecls.set(module.module, decls);
  }

  const loweredModules = [];
  for (const moduleName of [...modules.keys()].sort()) {
    const module = modules.get(moduleName);
    const localDiagnosticsStart = diagnostics.length;
    const resolveType = createResolver(modules, moduleName, moduleDecls, diagnostics);
    const declarations = module.declarations.map(decl => lowerDeclaration(moduleName, decl, resolveType, diagnostics));
    loweredModules.push({
      name: moduleName,
      modulePath: module.modulePath,
      imports: module.imports.map(item => ({ module: item.module, location: item.location })),
      exports: declarations.filter(item => item.exported).map(item => item.name).sort(),
      declarations: declarations.sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName)),
      diagnosticsIntroduced: diagnostics.length - localDiagnosticsStart,
    });
  }
  const severityCounts = diagnostics.reduce((acc, item) => ({ ...acc, [item.severity]: (acc[item.severity] ?? 0) + 1 }), {});
  const ok = (severityCounts.error ?? 0) === 0;
  const ir = {
    format: RCL_TYPE_MODULE_FORMAT,
    version: RCL_TYPE_MODULE_VERSION,
    moduleCount: loweredModules.length,
    declarationCount: loweredModules.reduce((sum, item) => sum + item.declarations.length, 0),
    modules: loweredModules,
  };
  const root = realityRoot({ ir, diagnostics: diagnostics.map(item => ({ code: item.code, message: item.message, severity: item.severity, location: item.location })) });
  const report = Object.freeze({
    ok,
    format: 'rcl.type-module.compile-report.v0.29',
    version: RCL_TYPE_MODULE_VERSION,
    root,
    irRoot: realityRoot(ir),
    diagnostics,
    severityCounts,
    ir: Object.freeze({ ...ir, root: realityRoot(ir) }),
    boundary: 'P3 vertical slice: typed module semantic IR with records, tagged unions, aliases, interfaces, generics, Option/Result containers, module graph diagnostics and source locations. Full compiler self-hosting remains staged.',
  });
  if (!ok && options.throwOnError) throw new RCLTypeModuleError('Typed module graph failed semantic validation', diagnostics);
  return report;
}

export function readTypedModuleSourcesFromDir(inputPath) {
  const stat = fs.statSync(inputPath);
  if (stat.isFile()) return { [path.basename(inputPath)]: fs.readFileSync(inputPath, 'utf8') };
  const result = {};
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, name);
      const childStat = fs.statSync(full);
      if (childStat.isDirectory()) walk(full);
      else if (name.endsWith('.rcltype')) result[path.relative(inputPath, full).replaceAll(path.sep, '/') ] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(inputPath);
  return result;
}

export function runTypeModuleDemo() {
  const sources = {
    'core.rcltype': `module core\nexport record User<T> {\n  id: Text\n  payload: T\n  tags: Array<Text>\n}\nexport union AuthState {\n  Guest\n  LoggedIn(User<Text>)\n  Failed(Text)\n}\nexport alias MaybeUser = Option<User<Text>>\nexport interface Renderer {\n  render(User<Text>) -> Result<Text, Text>\n}`,
    'app.rcltype': `module app\nimport core\nrecord Session {\n  user: MaybeUser\n  state: AuthState\n  output: Result<Text, Text>\n}`,
  };
  const report = compileTypedModuleGraph(sources, { throwOnError: true });
  return {
    stage: 'type-module-kernel-v0.29',
    ok: report.ok,
    moduleCount: report.ir.moduleCount,
    declarationCount: report.ir.declarationCount,
    exportedCoreTypes: report.ir.modules.find(item => item.name === 'core')?.exports ?? [],
    appSessionFields: report.ir.modules.find(item => item.name === 'app')?.declarations.find(item => item.name === 'Session')?.fields.map(field => ({ name: field.name, canonicalType: field.canonicalType })) ?? [],
    irRoot: report.irRoot,
    root: report.root,
    diagnostics: report.diagnostics,
    boundary: report.boundary,
  };
}

export function writeTypeModuleReport(inputPath, outputPath = null) {
  const sources = readTypedModuleSourcesFromDir(inputPath);
  const report = compileTypedModuleGraph(sources);
  const payload = {
    inputPath,
    sourceCount: Object.keys(sources).length,
    ok: report.ok,
    irRoot: report.irRoot,
    root: report.root,
    diagnostics: report.diagnostics,
    ir: report.ir,
    boundary: report.boundary,
  };
  if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

export function canonicalTypedModuleIr(ir) {
  return canonicalReality(ir);
}
