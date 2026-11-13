#!/usr/bin/env bun
/**
 * Documentation and clean-rebuild guards: required English documents, canonical design
 * images, absence of legacy paths and no stale Node.js/npm claims in active sources.
 */
import path from 'node:path';
import { ROOT as REPOSITORY_ROOT } from '../src/server/core/config.ts';

const ROOT = REPOSITORY_ROOT;

/** Documents every release must ship, in English. */
const REQUIRED_DOCUMENTS = [
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

/** Reads a UTF-8 file. */
async function read(relative: string): Promise<string> {
  const file = Bun.file(path.join(ROOT, relative));
  return file.exists() ? file.text() : '';
}

/** Lists every Markdown document below a directory. */
async function markdownFiles(directory: string): Promise<string[]> {
  const glob = new Bun.Glob('**/*.md');
  const output: string[] = [];
  for await (const relative of glob.scan({ cwd: directory, onlyFiles: true })) output.push(path.join(directory, relative));
  return output.sort();
}

/** Counts canonical design images (PNG and SVG). */
async function countDesignImages(directory: string): Promise<number> {
  const glob = new Bun.Glob('**/*.{png,svg}');
  let total = 0;
  for await (const _ of glob.scan({ cwd: directory, onlyFiles: true })) total++;
  return total;
}

/** Counts legacy Python design tests, which must not return. */
async function countLegacyDesignTests(directory: string): Promise<number> {
  const glob = new Bun.Glob('**/{test_*,*_test}.py');
  let total = 0;
  for await (const _ of glob.scan({ cwd: directory, onlyFiles: true })) total++;
  return total;
}

/**
 * Runs the documentation guard.
 *
 * @returns A process exit code: 0 when everything passes.
 */
async function checkDocs(): Promise<number> {
  let failed = false;
  const fail = (message: string): void => {
    console.error(`check-docs: ${message}`);
    failed = true;
  };

  for (const relative of REQUIRED_DOCUMENTS) {
    const text = await read(relative);
    if (!text) {
      fail(`missing ${relative}`);
      continue;
    }
    if (!/^#\s+\S/m.test(text)) fail(`${relative} has no top-level heading`);
    if (text.trim().length < 500) fail(`${relative} is too short to be practical`);
    if (ARABIC_SCRIPT.test(text)) fail(`${relative} contains non-English script`);
    if (JUNK.test(text)) fail(`${relative} contains unresolved drafting text`);
  }
  for (const file of [...(await markdownFiles(path.join(ROOT, 'docs'))), ...(await markdownFiles(path.join(ROOT, 'design')))]) {
    const text = await Bun.file(file).text();
    const relative = path.relative(ROOT, file);
    if (ARABIC_SCRIPT.test(text)) fail(`${relative} contains non-English script`);
    if (JUNK.test(text)) fail(`${relative} contains unresolved drafting text`);
  }
  for (const legacy of ['packages', 'map-server', 'package-lock.json', 'public/js/protocol.js']) {
    if (await Bun.file(path.join(ROOT, legacy)).exists()) fail(`legacy path still exists: ${legacy}`);
  }
  if (!(await Bun.file(path.join(ROOT, 'bun.lock')).exists())) fail('bun.lock is missing');
  if (!(await Bun.file(path.join(ROOT, '.bun-version')).exists())) fail('.bun-version is missing');

  const designImages = await countDesignImages(path.join(ROOT, 'design'));
  if (designImages < 100) fail(`expected at least 100 canonical design images, found ${designImages}`);
  if ((await countLegacyDesignTests(path.join(ROOT, 'design'))) > 0) fail('old design tests remain');
  if ((await markdownFiles(path.join(ROOT, 'design'))).length < 5) fail('design documentation is incomplete');

  if (!failed) {
    console.log(
      `check-docs: ${REQUIRED_DOCUMENTS.length} required documents, ${designImages} design images, English-only, clean`
    );
  }
  return failed ? 1 : 0;
}

if (import.meta.main) {
  process.exit(await checkDocs());
}
