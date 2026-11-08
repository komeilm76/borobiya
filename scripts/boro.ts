#!/usr/bin/env bun
/**
 * Borobiya automation entrypoint. One small Bun CLI owns every repeatable command:
 * setup, development, diagnostics, the quality gate, benchmarks, smoke, acceptance,
 * production deployment checks, database maintenance and cleanup.
 */
import path from 'node:path';
import { ROOT as REPOSITORY_ROOT } from '../src/server/core/config.ts';
import { buildAssets } from './build-assets.ts';
import { buildAll } from './build.ts';

const ROOT = REPOSITORY_ROOT;

/** Loads `.env` values without overriding the real process environment. */
function envFile(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value;
  }
  const file = Bun.file(path.join(ROOT, '.env'));
  if (!file.size) return result;
  const text = Bun.spawnSync(['cat', path.join(ROOT, '.env')], { stdout: 'pipe', stderr: 'ignore' }).stdout.toString();
  for (const raw of text.split(/\r?\n/)) {
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

/**
 * Runs a Bun command as a child process, inheriting stdio so output streams live.
 *
 * @param label Human-readable step label.
 * @param args Command and arguments, starting with `bun`.
 * @returns The child exit code.
 */
async function step(label: string, args: string[]): Promise<number> {
  console.log(`\n[boro] ${label}`);
  const child = Bun.spawn(args, { cwd: ROOT, stdio: ['inherit', 'inherit', 'inherit'], env: envFile() });
  return child.exited;
}

async function assets(): Promise<number> {
  await buildAssets();
  return 0;
}

async function doctor(): Promise<number> {
  console.log('[boro] diagnostics');
  const checks: Array<[string, boolean]> = [
    [`Bun >= 1.4 (running ${Bun.version})`, Bun.version.split('.').map(Number)[0] >= 1],
    ['canonical design images', await Bun.file(path.join(ROOT, 'design/map-page/navigation/01-map-idle.png')).exists()],
    ['shared TypeScript protocol', await Bun.file(path.join(ROOT, 'src/shared/protocol.ts')).exists()],
    ['Vue client entry', await Bun.file(path.join(ROOT, 'src/client/main.ts')).exists()],
    ['service-worker TypeScript source', await Bun.file(path.join(ROOT, 'src/client/service-worker/sw.ts')).exists()],
    ['Vitest configuration', await Bun.file(path.join(ROOT, 'vitest.config.ts')).exists()],
    ['bun lockfile', await Bun.file(path.join(ROOT, 'bun.lock')).exists()],
    ['legacy npm lockfile removed', !(await Bun.file(path.join(ROOT, 'package-lock.json')).exists())],
    ['generated icon CSS', await Bun.file(path.join(ROOT, 'public/assets/icons.css')).exists()],
    ['generated cache manifest', await Bun.file(path.join(ROOT, 'public/assets/cache-manifest.json')).exists()],
    ['legacy packages removed', !(await Bun.file(path.join(ROOT, 'packages')).exists())]
  ];
  for (const [name, passed] of checks) console.log(`${passed ? 'ok  ' : 'FAIL'} ${name}`);
  return checks.some(([, passed]) => !passed) ? 1 : 0;
}

async function setup(): Promise<number> {
  if (!(await Bun.file(path.join(ROOT, 'node_modules')).exists())) {
    const install = await step('install dependencies with bun', ['bun', 'install']);
    if (install !== 0) return install;
  }
  if (!(await Bun.file(path.join(ROOT, '.env')).exists())) {
    await Bun.write(path.join(ROOT, '.env'), Bun.file(path.join(ROOT, '.env.example')));
    console.log('[boro] created .env from .env.example');
  }
  await Bun.spawn(['mkdir', '-p', path.join(ROOT, 'data')], { stdout: 'ignore', stderr: 'ignore' }).exited;
  await buildAll();
  return step('prepare local database', ['bun', 'src/server/index.ts', '--seed-only']);
}

async function dev(): Promise<number> {
  await assets();
  const child = Bun.spawn(['bun', '--watch', 'src/server/index.ts'], {
    cwd: ROOT,
    stdio: ['inherit', 'inherit', 'inherit'],
    env: { ...envFile(), NODE_ENV: envFile().NODE_ENV ?? 'development', HOST: envFile().HOST ?? '0.0.0.0' }
  });
  const stop = (): void => {
    if (!child.killed) child.kill('SIGTERM');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  return child.exited;
}

async function check(): Promise<number> {
  await buildAll();
  const steps: Array<[string, string[]]> = [
    ['server typecheck', ['bun', 'run', 'typecheck:server']],
    ['client typecheck (vue-tsc)', ['bun', 'run', 'typecheck:client']],
    ['documentation and clean-rebuild guards', ['bun', 'scripts/check-docs.ts']],
    ['Vitest suite with coverage', ['bun', 'run', 'coverage']]
  ];
  for (const [label, args] of steps) {
    const code = await step(label, args);
    if (code !== 0) return code;
  }
  return 0;
}

async function verify(): Promise<number> {
  const diagnostics = await doctor();
  if (diagnostics !== 0) return diagnostics;
  return check();
}

async function deployCheck(): Promise<number> {
  const env = envFile();
  const failures: string[] = [];
  const unsafeAdminPasswords = new Set([
    'change-me-before-production',
    'DemoPass!2026',
    'PreviewPass!2026',
    'CIReleasePass!2026'
  ]);
  if (env.NODE_ENV !== 'production') failures.push('NODE_ENV must be production');
  if (env.COOKIE_SECURE !== '1') failures.push('COOKIE_SECURE must be 1 behind HTTPS');
  if (!env.ADMIN_PASSWORD || unsafeAdminPasswords.has(env.ADMIN_PASSWORD) || env.ADMIN_PASSWORD.length < 12) {
    failures.push('set a unique ADMIN_PASSWORD of at least 12 characters');
  }
  if (!env.ALLOWED_ORIGINS || env.ALLOWED_ORIGINS.includes('*')) {
    failures.push('set ALLOWED_ORIGINS to exact HTTPS origins without wildcards');
  }
  if ((env.FRAME_ANCESTORS ?? '').includes('*')) failures.push('set FRAME_ANCESTORS to exact origins without wildcards');
  if (/^(1|true|yes|on)$/i.test(env.SEED_DEMO_USERS ?? '')) failures.push('disable SEED_DEMO_USERS in production');
  if (!/^(1|true|yes|on)$/i.test(env.TRUST_PROXY ?? '')) failures.push('set TRUST_PROXY=1 behind the HTTPS reverse proxy');
  if (!(await Bun.file(path.join(ROOT, 'public/assets/cache-manifest.json')).exists())) failures.push('run bun run build');
  for (const message of failures) console.error(`FAIL ${message}`);
  if (failures.length) return 1;
  console.log('deploy:check: production configuration is ready');
  return 0;
}

async function dbSeed(): Promise<number> {
  return step('seed local database', ['bun', 'src/server/index.ts', '--seed-only']);
}

async function dbReset(): Promise<number> {
  const env = envFile();
  const resolved = path.resolve(ROOT, env.DATA_DIR ?? './data');
  if (!resolved.startsWith(`${ROOT}/`) || resolved === ROOT) {
    console.error(`Refusing to remove unsafe DATA_DIR: ${resolved}`);
    return 1;
  }
  await Bun.spawn(['rm', '-rf', resolved], { stdout: 'ignore', stderr: 'ignore' }).exited;
  await Bun.spawn(['mkdir', '-p', resolved], { stdout: 'ignore', stderr: 'ignore' }).exited;
  await Bun.write(path.join(resolved, '.gitkeep'), '');
  console.log(`[boro] reset ${path.relative(ROOT, resolved)}`);
  return dbSeed();
}

async function clean(): Promise<number> {
  for (const name of ['coverage', 'dist']) {
    await Bun.spawn(['rm', '-rf', path.join(ROOT, name)], { stdout: 'ignore', stderr: 'ignore' }).exited;
  }
  console.log('[boro] removed coverage/ and dist/');
  return 0;
}

function help(): void {
  console.log(`Borobiya automation (Bun)

Usage: ./boro <command>

  setup          install dependencies with bun, create .env, build, seed the database
  dev            build browser assets and start the watched Bun server on 0.0.0.0
  doctor         verify Bun runtime and repository prerequisites
  check          build, typecheck, docs guard and the full Vitest suite with coverage
  verify         doctor + check
  bench          measure pure work, HTTP reads and realtime fan-out
  smoke          run an in-process HTTP, asset, auth, WebSocket and SOS smoke test
  acceptance     verify the closed acceptance checklist and release evidence
  deploy:check   validate production environment and generated assets
  db:seed        create/refresh the local database without starting a server
  db:reset       safely remove local data and seed a fresh database
  clean          remove test/build output
  help           show this list
`);
}

const commands: Record<string, () => Promise<number>> = {
  setup,
  dev,
  doctor,
  check,
  verify,
  bench: () => step('release benchmark', ['bun', 'scripts/bench.ts']),
  smoke: () => step('runtime smoke', ['bun', 'scripts/smoke.ts']),
  acceptance: () => step('release acceptance evidence', ['bun', 'scripts/acceptance.ts']),
  'deploy:check': deployCheck,
  'db:seed': dbSeed,
  'db:reset': dbReset,
  clean,
  help: async () => {
    help();
    return 0;
  }
};

const command = process.argv[2] ?? 'help';
const handler = commands[command];
if (!handler) {
  console.error(`Unknown command: ${command}\n`);
  help();
  process.exit(1);
}
process.exit(await handler());
