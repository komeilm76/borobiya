import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

test('the acceptance checklist is closed and covers all target groups', () => {
  const text = read('docs/ACCEPTANCE.md');
  assert.match(text, /^# Acceptance checklist/m);
  assert.doesNotMatch(text, /^\s*-\s*\[ \]/m);
  for (const heading of ['Foundation and contracts', 'Authentication and account lifecycle',
    'Map, location and offline behavior', 'SOS, missions and dispatch',
    'Administration and operations', 'Acceptance polish', 'Superseded legacy targets',
    'Legacy feature scope reconciliation', 'Release evidence']) {
    assert.match(text, new RegExp(`## ${heading}`));
  }
  const legacy = read('docs/LEGACY_REVIEW.md');
  assert.match(legacy, /## Scope reconciliation/);
  assert.match(legacy, /git show e1a7e91\^:docs\/TASKS\.md/);
  assert.doesNotMatch(legacy, /clean branch stages those deletions while `HEAD` retains/);
});

test('release evidence, notes, operations runbook and automation commands exist', () => {
  for (const file of ['docs/RELEASE_NOTES.md', 'docs/OPERATIONS.md', 'scripts/acceptance.mjs', 'scripts/bench.mjs']) {
    assert.ok(existsSync(path.join(ROOT, file)), file);
  }
  const release = read('docs/RELEASE_NOTES.md');
  assert.match(release, /Version 1\.0\.0/);
  assert.match(release, /clean rebuild/);
  const operations = read('docs/OPERATIONS.md');
  assert.match(operations, /Routine startup/);
  assert.match(operations, /Outages and recovery/);
  const pkg = JSON.parse(read('package.json'));
  for (const script of ['check', 'verify', 'doctor', 'deploy:check', 'bench', 'smoke', 'acceptance']) {
    assert.ok(pkg.scripts[script], script);
  }
  assert.deepEqual(Object.keys(pkg.dependencies || {}), []);
});

test('CI exercises install, verification, benchmark, smoke, acceptance and deployment configuration', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run verify/);
  assert.match(workflow, /npm run bench/);
  assert.match(workflow, /npm run smoke/);
  assert.match(workflow, /npm run acceptance/);
  assert.match(workflow, /npm run deploy:check/);
  assert.match(workflow, /NODE_ENV: production/);
  assert.match(workflow, /TRUST_PROXY: '1'/);
  assert.match(workflow, /SEED_DEMO_USERS: '0'/);
  assert.match(workflow, /FRAME_ANCESTORS: https:\/\/borobiya\.example\.test/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
  assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
  assert.match(workflow, /persist-credentials: false/);
  assert.doesNotMatch(workflow, /ubuntu-latest|actions\/checkout@v4|actions\/setup-node@v4/);
  assert.match(read('.env.example'), /^FRAME_ANCESTORS=$/m);
  assert.match(read('src/core/http.ts'), /config\.frameAncestors\.length/);
});
