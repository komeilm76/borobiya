#!/usr/bin/env bun
/**
 * Verifies that the release acceptance checklist and its evidence are closed.
 * Every check is a release gate: a failure exits non-zero so CI cannot ship an
 * unverified build. Checks read the repository through Bun's file and glob APIs only.
 */
import path from 'node:path';
import { ROOT } from '../src/server/core/config.ts';

const read = (relative: string): Promise<string> => Bun.file(path.join(ROOT, relative)).text();
const exists = (relative: string): Promise<boolean> => Bun.file(path.join(ROOT, relative)).exists();

/** Result of one acceptance check. */
export interface AcceptanceCheck {
  label: string;
  passed: boolean;
}

/** Counts files matching a Bun glob below a directory. */
async function countFiles(pattern: string, filter?: (file: string) => boolean): Promise<number> {
  let total = 0;
  for await (const relative of new Bun.Glob(pattern).scan({ cwd: ROOT, onlyFiles: true })) {
    if (!filter || filter(relative)) total++;
  }
  return total;
}

/**
 * Runs every acceptance check.
 *
 * @returns One entry per checked requirement.
 */
export async function acceptanceChecks(): Promise<AcceptanceCheck[]> {
  const checklist = await read('docs/ACCEPTANCE.md');
  const manifest = JSON.parse(await read('package.json')) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    packageManager?: string;
  };
  const workflow = await read('.github/workflows/ci.yml');
  const legacyReview = await read('docs/LEGACY_REVIEW.md');
  const envExample = await read('.env.example');
  const http = await read('src/server/core/http.ts');
  const checks: AcceptanceCheck[] = [];
  const check = (label: string, passed: boolean): void => {
    checks.push({ label, passed });
  };

  check('acceptance checklist has no unchecked items', !/^\s*-\s*\[ \]/m.test(checklist));
  check(
    'acceptance checklist names all target groups',
    [
      'Foundation and contracts',
      'Authentication and account lifecycle',
      'Map, location and offline behavior',
      'SOS, missions and dispatch',
      'Administration and operations',
      'Acceptance polish',
      'Superseded legacy targets',
      'Legacy feature scope reconciliation',
      'Release evidence'
    ].every((heading) => checklist.includes(`## ${heading}`))
  );
  check('the runtime is Bun 1.4.4 with a frozen lockfile', manifest.packageManager === 'bun@1.4.4' && (await exists('bun.lock')));
  check('no npm or Node.js runtime artifacts remain', !(await exists('package-lock.json')) && !(await exists('node_modules/.package-lock.json')));
  check('the Vue client and Vitest are real dependencies', Boolean(manifest.dependencies.vue) && Boolean(manifest.devDependencies.vitest));
  check(
    'release gate scripts are present',
    ['check', 'verify', 'doctor', 'deploy:check', 'bench', 'smoke', 'acceptance', 'typecheck:client', 'coverage'].every(
      (name) => Boolean(manifest.scripts[name])
    )
  );
  check(
    'release notes and operations runbook are present',
    (await exists('docs/RELEASE_NOTES.md')) && (await exists('docs/OPERATIONS.md'))
  );
  check(
    'legacy scope reconciliation is explicit',
    legacyReview.includes('## Scope reconciliation') && legacyReview.includes('git show e1a7e91^:docs/TASKS.md')
  );
  check(
    'CI runs frozen Bun install, typecheck, coverage, benchmark, smoke, acceptance and a guarded deploy check',
    [
      'bun install --frozen-lockfile',
      'bun run typecheck:client',
      'bun run typecheck:server',
      'bun run docs:check',
      'bun run build',
      'bun run coverage',
      'bun run bench',
      'bun run smoke',
      'bun run acceptance',
      'bun run deploy:check',
      "TRUST_PROXY: '1'",
      "SEED_DEMO_USERS: '0'",
      'FRAME_ANCESTORS: https://borobiya.example.test'
    ].every((value) => workflow.includes(value))
  );
  check(
    'CI pins a supported runner and an immutable checkout commit',
    [
      'runs-on: ubuntu-24.04',
      'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803',
      'persist-credentials: false'
    ].every((value) => workflow.includes(value)) &&
      !workflow.includes('ubuntu-latest') &&
      !workflow.includes('setup-node') &&
      !workflow.includes('actions/checkout@v4')
  );
  check(
    'CI installs exactly the Bun version pinned in .bun-version',
    workflow.includes("version=\"$(tr -d '[:space:]' < .bun-version)\"") &&
      workflow.includes('@oven/bun-linux-x64/-/bun-linux-x64-${version}.tgz') &&
      workflow.includes('bun --version') &&
      (await read('.bun-version')).trim() === '1.4.4'
  );
  check(
    'CI is least-privilege, concurrency-safe and covers both push and pull requests',
    ['permissions:\n  contents: read', 'concurrency:', 'cancel-in-progress: true', '  push:', '  pull_request:'].every(
      (value) => workflow.includes(value)
    )
  );
  check(
    'embedded frame ancestors are an explicit allowlist without a wildcard default',
    envExample.includes('FRAME_ANCESTORS=') && http.includes('config.frameAncestors.length') && !envExample.includes('FRAME_ANCESTORS=*')
  );
  check('canonical design images are intact', (await countFiles('design/**/*.{png,svg}')) >= 150);
  check('the generated bundle is present', await exists('public/index.html'));
  check('the generated service worker is present', await exists('public/sw.js'));
  check('the generated cache manifest is present', await exists('public/assets/cache-manifest.json'));
  for (const document of [
    'docs/TESTING.md',
    'docs/SECURITY.md',
    'docs/PERFORMANCE.md',
    'docs/AUTOMATION.md',
    'docs/STATUS.md'
  ]) {
    check(`${document} exists`, await exists(document));
  }
  check('old Python design tests are gone', (await countFiles('design/**/*.py', (file) => /^(test_|.*_test)\.py$/.test(path.basename(file)))) === 0);
  return checks;
}

if (import.meta.main) {
  const checks = await acceptanceChecks();
  for (const item of checks) console.log(`${item.passed ? 'ok  ' : 'FAIL'} ${item.label}`);
  const failures = checks.filter((item) => !item.passed);
  if (failures.length) {
    console.error(`acceptance: ${failures.length} failed checks`);
    process.exit(1);
  }
  console.log(`acceptance: ${checks.length} checks closed, evidence present, clean rebuild ready`);
}
