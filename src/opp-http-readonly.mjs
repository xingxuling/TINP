import { ProtocolError, rootHash } from './identity.mjs';

export const OPP_HTTP_READONLY_POLICY_FORMAT = 'twni.opp-http-readonly-policy.v1';
export const OPP_HTTP_READONLY_REQUEST_FORMAT = 'twni.opp-http-readonly-request.v1';
export const OPP_HTTP_READONLY_RECEIPT_FORMAT = 'twni.opp-http-readonly-receipt.v1';
export const OPP_HTTP_READONLY_BOUNDARY = 'Read-only external observation; no credential, retry, redirect, or authority grant';
export const OPP_HTTP_READONLY_OPP_REPOSITORY = 'https://github.com/xingxuling/OPP';
export const OPP_HTTP_READONLY_OPP_COMMIT = 'f7b76582a720d9d18af5153affa0fc2d78bc0410';

const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const POLICY_KEYS = ['format', 'policyId', 'adapterVersion', 'oppSource', 'transport', 'receiptFormat', 'authorityGranted', 'authorityBoundary', 'policyRoot'];
const OPP_SOURCE_KEYS = ['repository', 'commit', 'protocols'];
const TRANSPORT_KEYS = ['scheme', 'method', 'allowedHosts', 'allowedPathPrefixes', 'timeoutMs', 'maxResponseBytes', 'redirectPolicy', 'proxyPolicy', 'credentialPolicy', 'maxAttempts', 'allowedRequestHeaders', 'responseMediaType', 'responseFields'];
const REQUEST_KEYS = ['format', 'requestId', 'policyRoot', 'method', 'url', 'headers', 'requestRoot'];
const RECEIPT_KEYS = ['format', 'policyRoot', 'requestRoot', 'status', 'httpStatus', 'responseContentType', 'responseEtag', 'responseLastModified', 'responseBytes', 'wireResponseRoot', 'responseRoot', 'error', 'attempts', 'redirectsFollowed', 'ambientProxyUsed', 'ambientCredentialsUsed', 'authorityGranted', 'boundary', 'receiptRoot'];
const PROXY_ENVIRONMENT_KEYS = ['HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy'];
const FORBIDDEN_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization', 'x-api-key', 'x-auth-token']);

const fail = code => { throw new ProtocolError(code); };
const check = (ok, code) => { if (!ok) fail(code); };

function plain(value) {
  try {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  } catch { return false; }
}

function exact(value, fields, code) {
  check(plain(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(keys.length === fields.length && keys.every(key => typeof key === 'string' && fields.includes(key)), code);
  for (const key of fields) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(value, key); } catch { fail(code); }
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function strictArray(value, code) {
  check(Array.isArray(value), code);
  let keys;
  try { keys = Reflect.ownKeys(value); } catch { fail(code); }
  check(Object.getPrototypeOf(value) === Array.prototype && keys.length === value.length + 1
    && keys.includes('length') && keys.every(key => key === 'length' || (typeof key === 'string' && /^\d+$/.test(key) && Number(key) < value.length)), code);
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    check(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable, code);
  }
}

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256
    && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
}

function headerName(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
    && value === value.toLowerCase() && /^[a-z0-9-]+$/.test(value);
}

function headerValue(value) {
  return typeof value === 'string' && value.length <= 512 && !/[\r\n\u0000]/.test(value);
}

function sortedUnique(values, code) {
  const seen = new Set();
  let previous = null;
  for (const value of values) {
    check(!seen.has(value), code);
    if (previous !== null) check(previous < value, code);
    previous = value;
    seen.add(value);
  }
}

function validateHost(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 253
    && value === value.toLowerCase() && !value.includes(':') && !value.includes('/')
    && !value.includes('*') && /^[a-z0-9.-]+$/.test(value)
    && !value.startsWith('.') && !value.endsWith('.') && !value.includes('..');
}

function validatePathPrefix(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 2048
    && value.startsWith('/') && !value.includes('//') && !value.includes('..')
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function validatePolicyBody(policy) {
  exact(policy, POLICY_KEYS, 'OPP_HTTP_POLICY_INVALID');
  exact(policy.oppSource, OPP_SOURCE_KEYS, 'OPP_HTTP_POLICY_OPP_SOURCE_INVALID');
  exact(policy.transport, TRANSPORT_KEYS, 'OPP_HTTP_POLICY_TRANSPORT_INVALID');
  strictArray(policy.oppSource.protocols, 'OPP_HTTP_POLICY_PROTOCOLS_INVALID');
  strictArray(policy.transport.allowedHosts, 'OPP_HTTP_POLICY_HOSTS_INVALID');
  strictArray(policy.transport.allowedPathPrefixes, 'OPP_HTTP_POLICY_PATHS_INVALID');
  strictArray(policy.transport.allowedRequestHeaders, 'OPP_HTTP_POLICY_HEADERS_INVALID');
  strictArray(policy.transport.responseFields, 'OPP_HTTP_POLICY_RESPONSE_FIELDS_INVALID');
  check(policy.format === OPP_HTTP_READONLY_POLICY_FORMAT && identifier(policy.policyId)
    && identifier(policy.adapterVersion) && policy.receiptFormat === OPP_HTTP_READONLY_RECEIPT_FORMAT
    && policy.authorityGranted === false && policy.authorityBoundary === OPP_HTTP_READONLY_BOUNDARY
    && identifier(policy.oppSource.repository) && COMMIT.test(policy.oppSource.commit), 'OPP_HTTP_POLICY_INVALID');
  check(policy.oppSource.repository === OPP_HTTP_READONLY_OPP_REPOSITORY, 'OPP_HTTP_POLICY_OPP_REPOSITORY_INVALID');
  check(policy.oppSource.protocols.length > 0, 'OPP_HTTP_POLICY_PROTOCOLS_INVALID');
  for (const protocol of policy.oppSource.protocols) check(identifier(protocol), 'OPP_HTTP_POLICY_PROTOCOLS_INVALID');
  sortedUnique(policy.oppSource.protocols, 'OPP_HTTP_POLICY_PROTOCOLS_UNSORTED');
  check(policy.transport.scheme === 'https' && policy.transport.method === 'GET'
    && Number.isSafeInteger(policy.transport.timeoutMs) && policy.transport.timeoutMs >= 100
    && policy.transport.timeoutMs <= 60000 && Number.isSafeInteger(policy.transport.maxResponseBytes)
    && policy.transport.maxResponseBytes > 0 && policy.transport.maxResponseBytes <= 16 * 1024 * 1024
    && policy.transport.redirectPolicy === 'deny' && policy.transport.proxyPolicy === 'deny-ambient'
    && policy.transport.credentialPolicy === 'none' && policy.transport.maxAttempts === 1
    && policy.transport.responseMediaType === 'application/json', 'OPP_HTTP_POLICY_TRANSPORT_INVALID');
  check(policy.transport.allowedHosts.length > 0 && policy.transport.allowedPathPrefixes.length > 0,
    'OPP_HTTP_POLICY_ALLOWLIST_INVALID');
  for (const host of policy.transport.allowedHosts) check(validateHost(host), 'OPP_HTTP_POLICY_HOSTS_INVALID');
  for (const path of policy.transport.allowedPathPrefixes) check(validatePathPrefix(path), 'OPP_HTTP_POLICY_PATHS_INVALID');
  sortedUnique(policy.transport.allowedHosts, 'OPP_HTTP_POLICY_HOSTS_UNSORTED');
  sortedUnique(policy.transport.allowedPathPrefixes, 'OPP_HTTP_POLICY_PATHS_UNSORTED');
  for (const header of policy.transport.allowedRequestHeaders) check(headerName(header) && !FORBIDDEN_HEADERS.has(header), 'OPP_HTTP_POLICY_HEADERS_INVALID');
  sortedUnique(policy.transport.allowedRequestHeaders, 'OPP_HTTP_POLICY_HEADERS_UNSORTED');
  for (const field of policy.transport.responseFields) check(identifier(field), 'OPP_HTTP_POLICY_RESPONSE_FIELDS_INVALID');
  sortedUnique(policy.transport.responseFields, 'OPP_HTTP_POLICY_RESPONSE_FIELDS_UNSORTED');
  check(HASH.test(policy.policyRoot), 'OPP_HTTP_POLICY_ROOT_INVALID');
}

export function makeOppHttpReadonlyPolicy({
  policyId,
  adapterVersion = 'tinp-opp-http-readonly-v0.1',
  oppSource = {},
  allowedHosts,
  allowedPathPrefixes,
  timeoutMs = 15000,
  maxResponseBytes = 1024 * 1024,
  allowedRequestHeaders = ['accept', 'user-agent'],
  responseFields = [],
} = {}) {
  const body = {
    format: OPP_HTTP_READONLY_POLICY_FORMAT,
    policyId,
    adapterVersion,
    oppSource: {
      repository: oppSource.repository ?? OPP_HTTP_READONLY_OPP_REPOSITORY,
      commit: oppSource.commit ?? OPP_HTTP_READONLY_OPP_COMMIT,
      protocols: [...(oppSource.protocols ?? ['opp.chp.v0.1', 'opp.rcp.v0.1'])].sort(),
    },
    transport: {
      scheme: 'https',
      method: 'GET',
      allowedHosts: [...(allowedHosts ?? [])].sort(),
      allowedPathPrefixes: [...(allowedPathPrefixes ?? [])].sort(),
      timeoutMs,
      maxResponseBytes,
      redirectPolicy: 'deny',
      proxyPolicy: 'deny-ambient',
      credentialPolicy: 'none',
      maxAttempts: 1,
      allowedRequestHeaders: [...allowedRequestHeaders].map(value => value.toLowerCase()).sort(),
      responseMediaType: 'application/json',
      responseFields: [...responseFields].sort(),
    },
    receiptFormat: OPP_HTTP_READONLY_RECEIPT_FORMAT,
    authorityGranted: false,
    authorityBoundary: OPP_HTTP_READONLY_BOUNDARY,
  };
  const policy = { ...body, policyRoot: rootHash(body) };
  validateOppHttpReadonlyPolicy(policy);
  return policy;
}

export function validateOppHttpReadonlyPolicy(policy) {
  validatePolicyBody(policy);
  const { policyRoot, ...body } = policy;
  check(rootHash(body) === policyRoot, 'OPP_HTTP_POLICY_ROOT_INVALID');
  return true;
}

function parseUrl(url, policy) {
  let parsed;
  try { parsed = new URL(url); } catch { fail('OPP_HTTP_REQUEST_URL_INVALID'); }
  check(parsed.protocol === `${policy.transport.scheme}:` && !parsed.username && !parsed.password && !parsed.hash,
    'OPP_HTTP_REQUEST_URL_INVALID');
  check(!parsed.port || parsed.port === '443', 'OPP_HTTP_REQUEST_PORT_INVALID');
  check(policy.transport.allowedHosts.includes(parsed.hostname), 'OPP_HTTP_REQUEST_HOST_DENIED');
  check(policy.transport.allowedPathPrefixes.some(prefix => parsed.pathname === prefix || parsed.pathname.startsWith(`${prefix}/`)),
    'OPP_HTTP_REQUEST_PATH_DENIED');
  return parsed;
}

function validateHeaders(headers, policy) {
  check(plain(headers), 'OPP_HTTP_REQUEST_HEADERS_INVALID');
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    check(name === normalized && headerName(name) && policy.transport.allowedRequestHeaders.includes(name)
      && !FORBIDDEN_HEADERS.has(normalized) && headerValue(value), 'OPP_HTTP_REQUEST_HEADERS_INVALID');
  }
}

export function makeOppHttpReadonlyRequest({ policy, requestId, url, headers = {} } = {}) {
  validateOppHttpReadonlyPolicy(policy);
  const body = {
    format: OPP_HTTP_READONLY_REQUEST_FORMAT,
    requestId,
    policyRoot: policy.policyRoot,
    method: policy.transport.method,
    url,
    headers: Object.fromEntries(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value])
      .sort(([left], [right]) => left.localeCompare(right))),
  };
  validateRequestBody(body, policy);
  return { ...body, requestRoot: rootHash(body) };
}

function validateRequestBody(request, policy) {
  exact(request, REQUEST_KEYS.filter(key => key !== 'requestRoot'), 'OPP_HTTP_REQUEST_INVALID');
  validateOppHttpReadonlyPolicy(policy);
  check(request.format === OPP_HTTP_READONLY_REQUEST_FORMAT && identifier(request.requestId)
    && request.policyRoot === policy.policyRoot && request.method === policy.transport.method,
    'OPP_HTTP_REQUEST_INVALID');
  parseUrl(request.url, policy);
  validateHeaders(request.headers, policy);
}

export function validateOppHttpReadonlyRequest(request, policy) {
  exact(request, REQUEST_KEYS, 'OPP_HTTP_REQUEST_INVALID');
  const { requestRoot, ...body } = request;
  validateRequestBody(body, policy);
  check(HASH.test(requestRoot) && rootHash(body) === requestRoot, 'OPP_HTTP_REQUEST_ROOT_INVALID');
  return true;
}

function proxyConfigured(environment) {
  return PROXY_ENVIRONMENT_KEYS.some(name => typeof environment?.[name] === 'string' && environment[name].length > 0);
}

function errorCode(error) {
  if (error instanceof ProtocolError) return error.code;
  if (error?.name === 'AbortError') return 'OPP_HTTP_TIMEOUT';
  return 'OPP_HTTP_NETWORK_ERROR';
}

async function readBoundedBody(response, maxBytes) {
  const declared = response.headers.get('content-length');
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) fail('OPP_HTTP_RESPONSE_TOO_LARGE');
  if (!response.body) return Buffer.alloc(0);
  const chunks = [];
  let total = 0;
  if (typeof response.body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) fail('OPP_HTTP_RESPONSE_TOO_LARGE');
      chunks.push(bytes);
    }
  } else {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maxBytes) fail('OPP_HTTP_RESPONSE_TOO_LARGE');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

function contentType(response) {
  return response.headers.get('content-type')?.toLowerCase() ?? null;
}

function jsonContentType(value) {
  if (!value) return false;
  const mediaType = value.split(';', 1)[0].trim();
  return mediaType === 'application/json' || mediaType.endsWith('+json');
}

function projectResponse(body, fields) {
  if (fields.length === 0) return body;
  check(plain(body), 'OPP_HTTP_RESPONSE_OBJECT_REQUIRED');
  const projected = {};
  for (const field of fields) {
    check(Object.hasOwn(body, field), 'OPP_HTTP_RESPONSE_FIELD_MISSING');
    projected[field] = body[field];
  }
  return projected;
}

function makeReceipt({ policy, request, status, httpStatus = null, responseContentType = null,
  responseEtag = null, responseLastModified = null, responseBytes = 0, wireResponseRoot = null,
  responseRoot = null, error = null }) {
  const body = {
    format: OPP_HTTP_READONLY_RECEIPT_FORMAT,
    policyRoot: policy.policyRoot,
    requestRoot: request.requestRoot,
    status,
    httpStatus,
    responseContentType,
    responseEtag,
    responseLastModified,
    responseBytes,
    wireResponseRoot,
    responseRoot,
    error,
    attempts: 1,
    redirectsFollowed: false,
    ambientProxyUsed: false,
    ambientCredentialsUsed: false,
    authorityGranted: false,
    boundary: OPP_HTTP_READONLY_BOUNDARY,
  };
  return { ...body, receiptRoot: rootHash(body) };
}

export function validateOppHttpReadonlyReceipt(receipt, policy, request) {
  exact(receipt, RECEIPT_KEYS, 'OPP_HTTP_RECEIPT_INVALID');
  validateOppHttpReadonlyPolicy(policy);
  validateOppHttpReadonlyRequest(request, policy);
  const { receiptRoot, ...body } = receipt;
  check(receipt.format === OPP_HTTP_READONLY_RECEIPT_FORMAT && receipt.policyRoot === policy.policyRoot
    && receipt.requestRoot === request.requestRoot && ['PASS', 'FAIL_CLOSED'].includes(receipt.status)
    && (receipt.httpStatus === null || (Number.isSafeInteger(receipt.httpStatus) && receipt.httpStatus >= 100 && receipt.httpStatus <= 599))
    && (receipt.responseContentType === null || identifier(receipt.responseContentType))
    && (receipt.responseEtag === null || identifier(receipt.responseEtag))
    && (receipt.responseLastModified === null || identifier(receipt.responseLastModified))
    && Number.isSafeInteger(receipt.responseBytes) && receipt.responseBytes >= 0
    && (receipt.wireResponseRoot === null || HASH.test(receipt.wireResponseRoot))
    && (receipt.responseRoot === null || HASH.test(receipt.responseRoot))
    && (receipt.error === null || identifier(receipt.error)) && receipt.attempts === 1
    && receipt.redirectsFollowed === false && receipt.ambientProxyUsed === false
    && receipt.ambientCredentialsUsed === false && receipt.authorityGranted === false
    && receipt.boundary === OPP_HTTP_READONLY_BOUNDARY && HASH.test(receiptRoot)
    && rootHash(body) === receiptRoot, 'OPP_HTTP_RECEIPT_INVALID');
  return true;
}

export async function runOppHttpReadonly({ policy, request, fetchImpl = globalThis.fetch, environment = process.env } = {}) {
  validateOppHttpReadonlyPolicy(policy);
  validateOppHttpReadonlyRequest(request, policy);
  if (typeof fetchImpl !== 'function') {
    const receipt = makeReceipt({ policy, request, status: 'FAIL_CLOSED', error: 'OPP_HTTP_FETCH_UNAVAILABLE' });
    return { status: receipt.status, response: null, receipt };
  }
  if (proxyConfigured(environment)) {
    const receipt = makeReceipt({ policy, request, status: 'FAIL_CLOSED', error: 'OPP_HTTP_AMBIENT_PROXY_CONFIGURED' });
    return { status: receipt.status, response: null, receipt };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.transport.timeoutMs);
  let response;
  try {
    response = await fetchImpl(request.url, {
      method: request.method,
      headers: request.headers,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    clearTimeout(timer);
    const receipt = makeReceipt({ policy, request, status: 'FAIL_CLOSED', error: errorCode(error) });
    return { status: receipt.status, response: null, receipt };
  }
  const type = contentType(response);
  const etag = response.headers.get('etag');
  const lastModified = response.headers.get('last-modified');
  let bytes;
  try {
    bytes = await readBoundedBody(response, policy.transport.maxResponseBytes);
  } catch (error) {
    clearTimeout(timer);
    const receipt = makeReceipt({ policy, request, status: 'FAIL_CLOSED', httpStatus: response.status,
      responseContentType: type, responseEtag: etag, responseLastModified: lastModified,
      error: controller.signal.aborted ? 'OPP_HTTP_TIMEOUT' : errorCode(error) });
    return { status: receipt.status, response: null, receipt };
  }
  clearTimeout(timer);
  if (!response.ok) {
    const receipt = makeReceipt({ policy, request, status: 'FAIL_CLOSED', httpStatus: response.status,
      responseContentType: type, responseEtag: etag, responseLastModified: lastModified,
      responseBytes: bytes.length, error: 'OPP_HTTP_STATUS_NOT_SUCCESS' });
    return { status: receipt.status, response: null, receipt };
  }
  if (!jsonContentType(type)) {
    const receipt = makeReceipt({ policy, request, status: 'FAIL_CLOSED', httpStatus: response.status,
      responseContentType: type, responseEtag: etag, responseLastModified: lastModified,
      responseBytes: bytes.length, error: 'OPP_HTTP_JSON_REQUIRED' });
    return { status: receipt.status, response: null, receipt };
  }
  let body;
  try { body = JSON.parse(bytes.toString('utf8')); } catch {
    const receipt = makeReceipt({ policy, request, status: 'FAIL_CLOSED', httpStatus: response.status,
      responseContentType: type, responseEtag: etag, responseLastModified: lastModified,
      responseBytes: bytes.length, error: 'OPP_HTTP_JSON_INVALID' });
    return { status: receipt.status, response: null, receipt };
  }
  const wireResponseRoot = rootHash(body);
  let projected;
  try { projected = projectResponse(body, policy.transport.responseFields); } catch (error) {
    const receipt = makeReceipt({ policy, request, status: 'FAIL_CLOSED', httpStatus: response.status,
      responseContentType: type, responseEtag: etag, responseLastModified: lastModified,
      responseBytes: bytes.length, wireResponseRoot, error: errorCode(error) });
    return { status: receipt.status, response: null, receipt };
  }
  const receipt = makeReceipt({ policy, request, status: 'PASS', httpStatus: response.status,
    responseContentType: type, responseEtag: etag, responseLastModified: lastModified,
    responseBytes: bytes.length, wireResponseRoot, responseRoot: rootHash(projected) });
  return { status: receipt.status, response: projected, receipt };
}
