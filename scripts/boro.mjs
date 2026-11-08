#!/usr/bin/env node
/**
 * Borobiya automation entrypoint. One small CLI owns every repeatable command.
 * No shell-specific logic, no duplicated package scripts, no external process manager.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_MAJOR = Number(process.versions.node.split('.')[0]);
const NODE_MINOR = Number(process.versions.node.split('.')[1]);

function envFile() {
  const result = { ...process.env };
  const file = path.join(ROOT, '.env');
  if (!existsSync(file)) return result;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in result)) result[key] = value;
  }
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: options.capture ? 'pipe' : 'inherit',
    env: options.env ?? envFile(),
    encoding: options.capture ? 'utf8' : undefined
  });
  if (result.status !== 0) {
    if (options.capture) console.error(result.stdout, result.stderr);
    process.exit(result.status ?? 1);
  }
  return result.stdout ?? '';
}

function step(label, command, args, options) {
  console.log(`\n[boro] ${label}`);
  return run(command, args, options);
}

function assets() { step('generate design assets', process.execPath, ['scripts/build-assets.mjs']); }

function doctor() {
  console.log('[boro] diagnostics');
  const checks = [
    ['Node.js >= 22.12', NODE_MAJOR > 22 || (NODE_MAJOR === 22 && NODE_MINOR >= 12)],
    ['native TypeScript transform mode', NODE_MAJOR >= 22],
    ['canonical design images', existsSync(path.join(ROOT, 'design/map-page/navigation/01-map-idle.png'))],
    ['shared protocol', existsSync(path.join(ROOT, 'public/js/protocol.js'))],
    ['generated icon CSS', existsSync(path.join(ROOT, 'public/assets/icons.css'))],
    ['cache manifest', existsSync(path.join(ROOT, 'public/assets/cache-manifest.json'))],
    ['new test suite', existsSync(path.join(ROOT, 'tests/journeys.test.ts'))],
    ['legacy packages removed', !existsSync(path.join(ROOT, 'packages'))]
  ];
  for (const [name, passed] of checks) console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}`);
  const sqlite = spawnSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', "import('node:sqlite').then(()=>process.exit(0)).catch(()=>process.exit(1))"], { stdio: 'ignore' });
  console.log(`${sqlite.status === 0 ? 'ok  ' : 'FAIL'} node:sqlite available`);
  if (checks.some(([, passed]) => !passed) || sqlite.status !== 0) process.exit(1);
}

function setup() {
  if (NODE_MAJOR < 22 || (NODE_MAJOR === 22 && NODE_MINOR < 12)) {
    console.error('Node.js 22.12 or newer is required.');
    process.exit(1);
  }
  if (!existsSync(path.join(ROOT, 'node_modules'))) step('install development tools', 'npm', ['install']);
  if (!existsSync(path.join(ROOT, '.env'))) {
    copyFileSync(path.join(ROOT, '.env.example'), path.join(ROOT, '.env'));
    console.log('[boro] created .env from .env.example');
  }
  mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  assets();
  step('prepare local database', process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', 'src/index.ts', '--seed-only']);
  console.log('\n[boro] setup complete. Run: ./boro dev');
}

function dev() {
  assets();
  const child = spawn(process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', '--watch', 'src/index.ts'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...envFile(), NODE_ENV: envFile().NODE_ENV || 'development', HOST: envFile().HOST || '0.0.0.0' }
  });
  const stop = () => { if (!child.killed) child.kill('SIGTERM'); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  child.on('exit', (code) => process.exit(code ?? 0));
}

function check() {
  assets();
  step('server and test typecheck', 'npm', ['run', 'typecheck']);
  step('browser source check', 'npm', ['run', 'typecheck:client']);
  step('documentation and clean-rebuild guards', process.execPath, ['scripts/check-docs.mjs']);
  step('full new test suite', 'npm', ['test']);
}

function deployCheck() {
  const env = envFile();
  const failures = [];
  if (env.NODE_ENV !== 'production') failures.push('NODE_ENV must be production');
  if (env.COOKIE_SECURE !== '1' && env.NODE_ENV === 'production') failures.push('COOKIE_SECURE must be 1 behind HTTPS');
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD === 'change-me-before-production') failures.push('set a unique ADMIN_PASSWORD');
  if (!env.ALLOWED_ORIGINS) failures.push('set ALLOWED_ORIGINS to the exact HTTPS origins');
  if (!existsSync(path.join(ROOT, 'public/assets/cache-manifest.json'))) failures.push('run npm run assets');
  for (const message of failures) console.error(`FAIL ${message}`);
  if (failures.length) process.exit(1);
  console.log('deploy:check: production configuration is ready');
}

function dbReset() {
  const env = envFile();
  const configured = path.resolve(ROOT, env.DATA_DIR || './data');
  const resolved = path.resolve(configured);
  if (!resolved.startsWith(`${ROOT}${path.sep}`) || resolved === ROOT) {
    console.error(`Refusing to remove unsafe DATA_DIR: ${resolved}`);
    process.exit(1);
  }
  rmSync(resolved, { recursive: true, force: true });
  mkdirSync(resolved, { recursive: true });
  writeFileSync(path.join(resolved, '.gitkeep'), '');
  console.log(`[boro] reset ${path.relative(ROOT, resolved)}`);
  step('seed local database', process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', 'src/index.ts', '--seed-only']);
}

function clean() {
  for (const name of ['coverage', 'dist']) rmSync(path.join(ROOT, name), { recursive: true, force: true });
  console.log('[boro] removed coverage/ and dist/');
}

function help() {
  console.log(`Borobiya automation

Usage: ./boro <command>

  setup          install tools, create .env, build assets, seed the database
  dev            build browser assets and start the watched server on 0.0.0.0
  doctor         verify runtime and repository prerequisites
  check          typecheck, client check, docs guard, full test suite
  verify         doctor + check
  bench          measure pure work, HTTP reads and realtime fan-out
  acceptance     verify the closed acceptance checklist and release evidence
  deploy:check   validate production environment and generated assets
  db:seed        create/refresh the local database without starting a server
  db:reset       safely remove local data and seed a fresh database
  clean          remove test/build output
  help           show this list
`);
}

function bench() {
  step('release benchmark', process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', 'scripts/bench.mjs']);
}

function acceptance() {
  step('release acceptance evidence', process.execPath, ['scripts/acceptance.mjs']);
}

const commands = {
  setup, dev, doctor, check, bench, acceptance,
  verify() { doctor(); check(); },
  'deploy:check': deployCheck,
  'db:seed': () => step('seed local database', process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', 'src/index.ts', '--seed-only']),
  'db:reset': dbReset,
  clean,
  help
};
const command = process.argv[2] || 'help';
if (!(command in commands)) { console.error(`Unknown command: ${command}\n`); help(); process.exit(1); }
commands[command]();
