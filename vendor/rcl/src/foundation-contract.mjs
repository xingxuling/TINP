import crypto from 'node:crypto';

export const FOUNDATION_CONTRACT_FORMAT = 'taowind.rcl-foundation-contract.v0.1';
export const FOUNDATION_CONTRACT_VERSION = '0.1.0';
export const FOUNDATION_RUNTIME_RESULT_FORMAT = 'taowind.rcl-foundation-runtime-result.v0.1';
export const FOUNDATION_EXECUTION_MODES = Object.freeze(['native', 'bridge', 'projection', 'asset', 'none']);

const COMMON_INPUT_SCHEMA = Object.freeze({ type: 'object', required: ['input'], additionalProperties: true });
const COMMON_OUTPUT_SCHEMA = Object.freeze({ type: 'object', required: ['domain', 'proposal', 'constraints', 'stateDelta', 'evidence', 'confidence', 'authorityRequired', 'replayMetadata'] });
const COMMON_STATE_SCHEMA = Object.freeze({ type: 'object', required: ['beforeRoot', 'afterRoot', 'changes'] });
const COMMON_PROPOSAL_SCHEMA = Object.freeze({ type: 'object', required: ['name', 'status', 'changes'] });
const COMMON_CONSTRAINT_SCHEMA = Object.freeze({ type: 'array', items: { type: 'object' } });
const COMMON_EVIDENCE_SCHEMA = Object.freeze({ type: 'array', items: { type: ['string', 'object'] } });

function spec(id, chineseName, englishName, category, runtimeId, question, minimumConformanceTests) {
  return Object.freeze({
    id, chineseName, englishName, category, runtimeId, question,
    inputSchema: COMMON_INPUT_SCHEMA, outputSchema: COMMON_OUTPUT_SCHEMA, stateSchema: COMMON_STATE_SCHEMA,
    proposalSchema: COMMON_PROPOSAL_SCHEMA, constraintSchema: COMMON_CONSTRAINT_SCHEMA, evidenceSchema: COMMON_EVIDENCE_SCHEMA,
    providerRequirements: Object.freeze({ required: false, capabilities: [] }),
    deterministicRequirements: Object.freeze({ seed: 'required-when-random', providerReceipt: 'required-for-external-provider', root: 'before-after-state-root' }),
    supportedExecutionModes: FOUNDATION_EXECUTION_MODES,
    minimumConformanceTests: Object.freeze(minimumConformanceTests),
  });
}

export const FOUNDATION_DOMAINS = Object.freeze([
  spec('metacomputation', '元计算', 'metacomputation', 'domain', 'meta-computational', 'How can computation inspect and transform computation itself?', ['manifest-completeness', 'runtime-invocation', 'deterministic-replay']),
  spec('computation', '计算', 'computation', 'domain', 'computational', 'How are symbolic and machine states computed and executed?', ['manifest-completeness', 'behavior-mutation', 'deterministic-replay']),
  spec('physical', '物理', 'physical', 'domain', 'physical', 'How do matter, energy, fields, space and time evolve?', ['runtime-invocation', 'behavior-mutation', 'invariant-rejection']),
  spec('energy', '能量', 'energy', 'domain', 'energy', 'How is capacity to cause change stored, transferred and bounded?', ['runtime-invocation', 'behavior-mutation', 'invariant-rejection']),
  spec('elemental', '元素', 'elemental', 'domain', 'elemental', 'What constituents and compositions make a reality object what it is?', ['runtime-invocation', 'behavior-mutation', 'invariant-rejection']),
  spec('perception', '感知', 'perception', 'domain', 'perceptual', 'How does a world become observable by an observer?', ['runtime-invocation', 'behavior-mutation', 'deterministic-replay']),
  spec('neural', '神经', 'neural', 'domain', 'neural', 'How do signals become memory, attention, learning and control?', ['runtime-invocation', 'behavior-mutation', 'deterministic-replay']),
  spec('embodiment', '身体', 'embodiment', 'domain', 'embodied', 'How are boundaries and sensorimotor channels integrated into one body?', ['runtime-invocation', 'invariant-rejection', 'deterministic-replay']),
  spec('life', '生命', 'life', 'domain', 'living', 'How does a living system maintain continuity, needs and action?', ['runtime-invocation', 'behavior-mutation', 'invariant-rejection']),
  spec('genetic', '基因', 'genetic', 'domain', 'genetic', 'How are encoded structures expressed, inherited and changed?', ['runtime-invocation', 'behavior-mutation', 'deterministic-replay']),
  spec('quantitative', '量化', 'quantitative', 'domain', 'quantitative', 'What can be measured, with what uncertainty and evidence?', ['runtime-invocation', 'behavior-mutation', 'evidence-production']),
  spec('knowledge', '知识', 'knowledge', 'domain', 'knowledge', 'How do observations become justified, revisable and actionable knowledge?', ['runtime-invocation', 'evidence-production', 'invariant-rejection']),
  spec('scientific', '科学', 'scientific', 'domain', 'science', 'How are hypotheses tested, replicated and revised?', ['runtime-invocation', 'evidence-production', 'deterministic-replay']),
  spec('spiritual', '精神', 'spiritual', 'domain', 'spirit', 'How are identity, meaning, values, purpose and will integrated?', ['runtime-invocation', 'invariant-rejection', 'deterministic-replay']),
]);

export const FOUNDATION_COMPOSITE_PLANES = Object.freeze([
  spec('natural-language-reality', '自然语言现实', 'natural-language-reality', 'composite-plane', 'natural-language-plane', 'How do utterances become explicit intent candidates?', ['runtime-invocation', 'behavior-mutation', 'deterministic-replay']),
  spec('understanding-reality', '理解现实', 'understanding-reality', 'composite-plane', 'understanding-plane', 'How do evidence-bearing hypotheses form testable world models?', ['runtime-invocation', 'evidence-production', 'invariant-rejection']),
  spec('creative-reality', '创造现实', 'creative-reality', 'composite-plane', 'creative-plane', 'How are bounded candidates generated and selected without automatic execution?', ['runtime-invocation', 'behavior-mutation', 'deterministic-replay']),
  spec('inner-reality', '内在现实', 'inner-reality', 'composite-plane', 'inner-reality', 'How are perception, memory, needs and candidates combined for a subject?', ['runtime-invocation', 'deterministic-replay']),
  spec('execution-reality', '执行现实', 'execution-reality', 'composite-plane', 'execution-reality', 'How does an authorized intention become an evidenced state change?', ['runtime-invocation', 'negative-authority', 'evidence-production', 'root-consistency']),
]);

export const FOUNDATION_META_PLANES = Object.freeze([
  spec('meta-spacetime', '元时空', 'meta-spacetime', 'meta-plane', 'meta-spacetime', 'How are states, events and observers located and causally ordered?', ['runtime-invocation', 'invariant-rejection', 'deterministic-replay']),
  spec('meta-acceleration', '元加速', 'meta-acceleration', 'meta-plane', 'meta-acceleration', 'How can execution be accelerated while preserving declared fidelity?', ['runtime-invocation', 'invariant-rejection', 'deterministic-replay']),
  spec('meta-compression', '元压缩', 'meta-compression', 'meta-plane', 'meta-compression', 'How can representation cost be reduced while preserving a restore contract?', ['runtime-invocation', 'root-consistency', 'deterministic-replay']),
]);

export const FOUNDATION_CROSS_DOMAIN_AXES = Object.freeze([
  spec('authority-boundary', '权界', 'authority-boundary', 'cross-domain-axis', 'authority', 'Which bounded powers may become authoritative reality?', ['negative-authority', 'invariant-rejection']),
  spec('causality-evidence', '因果—证据', 'causality-evidence', 'cross-domain-axis', 'causality-evidence', 'Which causes, conditions and witnesses make a transition reproducible?', ['evidence-production', 'root-consistency', 'deterministic-replay']),
]);

export const FOUNDATION_4R = Object.freeze([
  Object.freeze({ id: 'explicit-variable', chineseName: '显式变量化', englishName: 'explicit-variable', category: '4r-control', trigger: '不可预测', requiredArtifacts: ['explicitVariables', 'uncertainty'], minimumConformanceTests: ['behavior-mutation', 'deterministic-replay'] }),
  Object.freeze({ id: 'provider-capability-boundary', chineseName: 'Provider / Capability 边界化', englishName: 'provider-capability-boundary', category: '4r-control', trigger: '不可控制', requiredArtifacts: ['providerCapabilities'], minimumConformanceTests: ['negative-authority', 'version-compatibility'] }),
  Object.freeze({ id: 'authorization-evidence', chineseName: '授权与证据化', englishName: 'authorization-evidence', category: '4r-control', trigger: '不可逆', requiredArtifacts: ['authorityRequirements', 'irreversibleEffects', 'evidenceRequirements'], minimumConformanceTests: ['negative-authority', 'evidence-production'] }),
  Object.freeze({ id: 'adaptive-invariant-field', chineseName: 'Adaptive Invariant Field', englishName: 'adaptive-invariant-field', category: '4r-control', trigger: '不稳定', requiredArtifacts: ['invariants', 'adaptiveInvariantField'], minimumConformanceTests: ['invariant-rejection', 'root-consistency'] }),
]);

export const FOUNDATION_MANIFEST = Object.freeze({ format: FOUNDATION_CONTRACT_FORMAT, version: FOUNDATION_CONTRACT_VERSION, domains: FOUNDATION_DOMAINS, compositePlanes: FOUNDATION_COMPOSITE_PLANES, metaRealityPlanes: FOUNDATION_META_PLANES, crossDomainAxes: FOUNDATION_CROSS_DOMAIN_AXES, realityRobustness: FOUNDATION_4R });

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  return value;
}

export const FOUNDATION_MANIFEST_ROOT = crypto.createHash('sha256').update(JSON.stringify(canonicalize(FOUNDATION_MANIFEST), 'utf8')).digest('hex');
const ALL_SPECS = Object.freeze([...FOUNDATION_DOMAINS, ...FOUNDATION_COMPOSITE_PLANES, ...FOUNDATION_META_PLANES, ...FOUNDATION_CROSS_DOMAIN_AXES, ...FOUNDATION_4R]);
const BY_ID = new Map(ALL_SPECS.map(item => [item.id, item]));
const BY_RUNTIME_ID = new Map(ALL_SPECS.filter(item => item.runtimeId).map(item => [item.runtimeId, item]));

export function getFoundationSpec(id) {
  const value = BY_ID.get(id) ?? BY_RUNTIME_ID.get(id);
  if (!value) throw new TypeError(`Unknown Foundation id '${id}'`);
  return value;
}

export function resolveFoundationId(id) { return getFoundationSpec(id).id; }

function clampConfidence(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(1, Math.max(0, number)) : 0;
}

function collectEvidence(record) {
  const values = [...(record.evidence ?? []), ...(record.witnesses ?? []), ...(record.measurements ?? []).flatMap(item => item.evidence ?? []), ...(record.knowledgeClaims ?? []).flatMap(item => item.evidence ?? []), ...(record.changes ?? []).flatMap(change => change.after?.evidence ?? [])];
  const seen = new Set();
  return values.filter(value => { const key = JSON.stringify(value); if (seen.has(key)) return false; seen.add(key); return true; }).map(value => structuredClone(value));
}

function recordConfidence(record) {
  const explicit = [record.confidence, ...(record.knowledgeClaims ?? []).map(item => item.confidence), ...(record.explanations ?? []).map(item => item.confidence)].map(Number).filter(Number.isFinite);
  return explicit.length ? clampConfidence(Math.min(...explicit)) : 0;
}

function recordDomainId(record) {
  if (record.domain) return resolveFoundationId(record.domain);
  const kindMap = { physical: 'physical', energy: 'energy', quantitative: 'quantitative', knowledge: 'knowledge', neural: 'neural', living: 'life', genetic: 'genetic', science: 'scientific', 'meta-computational': 'metacomputation', computational: 'computation', perceptual: 'perception', embodied: 'embodiment', living: 'life', science: 'scientific', spirit: 'spiritual', element: 'elemental', body: 'embodiment', 'natural-language-plane': 'natural-language-reality', 'understanding-plane': 'understanding-reality', 'creative-plane': 'creative-reality', 'meta-spacetime': 'meta-spacetime', 'meta-acceleration': 'meta-acceleration', 'meta-compression': 'meta-compression', 'meta-compression-restore': 'meta-compression' };
  if (record.domainKind && kindMap[record.domainKind]) return kindMap[record.domainKind];
  if (record.kind === 'Transition' || record.kind === 'Projection') return 'execution-reality';
  throw new TypeError(`Cannot map runtime record to Foundation domain: ${record.domainKind ?? record.kind ?? 'unknown'}`);
}

export function createFoundationRuntimeResult({ domain, proposal = {}, constraints = [], stateDelta = {}, evidence = [], confidence = 0, authorityRequired = [], replayMetadata = {} } = {}) {
  const specValue = getFoundationSpec(domain);
  const result = { format: FOUNDATION_RUNTIME_RESULT_FORMAT, contractVersion: FOUNDATION_CONTRACT_VERSION, domain: specValue.id, proposal: structuredClone(proposal), constraints: structuredClone(constraints), stateDelta: structuredClone(stateDelta), evidence: structuredClone(evidence), confidence: clampConfidence(confidence), authorityRequired: structuredClone(authorityRequired), replayMetadata: structuredClone(replayMetadata) };
  validateFoundationRuntimeResult(result);
  return result;
}

export function validateFoundationRuntimeResult(value) {
  if (!value || value.format !== FOUNDATION_RUNTIME_RESULT_FORMAT) throw new TypeError('Invalid Foundation runtime result format');
  getFoundationSpec(value.domain);
  for (const key of ['proposal', 'constraints', 'stateDelta', 'evidence', 'authorityRequired', 'replayMetadata']) if (value[key] === null || value[key] === undefined) throw new TypeError(`Foundation runtime result field '${key}' is required`);
  if (!Array.isArray(value.constraints) || !Array.isArray(value.evidence) || !Array.isArray(value.authorityRequired)) throw new TypeError('Foundation runtime arrays are invalid');
  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new TypeError('Foundation confidence must be between 0 and 1');
  if (typeof value.replayMetadata.deterministic !== 'boolean') throw new TypeError('Foundation replay metadata must declare deterministic');
  return true;
}

export function standardizeFoundationRecord(record, { sequence = 0, programRoot = null } = {}) {
  const domain = recordDomainId(record);
  const evidence = collectEvidence(record);
  const mode = record.mode ?? (record.status === 'projected' || record.kind === 'Projection' ? 'projection' : 'native');
  const providerCalls = [...(record.hostCalls ?? []), ...(record.providerCalls ?? [])];
  return createFoundationRuntimeResult({ domain, proposal: { name: record.name ?? record.rule ?? domain, kind: record.ruleKind ?? record.kind ?? 'DomainTransition', status: record.status ?? 'realized', mode, changes: structuredClone(record.changes ?? []) }, constraints: structuredClone(record.constraints ?? record.invariants ?? []), stateDelta: { beforeRoot: record.beforeRoot ?? null, afterRoot: record.afterRoot ?? null, changes: structuredClone(record.changes ?? []) }, evidence, confidence: recordConfidence(record), authorityRequired: structuredClone(record.authority?.needs ?? record.authorityRequired ?? []), replayMetadata: { deterministic: record.replayMetadata?.deterministic ?? providerCalls.length === 0, sequence, mode, programRoot, beforeRoot: record.beforeRoot ?? null, afterRoot: record.afterRoot ?? null, providerCallCount: providerCalls.length } });
}

export function buildFoundationRuntimeResults({ history = [], projections = [], programRoot = null } = {}) {
  const records = [...history, ...projections.map(record => ({ ...record, mode: 'projection', status: 'projected' }))];
  return records.map((record, index) => standardizeFoundationRecord(record, { sequence: index + 1, programRoot }));
}

export function foundationManifestSummary() {
  return { format: FOUNDATION_CONTRACT_FORMAT, version: FOUNDATION_CONTRACT_VERSION, root: FOUNDATION_MANIFEST_ROOT, counts: { domains: FOUNDATION_DOMAINS.length, compositePlanes: FOUNDATION_COMPOSITE_PLANES.length, metaRealityPlanes: FOUNDATION_META_PLANES.length, crossDomainAxes: FOUNDATION_CROSS_DOMAIN_AXES.length, realityRobustness: FOUNDATION_4R.length } };
}
