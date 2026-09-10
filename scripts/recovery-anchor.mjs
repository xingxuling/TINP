import fs from 'node:fs';
import { InternetSuite } from '../src/suite.mjs';
import { inspectPending } from '../src/pending-management.mjs';
import { requireThat } from '../src/identity.mjs';
import { keyringFromAuthorityRegistry, verifyAuthorityRegistry } from '../src/authority-registry.mjs';

const [action, directory, ...args] = process.argv.slice(2);
let suite;
try {
  const allowed = {
    status: ['keyring', 'anchor', 'registry', 'registry-policy', 'registry-issuer-keyring', 'registry-previous', 'registry-now-ms'],
    request: ['keyring', 'anchor', 'registry', 'registry-policy', 'registry-issuer-keyring', 'registry-previous', 'registry-now-ms'],
    pin: ['signer-id', 'public-key', 'configuration-root', 'confirm-pin-anchor', 'keyring'],
    accept: ['keyring', 'anchor', 'transport', 'registry', 'registry-policy', 'registry-issuer-keyring', 'registry-previous', 'registry-now-ms'],
  };
  requireThat(Object.hasOwn(allowed, action) && directory, 'RECOVERY_ANCHOR_COMMAND_INVALID');
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i].slice(2);
    requireThat(args[i].startsWith('--') && allowed[action].includes(flag) && !Object.hasOwn(options, flag), 'RECOVERY_ANCHOR_COMMAND_INVALID');
    if (flag.startsWith('confirm-')) options[flag] = true;
    else { requireThat(args[i + 1] && !args[i + 1].startsWith('--'), 'RECOVERY_ANCHOR_COMMAND_INVALID'); options[flag] = args[++i]; }
  }
  requireThat(['udp', 'tcp'].includes(options.transport ?? 'udp'), 'RECOVERY_ANCHOR_COMMAND_INVALID');
  const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  let recoveryAnchorKeyring = options.keyring ? readJson(options.keyring) : undefined;
  let registryVerification;
  const registryFlags = ['registry', 'registry-policy', 'registry-issuer-keyring', 'registry-previous', 'registry-now-ms'];
  if (registryFlags.some(flag => Object.hasOwn(options, flag))) {
    requireThat(options.registry && options['registry-policy'] && options['registry-issuer-keyring'] && options.keyring,
      'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const nowMs = options['registry-now-ms'] === undefined ? Date.now() : Number(options['registry-now-ms']);
    requireThat(Number.isSafeInteger(nowMs) && nowMs >= 0 && (options['registry-now-ms'] === undefined || /^[0-9]+$/.test(options['registry-now-ms'])), 'AUTHORITY_REGISTRY_COMMAND_INVALID');
    const registry = readJson(options.registry);
    registryVerification = verifyAuthorityRegistry({
      policy: readJson(options['registry-policy']), registry, issuerKeyring: readJson(options['registry-issuer-keyring']),
      previousRegistry: options['registry-previous'] ? readJson(options['registry-previous']) : undefined, nowMs,
    });
    recoveryAnchorKeyring = keyringFromAuthorityRegistry({ registry, memberKeyring: recoveryAnchorKeyring, role: 'recovery-witness', nowMs });
  }
  const recoveryAnchor = options.anchor ? readJson(options.anchor) : undefined;
  if (action === 'status' || action === 'request') {
    const view = await inspectPending(directory, { recoveryAnchorKeyring, recoveryAnchor });
    if (action === 'request') requireThat(view.recoveryAnchorRequest, 'RECOVERY_ANCHOR_POLICY_REQUIRED');
    console.log(JSON.stringify(action === 'request' ? {
      说明: '将此未签署请求交给独立恢复见证方。运行端不会生成外部签名或保存见证私钥。',
      request: view.recoveryAnchorRequest, registryVerification,
      signing: '使用外部见证私钥对 request.body 调用 TINP seal；将返回的 {body,root,signature} 保存为 anchor 文件。',
    } : { 说明: '只读摘要；不输出请求原文或密钥。', ...view, registryVerification }, null, 2));
  } else {
    requireThat(action === 'pin' ? options['confirm-pin-anchor'] && options['signer-id'] && options['public-key'] : options.keyring && options.anchor, 'RECOVERY_ANCHOR_COMMAND_CONFIRMATION_REQUIRED');
    suite = await InternetSuite.start({ directory, durable: true, recoveryMode: 'maintenance', recoveryAnchorKeyring, recoveryAnchor, transport: options.transport ?? 'udp' });
    if (action === 'pin') {
      const policy = await suite.pinRecoveryAnchor({ signerId: options['signer-id'], publicKeyPem: fs.readFileSync(options['public-key'], 'utf8'), configurationRoot: options['configuration-root'] ?? null, confirmed: true });
      console.log(JSON.stringify({ 说明: '已固定外部恢复见证公钥指纹；这是本机信任引导，不是生产注册。', policy }, null, 2));
    } else {
      const verification = await suite.adoptRecoveryAnchor(recoveryAnchor, { requireCurrent: false });
      console.log(JSON.stringify({ 说明: '已导入外部单调恢复锚点；本次按已验证账本前缀接纳，未创建新权限。', status: 'anchored', verification, registryVerification }, null, 2));
    }
  }
} catch (error) {
  console.error(JSON.stringify({ status: 'blocked', code: error.code ?? 'RECOVERY_ANCHOR_COMMAND_FAILED', 说明: '失败不会清除状态或自动更换见证密钥。' }, null, 2));
  process.exitCode = 2;
} finally { await suite?.close(); }
