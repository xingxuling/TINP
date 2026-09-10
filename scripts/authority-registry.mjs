import fs from 'node:fs';
import { keyringFromAuthorityRegistry, verifyAuthorityRegistry } from '../src/authority-registry.mjs';
import { verifyAuthorityRegistryDistribution } from '../src/authority-registry-distribution.mjs';
import { requireThat } from '../src/identity.mjs';

const [action, registryFile, ...args] = process.argv.slice(2);
const allowed = {
  verify: ['policy', 'issuer-keyring', 'previous', 'now-ms'],
  keyring: ['policy', 'issuer-keyring', 'member-keyring', 'role', 'previous', 'now-ms'],
  'distribution-verify': ['policy', 'issuer-keyring', 'distribution-policy', 'mirror-keyring', 'previous', 'now-ms'],
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
  requireThat(options.policy && options['issuer-keyring'], 'AUTHORITY_REGISTRY_COMMAND_INVALID');
  if (action === 'keyring') requireThat(options['member-keyring'] && options.role, 'AUTHORITY_REGISTRY_COMMAND_INVALID');
  const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const nowMs = options['now-ms'] === undefined ? Date.now() : Number(options['now-ms']);
  requireThat(Number.isSafeInteger(nowMs) && nowMs >= 0 && (options['now-ms'] === undefined || /^[0-9]+$/.test(options['now-ms'])), 'AUTHORITY_REGISTRY_COMMAND_INVALID');
  const policy = readJson(options.policy), registryInput = readJson(registryFile), issuerKeyring = readJson(options['issuer-keyring']);
  const previousRegistry = options.previous ? readJson(options.previous) : undefined;
  if (action === 'distribution-verify') {
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
