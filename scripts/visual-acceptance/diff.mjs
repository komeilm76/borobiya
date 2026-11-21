// Capture-drift checker for the visual-acceptance evidence set.
// Usage: node diff.mjs [regen-dir] [threshold-pct]
//   regen-dir      directory holding a fresh regeneration (default /tmp/regen)
//   threshold-pct  changed-pixel percentage at or below which a differing capture is
//                  classified VOLATILE (clock, pulse, animation phase, timestamps);
//                  above it the capture is flagged REVIEW (default 0.5)
// Compares every committed capture in docs/visual-acceptance/screens/ against the
// regeneration, pixel by pixel (any channel differing by more than 8/255 counts).
// Exit code 1 when anything needs REVIEW or a regeneration file is missing.
// This tool reports drift; it never approves anything — visual acceptance stays human.
import { PNG } from 'pngjs';
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'node:path';

const committedDir = 'docs/visual-acceptance/screens';
const regenDir = process.argv[2] ?? '/tmp/regen';
const threshold = Number(process.argv[3] ?? 0.5);

function changedPixels(a, b) {
  if (a.width !== b.width || a.height !== b.height) return { pct: 100, sizeMismatch: true };
  let changed = 0;
  const total = a.width * a.height;
  for (let i = 0; i < a.data.length; i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) > 8 || Math.abs(a.data[i + 1] - b.data[i + 1]) > 8 || Math.abs(a.data[i + 2] - b.data[i + 2]) > 8) changed++;
  }
  return { pct: (changed / total) * 100, sizeMismatch: false };
}

let identical = 0;
const volatile = [];
const review = [];
const missing = [];
for (const file of readdirSync(committedDir).filter((name) => name.endsWith('.png')).sort()) {
  const regenPath = path.join(regenDir, file);
  if (!existsSync(regenPath)) { missing.push(file); continue; }
  const committedBytes = readFileSync(path.join(committedDir, file));
  const regenBytes = readFileSync(regenPath);
  if (committedBytes.equals(regenBytes)) { identical++; continue; }
  const { pct, sizeMismatch } = changedPixels(PNG.sync.read(committedBytes), PNG.sync.read(regenBytes));
  (pct <= threshold && !sizeMismatch ? volatile : review).push(`${file} ${pct.toFixed(3)}%${sizeMismatch ? ' SIZE-MISMATCH' : ''}`);
}

console.log(`identical: ${identical}`);
console.log(`volatile-only (<= ${threshold}% changed): ${volatile.length}`);
for (const line of review) console.log(`REVIEW ${line}`);
for (const file of missing) console.log(`MISSING-REGEN ${file}`);
if (review.length || missing.length) {
  console.log(`drift check: ${review.length + missing.length} capture(s) need human review`);
  process.exit(1);
}
console.log('drift check: no capture needs review (volatile-only differences are clock/animation/timestamp regions)');
