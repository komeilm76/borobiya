#!/usr/bin/env node
/** Practical repository documentation and clean-rebuild guards. */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = [
  'README.md', 'design/README.md', 'design/auth/README.md', 'design/icons/README.md',
  'design/admin-panel/README.md', 'design/map-page/README.md',
  'docs/README.md', 'docs/ARCHITECTURE.md', 'docs/API.md', 'docs/WEBSOCKET.md',
  'docs/DEVELOPMENT.md', 'docs/DEPLOYMENT.md', 'docs/USER_MANUAL.md',
  'docs/ADMIN_MANUAL.md', 'docs/TESTING.md', 'docs/SECURITY.md',
  'docs/PERFORMANCE.md', 'docs/AUTOMATION.md', 'docs/DESIGN_SYSTEM.md',
  'docs/LEGACY_REVIEW.md', 'docs/STATUS.md', 'docs/ACCEPTANCE.md',
  'docs/RELEASE_NOTES.md', 'docs/OPERATIONS.md'
];
const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
const JUNK = /\b(TODO|TBD|lorem ipsum|junk text|placeholder screenshot)\b/i;

function markdownFiles(directory) {
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...markdownFiles(absolute));
    else if (entry.name.endsWith('.md')) output.push(absolute);
  }
  return output;
}

function fail(message) { console.error(`check-docs: ${message}`); process.exitCode = 1; }

for (const relative of REQUIRED) {
  const file = path.join(ROOT, relative);
  if (!existsSync(file)) { fail(`missing ${relative}`); continue; }
  const text = readFileSync(file, 'utf8');
  if (!/^#\s+\S/m.test(text)) fail(`${relative} has no top-level heading`);
  if (text.trim().length < 500) fail(`${relative} is too short to be practical`);
  if (ARABIC_SCRIPT.test(text)) fail(`${relative} contains non-English script`);
  if (JUNK.test(text)) fail(`${relative} contains unresolved drafting text`);
}
for (const file of markdownFiles(path.join(ROOT, 'docs'))) {
  const text = readFileSync(file, 'utf8');
  if (ARABIC_SCRIPT.test(text)) fail(`${path.relative(ROOT, file)} contains non-English script`);
  if (JUNK.test(text)) fail(`${path.relative(ROOT, file)} contains unresolved drafting text`);
}
for (const legacy of ['packages', 'map-server', 'bun.lock', 'vitest.config.ts']) {
  if (existsSync(path.join(ROOT, legacy))) fail(`legacy path still exists: ${legacy}`);
}
const packageJson = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
if (Object.keys(packageJson.dependencies || {}).length) fail('runtime dependencies must stay at zero');
const designTests = [];
for (const file of markdownFiles(path.join(ROOT, 'design'))) {
  if (ARABIC_SCRIPT.test(readFileSync(file, 'utf8'))) fail(`${path.relative(ROOT, file)} is not English`);
}
function findOldTests(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) findOldTests(absolute);
    else if (/^(test_.*|.*_test)\.py$/.test(entry.name)) designTests.push(path.relative(ROOT, absolute));
  }
}
findOldTests(path.join(ROOT, 'design'));
if (designTests.length) fail(`old design tests remain: ${designTests.join(', ')}`);
const images = markdownFiles(path.join(ROOT, 'design')).length;
if (images < 5) fail('design documentation is incomplete');
const designImageCount = (function count(directory) {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) total += count(absolute);
    else if (/\.(png|svg)$/i.test(entry.name) && statSync(absolute).isFile()) total++;
  }
  return total;
})(path.join(ROOT, 'design'));
if (designImageCount < 100) fail(`expected at least 100 canonical design images, found ${designImageCount}`);
if (!process.exitCode) console.log(`check-docs: ${REQUIRED.length} required documents, ${designImageCount} design images, English-only, clean`);
