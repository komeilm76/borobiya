// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from '../src/server/core/config.ts';

const read = (relative: string): Promise<string> => Bun.file(path.join(ROOT, relative)).text();
const exists = (relative: string): Promise<boolean> => Bun.file(path.join(ROOT, relative)).exists();

/** Recursively counts files matching a Bun glob. */
async function countFiles(directory: string, pattern: string): Promise<number> {
  let total = 0;
  for await (const _ of new Bun.Glob(pattern).scan({ cwd: directory, onlyFiles: true })) total++;
  return total;
}

describe('release acceptance', () => {
  it('the acceptance checklist is closed and covers all target groups', async () => {
    const text = await read('docs/ACCEPTANCE.md');
    expect(text).toMatch(/^# Acceptance checklist/m);
    expect(text).not.toMatch(/^\s*-\s*\[ \]/m);
    for (const heading of [
      'Foundation and contracts',
      'Authentication and account lifecycle',
      'Map, location and offline behavior',
      'SOS, missions and dispatch',
      'Administration and operations',
      'Acceptance polish',
      'Superseded legacy targets',
      'Legacy feature scope reconciliation',
      'Release evidence'
    ]) {
      expect(text, heading).toContain(`## ${heading}`);
    }
    const legacy = await read('docs/LEGACY_REVIEW.md');
    expect(legacy).toContain('## Scope reconciliation');
    expect(legacy).toContain('git show e1a7e91^:docs/TASKS.md');
  });

  it('release evidence, notes, operations runbook and Bun automation commands exist', async () => {
    for (const file of [
      'docs/RELEASE_NOTES.md',
      'docs/OPERATIONS.md',
      'scripts/acceptance.ts',
      'scripts/bench.ts',
      'scripts/smoke.ts',
      'scripts/check-docs.ts',
      'scripts/boro.ts'
    ]) {
      expect(await exists(file), file).toBe(true);
    }
    const release = await read('docs/RELEASE_NOTES.md');
    expect(release).toMatch(/Version 2\.0\.0/);
    expect(release).toMatch(/Bun/);
    const operations = await read('docs/OPERATIONS.md');
    expect(operations).toMatch(/Routine startup/);
    expect(operations).toMatch(/Outages and recovery/);
    const manifest = JSON.parse(await read('package.json'));
    for (const script of ['check', 'verify', 'doctor', 'deploy:check', 'bench', 'smoke', 'acceptance']) {
      expect(manifest.scripts[script], script).toBeTruthy();
    }
    expect(manifest.dependencies.vue).toBeTruthy();
    expect(manifest.devDependencies.vitest).toBeTruthy();
  });

  it('CI exercises frozen Bun install, verification, benchmark, smoke, acceptance and deployment checks', async () => {
    const workflow = await read('.github/workflows/ci.yml');
    for (const value of [
      'bun install --frozen-lockfile',
      'bun run typecheck:server',
      'bun run docs:check',
      'bun run build',
      'bun run bench',
      'bun run smoke',
      'bun run acceptance',
      'bun run deploy:check',
      'bun run typecheck:client',
      'bun run coverage',
      "TRUST_PROXY: '1'",
      "SEED_DEMO_USERS: '0'",
      'FRAME_ANCESTORS: https://borobiya.example.test',
      'runs-on: ubuntu-24.04',
      'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
      'oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6',
      'bun-version-file: .bun-version',
      'persist-credentials: false'
    ]) {
      expect(workflow, value).toContain(value);
    }
    for (const banned of ['ubuntu-latest', 'actions/checkout@v4', 'setup-node', 'npm ci', 'npm run']) {
      expect(workflow, banned).not.toContain(banned);
    }
    expect(workflow).toMatch(/permissions:\n {2}contents: read/);
    expect(workflow).toMatch(/concurrency:/);
    expect(workflow).toMatch(/cancel-in-progress: true/);
    expect(workflow).toMatch(/^ {2}push:$/m);
    expect(workflow).toMatch(/^ {2}pull_request:$/m);
    expect(await read('.env.example')).toMatch(/^FRAME_ANCESTORS=$/m);
    expect(await read('.env.example')).not.toContain('FRAME_ANCESTORS=*');
    expect(await read('src/server/core/http.ts')).toMatch(/config\.frameAncestors\.length/);
  });

  it('local setup seeds the database as a local run, not as the production build it just ran', async () => {
    // `vite build` sets process.env.NODE_ENV = 'production' inside the `boro` process. That value
    // must not reach the seed child, or a fresh `./boro setup` fails the production password guard.
    const boro = await read('scripts/boro.ts');
    expect(boro).toMatch(/BASE_ENV/);
    expect(boro).toMatch(/const BASE_ENV: Record<string, string> = \{\};\nfor \(const \[key, value\] of Object.entries\(process\.env\)\)/);
    expect(boro).toMatch(/function fileEnv\(key: string\)/);
    expect(boro).toMatch(/NODE_ENV: fileEnv\('NODE_ENV'\) \?\? 'development'/);
    expect(boro.indexOf('const BASE_ENV')).toBeLessThan(boro.indexOf('async function setup'));
    // A real temporary directory: the seed writes a SQLite file, and nothing may land in the repo.
    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'borobiya-setup-'));
    const seed = Bun.spawnSync(['bun', 'src/server/index.ts', '--seed-only'], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production', ADMIN_PASSWORD: 'change-me-before-production', DATA_DIR: dataDir },
      stdout: 'pipe',
      stderr: 'pipe'
    });
    expect(new TextDecoder().decode(seed.stderr)).toContain('ADMIN_PASSWORD');
    const local = Bun.spawnSync(['bun', 'src/server/index.ts', '--seed-only'], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'development', ADMIN_PASSWORD: 'change-me-before-production', DATA_DIR: dataDir },
      stdout: 'pipe',
      stderr: 'pipe'
    });
    expect(local.exitCode).toBe(0);
    expect(new TextDecoder().decode(local.stdout)).toContain('database ready');
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('production safety defaults stay documented and enforced', async () => {
    const env = await read('.env.example');
    expect(env).toMatch(/^SEED_DEMO_USERS=1$/m);
    expect(env).toMatch(/^COOKIE_SECURE=0$/m);
    expect(env).toMatch(/^TRUST_PROXY=0$/m);
    expect(env).toMatch(/ADMIN_PASSWORD=change-me-before-production/);
    const config = await read('src/server/core/config.ts');
    expect(config).toMatch(/SEED_DEMO_USERS must be disabled in production/);
    expect(config).toMatch(/ADMIN_PASSWORD must be a unique password/);
  });

  it('the repository keeps canonical design images and no legacy scaffolding', async () => {
    expect(await countFiles(path.join(ROOT, 'design'), '**/*.{png,svg}')).toBeGreaterThanOrEqual(150);
    const designTests: string[] = [];
    for await (const relative of new Bun.Glob('**/*.py').scan({ cwd: path.join(ROOT, 'design'), onlyFiles: true })) {
      if (/^(test_|.*_test)\.py$/.test(path.basename(relative))) designTests.push(relative);
    }
    expect(designTests).toEqual([]);
    for (const legacy of ['packages', 'map-server', 'package-lock.json']) {
      expect(await exists(legacy), legacy).toBe(false);
    }
  });
});
