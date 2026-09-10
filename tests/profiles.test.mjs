import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {InternetSuite, parseLifeIntent} from '../src/suite.mjs';
import {CAPABILITY, CONTRACT_ROOT, SUBJECT, CONTINUITY, providerManifest} from '../src/contract.mjs';
import {rootHash} from '../src/identity.mjs';
import {verifyLedger} from '../src/evidence.mjs';

const root = fileURLToPath(new URL('../.runs/profiles/', import.meta.url));
async function fixture(t, options = {}) {
  fs.mkdirSync(root, {recursive:true});
  const directory = fs.mkdtempSync(path.join(root, 'run-'));
  const suite = await InternetSuite.start({directory, timeoutMs:2500, ...options});
  t.after(async () => { await suite.close(); });
  t.diagnostic(`Local process/socket evidence: ${directory}`);
  return suite;
}

function ledgerIsDurable(suite) {
  const disk = fs.readFileSync(suite.ledger.file, 'utf8').trimEnd().split('\n').map(JSON.parse);
  assert.deepEqual(disk, suite.ledger.events);
  assert.equal(verifyLedger(disk), suite.ledger.root);
  for (const event of disk.filter(e => e.type === 'execution.verified')) {
    const receipt = event.detail.receipt.body;
    assert.equal(receipt.previousEvidenceRoot, event.previousRoot);
    assert.equal(receipt.requestRoot, event.detail.requestRoot);
    assert.equal(receipt.guard.allowed, true);
  }
  return disk;
}

function counted(result, text, route) {
  assert.equal(result.status, 'executed');
  assert.equal(result.result.count, [...text].length);
  assert.deepEqual(result.receipt.body.route, route);
  assert.equal(result.receipt.body.subjectId, SUBJECT);
  assert.equal(result.receipt.body.continuityRoot, CONTINUITY);
  assert.equal(result.receipt.body.contractRoot, CONTRACT_ROOT);
  assert.equal(result.receipt.body.leaseRoot, result.request.body.lease.root);
  assert.deepEqual(result.request.body.session.body.scopes, ['text.read']);
  assert.equal(result.receipt.body.guard.allowed, true);
  assert.match(result.receipt.body.guard.sourceSha256, /^[a-f0-9]{64}$/);
}

function statsByNode(rows) { return Object.fromEntries(rows.map(row => [row.nodeId, row])); }
const timeout = {timeout:90000};

for (const transport of ['udp','tcp']) {
  test(`${transport}: Chinese life intent executes through three independent local processes and two socket hops`, timeout, async t => {
    const suite = await fixture(t, {transport});
    const input = '我要使用字符计数能力完成：你好，互联网🌏e\u0301';
    const intent = parseLifeIntent(input);
    assert.deepEqual(Object.keys(intent).sort(), ['capabilityId','text']);
    assert.equal(intent.capabilityId, CAPABILITY.capabilityId);
    assert.equal(intent.text, '你好，互联网🌏e\u0301');
    const infos = [...suite.nodes.values()].map(node => node.info);
    assert.equal(new Set(infos.map(info => info.pid)).size, 3);
    assert.equal(new Set(infos.map(info => info.endpoint.port)).size, 3);
    for (const info of infos) {
      assert.notEqual(info.pid, process.pid);
      assert.ok(Number.isInteger(info.pid) && info.pid > 0);
      assert.equal(info.endpoint.transport, transport);
      assert.equal(info.endpoint.host, '127.0.0.1');
      assert.ok(Number.isInteger(info.endpoint.port) && info.endpoint.port > 0);
      assert.doesNotThrow(() => process.kill(info.pid, 0));
    }
    const result = await suite.use(intent.text);
    counted(result, intent.text, ['A','B','C']);
    assert.equal(result.level, 'Full');
    const stats = statsByNode(await suite.stats());
    assert.deepEqual([stats.A.executions,stats.B.executions,stats.C.executions], [0,0,1]);
    for (const info of infos) {
      assert.equal(stats[info.nodeId].pid, info.pid);
      assert.ok(stats[info.nodeId].metrics.sentFrames >= 2, `${info.nodeId} sent real discovery/execution frames`);
      assert.ok(stats[info.nodeId].metrics.receivedFrames >= 2);
      assert.ok(stats[info.nodeId].metrics.sentBytes > 0);
      assert.equal(stats[info.nodeId].metrics.invalidFrames, 0);
    }
    assert.ok(stats.B.metrics.sentFrames >= 4, 'B must relay both requests and signed responses');
    assert.equal(stats.C.cacheEntries, 1);
    const cached = fs.readFileSync(path.join(suite.directory, 'C-execution-cache.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(cached.length, 1);
    assert.equal(cached[0].receipt.root, result.receipt.root);
    ledgerIsDurable(suite);
  });
}

test('commercial: contract-identical provider replacement executes; semantic drift rolls back; missing provider migrates to B', timeout, async t => {
  const suite = await fixture(t);
  const first = await suite.use('起点🌏');
  const replacement = providerManifest('C', 'C:replacement-verified');
  await suite.replaceProvider('C', replacement);
  const second = await suite.use('替换后🌏');
  counted(second, '替换后🌏', ['A','B','C']);
  assert.equal(second.receipt.body.providerId, replacement.providerId);
  assert.ok(second.receipt.body.providerEpoch > first.receipt.body.providerEpoch);
  assert.equal(second.request.body.session.body.sessionId, first.request.body.session.body.sessionId);
  const changedCapability = {...CAPABILITY, semantics:'Count UTF-16 code units instead of Unicode code points.'};
  const drift = {...replacement,providerId:'C:semantic-drift',capability:changedCapability,contractRoot:rootHash(changedCapability)};
  await assert.rejects(suite.replaceProvider('C', drift), error => error.code === 'PROVIDER_SEMANTIC_MISMATCH');
  const restored = await suite.use('🌏');
  counted(restored, '🌏', ['A','B','C']);
  assert.equal(restored.result.count, 1);
  assert.equal(restored.receipt.body.providerId, replacement.providerId);
  assert.ok(suite.ledger.events.some(event => event.type==='provider.rollback' && event.detail.restored===replacement.providerId));
  const before = statsByNode(await suite.stats());
  await suite.nodes.get('C').call('provider', {enabled:false});
  const fallback = await suite.use('备份能力');
  counted(fallback, '备份能力', ['A','B']);
  assert.equal(fallback.level, 'Essential');
  assert.equal(fallback.receipt.body.providerId, 'B:counter');
  const after = statsByNode(await suite.stats());
  assert.equal(after.C.executions, before.C.executions);
  assert.equal(after.B.executions, before.B.executions+1);
  assert.equal(fallback.request.body.session.body.sessionId, first.request.body.session.body.sessionId);
  assert.ok(suite.ledger.events.some(event => event.type==='session.migrating' && event.detail.to==='B'));
  ledgerIsDurable(suite);
});

test('degraded: killing relay B causes authenticated direct A-C execution without authority or evidence loss', timeout, async t => {
  const suite = await fixture(t, {timeoutMs:700});
  const first = await suite.use('正常路径');
  const child = suite.nodes.get('B');
  const pid = child.info.pid;
  await child.kill();
  assert.equal(child.child.connected, false);
  assert.throws(() => process.kill(pid, 0));
  const fallback = await suite.use('节点死亡后');
  counted(fallback, '节点死亡后', ['A','C']);
  assert.equal(fallback.level, 'Reduced');
  assert.equal(fallback.request.body.session.body.sessionId, first.request.body.session.body.sessionId);
  assert.equal(fallback.receipt.body.leaseRoot, first.receipt.body.leaseRoot);
  const stats = statsByNode(await suite.stats());
  assert.equal(stats.B, undefined);
  assert.equal(stats.C.executions, 2);
  assert.ok(stats.A.metrics.sentBytes > 0 && stats.C.metrics.receivedFrames > 0);
  assert.ok(suite.ledger.events.some(event => event.type==='attempt.failed'));
  ledgerIsDurable(suite);
});

test('partition: actual links blocked on both sides preserve local isolated capability without remote execution', timeout, async t => {
  const suite = await fixture(t);
  const first = await suite.use('分区前');
  suite.routes.set('A','B',{up:false});
  suite.routes.set('A','C',{up:false});
  await suite.nodes.get('A').call('fault', {blocked:['B','C']});
  await suite.nodes.get('B').call('fault', {blocked:['A']});
  await suite.nodes.get('C').call('fault', {blocked:['A']});
  const before = statsByNode(await suite.stats());
  const isolated = await suite.use('本地仍可用🌏');
  counted(isolated, '本地仍可用🌏', ['A']);
  assert.equal(isolated.level, 'Isolated');
  assert.equal(isolated.request.body.session.body.sessionId, first.request.body.session.body.sessionId);
  assert.equal(isolated.receipt.body.leaseRoot, first.receipt.body.leaseRoot);
  const after = statsByNode(await suite.stats());
  assert.equal(after.A.executions, before.A.executions+1);
  assert.equal(after.B.executions, before.B.executions);
  assert.equal(after.C.executions, before.C.executions);
  for (const node of ['A','B','C']) assert.equal(after[node].metrics.sentBytes, before[node].metrics.sentBytes, 'partition must prevent new remote traffic');
  ledgerIsDurable(suite);
});

test('degraded: a real link failure with B still alive reroutes socket traffic over A-C', timeout, async t => {
  const suite = await fixture(t);
  await suite.nodes.get('A').call('fault',{blocked:['B']});
  await suite.nodes.get('B').call('fault',{blocked:['A']});
  const result = await suite.use('链路故障');
  counted(result,'链路故障',['A','C']);
  assert.equal(result.level,'Reduced');
  assert.doesNotThrow(() => process.kill(suite.nodes.get('B').info.pid,0));
  const stats=statsByNode(await suite.stats());
  assert.equal(stats.B.executions,0);
  assert.equal(stats.B.metrics.sentFrames,0);
  assert.equal(stats.C.executions,1);
  assert.ok(stats.A.metrics.sentFrames>=2 && stats.C.metrics.receivedFrames>=2);
  assert.ok(suite.ledger.events.some(event=>event.type==='attempt.failed' && event.detail.code==='LINK_UNAVAILABLE'));
  ledgerIsDurable(suite);
});

test('survival: every provider disappears; no execution is fabricated and identity/session/durable prefix survive', timeout, async t => {
  const suite = await fixture(t);
  const first = await suite.use('保留证据');
  const session = structuredClone(suite.session);
  const prefix = structuredClone(suite.ledger.events);
  const before = statsByNode(await suite.stats());
  await Promise.all([...suite.nodes.values()].map(node => node.call('provider',{enabled:false})));
  const result = await suite.use('等待能力恢复');
  assert.equal(result.status,'deferred');
  assert.equal(result.level,'Survival');
  assert.equal(result.reason,'NO_AUTHORIZED_PROVIDER');
  assert.equal(result.result, undefined);
  assert.equal(result.receipt, undefined);
  assert.equal(result.subjectId, SUBJECT);
  assert.equal(result.continuityRoot, CONTINUITY);
  assert.deepEqual(suite.session, session);
  assert.deepEqual(suite.ledger.events.slice(0,prefix.length), prefix);
  assert.equal(result.evidenceRoot, suite.ledger.root);
  const after = statsByNode(await suite.stats());
  for (const node of ['A','B','C']) assert.equal(after[node].executions,before[node].executions);
  assert.equal(first.receipt.body.leaseRoot,suite.lease.root);
  const events = ledgerIsDurable(suite);
  assert.equal(events.filter(event => event.type==='execution.verified').length,1);
});

test('commercial: source migration A to B preserves subject, session, authority and a verifiable durable evidence chain', timeout, async t => {
  const suite = await fixture(t, {transport:'tcp'});
  const first = await suite.use('设备一');
  const previousSessionRoot = suite.session.root;
  const prefix = structuredClone(suite.ledger.events);
  const before = statsByNode(await suite.stats());
  await suite.migrateSource('B');
  const second = await suite.use('设备二🌏');
  counted(second,'设备二🌏',['B','C']);
  assert.equal(second.request.body.session.body.sourceNodeId,'B');
  assert.equal(second.request.body.session.body.sessionId,first.request.body.session.body.sessionId);
  assert.equal(second.request.body.session.body.previousSessionRoot,previousSessionRoot);
  assert.equal(second.receipt.body.leaseRoot,first.receipt.body.leaseRoot);
  assert.deepEqual(suite.ledger.events.slice(0,prefix.length),prefix);
  const after = statsByNode(await suite.stats());
  assert.equal(after.A.metrics.sentBytes,before.A.metrics.sentBytes,'old source must not transmit after source migration');
  assert.ok(after.B.metrics.sentBytes>before.B.metrics.sentBytes);
  assert.equal(after.C.executions,before.C.executions+1);
  const events = ledgerIsDurable(suite);
  assert.ok(events.some(event => event.type==='subject.body-migrated' && event.detail.previousNodeId==='A' && event.detail.newNodeId==='B'));
});

test('commercial: protocol downgrade is negotiated and an unsupported provider version fails over without invoking it', timeout, async t => {
  const suite = await fixture(t);
  await suite.nodes.get('C').call('version',['0.1.0']);
  const compatible = await suite.use('旧协议');
  counted(compatible,'旧协议',['A','B','C']);
  assert.equal(compatible.receipt.body.version,'0.1.0');
  await suite.nodes.get('C').call('version',['99.0.0']);
  const after = await suite.use('版本不兼容');
  counted(after,'版本不兼容',['A','B']);
  assert.equal(after.level,'Essential');
  const stats = statsByNode(await suite.stats());
  assert.equal(stats.C.executions,1);
  assert.equal(stats.B.executions,1);
  assert.ok(suite.ledger.events.some(event => event.type==='attempt.failed' && event.detail.code==='PROTOCOL_VERSION_UNSUPPORTED'));
  ledgerIsDurable(suite);
});

test('degraded: actual socket send throttling delays bytes while the same guarded operation still executes', timeout, async t => {
  const suite = await fixture(t, {transport:'udp',timeoutMs:10000});
  const bytesPerSecond=16000;
  suite.routes.set('A','B',{bandwidth:bytesPerSecond});
  suite.routes.set('B','C',{bandwidth:bytesPerSecond});
  await Promise.all([...suite.nodes.values()].map(node => node.call('fault',{bandwidth:bytesPerSecond})));
  // Direct wire timing excludes the Python OPP negotiation and RCL compiler costs.
  // Otherwise their baseline latency could falsely satisfy a nominal delay check.
  const probeBefore=statsByNode(await suite.stats());
  const probeStart=performance.now();
  const advertisement=await suite.wire('C','DISCOVER',{capabilityId:CAPABILITY.capabilityId});
  const probeElapsedMs=performance.now()-probeStart;
  assert.equal(advertisement.body.nodeId,'C');
  const probeAfter=statsByNode(await suite.stats());
  const probeBytes=Object.keys(probeAfter).reduce((sum,node)=>sum+probeAfter[node].metrics.sentBytes-probeBefore[node].metrics.sentBytes,0);
  const probeNominalMs=probeBytes*1000/bytesPerSecond;
  assert.ok(probeNominalMs>100,'wire-only probe must incur a meaningful throttle interval');
  assert.ok(probeElapsedMs>=probeNominalMs*0.75,`wire-only throttling missing: ${probeElapsedMs} ms vs ${probeNominalMs} ms`);
  const before = statsByNode(await suite.stats());
  const start=performance.now();
  const result=await suite.use('受限链路🌏'.repeat(12));
  const elapsedMs=performance.now()-start;
  counted(result,'受限链路🌏'.repeat(12),['A','B','C']);
  assert.equal(result.level,'Reduced');
  const after=statsByNode(await suite.stats());
  const sentBytes=Object.keys(after).reduce((sum,node)=>sum+after[node].metrics.sentBytes-before[node].metrics.sentBytes,0);
  assert.ok(sentBytes>10000,'the test must move substantial signed discovery/request/receipt bytes');
  assert.ok(after.B.metrics.sentFrames-before.B.metrics.sentFrames>=4,'both hops must actually transfer');
  assert.equal(after.C.executions,1);
  const nominalDelayMs=sentBytes*1000/bytesPerSecond;
  assert.ok(elapsedMs>=nominalDelayMs*0.75,`actual transfer ${sentBytes} bytes should incur delay: observed ${elapsedMs.toFixed(1)} ms, nominal ${nominalDelayMs.toFixed(1)} ms`);
  assert.ok(elapsedMs>=100,'changing route metadata alone cannot satisfy this check');
  t.diagnostic(JSON.stringify({profile:'actual-throttled-local-udp',sentBytes,bytesPerSecond,elapsedMs,nominalDelayMs,probeBytes,probeElapsedMs,probeNominalMs}));
  ledgerIsDurable(suite);
});
