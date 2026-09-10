import {
  FOUNDATION_CONTRACT_FORMAT,
  FOUNDATION_CONTRACT_VERSION,
  FOUNDATION_DOMAINS,
  FOUNDATION_COMPOSITE_PLANES,
  FOUNDATION_META_PLANES,
  FOUNDATION_CROSS_DOMAIN_AXES,
  FOUNDATION_MANIFEST_ROOT,
  foundationManifestSummary,
} from './foundation-contract.mjs';
const LEGACY_REALITY_DOMAINS = Object.freeze([
  {
    id: 'meta-computational', keyword: 'meta',
    question: 'How can computation inspect, validate and transform computation itself?',
  },
  {
    id: 'computational', keyword: 'reckon/host',
    question: 'How are symbolic and machine states computed and executed?',
  },
  {
    id: 'physical', keyword: 'physical',
    question: 'How do matter, energy, fields, space and time evolve?',
  },
  {
    id: 'energy', keyword: 'energy',
    question: 'How is capacity to cause change stored, transferred, transformed, dissipated and bounded?',
  },
  {
    id: 'elemental', keyword: 'element',
    question: 'What primitive constituents, properties, bonds and compositions make a reality object what it is?',
  },
  {
    id: 'perceptual', keyword: 'perception',
    question: 'How does a world become observable and experienced by an observer?',
  },
  {
    id: 'neural', keyword: 'neural',
    question: 'How do signals become memory, attention, learning, decisions and control?',
  },
  {
    id: 'embodied', keyword: 'embodiment',
    question: 'How are systems, organs, boundaries and sensorimotor channels integrated into one body?',
  },
  {
    id: 'living', keyword: 'living',
    question: 'How does a living system maintain continuity, needs and autonomous action?',
  },
  {
    id: 'genetic', keyword: 'genetic',
    question: 'How are structures encoded, expressed, inherited and changed across generations?',
  },
  {
    id: 'quantitative', keyword: 'quantitative',
    question: 'What can be measured, on what scale, with what uncertainty, confidence and evidence?',
  },
  {
    id: 'knowledge', keyword: 'knowledge',
    question: 'How do observations and prior structures become justified, revisable and actionable knowledge?',
  },
  {
    id: 'science', keyword: 'science',
    question: 'How are hypotheses made falsifiable, tested, replicated, revised and accepted with explicit method and evidence?',
  },
  {
    id: 'spirit', keyword: 'spirit',
    question: 'How are identity, meaning, values, purposes, affect and will integrated as a subject-relative mental reality?',
  },
]);

const LEGACY_CROSS_DOMAIN_AXES = Object.freeze([
  {
    id: 'authority', primitives: ['warrant', 'needs', 'preserve'],
    role: 'opens bounded powers while constraining which changes can become authoritative reality',
  },
  {
    id: 'causality-evidence', primitives: ['cause', 'when', 'witness', 'evidence'],
    role: 'connects change and knowledge to causes, conditions, provenance and reproducible evidence',
  },
]);

const LEGACY_COMPOSITE_REALITY_PLANES = Object.freeze([
  {
    id: 'natural-language-reality',
    primitives: ['language', 'utterance', 'intent', 'interpret'],
    composedFrom: ['perceptual', 'knowledge', 'authority'],
    role: 'turns human symbols into explicit utterances, candidate meanings and bounded intents without making a language model the whole intelligence',
  },
  {
    id: 'understanding-reality',
    primitives: ['understanding', 'hypothesis', 'explanation', 'understand'],
    composedFrom: ['knowledge', 'quantitative', 'perceptual', 'natural-language-reality'],
    role: 'constructs testable world models that explain evidence, expose confidence and can be rejected by contradiction',
  },
  {
    id: 'creative-reality',
    primitives: ['creation', 'candidate', 'select', 'create'],
    composedFrom: ['understanding-reality', 'knowledge', 'meta-computational', 'authority'],
    role: 'generates bounded novelty, evaluates candidates by utility, feasibility, novelty and risk, then selects without automatically executing',
  },
  {
    id: 'inner-reality',
    composedFrom: ['perceptual', 'neural', 'living', 'knowledge', 'natural-language-reality', 'understanding-reality', 'creative-reality'],
    role: 'the subject-relative model that contains percepts, needs, memories, claims, interpretations, explanations and candidate creations',
  },
  {
    id: 'execution-reality',
    composedFrom: ['computational', 'physical', 'authority', 'causality-evidence'],
    role: 'the bounded transition plane that turns a justified and selected intention into an observed, authorized and evidenced change',
  },
]);

const LEGACY_META_REALITY_PLANES = Object.freeze([
  {
    id: 'meta-spacetime-reality',
    primitives: ['spacetime', 'frame', 'clock', 'coordinate', 'relation', 'synchronize'],
    operatesOn: ['all reality domains', 'all transitions', 'all observations'],
    role: 'locates every state, event and observer in a reference frame and logical/physical time while preserving causal order and synchronization boundaries',
  },
  {
    id: 'meta-acceleration-reality',
    primitives: ['acceleration', 'target', 'strategy', 'factor', 'budget', 'fidelity', 'accelerate'],
    operatesOn: ['computation', 'simulation', 'learning', 'execution'],
    role: 'changes the speed, scheduling and reuse strategy of reality computation while preserving declared fidelity, authority and causal invariants',
  },
  {
    id: 'meta-compression-reality',
    primitives: ['compression', 'target', 'mode', 'codec', 'reversible', 'fidelity', 'compress', 'restore'],
    operatesOn: ['state', 'history', 'knowledge', 'world models', 'evidence'],
    role: 'reduces representational cost while preserving a declared reconstruction contract, provenance and reality root',
  },
]);

// Keep the compiler IR byte-stable. Canonical IDs and schemas live in the
// Foundation Contract; the legacy runtime descriptors remain the compiler ABI.
export const REALITY_DOMAINS = LEGACY_REALITY_DOMAINS;
export const CROSS_DOMAIN_AXES = LEGACY_CROSS_DOMAIN_AXES;
export const COMPOSITE_REALITY_PLANES = LEGACY_COMPOSITE_REALITY_PLANES;
export const META_REALITY_PLANES = LEGACY_META_REALITY_PLANES;
export function foundationSummary(program) {
  return {
    format: 'rcl.reality-foundation.v0.6',
    contract: { format: FOUNDATION_CONTRACT_FORMAT, version: FOUNDATION_CONTRACT_VERSION, root: FOUNDATION_MANIFEST_ROOT },
    contractSummary: foundationManifestSummary(),
    program: program.name,
    languageVersion: program.languageVersion,
    programRoot: program.programRoot,
    domains: {
      metaComputational: program.metaDomains?.length ?? 0,
      computational: (program.reckons?.length ?? 0) + (program.hosts?.length ?? 0),
      physical: program.physicals?.length ?? 0,
      energy: program.energies?.length ?? 0,
      elemental: program.elements?.length ?? 0,
      perceptual: program.perceptions?.length ?? 0,
      neural: program.neurals?.length ?? 0,
      embodied: program.embodiments?.length ?? 0,
      living: program.livings?.length ?? 0,
      genetic: program.genetics?.length ?? 0,
      quantitative: program.quantitatives?.length ?? 0,
      knowledge: program.knowledges?.length ?? 0,
      science: program.sciences?.length ?? 0,
      spirit: program.spirits?.length ?? 0,
    },
    canonicalDomainIds: FOUNDATION_DOMAINS.map(domain => domain.id),
    runningPlanes: {
      naturalLanguage: program.naturalLanguages?.length ?? 0,
      understanding: program.understandings?.length ?? 0,
      creative: program.creations?.length ?? 0,
      inner: 1,
      execution: 1,
    },
    metaPlanes: {
      spacetime: program.spacetimes?.length ?? 0,
      acceleration: program.accelerations?.length ?? 0,
      compression: program.compressions?.length ?? 0,
    },
    authority: {
      warrants: program.warrants?.length ?? 0,
      boundedRules: program.rules?.filter(rule => rule.needs.length || rule.preserves.length).length ?? 0,
    },
    compositePlanes: COMPOSITE_REALITY_PLANES,
    metaRealityPlanes: META_REALITY_PLANES,
  };
}
