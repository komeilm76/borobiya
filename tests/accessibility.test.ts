import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function variable(css: string, name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(match, `missing CSS variable ${name}`);
  return match[1];
}

test('light-theme text and semantic colors meet WCAG AA contrast', () => {
  const css = read('public/app.css');
  const root = css.slice(css.indexOf(':root {'), css.indexOf(':root[data-theme='));
  const surface = variable(root, '--surface');
  for (const name of ['--text', '--muted', '--primary', '--danger', '--success', '--warning', '--info']) {
    const ratio = contrast(variable(root, name), surface);
    assert.ok(ratio >= 4.5, `${name} contrast ${ratio.toFixed(2)} is below 4.5:1`);
  }
  assert.ok(contrast(variable(root, '--text'), surface) >= 7);
});

test('the HTML shell exposes skip navigation, a focusable landmark and live regions', () => {
  const html = read('public/index.html');
  assert.match(html, /class="skip-link" href="#app"/);
  assert.match(html, /<main id="app"[^>]*tabindex="-1"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="status"/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  const css = read('public/app.css');
  assert.match(css, /\.skip-link:focus/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /prefers-reduced-motion/);
});

test('lazy view loading, loading states and modal focus support are wired', () => {
  const app = read('public/js/app.js');
  assert.doesNotMatch(app, /import \{[^}]*\} from '\.\/views\//);
  assert.match(app, /import\('\.\/views\/auth\.js'\)/);
  assert.match(app, /import\('\.\/views\/map\.js'\)/);
  assert.match(app, /import\('\.\/views\/admin\.js'\)/);
  assert.match(app, /loadingShell\(mode\)/);
  assert.match(app, /offlinePanel/);
  assert.match(app, /trapModalFocus/);
  assert.match(app, /modalOpener/);
  assert.match(app, /busy\(button/);
  const ui = read('public/js/ui.js');
  assert.match(ui, /export function loadingShell/);
  assert.match(ui, /export function offlinePanel/);
  assert.match(ui, /export async function busy/);
  assert.match(ui, /root\.focus/);
});

test('active navigation, control labels and keyboard palette behavior are present', () => {
  const admin = read('public/js/views/admin.js');
  assert.match(admin, /aria-current="page"/);
  assert.match(admin, /command-list/);
  const map = read('public/js/views/map.js');
  assert.match(map, /aria-current="page"/);
  const app = read('public/js/app.js');
  assert.match(app, /navigateCommandPalette/);
  assert.match(app, /ArrowDown|Home|End/);
  const css = read('public/app.css');
  assert.match(css, /is-keyboard-active/);
});
