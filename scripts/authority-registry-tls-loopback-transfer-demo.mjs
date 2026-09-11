import { spawnSync } from 'node:child_process';

const result = spawnSync(process.execPath, ['scripts/authority-registry-loopback-transfer-demo.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, TINP_LOOPBACK_TRANSPORT: 'tls' },
  encoding: 'utf8',
  windowsHide: true,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status ?? 1);
