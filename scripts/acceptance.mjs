#!/usr/bin/env node
/** Verifies that the release acceptance checklist and its evidence are closed. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(ROOT, relative), 'utf8');
const failures = [];
const check = (label, condition) => {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${label}`);
  if (!condition) failures.push(label);
};
const images = (directory) => {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) total += images(absolute);
    else if (/\.(png|svg)$/i.test(entry.name) && statSync(absolute).isFile()) total++;
  }
  return total;
};
const oldTests = (directory) => {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) total += oldTests(absolute);
    else if (/^(test_.*|.*_test)\.py$/.test(entry.name)) total++;
  }
  return total;
};

const acceptance = read('docs/ACCEPTANCE.md');
const pkg = JSON.parse(read('package.json'));
const workflow = read('.github/workflows/ci.yml');
check('acceptance checklist has no unchecked items', !/^\s*-\s*\[ \]/m.test(acceptance));
check('acceptance checklist names all target groups', ['Foundation and contracts', 'Authentication and account lifecycle', 'Map, location and offline behavior', 'SOS, missions and dispatch', 'Administration and operations', 'Acceptance polish', 'Superseded legacy targets', 'Legacy feature scope reconciliation', 'Release evidence'].every((heading) => acceptance.includes(`## ${heading}`)));
check('zero runtime dependencies', Object.keys(pkg.dependencies || {}).length === 0);
check('release gate scripts are present', ['check', 'verify', 'doctor', 'deploy:check', 'bench', 'smoke', 'acceptance'].every((name) => Boolean(pkg.scripts[name])));
check('release notes and operations runbook are present', existsSync(path.join(ROOT, 'docs/RELEASE_NOTES.md')) && existsSync(path.join(ROOT, 'docs/OPERATIONS.md')));
check('legacy scope reconciliation is explicit', read('docs/LEGACY_REVIEW.md').includes('## Scope reconciliation') && read('docs/LEGACY_REVIEW.md').includes('git show e1a7e91^:docs/TASKS.md'));
check('CI runs install, verify, benchmark, smoke, acceptance and a guarded deploy check', ['npm ci', 'npm run verify', 'npm run bench', 'npm run smoke', 'npm run acceptance', 'npm run deploy:check', "TRUST_PROXY: '1'", "SEED_DEMO_USERS: '0'", 'FRAME_ANCESTORS: https://borobiya.example.test'].every((value) => workflow.includes(value)));
check('embedded frame ancestors are an explicit allowlist without a wildcard default', read('.env.example').includes('FRAME_ANCESTORS=') && read('src/core/http.ts').includes('config.frameAncestors.length') && !read('.env.example').includes('FRAME_ANCESTORS=*'));
check('canonical design images are intact', images(path.join(ROOT, 'design')) >= 100);
check('legacy workspace paths are gone', ['packages', 'map-server', 'bun.lock', 'vitest.config.ts'].every((name) => !existsSync(path.join(ROOT, name))));
check('old Python design tests are gone', oldTests(path.join(ROOT, 'design')) === 0);

if (failures.length) {
  console.error(`acceptance: ${failures.length} failed checks`);
  process.exitCode = 1;
} else {
  console.log('acceptance: checklist closed, evidence present, clean rebuild ready');
}
