export class RCLError extends Error {
  constructor(code, message, details = {}) {
    super(`${code}: ${message}`);
    this.name = 'RCLError';
    this.code = code;
    this.details = details;
  }
}

export class RCLSyntaxError extends RCLError {
  constructor(message, token) {
    super('RCL_SYNTAX_ERROR', message, token ? { line: token.line, column: token.column, token: token.value } : {});
    this.name = 'RCLSyntaxError';
  }
}

export class RCLCompileError extends RCLError {
  constructor(diagnostics) {
    super('RCL_COMPILE_ERROR', diagnostics.map(d => d.message).join('; '), { diagnostics });
    this.name = 'RCLCompileError';
    this.diagnostics = diagnostics;
  }
}

export class RCLRuntimeError extends RCLError {
  constructor(code, message, details = {}) {
    super(code, message, details);
    this.name = 'RCLRuntimeError';
  }
}
