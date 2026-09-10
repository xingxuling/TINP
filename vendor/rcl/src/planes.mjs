import { realityRoot } from './canonical.mjs';
import { isKnowledge } from './knowledge.mjs';
import { isUtterance, isIntent, isUnderstanding, isCreation, isCreationProposal } from './cognition.mjs';

function selectByPrefixes(state, prefixes) {
  const selected = {};
  for (const [path, value] of Object.entries(state)) {
    if (prefixes.some(prefix => path === prefix || path.startsWith(`${prefix}.`))) selected[path] = structuredClone(value);
  }
  return selected;
}

function freezePlane(plane) { return Object.freeze({ ...plane, root: realityRoot(plane) }); }

export function buildNaturalLanguageReality(program, state, history = []) {
  const values = selectByPrefixes(state, (program.naturalLanguages ?? []).map(domain => domain.name));
  const utterances = {};
  const intents = {};
  for (const [path, value] of Object.entries(values)) {
    if (isUtterance(value)) utterances[path] = value;
    else if (isIntent(value)) intents[path] = value;
  }
  const activeIntents = Object.entries(intents)
    .filter(([, value]) => value.active)
    .map(([path, value]) => ({ path, action: value.action, target: value.target, confidence: value.confidence }));
  return freezePlane({
    format: 'rcl.natural-language-reality.v0.1',
    program: program.name,
    utterances,
    intents,
    activeIntents,
    interpretations: history.filter(record => record.domainKind === 'natural-language-plane').map(record => structuredClone(record)),
  });
}

export function buildUnderstandingReality(program, state, history = []) {
  const values = selectByPrefixes(state, (program.understandings ?? []).map(domain => domain.name));
  const models = {};
  for (const [path, value] of Object.entries(values)) if (isUnderstanding(value)) models[path] = value;
  const weakModels = Object.entries(models)
    .filter(([, value]) => value.confidence < 0.5 || value.coherence < 0.5)
    .map(([path, value]) => ({ path, confidence: value.confidence, coherence: value.coherence, explanation: value.explanation }));
  return freezePlane({
    format: 'rcl.understanding-reality.v0.1',
    program: program.name,
    models,
    weakModels,
    explanations: history.filter(record => record.domainKind === 'understanding-plane').flatMap(record => record.explanations ?? []),
  });
}

export function buildCreativeReality(program, state, history = []) {
  const values = selectByPrefixes(state, (program.creations ?? []).map(domain => domain.name));
  const proposals = {};
  const candidates = {};
  const selected = {};
  for (const [path, value] of Object.entries(values)) {
    if (isCreationProposal(value)) {
      proposals[path] = value;
      continue;
    }
    if (!isCreation(value)) continue;
    candidates[path] = value;
    if (value.status === 'selected') selected[path] = value;
  }
  return freezePlane({
    format: 'rcl.creative-reality.v0.1',
    program: program.name,
    proposals,
    candidates,
    selected,
    generations: history.filter(record => record.domainKind === 'creative-plane').map(record => structuredClone(record)),
  });
}

export function buildInnerReality(program, state) {
  const knowledge = {};
  for (const [path, value] of Object.entries(state)) if (isKnowledge(value)) knowledge[path] = structuredClone(value);

  const perceptual = selectByPrefixes(state, program.perceptions.map(domain => domain.name));
  const neural = selectByPrefixes(state, program.neurals.map(domain => domain.name));
  const living = selectByPrefixes(state, program.livings.map(domain => domain.name));
  const naturalLanguage = selectByPrefixes(state, (program.naturalLanguages ?? []).map(domain => domain.name));
  const understanding = selectByPrefixes(state, (program.understandings ?? []).map(domain => domain.name));
  const creative = selectByPrefixes(state, (program.creations ?? []).map(domain => domain.name));

  const unresolved = Object.entries(knowledge)
    .filter(([, claim]) => ['contested', 'forgotten'].includes(claim.status))
    .map(([path, claim]) => ({ path, status: claim.status, alternatives: claim.alternatives }));

  const plane = {
    format: 'rcl.inner-reality.v0.2',
    program: program.name,
    perceptual,
    neural,
    living,
    knowledge,
    naturalLanguage,
    understanding,
    creative,
    unresolved,
  };
  return freezePlane(plane);
}

export function buildExecutionReality(program, history, projections) {
  const realized = history.map(record => structuredClone(record));
  const projected = projections.map(record => structuredClone(record));
  const hostCalls = realized.flatMap(record => record.hostCalls ?? []);
  const authorityDecisions = realized
    .filter(record => record.authority)
    .map(record => ({ rule: record.rule, actor: record.actor, authority: record.authority }));
  const evidence = realized.flatMap(record => [
    ...(record.witnesses ?? []),
    ...((record.measurements ?? []).flatMap(item => item.evidence ?? [])),
    ...((record.knowledgeClaims ?? []).flatMap(item => item.evidence ?? [])),
    ...((record.changes ?? []).flatMap(item => item.after?.evidence ?? [])),
  ]);
  const plane = {
    format: 'rcl.execution-reality.v0.2',
    program: program.name,
    projected,
    realized,
    hostCalls,
    authorityDecisions,
    evidence: [...new Set(evidence)],
  };
  return freezePlane(plane);
}
