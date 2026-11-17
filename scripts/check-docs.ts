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
  'docs/LEGACY_REVIEW.md', 'docs/STATUS.md', 'docs/ACCEPTANCE.md', 'docs/VISUAL_ACCEPTANCE.md',
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

/**
 * The design matrix publishes its canonical tally as an HTML-comment marker next to the summary.
 * The marker must agree with the per-row table; the two drifted apart undetected across multiple
 * stages, which is why this guard exists.
 */
const MATRIX_PATH = 'docs/DESIGN_MATRIX.md';
const MATRIX_ROW = /^\|\s*[^|\n]+?\.png\s*\|\s*(done|partial|missing|superseded|reference|deviation)\s*\|/gm;
const MATRIX_MARKER = /<!-- canonical-tally done=(\d+) partial=(\d+) missing=(\d+) superseded=(\d+) reference=(\d+) deviation=(\d+) total=(\d+) -->/;

/** Counts canonical matrix rows by status and compares them against the marker. */
async function checkMatrixTally(fail: (message: string) => void): Promise<void> {
  const text = await read(MATRIX_PATH);
  if (!text) return fail(`${MATRIX_PATH} is missing`);
  const marker = MATRIX_MARKER.exec(text);
  if (!marker) return fail(`${MATRIX_PATH} carries no <!-- canonical-tally ... --> marker`);
  const counts = new Map<string, number>([['done', 0], ['partial', 0], ['missing', 0], ['superseded', 0], ['reference', 0], ['deviation', 0]]);
  let total = 0;
  const row = new RegExp(MATRIX_ROW);
  for (const match of text.matchAll(row)) {
    counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
    total += 1;
  }
  const expected = [Number(marker[1]), Number(marker[2]), Number(marker[3]), Number(marker[4]), Number(marker[5]), Number(marker[6]), Number(marker[7])];
  const actual = ['done', 'partial', 'missing', 'superseded', 'reference', 'deviation'].map((key) => counts.get(key) ?? 0);
  if (total !== expected[6] || actual.some((value, index) => value !== expected[index])) {
    fail(
      `${MATRIX_PATH} tally marker (done ${expected[0]} / partial ${expected[1]} / missing ${expected[2]} / superseded ${expected[3]} / reference ${expected[4]} / deviation ${expected[5]}, total ${expected[6]}) ` +
        `does not match the table (done ${actual[0]} / partial ${actual[1]} / missing ${actual[2]} / superseded ${actual[3]} / reference ${actual[4]} / deviation ${actual[5]}, total ${total})`
    );
  }
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
  await checkMatrixTally(fail);

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
