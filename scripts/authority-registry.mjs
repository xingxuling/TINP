import fs from 'node:fs';
import { keyringFromAuthorityRegistry, verifyAuthorityRegistry } from '../src/authority-registry.mjs';
import { verifyAuthorityRegistryDistribution } from '../src/authority-registry-distribution.mjs';
import { verifyAuthorityRegistryConvergence } from '../src/authority-registry-convergence.mjs';
import { AuthorityRegistryConvergenceStore } from '../src/authority-registry-convergence-store.mjs';
import { authorityRegistryConvergenceWitnessBodyForStore, validateAuthorityRegistryConvergenceWitness,
  verifyAuthorityRegistryConvergenceWitness } from '../src/authority-registry-convergence-witness.mjs';
import { requireThat } from '../src/identity.mjs';

const [action, registryFile, ...args] = process.argv.slice(2);
const allowed = {
  verify: ['policy', 'issuer-keyring', 'previous', 'now-ms'],
  keyring: ['policy', 'issuer-keyring', 'member-keyring', 'role', 'previous', 'now-ms'],
  'distribution-verify': ['policy', 'issuer-keyring', 'distribution-policy', 'mirror-keyring', 'previous', 'now-ms'],
  'convergence-verify': ['policy', 'issuer-keyring', 'distribution-policy', 'mirror-keyring', 'now-ms'],
  'convergence-store-verify': ['policy', 'issuer-keyring', 'distribution-policy', 'mirror-keyring', 'now-ms'],
  'convergence-store-append': ['policy', 'issuer-keyring', 'distribution-policy', 'mirror-keyring', 'store', 'now-ms'],
  'convergence-witness-request': ['policy', 'previous-witness', 'sequence', 'now-ms'],
  'convergence-witness-verify': ['policy', 'witness-keyring', 'store', 'registry-policy', 'issuer-keyring', 'distribution-policy', 'mirror-keyring', 'saved-witness', 'now-ms'],
};
try {
  requireThat(Object.hasOwn(allowed, action) && registryFile, 'AUTHORITY_REGISTRY_COMMAND_INVALID');
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    requireThat(argument.startsWith('--'), 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const flag = argument.slice(2);
    requireThat(allowed[action].includes(flag) && !Object.hasOwn(options, flag), 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    {
      requireThat(args[index + 1] && !args[index + 1].startsWith('--'), 'AUTHORITY_REGISTRY_COMMAND_INVALID');
      options[flag] = args[++index];
    }
  }
  requireThat(options.policy && (action === 'convergence-witness-request' || options['issuer-keyring']), 'AUTHORITY_REGISTRY_COMMAND_INVALID');
  if (action === 'keyring') requireThat(options['member-keyring'] && options.role, 'AUTHORITY_REGISTRY_COMMAND_INVALID');
  const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const nowMs = options['now-ms'] === undefined ? Date.now() : Number(options['now-ms']);
  requireThat(Number.isSafeInteger(nowMs) && nowMs >= 0 && (options['now-ms'] === undefined || /^[0-9]+$/.test(options['now-ms'])), 'AUTHORITY_REGISTRY_COMMAND_INVALID');
  const policy = readJson(options.policy), registryInput = readJson(registryFile), issuerKeyring = options['issuer-keyring'] ? readJson(options['issuer-keyring']) : undefined;
  const previousRegistry = options.previous ? readJson(options.previous) : undefined;
  if (action === 'convergence-witness-request') {
    const store = new AuthorityRegistryConvergenceStore(registryFile);
    const state = store.load();
    const sequence = options.sequence === undefined ? state.lastSequence : Number(options.sequence);
    requireThat(Number.isSafeInteger(sequence) && sequence > 0
      && (options.sequence === undefined || /^[0-9]+$/.test(options.sequence)), 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const previousWitness = options['previous-witness'] ? readJson(options['previous-witness']) : null;
    requireThat((sequence === 1 && previousWitness === null) || (sequence > 1 && previousWitness !== null),
      'AUTHORITY_REGISTRY_COMMAND_INVALID');
    if (previousWitness) validateAuthorityRegistryConvergenceWitness(previousWitness);
    const body = authorityRegistryConvergenceWitnessBodyForStore({ policy, sequence,
      previousWitnessRoot: previousWitness?.root, state, issuedAtMs: nowMs });
    console.log(JSON.stringify({ status: 'request', body, storeFile: store.file,
      signing: '将 body 交给独立 convergence witness；运行端不生成或保存见证私钥。',
      boundary: '请求只读；外部签署仍是调用方流程，不构成在线透明日志或可信时间。' }, null, 2));
    process.exitCode = 0;
  } else if (action === 'convergence-witness-verify') {
    requireThat(options['witness-keyring'] && options.store && options['registry-policy']
      && options['distribution-policy'] && options['mirror-keyring'], 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const store = new AuthorityRegistryConvergenceStore(options.store);
    const verification = verifyAuthorityRegistryConvergenceWitness({ policy, witness: registryInput,
      keyring: readJson(options['witness-keyring']), savedWitness: options['saved-witness'] ? readJson(options['saved-witness']) : null,
      state: store.load(), distributionPolicy: readJson(options['distribution-policy']),
      registryPolicy: readJson(options['registry-policy']), issuerKeyring,
      mirrorKeyring: readJson(options['mirror-keyring']), nowMs });
    console.log(JSON.stringify({ status: 'verified', verification, witnessFile: registryFile, storeFile: store.file,
      timeSource: 'caller-supplied local nowMs; no trusted clock',
      boundary: '外部签名只绑定本机提供的完整 store 状态；未连接在线透明日志、可信时钟或跨主机共识。' }, null, 2));
    process.exitCode = 0;
  } else if (action === 'convergence-store-append') {
    requireThat(options['distribution-policy'] && options['mirror-keyring'] && options.store, 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const distributionPolicy = readJson(options['distribution-policy']);
    const mirrorKeyring = readJson(options['mirror-keyring']);
    const store = new AuthorityRegistryConvergenceStore(options.store);
    const result = await store.append({ convergenceBundle: registryInput, distributionPolicy,
      registryPolicy: policy, issuerKeyring, mirrorKeyring, nowMs });
    console.log(JSON.stringify({ status: 'stored', operation: result.status,
      appendedBundles: result.appendedBundles, storeFile: result.file, verification: result.verification,
      writeBoundary: '显式本机 append 才会原子写入；未连接在线透明日志、可信时钟或跨主机持久共识。' }, null, 2));
    process.exitCode = 0;
  } else if (action === 'convergence-store-verify') {
    requireThat(options['distribution-policy'] && options['mirror-keyring'], 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const distributionPolicy = readJson(options['distribution-policy']);
    const mirrorKeyring = readJson(options['mirror-keyring']);
    const store = new AuthorityRegistryConvergenceStore(registryFile);
    const verification = store.verify({ distributionPolicy, registryPolicy: policy,
      issuerKeyring, mirrorKeyring, nowMs });
    console.log(JSON.stringify({ status: 'verified', verification, storeFile: store.file,
      timeSource: 'caller-supplied local nowMs; no trusted clock',
      说明: '已验证本机收敛历史 store 的签名链、连续性和当前最新快照；store 不是在线透明日志或跨主机共识。' }, null, 2));
    process.exitCode = 0;
  } else if (action === 'convergence-verify') {
    requireThat(options['distribution-policy'] && options['mirror-keyring'], 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const distributionPolicy = readJson(options['distribution-policy']);
    const mirrorKeyring = readJson(options['mirror-keyring']);
    const verification = verifyAuthorityRegistryConvergence({ distributionPolicy, convergenceBundle: registryInput,
      registryPolicy: policy, issuerKeyring, mirrorKeyring, nowMs });
    console.log(JSON.stringify({ status: 'verified', verification, historyFile: registryFile,
      timeSource: 'caller-supplied local nowMs; no trusted clock',
      说明: '已验证连续 registry 历史、每段 mirror quorum 和稳定镜像集合；未连接在线透明日志、可信时钟或跨主机持久存储。' }, null, 2));
    process.exitCode = 0;
  } else if (action === 'distribution-verify') {
    requireThat(options['distribution-policy'] && options['mirror-keyring'], 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const distributionPolicy = readJson(options['distribution-policy']);
    const mirrorKeyring = readJson(options['mirror-keyring']);
    const verification = verifyAuthorityRegistryDistribution({ distributionPolicy, bundle: registryInput,
      registryPolicy: policy, issuerKeyring, previousRegistry, mirrorKeyring, nowMs });
    console.log(JSON.stringify({ status: 'verified', verification, bundleFile: registryFile,
      previousRegistry: Boolean(previousRegistry), timeSource: 'caller-supplied local nowMs; no trusted clock',
      说明: '已验证 registry issuer 与多镜像签名收敛到同一 root；未连接在线发布服务、可信时钟或跨设备存储。' }, null, 2));
    process.exitCode = 0;
  } else {
    const verification = verifyAuthorityRegistry({ policy, registry: registryInput, issuerKeyring, previousRegistry, nowMs });
    const result = { status: 'verified', verification, registryFile, previousRegistry: Boolean(previousRegistry), timeSource: 'caller-supplied local nowMs; no trusted clock' };
    if (action === 'keyring') {
      const registry = registryInput;
    const memberKeyring = readJson(options['member-keyring']);
    result.role = options.role;
    result.keyring = keyringFromAuthorityRegistry({ registry, memberKeyring, role: options.role, nowMs, includeRevoked: true });
    result.说明 = '已验证签名注册表并按角色解析调用方提供的成员公钥；注册表不保存私钥，也不自动发布或收敛。';
    } else result.说明 = '已验证独立 issuer 签署的注册表快照；未创建权限或写入运行状态。';
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'blocked', code: error.code ?? 'AUTHORITY_REGISTRY_COMMAND_FAILED', 说明: '注册表验证失败不会更换 key、写入运行状态或自动发布新快照。' }, null, 2));
  process.exitCode = 2;
}
