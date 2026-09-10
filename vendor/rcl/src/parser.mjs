import { lexReality } from './lexer.mjs';
import { RCLSyntaxError } from './errors.mjs';

const BINARY_PRECEDENCE = new Map([
  ['or', 1], ['and', 2], ['==', 3], ['!=', 3],
  ['<', 4], ['<=', 4], ['>', 4], ['>=', 4],
  ['+', 5], ['-', 5], ['*', 6], ['/', 6], ['%', 6],
]);

class Parser {
  constructor(tokens) { this.tokens = tokens; this.index = 0; }
  current() { return this.tokens[this.index]; }
  at(value) { return this.current().value === value; }
  atType(type) { return this.current().type === type; }
  advance() { const token = this.current(); if (token.type !== 'EOF') this.index += 1; return token; }
  expect(value, message = `Expected '${value}'`) { if (!this.at(value)) throw new RCLSyntaxError(message, this.current()); return this.advance(); }
  expectType(type, message = `Expected ${type}`) { if (!this.atType(type)) throw new RCLSyntaxError(message, this.current()); return this.advance(); }

  parseProgram() {
    this.expect('reality', "RCL source must begin with 'reality'");
    const name = this.expectType('IDENT', 'Expected reality name').value;
    this.expect('{');
    const body = [];
    while (!this.at('}')) {
      if (this.atType('EOF')) throw new RCLSyntaxError('Reality block is not closed', this.current());
      body.push(this.parseTopLevel());
    }
    this.expect('}');
    if (!this.atType('EOF')) throw new RCLSyntaxError('Unexpected content after reality block', this.current());
    return { kind: 'RealityProgram', name, body };
  }

  parseTopLevel() {
    switch (this.current().value) {
      case 'facet': return this.parseFacet(null);
      case 'subject': return this.parseSubject();
      case 'reckon': return this.parseReckon();
      case 'host': return this.parseHost();
      case 'dialect': return this.parseDialect();
      case 'effect': return this.parseEffectDecl();
      case 'capability_policy': return this.parseCapabilityPolicy();
      case 'store': return this.parseStoreDecl();
      case 'ui': return this.parseNativeUI();
      case 'verify': return this.parseAbsorptionDirective('VerifyCapabilities', 'policy');
      case 'snapshot': return this.parseAbsorptionDirective('SnapshotStore', 'store');
      case 'meta': return this.parseMeta();
      case 'physical': return this.parsePhysical();
      case 'perception': return this.parsePerception();
      case 'neural': return this.parseNeural();
      case 'living': return this.parseLiving();
      case 'genetic': return this.parseGenetic();
      case 'quantitative': return this.parseQuantitative();
      case 'knowledge': return this.parseKnowledge();
      case 'language': return this.parseNaturalLanguage();
      case 'understanding': return this.parseUnderstanding();
      case 'creation': return this.parseCreation();
      case 'spacetime': return this.parseSpacetime();
      case 'acceleration': return this.parseAcceleration();
      case 'compression': return this.parseCompression();
      case 'energy': return this.parseEnergy();
      case 'element': return this.parseElement();
      case 'science': return this.parseScience();
      case 'embodiment': return this.parseEmbodiment();
      case 'spirit': return this.parseSpirit();
      case 'emergence': return this.parseRule('Emergence');
      case 'resonance': return this.parseRule('Resonance');
      case 'foresee': return this.parseRuleDirective('Foresee');
      case 'realize': return this.parseRuleDirective('Realize');
      case 'reflect': return this.parseNameDirective('Reflect');
      case 'advance': return this.parseStepDirective('Advance', 'steps');
      case 'observe': return this.parseNameDirective('Observe');
      case 'propagate': return this.parseStepDirective('Propagate', 'steps');
      case 'live': return this.parseStepDirective('Live', 'steps');
      case 'inherit': return this.parseStepDirective('Inherit', 'generations');
      case 'quantify': return this.parseNameDirective('Quantify');
      case 'learn': return this.parseNameDirective('Learn');
      case 'interpret': return this.parseNameDirective('Interpret');
      case 'understand': return this.parseNameDirective('Understand');
      case 'create': return this.parseNameDirective('Create');
      case 'synchronize': return this.parseStepDirective('Synchronize', 'steps');
      case 'accelerate': return this.parseNameDirective('Accelerate');
      case 'compress': return this.parseNameDirective('Compress');
      case 'restore': return this.parseNameDirective('Restore');
      case 'energize': return this.parseNameDirective('Energize');
      case 'constitute': return this.parseNameDirective('Constitute');
      case 'investigate': return this.parseNameDirective('Investigate');
      case 'embody': return this.parseNameDirective('Embody');
      case 'integrate': return this.parseNameDirective('Integrate');
      default: throw new RCLSyntaxError(`Unknown reality declaration '${this.current().value}'`, this.current());
    }
  }

  parsePath() {
    const parts = [this.expectType('IDENT', 'Expected name').value];
    while (this.at('.')) { this.advance(); parts.push(this.expectType('IDENT', 'Expected name after dot').value); }
    return parts.join('.');
  }

  parseType() {
    const parseOne = () => {
      let name = this.expectType('IDENT', 'Expected type name').value;
      while (this.at('.')) {
        this.advance();
        name += `.${this.expectType('IDENT', 'Expected type name after dot').value}`;
      }
      const args = [];
      if (this.at('<')) {
        this.advance();
        if (!this.at('>')) {
          while (true) {
            args.push(parseOne());
            if (!this.at(',')) break;
            this.advance();
          }
        }
        this.expect('>', 'Expected closing > in generic type');
      }
      return `${name}${args.length ? `<${args.join(',')}>` : ''}`;
    };
    return parseOne();
  }

  parseNameList(message = 'Expected name') {
    const names = [];
    do {
      names.push(this.parsePath());
      if (!this.at(',')) break;
      this.advance();
    } while (true);
    if (names.length === 0) throw new RCLSyntaxError(message, this.current());
    return names;
  }

  parseBooleanLiteral(message = 'Expected true or false') {
    const value = this.expectType('IDENT', message).value;
    if (value !== 'true' && value !== 'false') throw new RCLSyntaxError(message, this.current());
    return value === 'true';
  }

  parseNumberLiteral(message = 'Expected number') {
    return Number(this.expectType('NUMBER', message).value);
  }

  parseFacet(prefix) {
    const start = this.expect('facet');
    const local = this.parsePath();
    const path = prefix ? `${prefix}.${local}` : local;
    this.expect(':');
    const valueType = this.parseType();
    this.expect('=');
    return {
      kind: 'FacetDecl',
      path,
      valueType,
      value: this.parseExpression(),
      owner: prefix,
      location: { line: start.line, column: start.column },
    };
  }

  parseSubject() {
    this.expect('subject');
    const name = this.expectType('IDENT', 'Expected subject name').value;
    this.expect('{'); const facets = []; const warrants = [];
    while (!this.at('}')) {
      if (this.at('facet')) facets.push(this.parseFacet(name));
      else if (this.at('warrant')) warrants.push(this.parseWarrant(name));
      else throw new RCLSyntaxError(`Unknown subject declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return { kind: 'SubjectDecl', name, facets, warrants };
  }

  parseWarrant(subject) {
    this.expect('warrant'); const capability = this.parsePath(); this.expect('on'); const target = this.parsePath();
    let condition = null; if (this.at('while')) { this.advance(); condition = this.parseExpression(); }
    return { kind: 'WarrantDecl', subject, capability, target, condition };
  }

  parseReckon() {
    this.expect('reckon'); const name = this.expectType('IDENT', 'Expected reckoning name').value; this.expect('(');
    const params = [];
    if (!this.at(')')) do {
      const paramName = this.expectType('IDENT', 'Expected parameter name').value; this.expect(':');
      params.push({ name: paramName, valueType: this.parseType() });
      if (!this.at(',')) break; this.advance();
    } while (!this.at(')'));
    this.expect(')'); this.expect('->'); const returnType = this.parseType(); this.expect('=');
    return { kind: 'ReckonDecl', name, params, returnType, expression: this.parseExpression() };
  }

  parseHost() {
    this.expect('host'); const name = this.expectType('IDENT', 'Expected host name').value; this.expect('{'); const offers = [];
    while (!this.at('}')) { this.expect('offers', "Host blocks only accept 'offers'"); const capability = this.parsePath(); this.expect('->'); offers.push({ capability, returnType: this.parseType() }); }
    this.expect('}'); return { kind: 'HostDecl', name, offers };
  }

  parseMeta() {
    this.expect('meta'); const name = this.expectType('IDENT', 'Expected meta-computational reality name').value;
    const node = { kind: 'MetaDecl', name, facets: [], inspections: [], revisions: [], preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('facet')) node.facets.push(this.parseFacet(name));
      else if (this.at('inspect')) { this.advance(); node.inspections.push(this.parsePath()); }
      else if (this.at('revise')) { this.advance(); const target = this.parsePath(); this.expect('<-'); node.revisions.push({ target, expression: this.parseExpression() }); }
      else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown meta-computational declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parsePhysicalEntity(domain, entityKind) {
    this.expect(entityKind); const name = this.expectType('IDENT', `Expected ${entityKind} name`).value;
    const prefix = `${domain}.${name}`; this.expect('{'); const facets = [];
    while (!this.at('}')) {
      if (this.at('facet')) facets.push(this.parseFacet(prefix));
      else throw new RCLSyntaxError(`${entityKind} blocks only accept facets`, this.current());
    }
    this.expect('}'); return { kind: entityKind === 'body' ? 'PhysicalBodyDecl' : 'PhysicalFieldDecl', name, path: prefix, facets };
  }

  parsePhysicalLaw(domain) {
    this.expect('law'); const localName = this.expectType('IDENT', 'Expected physical law name').value;
    const law = { kind: 'PhysicalLawDecl', name: `${domain}.${localName}`, domain, step: null, when: null, evolves: [], conserves: [], witnesses: [] };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'step') { this.advance(); const name = this.expectType('IDENT', 'Expected step variable').value; this.expect(':'); law.step = { name, valueType: this.parseType() }; }
      else if (keyword === 'when') { this.advance(); law.when = this.parseExpression(); }
      else if (keyword === 'evolve') { this.advance(); const target = this.parsePath(); this.expect('<-'); law.evolves.push({ target, expression: this.parseExpression() }); }
      else if (keyword === 'conserve') { this.advance(); law.conserves.push(this.parseExpression()); }
      else if (keyword === 'witness') { this.advance(); law.witnesses.push(this.expectType('STRING', 'Expected witness text').value); }
      else throw new RCLSyntaxError(`Unknown physical law clause '${keyword}'`, this.current());
    }
    this.expect('}'); return law;
  }

  parsePhysical() {
    this.expect('physical'); const name = this.expectType('IDENT', 'Expected physical reality name').value;
    const node = { kind: 'PhysicalDecl', name, facets: [], bodies: [], fields: [], laws: [] }; this.expect('{');
    while (!this.at('}')) {
      if (this.at('facet')) node.facets.push(this.parseFacet(name));
      else if (this.at('body')) node.bodies.push(this.parsePhysicalEntity(name, 'body'));
      else if (this.at('field')) node.fields.push(this.parsePhysicalEntity(name, 'field'));
      else if (this.at('law')) node.laws.push(this.parsePhysicalLaw(name));
      else throw new RCLSyntaxError(`Unknown physical declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parsePerception() {
    this.expect('perception'); const name = this.expectType('IDENT', 'Expected perception name').value;
    const node = { kind: 'PerceptionDecl', name, observer: null, source: null, channels: [], preserves: [] }; this.expect('{');
    while (!this.at('}')) {
      if (this.at('observer')) { this.advance(); node.observer = this.parsePath(); }
      else if (this.at('source')) { this.advance(); node.source = this.parsePath(); }
      else if (this.at('channel')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected channel name').value; this.expect(':'); const valueType = this.parseType(); this.expect('=');
        node.channels.push({ kind: 'PerceptionChannelDecl', path: `${name}.${local}`, valueType, expression: this.parseExpression() });
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown perception declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseNeuralPathway(domain) {
    this.expect('pathway'); const localName = this.expectType('IDENT', 'Expected neural pathway name').value;
    const pathway = { kind: 'NeuralPathwayDecl', name: `${domain}.${localName}`, domain, when: null, changes: [], preserves: [], witnesses: [] };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'when') { this.advance(); pathway.when = this.parseExpression(); }
      else if (['transmit', 'inhibit', 'learn', 'modulate'].includes(keyword)) {
        this.advance(); const target = this.parsePath(); this.expect('<-'); pathway.changes.push({ mode: keyword, target, expression: this.parseExpression() });
      } else if (keyword === 'preserve') { this.advance(); pathway.preserves.push(this.parseExpression()); }
      else if (keyword === 'witness') { this.advance(); pathway.witnesses.push(this.expectType('STRING', 'Expected witness text').value); }
      else throw new RCLSyntaxError(`Unknown neural pathway clause '${keyword}'`, this.current());
    }
    this.expect('}'); return pathway;
  }

  parseNeural() {
    this.expect('neural'); const name = this.expectType('IDENT', 'Expected neural reality name').value;
    const node = { kind: 'NeuralDecl', name, facets: [], pathways: [] }; this.expect('{');
    while (!this.at('}')) {
      if (this.at('facet')) node.facets.push(this.parseFacet(name));
      else if (this.at('pathway')) node.pathways.push(this.parseNeuralPathway(name));
      else throw new RCLSyntaxError(`Unknown neural declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseLivingCycle(life) {
    this.expect('cycle'); const localName = this.expectType('IDENT', 'Expected life cycle name').value;
    const cycle = { kind: 'LifeCycleDecl', name: `${life}.${localName}`, life, when: null, changes: [], witnesses: [] }; this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'when') { this.advance(); cycle.when = this.parseExpression(); }
      else if (['metabolize', 'intend', 'act', 'adapt', 'heal', 'grow'].includes(keyword)) {
        this.advance(); const target = this.parsePath(); this.expect('<-'); cycle.changes.push({ mode: keyword, target, expression: this.parseExpression() });
      } else if (keyword === 'witness') { this.advance(); cycle.witnesses.push(this.expectType('STRING', 'Expected witness text').value); }
      else throw new RCLSyntaxError(`Unknown life cycle clause '${keyword}'`, this.current());
    }
    this.expect('}'); return cycle;
  }

  parseLiving() {
    this.expect('living'); const name = this.expectType('IDENT', 'Expected living reality name').value;
    const node = { kind: 'LivingDecl', name, body: null, facets: [], needs: [], senses: [], maintains: [], cycles: [] }; this.expect('{');
    while (!this.at('}')) {
      if (this.at('body')) { this.advance(); node.body = this.parsePath(); }
      else if (this.at('facet')) node.facets.push(this.parseFacet(name));
      else if (this.at('need')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected need facet name').value;
        this.expect('target'); const target = this.parseExpression(); this.expect('critical'); const critical = this.parseExpression();
        node.needs.push({ kind: 'NeedDecl', path: `${name}.${local}`, target, critical });
      } else if (this.at('sense')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected sense name').value; this.expect(':'); const valueType = this.parseType(); this.expect('from'); const source = this.parsePath();
        node.senses.push({ kind: 'SenseDecl', path: `${name}.${local}`, valueType, source });
      } else if (this.at('maintain')) { this.advance(); node.maintains.push(this.parseExpression()); }
      else if (this.at('cycle')) node.cycles.push(this.parseLivingCycle(name));
      else throw new RCLSyntaxError(`Unknown living declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseGenetic() {
    this.expect('genetic'); const name = this.expectType('IDENT', 'Expected genetic reality name').value;
    const node = { kind: 'GeneticDecl', name, facets: [], genes: [], expressions: [], mutations: [], preserves: [], witnesses: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('facet')) node.facets.push(this.parseFacet(name));
      else if (this.at('gene')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected gene name').value; this.expect(':'); const valueType = this.parseType(); this.expect('=');
        node.genes.push({ kind: 'GeneDecl', path: `${name}.${local}`, valueType, value: this.parseExpression() });
      } else if (this.at('express')) {
        this.advance(); const target = this.parsePath(); this.expect('<-'); node.expressions.push({ target, expression: this.parseExpression() });
      } else if (this.at('mutate')) {
        this.advance(); const target = this.parsePath(); this.expect('by'); node.mutations.push({ target, expression: this.parseExpression() });
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else if (this.at('witness')) { this.advance(); node.witnesses.push(this.expectType('STRING', 'Expected witness text').value); }
      else throw new RCLSyntaxError(`Unknown genetic declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseQuantitative() {
    this.expect('quantitative'); const name = this.expectType('IDENT', 'Expected quantitative reality name').value;
    const node = { kind: 'QuantitativeDecl', name, measures: [], derives: [], preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('measure')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected measurement name').value; this.expect(':'); const baseType = this.parseType(); this.expect('=');
        const measure = {
          kind: 'MeasureDecl', path: `${name}.${local}`, baseType,
          value: this.parseExpression(), uncertainty: null, confidence: null,
          unit: null, scale: 'ratio', evidence: [], calibratedBy: null,
        };
        while (['uncertainty', 'confidence', 'unit', 'scale', 'evidence', 'calibrated'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'uncertainty') measure.uncertainty = this.parseExpression();
          else if (clause === 'confidence') measure.confidence = this.parseExpression();
          else if (clause === 'unit') measure.unit = this.expectType('STRING', 'Expected unit text').value;
          else if (clause === 'scale') measure.scale = this.expectType('IDENT', 'Expected scale name').value;
          else if (clause === 'evidence') measure.evidence.push(this.expectType('STRING', 'Expected evidence text').value);
          else if (clause === 'calibrated') { this.expect('by'); measure.calibratedBy = this.expectType('STRING', 'Expected calibration identity').value; }
        }
        node.measures.push(measure);
      } else if (this.at('derive')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected derived quantity name').value; this.expect(':'); const valueType = this.parseType(); this.expect('=');
        node.derives.push({ kind: 'DerivedMeasureDecl', path: `${name}.${local}`, valueType, expression: this.parseExpression() });
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown quantitative declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseKnowledgeMetadata(node, allowDependencies = false) {
    while (['confidence', 'evidence', 'source', 'scope', 'status', 'from'].includes(this.current().value)) {
      const clause = this.advance().value;
      if (clause === 'confidence') node.confidence = this.parseExpression();
      else if (clause === 'evidence') node.evidence.push(this.expectType('STRING', 'Expected evidence text').value);
      else if (clause === 'source') node.source = this.expectType('STRING', 'Expected knowledge source').value;
      else if (clause === 'scope') node.scope = this.expectType('STRING', 'Expected knowledge scope').value;
      else if (clause === 'status') node.status = this.expectType('IDENT', 'Expected knowledge status').value;
      else if (clause === 'from') {
        if (!allowDependencies) throw new RCLSyntaxError("Only derived knowledge accepts 'from' dependencies", this.current());
        do {
          node.dependencies.push(this.parsePath());
          if (!this.at(',')) break;
          this.advance();
        } while (true);
      }
    }
    return node;
  }

  parseKnowledge() {
    this.expect('knowledge'); const name = this.expectType('IDENT', 'Expected knowledge reality name').value;
    const node = { kind: 'KnowledgeDecl', name, claims: [], derives: [], revisions: [], decays: [], preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('claim')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected knowledge claim name').value;
        this.expect(':'); const baseType = this.parseType(); this.expect('=');
        const claim = {
          kind: 'KnowledgeClaimDecl', path: `${name}.${local}`, baseType,
          expression: this.parseExpression(), confidence: null, evidence: [],
          source: null, scope: 'local', status: 'provisional', dependencies: [],
        };
        node.claims.push(this.parseKnowledgeMetadata(claim, false));
      } else if (this.at('derive')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected derived knowledge name').value;
        this.expect(':'); const baseType = this.parseType(); this.expect('=');
        const derive = {
          kind: 'DerivedKnowledgeDecl', path: `${name}.${local}`, baseType,
          expression: this.parseExpression(), confidence: null, evidence: [],
          source: 'rcl:inference', scope: 'local', status: 'derived', dependencies: [],
        };
        node.derives.push(this.parseKnowledgeMetadata(derive, true));
      } else if (this.at('revise')) {
        this.advance(); const target = this.parsePath(); this.expect('<-');
        const revision = {
          kind: 'KnowledgeRevisionDecl', target, expression: this.parseExpression(),
          confidence: null, evidence: [], source: null, scope: null,
          status: 'revision', dependencies: [],
        };
        node.revisions.push(this.parseKnowledgeMetadata(revision, true));
      } else if (this.at('forget')) {
        this.advance(); const target = this.parsePath(); this.expect('by');
        node.decays.push({ kind: 'KnowledgeDecayDecl', target, amount: this.parseExpression() });
      } else if (this.at('preserve')) {
        this.advance(); node.preserves.push(this.parseExpression());
      } else throw new RCLSyntaxError(`Unknown knowledge declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }


  parseNaturalLanguage() {
    this.expect('language'); const name = this.expectType('IDENT', 'Expected natural-language plane name').value;
    const node = { kind: 'NaturalLanguageDecl', name, utterances: [], intents: [], preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('utterance')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected utterance name').value; this.expect('=');
        const decl = {
          kind: 'UtteranceDecl', path: `${name}.${local}`, expression: this.parseExpression(),
          speaker: 'unknown', locale: 'und', channel: 'text', evidence: [],
        };
        while (['speaker', 'locale', 'channel', 'evidence'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'speaker') decl.speaker = this.expectType('STRING', 'Expected speaker text').value;
          else if (clause === 'locale') decl.locale = this.expectType('STRING', 'Expected locale text').value;
          else if (clause === 'channel') decl.channel = this.expectType('STRING', 'Expected channel text').value;
          else if (clause === 'evidence') decl.evidence.push(this.expectType('STRING', 'Expected evidence text').value);
        }
        node.utterances.push(decl);
      } else if (this.at('intent')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected intent name').value; this.expect('when');
        const decl = {
          kind: 'IntentDecl', path: `${name}.${local}`, name: local, when: this.parseExpression(),
          action: '', target: '', confidence: null, evidence: [], utterances: [], slots: [],
        };
        while (['action', 'target', 'confidence', 'evidence', 'from', 'slot'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'action') decl.action = this.expectType('STRING', 'Expected action text').value;
          else if (clause === 'target') decl.target = this.expectType('STRING', 'Expected target text').value;
          else if (clause === 'confidence') decl.confidence = this.parseExpression();
          else if (clause === 'evidence') decl.evidence.push(this.expectType('STRING', 'Expected evidence text').value);
          else if (clause === 'from') {
            do { decl.utterances.push(this.parsePath()); if (!this.at(',')) break; this.advance(); } while (true);
          } else if (clause === 'slot') {
            const slotName = this.expectType('IDENT', 'Expected slot name').value; this.expect('=');
            decl.slots.push({ name: slotName, expression: this.parseExpression() });
          }
        }
        node.intents.push(decl);
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown natural-language declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseUnderstanding() {
    this.expect('understanding'); const name = this.expectType('IDENT', 'Expected understanding plane name').value;
    const node = { kind: 'UnderstandingDecl', name, hypotheses: [], preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('hypothesis') || this.at('derive')) {
        const keyword = this.advance().value;
        const local = this.expectType('IDENT', 'Expected understanding name').value;
        this.expect(':'); const baseType = this.parseType(); this.expect('=');
        const decl = {
          kind: keyword === 'hypothesis' ? 'HypothesisDecl' : 'DerivedUnderstandingDecl',
          path: `${name}.${local}`, baseType, expression: this.parseExpression(), confidence: null,
          explanation: '', evidence: [], dependencies: [], coverage: null, coherence: null,
          status: keyword === 'hypothesis' ? 'hypothesis' : 'derived',
        };
        while (['confidence', 'explanation', 'evidence', 'from', 'coverage', 'coherence', 'status'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'confidence') decl.confidence = this.parseExpression();
          else if (clause === 'explanation') decl.explanation = this.expectType('STRING', 'Expected explanation text').value;
          else if (clause === 'evidence') decl.evidence.push(this.expectType('STRING', 'Expected evidence text').value);
          else if (clause === 'from') {
            do { decl.dependencies.push(this.parsePath()); if (!this.at(',')) break; this.advance(); } while (true);
          } else if (clause === 'coverage') decl.coverage = this.parseExpression();
          else if (clause === 'coherence') decl.coherence = this.parseExpression();
          else if (clause === 'status') decl.status = this.expectType('IDENT', 'Expected understanding status').value;
        }
        node.hypotheses.push(decl);
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown understanding declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseCreation() {
    this.expect('creation'); const name = this.expectType('IDENT', 'Expected creative plane name').value;
    const node = { kind: 'CreationDecl', name, candidates: [], selection: null, preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('candidate')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected candidate name').value;
        this.expect(':'); const baseType = this.parseType(); this.expect('=');
        const decl = {
          kind: 'CreationCandidateDecl', path: `${name}.${local}`, localName: local, baseType,
          expression: this.parseExpression(), when: { kind: 'LiteralExpr', value: true, valueType: 'Truth' },
          target: '', novelty: null, utility: null, feasibility: null, risk: null,
          evidence: [], basedOn: [],
        };
        while (['when', 'target', 'novelty', 'utility', 'feasibility', 'risk', 'evidence', 'based_on'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'when') decl.when = this.parseExpression();
          else if (clause === 'target') decl.target = this.expectType('STRING', 'Expected creation target text').value;
          else if (clause === 'novelty') decl.novelty = this.parseExpression();
          else if (clause === 'utility') decl.utility = this.parseExpression();
          else if (clause === 'feasibility') decl.feasibility = this.parseExpression();
          else if (clause === 'risk') decl.risk = this.parseExpression();
          else if (clause === 'evidence') decl.evidence.push(this.expectType('STRING', 'Expected evidence text').value);
          else if (clause === 'based_on') {
            do { decl.basedOn.push(this.parsePath()); if (!this.at(',')) break; this.advance(); } while (true);
          }
        }
        node.candidates.push(decl);
      } else if (this.at('select')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected selection name').value; this.expect('from');
        const candidates = [];
        do {
          const path = this.parsePath(); candidates.push(path.includes('.') ? path : `${name}.${path}`);
          if (!this.at(',')) break; this.advance();
        } while (true);
        node.selection = { kind: 'CreationSelectionDecl', path: `${name}.${local}`, candidates };
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown creation declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }



  parseEnergy() {
    this.expect('energy'); const name = this.expectType('IDENT', 'Expected energy reality name').value;
    const node = { kind: 'EnergyDecl', name, reservoirs: [], flows: [], preserves: [], witnesses: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('reservoir')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected reservoir name').value;
        this.expect(':'); const valueType = this.parseType(); this.expect('=');
        node.reservoirs.push({ kind: 'EnergyReservoirDecl', path: `${name}.${local}`, localName: local, valueType, value: this.parseExpression() });
      } else if (this.at('flow')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected flow name').value;
        this.expect('from'); let from = this.parsePath(); if (!from.includes('.')) from = `${name}.${from}`;
        this.expect('to'); let to = this.parsePath(); if (!to.includes('.')) to = `${name}.${to}`;
        this.expect('amount'); const amount = this.parseExpression();
        let efficiency = { kind: 'LiteralExpr', value: 1, valueType: 'Number' }; const evidence = [];
        while (['efficiency', 'evidence'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'efficiency') efficiency = this.parseExpression();
          else evidence.push(this.expectType('STRING', 'Expected energy-flow evidence').value);
        }
        node.flows.push({ kind: 'EnergyFlowDecl', name: `${name}.${local}`, localName: local, from, to, amount, efficiency, evidence });
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else if (this.at('witness')) { this.advance(); node.witnesses.push(this.expectType('STRING', 'Expected witness text').value); }
      else throw new RCLSyntaxError(`Unknown energy declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseElement() {
    this.expect('element'); const name = this.expectType('IDENT', 'Expected element reality name').value;
    const node = { kind: 'ElementDecl', name, species: [], compounds: [], preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('species')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected species name').value;
        const item = { kind: 'ElementSpeciesDecl', path: `${name}.${local}`, localName: local, symbol: null, atomicNumber: null, atomicMass: null, charge: null, phase: null, evidence: [] };
        this.expect('{');
        while (!this.at('}')) {
          const clause = this.advance().value;
          if (clause === 'symbol') item.symbol = this.expectType('STRING', 'Expected element symbol').value;
          else if (clause === 'atomic') item.atomicNumber = this.parseExpression();
          else if (clause === 'mass') item.atomicMass = this.parseExpression();
          else if (clause === 'charge') item.charge = this.parseExpression();
          else if (clause === 'phase') item.phase = this.expectType('STRING', 'Expected phase text').value;
          else if (clause === 'evidence') item.evidence.push(this.expectType('STRING', 'Expected element evidence').value);
          else throw new RCLSyntaxError(`Unknown species clause '${clause}'`, this.current());
        }
        this.expect('}'); node.species.push(item);
      } else if (this.at('compound')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected compound name').value;
        const item = { kind: 'ElementCompoundDecl', path: `${name}.${local}`, localName: local, components: [], bond: null, evidence: [] };
        this.expect('{');
        while (!this.at('}')) {
          if (this.at('component')) {
            this.advance(); let component = this.parsePath(); if (!component.includes('.')) component = `${name}.${component}`;
            const coefficient = this.parseExpression(); item.components.push({ component, coefficient });
          } else if (this.at('bond')) { this.advance(); item.bond = this.expectType('STRING', 'Expected bond text').value; }
          else if (this.at('evidence')) { this.advance(); item.evidence.push(this.expectType('STRING', 'Expected compound evidence').value); }
          else throw new RCLSyntaxError(`Unknown compound clause '${this.current().value}'`, this.current());
        }
        this.expect('}'); node.compounds.push(item);
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown element declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseScience() {
    this.expect('science'); const name = this.expectType('IDENT', 'Expected science reality name').value;
    const node = { kind: 'ScienceDecl', name, hypotheses: [], experiments: [], conclusions: [], preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('hypothesis')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected hypothesis name').value;
        this.expect(':'); const baseType = this.parseType(); this.expect('=');
        const item = { kind: 'ScienceHypothesisDecl', path: `${name}.${local}`, localName: local, baseType, expression: this.parseExpression(), confidence: null, evidence: [] };
        while (['confidence', 'evidence'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'confidence') item.confidence = this.parseExpression();
          else item.evidence.push(this.expectType('STRING', 'Expected hypothesis evidence').value);
        }
        node.hypotheses.push(item);
      } else if (this.at('experiment')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected experiment name').value;
        this.expect('tests'); let hypothesis = this.parsePath(); if (!hypothesis.includes('.')) hypothesis = `${name}.${hypothesis}`;
        let repeats = { kind: 'LiteralExpr', value: 1, valueType: 'Number' };
        let tolerance = { kind: 'LiteralExpr', value: 0, valueType: 'Number' };
        let method = 'deterministic'; const evidence = [];
        while (['repeats', 'tolerance', 'method', 'evidence'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'repeats') repeats = this.parseExpression();
          else if (clause === 'tolerance') tolerance = this.parseExpression();
          else if (clause === 'method') method = this.expectType('STRING', 'Expected scientific method text').value;
          else evidence.push(this.expectType('STRING', 'Expected experiment evidence').value);
        }
        node.experiments.push({ kind: 'ScienceExperimentDecl', path: `${name}.${local}`, localName: local, hypothesis, repeats, tolerance, method, evidence });
      } else if (this.at('conclude')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected conclusion name').value;
        this.expect('from'); let source = this.parsePath(); if (!source.includes('.')) source = `${name}.${source}`;
        let confidence = null; const evidence = [];
        while (['confidence', 'evidence'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'confidence') confidence = this.parseExpression();
          else evidence.push(this.expectType('STRING', 'Expected conclusion evidence').value);
        }
        node.conclusions.push({ kind: 'ScienceConclusionDecl', path: `${name}.${local}`, localName: local, source, confidence, evidence });
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown science declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseEmbodimentPart(domain, partKind) {
    this.expect(partKind); const local = this.expectType('IDENT', `Expected ${partKind} name`).value;
    const prefix = `${domain}.${partKind}.${local}`; const facets = [];
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('facet')) facets.push(this.parseFacet(prefix));
      else throw new RCLSyntaxError(`${partKind} blocks only accept facets`, this.current());
    }
    this.expect('}'); return { kind: partKind === 'system' ? 'BodySystemDecl' : 'BodyOrganDecl', name: local, path: prefix, facets };
  }

  parseEmbodiment() {
    this.expect('embodiment'); const name = this.expectType('IDENT', 'Expected embodiment reality name').value;
    const node = { kind: 'EmbodimentDecl', name, facets: [], systems: [], organs: [], bindings: {}, maintains: [], evidence: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('facet')) node.facets.push(this.parseFacet(name));
      else if (this.at('system')) node.systems.push(this.parseEmbodimentPart(name, 'system'));
      else if (this.at('organ')) node.organs.push(this.parseEmbodimentPart(name, 'organ'));
      else if (this.at('bind')) { this.advance(); const kind = this.expectType('IDENT', 'Expected binding kind').value; node.bindings[kind] = this.parsePath(); }
      else if (this.at('maintain')) { this.advance(); node.maintains.push(this.parseExpression()); }
      else if (this.at('evidence')) { this.advance(); node.evidence.push(this.expectType('STRING', 'Expected embodiment evidence').value); }
      else throw new RCLSyntaxError(`Unknown embodiment declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseSpirit() {
    this.expect('spirit'); const name = this.expectType('IDENT', 'Expected spirit reality name').value;
    const node = { kind: 'SpiritDecl', name, facets: [], values: [], purposes: [], affects: [], preserves: [], evidence: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('facet')) node.facets.push(this.parseFacet(name));
      else if (['value', 'purpose', 'affect'].includes(this.current().value)) {
        const category = this.advance().value; const local = this.expectType('IDENT', `Expected ${category} name`).value;
        this.expect(':'); const valueType = this.parseType(); this.expect('='); const expression = this.parseExpression();
        let weight = { kind: 'LiteralExpr', value: 1, valueType: 'Number' };
        if (this.at(category === 'purpose' ? 'priority' : category === 'affect' ? 'intensity' : 'weight')) { this.advance(); weight = this.parseExpression(); }
        const item = { kind: 'SpiritAspectDecl', category, path: `${name}.${category}.${local}`, localName: local, valueType, expression, weight };
        if (category === 'value') node.values.push(item); else if (category === 'purpose') node.purposes.push(item); else node.affects.push(item);
      } else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else if (this.at('evidence')) { this.advance(); node.evidence.push(this.expectType('STRING', 'Expected spirit evidence').value); }
      else throw new RCLSyntaxError(`Unknown spirit declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseSpacetime() {
    this.expect('spacetime'); const name = this.expectType('IDENT', 'Expected spacetime reality name').value;
    const node = { kind: 'SpacetimeDecl', name, frames: [], clocks: [], coordinates: [], relations: [], preserves: [] };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('frame')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected frame name').value;
        this.expect('dimensions'); const dimensions = Number(this.expectType('NUMBER', 'Expected frame dimension count').value);
        this.expect('topology'); const topology = this.expectType('STRING', 'Expected topology text').value;
        node.frames.push({ kind: 'SpacetimeFrameDecl', name: `${name}.${local}`, localName: local, dimensions, topology });
      } else if (this.at('clock')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected clock name').value;
        this.expect(':'); const valueType = this.parseType(); this.expect('='); const value = this.parseExpression();
        this.expect('tick'); const tick = this.parseExpression();
        let rate = { kind: 'LiteralExpr', value: 1, valueType: 'Number' };
        if (this.at('rate')) { this.advance(); rate = this.parseExpression(); }
        node.clocks.push({ kind: 'SpacetimeClockDecl', path: `${name}.${local}`, localName: local, valueType, value, tick, rate });
      } else if (this.at('coordinate')) {
        this.advance(); const local = this.expectType('IDENT', 'Expected coordinate name').value;
        this.expect('='); const expression = this.parseExpression();
        let target = null; let clock = null;
        while (['target', 'clock'].includes(this.current().value)) {
          const clause = this.advance().value;
          if (clause === 'target') target = this.expectType('STRING', 'Expected coordinate target text').value;
          else clock = this.expectType('IDENT', 'Expected clock name').value;
        }
        node.coordinates.push({ kind: 'SpacetimeCoordinateDecl', path: `${name}.${local}`, localName: local, expression, target, clock: clock ? `${name}.${clock}` : null });
      } else if (this.at('relation')) {
        this.advance(); const left = this.parsePath();
        const relation = this.expectType('IDENT', 'Expected temporal relation').value;
        const right = this.parsePath();
        node.relations.push({ kind: 'SpacetimeRelationDecl', left, relation, right });
      } else if (this.at('preserve')) {
        this.advance(); node.preserves.push(this.parseExpression());
      } else throw new RCLSyntaxError(`Unknown spacetime declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseAcceleration() {
    this.expect('acceleration'); const name = this.expectType('IDENT', 'Expected acceleration reality name').value;
    const node = {
      kind: 'AccelerationDecl', name, target: null, strategy: 'memoize', factor: null,
      budget: null, fidelity: null, evidence: [], preserves: [],
    };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('target')) { this.advance(); node.target = this.parsePath(); }
      else if (this.at('strategy')) { this.advance(); node.strategy = this.expectType('IDENT', 'Expected acceleration strategy').value; }
      else if (this.at('factor')) { this.advance(); node.factor = this.parseExpression(); }
      else if (this.at('budget')) { this.advance(); node.budget = this.parseExpression(); }
      else if (this.at('fidelity')) { this.advance(); node.fidelity = this.parseExpression(); }
      else if (this.at('evidence')) { this.advance(); node.evidence.push(this.expectType('STRING', 'Expected acceleration evidence').value); }
      else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown acceleration declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseCompression() {
    this.expect('compression'); const name = this.expectType('IDENT', 'Expected compression reality name').value;
    const node = {
      kind: 'CompressionDecl', name, target: null, mode: 'lossless', codec: 'deflate',
      reversible: true, discard: false, fidelity: null, maxRatio: null,
      evidence: [], preserves: [],
    };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('target')) { this.advance(); node.target = this.parsePath(); }
      else if (this.at('mode')) { this.advance(); node.mode = this.expectType('IDENT', 'Expected compression mode').value; }
      else if (this.at('codec')) { this.advance(); node.codec = this.expectType('IDENT', 'Expected compression codec').value; }
      else if (this.at('reversible')) { this.advance(); node.reversible = this.expectType('IDENT', 'Expected true or false').value === 'true'; }
      else if (this.at('discard')) { this.advance(); node.discard = this.expectType('IDENT', 'Expected true or false').value === 'true'; }
      else if (this.at('fidelity')) { this.advance(); node.fidelity = this.parseExpression(); }
      else if (this.at('max_ratio')) { this.advance(); node.maxRatio = this.parseExpression(); }
      else if (this.at('evidence')) { this.advance(); node.evidence.push(this.expectType('STRING', 'Expected compression evidence').value); }
      else if (this.at('preserve')) { this.advance(); node.preserves.push(this.parseExpression()); }
      else throw new RCLSyntaxError(`Unknown compression declaration '${this.current().value}'`, this.current());
    }
    this.expect('}'); return node;
  }

  parseUIProperty(allowInheritance = false) {
    this.expect('property');
    const name = this.expectType('IDENT', 'Expected UI property name').value;
    this.expect('=', 'Expected = after UI property name');
    const expression = this.parseExpression();
    let inherited = false;
    if (allowInheritance && this.at('inherit')) { this.advance(); inherited = true; }
    return { kind: 'UIPropertyDecl', name, expression, inherited };
  }

  parseUIState(derived = false) {
    const start = this.advance();
    const name = this.expectType('IDENT', `Expected ${derived ? 'derived state' : 'state'} identity`).value;
    this.expect(':', `Expected : after UI ${derived ? 'derived state' : 'state'} identity`);
    const valueType = this.parseType();
    this.expect('=', `Expected = after UI ${derived ? 'derived state' : 'state'} type`);
    return {
      kind: derived ? 'UIDerivedStateDecl' : 'UIStateDecl',
      name,
      valueType,
      expression: this.parseExpression(),
      location: { line: start.line, column: start.column },
    };
  }

  parseUITheme() {
    const start = this.expect('theme');
    const name = this.expectType('IDENT', 'Expected UI theme identity').value;
    const declarations = [];
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('property')) declarations.push(this.parseUIProperty(true));
      else throw new RCLSyntaxError(`Unknown UI theme clause '${this.current().value}'`, this.current());
    }
    this.expect('}');
    return { kind: 'UIThemeDecl', name, declarations, location: { line: start.line, column: start.column } };
  }

  parseUIStyle() {
    const start = this.expect('style');
    const name = this.expectType('IDENT', 'Expected UI style identity').value;
    const node = { kind: 'UIStyleDecl', name, selector: null, priority: 0, declarations: [], location: { line: start.line, column: start.column } };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('target')) {
        this.advance();
        const selectorKind = this.expectType('IDENT', 'Expected UI selector kind').value;
        const value = this.expectType('IDENT', 'Expected UI selector value').value;
        node.selector = { kind: selectorKind, value };
      } else if (this.at('priority')) {
        this.advance(); node.priority = this.parseNumberLiteral('Expected UI style priority');
      } else if (this.at('property')) node.declarations.push(this.parseUIProperty(true));
      else throw new RCLSyntaxError(`Unknown UI style clause '${this.current().value}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseUISize(axis) {
    this.expect(axis);
    const mode = this.expectType('IDENT', `Expected ${axis} sizing mode`).value;
    return { mode, value: mode === 'fixed' ? this.parseExpression() : null };
  }

  parseUILayout() {
    const start = this.expect('layout');
    const mode = this.expectType('IDENT', 'Expected UI layout mode').value;
    const node = {
      kind: 'UILayoutDecl', mode, width: null, height: null, gap: null, padding: null,
      alignment: null, distribution: null, overflow: null, columns: 1,
      location: { line: start.line, column: start.column },
    };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'width' || keyword === 'height') node[keyword] = this.parseUISize(keyword);
      else if (keyword === 'gap' || keyword === 'padding') { this.advance(); node[keyword] = this.parseExpression(); }
      else if (keyword === 'align') { this.advance(); node.alignment = this.expectType('IDENT', 'Expected UI alignment').value; }
      else if (keyword === 'distribute') { this.advance(); node.distribution = this.expectType('IDENT', 'Expected UI distribution').value; }
      else if (keyword === 'overflow') { this.advance(); node.overflow = this.expectType('IDENT', 'Expected UI overflow mode').value; }
      else if (keyword === 'columns') { this.advance(); node.columns = this.parseNumberLiteral('Expected UI grid column count'); }
      else throw new RCLSyntaxError(`Unknown UI layout clause '${keyword}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseUINavigation() {
    const start = this.expect('navigation');
    const node = { kind: 'UINavigationDecl', initial: null, routes: [], location: { line: start.line, column: start.column } };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('initial')) {
        this.advance();
        if (node.initial !== null) throw new RCLSyntaxError('Native UI navigation may declare initial only once', this.current());
        node.initial = this.expectType('IDENT', 'Expected initial UI route identity').value;
      } else if (this.at('route')) {
        this.advance();
        const id = this.expectType('IDENT', 'Expected UI route identity').value;
        this.expect('->', 'Expected -> between UI route and target view');
        const target = this.expectType('IDENT', 'Expected UI route target view identity').value;
        node.routes.push({ id, target });
      } else throw new RCLSyntaxError(`Unknown UI navigation clause '${this.current().value}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseUIDeviceAdaptation() {
    const start = this.expect('adaptation');
    const node = { kind: 'UIDeviceAdaptationDecl', defaultProfile: null, profiles: [], location: { line: start.line, column: start.column } };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('default')) {
        this.advance();
        if (node.defaultProfile !== null) throw new RCLSyntaxError('Native UI device adaptation may declare default only once', this.current());
        node.defaultProfile = this.expectType('IDENT', 'Expected default device profile identity').value;
      } else if (this.at('profile')) {
        this.advance();
        const id = this.expectType('IDENT', 'Expected device profile identity').value;
        let minWidth = null;
        let maxWidth = null;
        while (this.at('min_width') || this.at('max_width')) {
          const bound = this.advance().value;
          const value = this.parseNumberLiteral(`Expected numeric ${bound} device profile bound`);
          if (bound === 'min_width') {
            if (minWidth !== null) throw new RCLSyntaxError(`Device profile '${id}' repeats min_width`, this.current());
            minWidth = value;
          } else {
            if (maxWidth !== null) throw new RCLSyntaxError(`Device profile '${id}' repeats max_width`, this.current());
            maxWidth = value;
          }
        }
        node.profiles.push({ id, minWidth, maxWidth });
      } else throw new RCLSyntaxError(`Unknown UI device adaptation clause '${this.current().value}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseUIEvent() {
    const start = this.expect('on');
    const eventType = this.expectType('IDENT', 'Expected canonical UI event type').value;
    const parameters = [];
    if (this.at('(')) {
      this.advance();
      if (!this.at(')')) {
        while (true) {
          const name = this.expectType('IDENT', 'Expected UI event parameter').value;
          let valueType = null;
          if (this.at(':')) { this.advance(); valueType = this.parseType(); }
          parameters.push({ name, valueType });
          if (!this.at(',')) break;
          this.advance();
        }
      }
      this.expect(')', 'Expected ) after UI event parameters');
    }
    const statements = [];
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('set')) {
        this.advance();
        const target = this.parsePath();
        this.expect('<-', 'Expected <- in UI state mutation');
        statements.push({ kind: 'UISetState', target, expression: this.parseExpression() });
      } else if (this.at('realize')) {
        this.advance();
        statements.push({ kind: 'UIRealizeReality', rule: this.expectType('IDENT', 'Expected RCL reality rule name').value });
      } else if (this.at('navigate')) {
        this.advance();
        statements.push({ kind: 'UINavigate', route: this.expectType('IDENT', 'Expected UI navigation route identity').value });
      } else throw new RCLSyntaxError(`Unknown UI event statement '${this.current().value}'`, this.current());
    }
    this.expect('}');
    return { kind: 'UIEventDecl', eventType, parameters, statements, location: { line: start.line, column: start.column } };
  }

  parseUIViewNode() {
    const start = this.advance();
    const declaration = start.value;
    const id = this.expectType('IDENT', `Expected stable identity after UI ${declaration}`).value;
    const roleByDeclaration = { view: 'container', text: 'text', action: 'action', input: 'input' };
    const node = {
      kind: 'UIViewNodeDecl', id, role: roleByDeclaration[declaration], classes: [],
      properties: [], bindings: [], events: [], children: [], layout: null, adaptiveLayouts: [],
      location: { line: start.line, column: start.column },
    };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (['view', 'text', 'action', 'input'].includes(keyword)) node.children.push(this.parseUIViewNode());
      else if (keyword === 'role') { this.advance(); node.role = this.expectType('IDENT', 'Expected canonical UI role').value; }
      else if (keyword === 'layout') {
        if (node.layout) throw new RCLSyntaxError(`Native UI node '${id}' may declare layout only once`, this.current());
        node.layout = this.parseUILayout();
      } else if (keyword === 'adapt') {
        this.advance();
        const profile = this.expectType('IDENT', 'Expected device profile identity after adapt').value;
        this.expect('layout', 'Expected layout after device profile identity');
        const mode = this.expectType('IDENT', 'Expected adaptive UI layout mode').value;
        node.adaptiveLayouts.push({ profile, mode });
      }
      else if (keyword === 'class') { this.advance(); node.classes.push(this.expectType('IDENT', 'Expected UI style class').value); }
      else if (keyword === 'property') node.properties.push(this.parseUIProperty(false));
      else if (['value', 'label', 'placeholder', 'accessibility_label'].includes(keyword)) {
        this.advance();
        node.properties.push({ kind: 'UIPropertyDecl', name: keyword, expression: this.parseExpression(), inherited: false });
      } else if (keyword === 'bind') {
        this.advance();
        const property = this.expectType('IDENT', 'Expected UI binding property').value;
        this.expect('<-', 'Expected <- in UI property binding');
        node.bindings.push({ kind: 'UIBindingDecl', property, expression: this.parseExpression() });
      } else if (keyword === 'on') node.events.push(this.parseUIEvent());
      else throw new RCLSyntaxError(`Unknown UI node clause '${keyword}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseUILifecycle() {
    const start = this.expect('lifecycle');
    const node = { kind: 'UILifecycleDecl', stages: [], restore: [], location: { line: start.line, column: start.column } };
    this.expect('{');
    while (!this.at('}')) {
      if (this.at('restore')) { this.advance(); node.restore.push(this.expectType('IDENT', 'Expected UI state identity to restore').value); }
      else node.stages.push(this.expectType('IDENT', 'Expected canonical UI lifecycle stage').value);
    }
    this.expect('}');
    return node;
  }

  parseNativeUI() {
    const start = this.expect('ui');
    const name = this.expectType('IDENT', 'Expected native UI program identity').value;
    const node = {
      kind: 'NativeUIDecl', name, states: [], derivedStates: [], themes: [], styles: [],
      viewTrees: [], lifecycle: null, navigation: null, deviceAdaptation: null, location: { line: start.line, column: start.column },
    };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'state') node.states.push(this.parseUIState(false));
      else if (keyword === 'derived') node.derivedStates.push(this.parseUIState(true));
      else if (keyword === 'theme') node.themes.push(this.parseUITheme());
      else if (keyword === 'style') node.styles.push(this.parseUIStyle());
      else if (keyword === 'lifecycle') {
        if (node.lifecycle) throw new RCLSyntaxError('Native UI may declare lifecycle only once', this.current());
        node.lifecycle = this.parseUILifecycle();
      } else if (keyword === 'navigation') {
        if (node.navigation) throw new RCLSyntaxError('Native UI may declare navigation only once', this.current());
        node.navigation = this.parseUINavigation();
      } else if (keyword === 'adaptation') {
        if (node.deviceAdaptation) throw new RCLSyntaxError('Native UI may declare device adaptation only once', this.current());
        node.deviceAdaptation = this.parseUIDeviceAdaptation();
      } else if (keyword === 'view') node.viewTrees.push(this.parseUIViewNode());
      else throw new RCLSyntaxError(`Unknown native UI declaration '${keyword}'`, this.current());
    }
    this.expect('}');
    return node;
  }


  parseDialectOperation() {
    this.expect('operation');
    const name = this.expectType('IDENT', 'Expected dialect operation name').value;
    const operation = { name, inputs: [], outputs: [], effects: [], lowersTo: [] };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'input') { this.advance(); operation.inputs.push(this.parseType()); }
      else if (keyword === 'output') { this.advance(); operation.outputs.push(this.parseType()); }
      else if (keyword === 'effect' || keyword === 'effects') { this.advance(); operation.effects.push(...this.parseNameList('Expected effect name')); }
      else if (keyword === 'lowers_to') { this.advance(); operation.lowersTo.push(...this.parseNameList('Expected target dialect')); }
      else throw new RCLSyntaxError(`Unknown dialect operation clause '${keyword}'`, this.current());
    }
    this.expect('}');
    return operation;
  }

  parseDialect() {
    this.expect('dialect');
    const id = this.expectType('IDENT', 'Expected dialect id').value;
    const node = {
      kind: 'DialectDecl', id, version: '0.14.0-alpha.1', layer: 'semantic', domain: null,
      description: '', operations: [], lowersTo: [], invariants: [],
    };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'version') { this.advance(); node.version = this.expectType('STRING', 'Expected dialect version string').value; }
      else if (keyword === 'layer') { this.advance(); node.layer = this.expectType('IDENT', 'Expected dialect layer').value; }
      else if (keyword === 'domain') { this.advance(); node.domain = this.parsePath(); }
      else if (keyword === 'description') { this.advance(); node.description = this.expectType('STRING', 'Expected dialect description').value; }
      else if (keyword === 'lowers_to') { this.advance(); node.lowersTo.push(...this.parseNameList('Expected target dialect')); }
      else if (keyword === 'operation') node.operations.push(this.parseDialectOperation());
      else if (keyword === 'invariant') { this.advance(); node.invariants.push(this.expectType('STRING', 'Expected invariant text').value); }
      else throw new RCLSyntaxError(`Unknown dialect clause '${keyword}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseEffectDecl() {
    this.expect('effect');
    const name = this.expectType('IDENT', 'Expected effect name').value;
    const node = {
      kind: 'EffectDecl', name, deterministic: true, replay: 'deterministic', evidenceRequired: false,
      description: '', lowersTo: [],
    };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'deterministic') { this.advance(); node.deterministic = this.parseBooleanLiteral('Expected true or false after deterministic'); }
      else if (keyword === 'replay') { this.advance(); node.replay = this.expectType('STRING', 'Expected replay mode text').value; }
      else if (keyword === 'evidence_required') { this.advance(); node.evidenceRequired = this.parseBooleanLiteral('Expected true or false after evidence_required'); }
      else if (keyword === 'description') { this.advance(); node.description = this.expectType('STRING', 'Expected effect description').value; }
      else if (keyword === 'lowers_to') { this.advance(); node.lowersTo.push(...this.parseNameList('Expected target dialect')); }
      else throw new RCLSyntaxError(`Unknown effect clause '${keyword}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseCapabilityPolicy() {
    this.expect('capability_policy');
    const name = this.expectType('IDENT', 'Expected capability policy name').value;
    const node = {
      kind: 'CapabilityPolicyDecl', name, allowedEffects: [], deniedEffects: [], capabilities: [],
      hostCapabilities: [], budget: {}, requireDeterministicReplay: false,
    };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'allow_effect') { this.advance(); node.allowedEffects.push(...this.parseNameList('Expected effect name')); }
      else if (keyword === 'deny_effect') { this.advance(); node.deniedEffects.push(...this.parseNameList('Expected effect name')); }
      else if (keyword === 'allow') {
        this.advance(); const capability = this.parsePath(); this.expect('on'); const target = this.parsePath();
        node.capabilities.push({ capability, target });
      } else if (keyword === 'allow_host') { this.advance(); node.hostCapabilities.push(...this.parseNameList('Expected host capability')); }
      else if (keyword === 'require_deterministic_replay') {
        this.advance();
        node.requireDeterministicReplay = this.at('true') || this.at('false') ? this.parseBooleanLiteral('Expected true or false') : true;
      } else if (keyword === 'budget') {
        this.advance(); const key = this.expectType('IDENT', 'Expected budget key').value; node.budget[key] = this.parseNumberLiteral('Expected budget number');
      } else throw new RCLSyntaxError(`Unknown capability policy clause '${keyword}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseStoreDecl() {
    this.expect('store');
    const name = this.expectType('IDENT', 'Expected store name').value;
    const node = { kind: 'StoreDecl', name, branches: [], commits: [] };
    this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'branch') { this.advance(); node.branches.push(this.expectType('IDENT', 'Expected branch name').value); }
      else if (keyword === 'commit') { this.advance(); node.commits.push(this.expectType('STRING', 'Expected commit message').value); }
      else throw new RCLSyntaxError(`Unknown store clause '${keyword}'`, this.current());
    }
    this.expect('}');
    return node;
  }

  parseAbsorptionDirective(kind, targetKey) {
    this.advance();
    return { kind, [targetKey]: this.expectType('IDENT', `Expected ${targetKey} name`).value };
  }

  parseRule(ruleKind) {
    this.expect(ruleKind === 'Emergence' ? 'emergence' : 'resonance'); const name = this.expectType('IDENT', 'Expected rule name').value;
    const rule = { kind: ruleKind, name, cause: null, from: null, into: null, when: null, needs: [], preserves: [], alters: [], calls: [], witnesses: [] }; this.expect('{');
    while (!this.at('}')) {
      const keyword = this.current().value;
      if (keyword === 'cause') { this.advance(); rule.cause = this.expectType('IDENT', 'Expected causing subject').value; }
      else if (keyword === 'from') { this.advance(); rule.from = this.expectType('IDENT', 'Expected source subject').value; }
      else if (keyword === 'into') { this.advance(); rule.into = this.expectType('IDENT', 'Expected target subject').value; }
      else if (keyword === 'when') { this.advance(); rule.when = this.parseExpression(); }
      else if (keyword === 'needs') { this.advance(); const capability = this.parsePath(); this.expect('on'); rule.needs.push({ capability, target: this.parsePath() }); }
      else if (keyword === 'preserve') { this.advance(); rule.preserves.push(this.parseExpression()); }
      else if (keyword === 'alter') { this.advance(); const target = this.parsePath(); this.expect('<-'); rule.alters.push({ target, expression: this.parseExpression() }); }
      else if (keyword === 'call') {
        this.advance(); const capability = this.parsePath(); this.expect('('); const args = [];
        if (!this.at(')')) do { args.push(this.parseExpression()); if (!this.at(',')) break; this.advance(); } while (!this.at(')'));
        this.expect(')'); this.expect('->'); rule.calls.push({ capability, args, target: this.parsePath() });
      } else if (keyword === 'witness') { this.advance(); rule.witnesses.push(this.expectType('STRING', 'Expected witness text').value); }
      else throw new RCLSyntaxError(`Unknown ${ruleKind.toLowerCase()} clause '${keyword}'`, this.current());
    }
    this.expect('}'); return rule;
  }

  parseRuleDirective(kind) { this.advance(); return { kind, rule: this.expectType('IDENT', `Expected rule name after ${kind.toLowerCase()}`).value }; }
  parseNameDirective(kind) { this.advance(); return { kind, name: this.parsePath() }; }
  parseStepDirective(kind, countKeyword) {
    this.advance(); const name = this.parsePath(); this.expect(countKeyword); const count = this.parseExpression();
    let dt = null; if (kind === 'Advance') { this.expect('dt'); dt = this.parseExpression(); }
    return { kind, name, count, dt };
  }

  parseExpression(minPrecedence = 0) {
    let left = this.parsePrefix();
    while (true) {
      const operator = this.current().value; const precedence = BINARY_PRECEDENCE.get(operator);
      if (precedence === undefined || precedence < minPrecedence) break;
      this.advance(); const right = this.parseExpression(precedence + 1); left = { kind: 'BinaryExpr', operator, left, right };
    }
    return left;
  }

  parseMatchExpression() {
    const start = this.expect('match');
    const target = this.parseExpression();
    this.expect('{', 'Expected { after match target');
    const cases = [];
    while (!this.at('}')) {
      if (this.atType('EOF')) throw new RCLSyntaxError('Match expression is not closed', this.current());
      const variantToken = this.expectType('IDENT', 'Expected union variant name or _ in match case');
      const bindings = [];
      if (this.at('(')) {
        this.advance();
        if (!this.at(')')) {
          while (true) {
            const binding = this.expectType('IDENT', 'Expected match binding name').value;
            bindings.push(binding);
            if (!this.at(',')) break;
            this.advance();
          }
        }
        this.expect(')', 'Expected ) after match bindings');
      }
      this.expect('->', 'Expected -> in match case');
      const expression = this.parseExpression();
      cases.push({
        variant: variantToken.value,
        wildcard: variantToken.value === '_',
        bindings,
        expression,
        location: { line: variantToken.line, column: variantToken.column },
      });
      if (this.at(',')) this.advance();
    }
    this.expect('}', 'Expected closing } in match expression');
    return { kind: 'MatchUnionExpr', target, cases, location: { line: start.line, column: start.column } };
  }

  parsePrefix() {
    const token = this.current();
    if (token.value === 'not' || token.value === '-') { this.advance(); return { kind: 'UnaryExpr', operator: token.value, expression: this.parseExpression(7) }; }
    if (token.value === 'match') return this.parseMatchExpression();
    if (token.type === 'NUMBER') { this.advance(); return { kind: 'LiteralExpr', value: Number(token.value), valueType: 'Number' }; }
    if (token.type === 'STRING') { this.advance(); return { kind: 'LiteralExpr', value: token.value, valueType: 'Text' }; }
    if (token.value === 'true' || token.value === 'false') { this.advance(); return { kind: 'LiteralExpr', value: token.value === 'true', valueType: 'Truth' }; }
    if (token.value === '(') { this.advance(); const expression = this.parseExpression(); this.expect(')'); return expression; }
    if (token.value === '{') {
      const start = this.advance();
      const fields = [];
      if (!this.at('}')) do {
        const nameToken = this.expectType('IDENT', 'Expected record field name');
        this.expect(':', 'Expected : after record field name');
        fields.push({ name: nameToken.value, expression: this.parseExpression(), location: { line: nameToken.line, column: nameToken.column } });
        if (!this.at(',')) break;
        this.advance();
      } while (!this.at('}'));
      this.expect('}', 'Expected closing } in record literal');
      return { kind: 'RecordLiteralExpr', fields, location: { line: start.line, column: start.column } };
    }
    if (token.type === 'IDENT') {
      const name = this.parsePath();
      if (this.at('(')) {
        this.advance(); const args = [];
        if (!this.at(')')) do { args.push(this.parseExpression()); if (!this.at(',')) break; this.advance(); } while (!this.at(')'));
        this.expect(')'); return { kind: 'CallExpr', name, args };
      }
      return { kind: 'PathExpr', path: name };
    }
    throw new RCLSyntaxError(`Expected expression, found '${token.value}'`, token);
  }
}

export function parseReality(source) { return new Parser(lexReality(source)).parseProgram(); }
