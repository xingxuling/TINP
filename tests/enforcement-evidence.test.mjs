import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {InternetSuite} from '../src/suite.mjs';
import {clone, seal} from '../src/identity.mjs';

// 复用真实节点、传输和 RCL 准入规则，不模拟授权结果。
async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tinp-enforcement-'));
  let suite;
  t.after(async () => {
    if (suite) await suite.close();
    fs.rmSync(directory, {recursive: true, force: true});
  });
  suite = await InternetSuite.start({directory, transport: 'tcp', timeoutMs: 2500});
  return suite;
}

async function executionState(suite) {
  return (await suite.stats()).map(({nodeId, executions, cacheEntries}) =>
    ({nodeId, executions, cacheEntries})).sort((a, b) => a.nodeId.localeCompare(b.nodeId));
}

const options = {timeout: 60000};

test('执行前：直接送达主节点和备用节点的非法请求均不增加执行次数或回执缓存', options, async t => {
  const suite = await fixture(t);
  for (const target of ['C', 'B']) {
    const selection = await suite.discover(target);
    const good = await suite.buildRequest('权限测试', selection);
    const cases = [
      ['缺少租约', 'AUTHORITY_REQUIRED', q => { delete q.lease; }],
      ['请求未获授权的能力范围', 'RCL_GUARD_DENIED', q => { q.authorityScope = 'file.write'; }],
      ['会话扩大权限', 'AUTHORITY_EXPANSION', q => {
        q.session.body.scopes.push('file.write');
        q.session = seal(q.session.body, suite.authority.privateKey);
      }],
    ];
    for (const [name, code, mutate] of cases) {
      const before = await executionState(suite);
      const body = clone(good.body);
      mutate(body);
      // 绕过 suite.use() 的调用端预检，直接经过传输送到执行端。
      const request = seal(body, suite.subjectIdentity.privateKey);
      await assert.rejects(suite.wire(target, 'INTENT', request, selection.route), e => e.code === code);
      assert.deepEqual(await executionState(suite), before, `${target}: ${name}`);
      t.diagnostic(`${target}: ${name} -> ${code}; execution/cache delta = 0`);
    }
    // 正向对照：同一节点仍能执行合法请求，排除“全部拒绝”的假通过。
    const receipt = await suite.wire(target, 'INTENT', good, selection.route);
    assert.equal(suite.verifyReceipt(receipt, good).result.count, 4);
  }
});

test('执行前：请求已生成但权限随后撤销，执行端仍拒绝且不产生业务执行', options, async t => {
  const suite = await fixture(t);
  const selection = await suite.discover('C');
  const request = await suite.buildRequest('撤销前已准备', selection);
  await suite.revoke();
  const before = await executionState(suite);
  await assert.rejects(suite.wire('C', 'INTENT', request, selection.route), e => e.code === 'RCL_GUARD_DENIED');
  assert.deepEqual(await executionState(suite), before);
  assert.ok(before.every(row => row.executions === 0 && row.cacheEntries === 0));
});

test('执行前：已缓存的请求也不能绕过当前撤销检查', options, async t => {
  const suite = await fixture(t);
  const selection = await suite.discover('C');
  const request = await suite.buildRequest('已有回执', selection);
  const receipt = await suite.wire('C', 'INTENT', request, selection.route);
  assert.equal(suite.verifyReceipt(receipt, request).result.count, 4);
  await suite.revoke();
  const before = await executionState(suite);
  await assert.rejects(suite.wire('C', 'INTENT', request, selection.route), e => e.code === 'RCL_GUARD_DENIED');
  assert.deepEqual(await executionState(suite), before);
  assert.equal(before.find(row => row.nodeId === 'C').executions, 1);
});

test('执行后：篡改回执被拒收；校验不撤销已发生的执行，也不再次调用节点', options, async t => {
  const suite = await fixture(t);
  const selection = await suite.discover('C');
  const request = await suite.buildRequest('回执测试', selection);
  const receipt = await suite.wire('C', 'INTENT', request, selection.route);
  const before = await executionState(suite);
  assert.equal(before.find(row => row.nodeId === 'C').executions, 1);
  const eventsBefore = suite.ledger.events.length;
  const altered = clone(receipt);
  altered.body.result.count = 999;
  assert.throws(() => suite.verifyReceipt(altered, request), e => e.code === 'RECEIPT_SIGNATURE_INVALID');
  assert.deepEqual(await executionState(suite), before);
  assert.equal(suite.ledger.events.length, eventsBefore);
  assert.equal(suite.verifyReceipt(receipt, request).result.count, 4);
});
