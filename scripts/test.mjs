import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const requirements = path.join(root, 'adapters', 'requirements.txt');
const venv = path.join(root, '.tinp-python');
const managedPython = process.platform === 'win32'
  ? path.join(venv, 'Scripts', 'python.exe')
  : path.join(venv, 'bin', 'python');
const bootstrapPython = process.env.TINP_BOOTSTRAP_PYTHON || 'python';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function hasJsonschema(python) {
  const result = spawnSync(python, ['-X', 'utf8', '-c',
    "import jsonschema; from importlib.metadata import version; print(version('jsonschema'))"],
    { cwd: root, stdio: 'ignore' });
  return !result.error && result.status === 0;
}

let python = process.env.NEXT_INTERNET_PYTHON;
if (python) {
  if (!hasJsonschema(python)) {
    console.error('TINP_PYTHON_DEPENDENCY_MISSING: NEXT_INTERNET_PYTHON cannot import jsonschema.');
    console.error('Install adapters/requirements.txt into that interpreter or unset NEXT_INTERNET_PYTHON.');
    process.exit(2);
  }
} else {
  python = managedPython;
  if (!fs.existsSync(python)) {
    console.error('[TINP] creating project-local Python environment: .tinp-python');
    run(bootstrapPython, ['-m', 'venv', venv]);
  }
  if (!hasJsonschema(python)) {
    console.error('[TINP] installing declared Python adapter requirements into .tinp-python');
    run(python, ['-m', 'pip', 'install', '-r', requirements]);
  }
}

if (process.argv.includes('--bootstrap-only')) {
  console.log(python);
  process.exit(0);
}

const collect = directory => fs.readdirSync(directory)
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => path.join(directory, name));
const tests = [
  ...collect(path.join(root, 'tests')),
  ...collect(path.join(root, 'vendor', 'tinp', 'tests')),
];

const result = spawnSync(process.execPath,
  ['--test', '--test-concurrency=1', ...tests], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NEXT_INTERNET_PYTHON: python },
  });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
