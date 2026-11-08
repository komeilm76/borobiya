import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

function walk(directory: string, extensions: string[]): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) output.push(absolute);
  }
  return output;
}

test('generated cache manifest uses web-root paths, a stable version and existing files', () => {
  const manifest = JSON.parse(read('public/assets/cache-manifest.json'));
  assert.match(manifest.version, /^[a-f0-9]{16}$/);
  assert.equal(Object.hasOwn(manifest, 'generatedAt'), false);
  assert.equal(manifest.runtime.apiCaching, false);
  assert.equal(manifest.runtime.tileLimit, 256);
  assert.ok(manifest.precache.includes('/'));
  assert.ok(manifest.precache.includes('/sw.js'));
  assert.ok(manifest.precache.includes('/app.css'));
  assert.ok(manifest.precache.includes('/js/app.js'));
  assert.ok(manifest.precache.includes('/js/views/map.js'));
  assert.ok(manifest.precache.includes('/js/views/admin.js'));
  assert.equal(new Set(manifest.precache).size, manifest.precache.length);
  for (const url of manifest.precache) {
    assert.match(url, /^\//);
    assert.doesNotMatch(url, /^\/public\//);
    if (url === '/') continue;
    const absolute = path.join(PUBLIC, url.slice(1));
    assert.ok(existsSync(absolute) && statSync(absolute).isFile(), url);
  }
});

test('generated fonts, icon CSS, logo and favicon are self-hosted', () => {
  for (const file of ['public/assets/fonts/Vazirmatn-Regular.ttf', 'public/assets/fonts/Vazirmatn-Bold.ttf',
    'public/assets/fonts/materialdesignicons-webfont.ttf', 'public/assets/icons.css',
    'public/assets/logo.svg', 'public/assets/favicon.svg']) {
    const absolute = path.join(ROOT, file);
    assert.ok(existsSync(absolute) && statSync(absolute).size > 100, file);
  }
  const icons = read('public/assets/icons.css');
  assert.match(icons, /@font-face/);
  assert.match(icons, /materialdesignicons-webfont\.ttf/);
  assert.doesNotMatch(icons, /https?:\/\//);
  assert.ok([...icons.matchAll(/\.mdi-[a-z0-9-]+::before/g)].length >= 250);
});

test('every icon used by the new UI exists in the shipped MDI subset and canonical inventory', () => {
  const icons = read('public/assets/icons.css');
  const inventory = JSON.parse(read('design/icons/icons.json')).icons.map((item: any) => String(item.name).replace(/^mdi-/, ''));
  const shipped = new Set([...icons.matchAll(/\.mdi-([a-z0-9-]+)::before/g)].map((match) => match[1]));
  const sourceFiles = walk(path.join(PUBLIC, 'js'), ['.js']).concat([path.join(PUBLIC, 'index.html'), path.join(PUBLIC, 'app.css'), path.join(ROOT, 'src/domain/catalog.ts')]);
  const source = sourceFiles.map((file) => readFileSync(file, 'utf8')).join('\n');
  const used = new Set<string>();
  for (const match of source.matchAll(/icon\(\s*'([a-z0-9-]+)'/g)) used.add(match[1]);
  for (const match of source.matchAll(/icon:\s*'([a-z0-9-]+)'/g)) used.add(match[1]);
  for (const name of used) assert.ok(shipped.has(name), `missing shipped icon ${name}`);
  for (const name of inventory) assert.ok(shipped.has(name), `canonical icon omitted: ${name}`);
});

test('the HTML shell, stylesheet and web app manifest contain no external runtime references', () => {
  const html = read('public/index.html');
  assert.match(html, /<script src="\/js\/theme\.js"><\/script>/);
  assert.match(html, /<script type="module" src="\/js\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /data-theme-choice="system"/);
  const css = read('public/app.css');
  assert.doesNotMatch(css, /@import|https?:\/\//);
  assert.match(css, /--primary: #0E6666/);
  assert.match(css, /prefers-reduced-motion/);
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.dir, 'rtl');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#0E6666');
  assert.ok(manifest.icons.every((icon: any) => icon.src.startsWith('/assets/')));
});

test('the service worker precaches versioned static files and never caches private APIs', () => {
  const source = read('public/sw.js');
  assert.match(source, /borobiya-static-/);
  assert.match(source, /\/assets\/cache-manifest\.json/);
  assert.match(source, /TILE_LIMIT = 256/);
  assert.match(source, /_public\/map\/tiles\//);
  assert.match(source, /_auth\//);
  assert.match(source, /_user\//);
  assert.match(source, /_admin\//);
  assert.match(source, /path\.startsWith\('\/_auth\/'\).*return;/);
  assert.doesNotMatch(source, /cache\.put\(request, response\.clone\(\)\).*_\/admin/);
});
