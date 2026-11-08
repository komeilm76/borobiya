// @vitest-environment node
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ROOT } from '../src/server/core/config.ts';

const PUBLIC = path.join(ROOT, 'public');
const read = (relative: string): Promise<string> => Bun.file(path.join(ROOT, relative)).text();
const exists = (relative: string): Promise<boolean> => Bun.file(path.join(ROOT, relative)).exists();

/** Recursively lists files below a directory with Bun's glob. */
async function glob(directory: string, pattern: string): Promise<string[]> {
  const found: string[] = [];
  for await (const relative of new Bun.Glob(pattern).scan({ cwd: directory, onlyFiles: true })) {
    found.push(path.join(directory, relative));
  }
  return found.sort();
}

describe('generated assets', () => {
  it('the cache manifest uses web-root paths, a stable version and existing files', async () => {
    const manifest = JSON.parse(await read('public/assets/cache-manifest.json'));
    expect(manifest.version).toMatch(/^[a-f0-9]{16}$/);
    expect(Object.hasOwn(manifest, 'generatedAt')).toBe(false);
    expect(manifest.runtime.apiCaching).toBe(false);
    expect(manifest.runtime.tileLimit).toBe(256);
    expect(manifest.precache).toContain('/');
    expect(manifest.precache).toContain('/sw.js');
    expect(manifest.precache).toContain('/app.css');
    expect(manifest.precache).toContain('/manifest.webmanifest');
    expect(manifest.precache.some((url: string) => url.startsWith('/js/'))).toBe(true);
    expect(new Set(manifest.precache).size).toBe(manifest.precache.length);
    for (const url of manifest.precache) {
      expect(url).toMatch(/^\//);
      expect(url).not.toMatch(/^\/public\//);
      if (url === '/') continue;
      expect(await Bun.file(path.join(PUBLIC, url.slice(1))).exists(), url).toBe(true);
    }
  });

  it('the manifest version changes with content and never embeds a timestamp', async () => {
    const first = JSON.parse(await read('public/assets/cache-manifest.json'));
    const { writeManifest } = await import('../scripts/build-assets.ts');
    const second = await writeManifest();
    expect(second.version).toBe(first.version);
    expect(JSON.stringify(second)).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('the bundle contains a stable SPA entry and hashed code-split views', async () => {
    const html = await read('public/index.html');
    expect(html).toMatch(/<script type="module"[^>]*src="\/js\/index\.js"/);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('data-theme-choice="system"');
    expect(html).toMatch(/href="\/app\.css"/);
    expect(html).not.toMatch(/https?:\/\//);
    const chunks = (await glob(path.join(PUBLIC, 'js'), '**/*.js')).map((file) => path.basename(file));
    for (const view of ['LoginView', 'MapView', 'SosView', 'MissionView', 'OverviewView', 'UsersView', 'DispatchView']) {
      expect(chunks.some((chunk) => chunk.startsWith(view)), view).toBe(true);
    }
  });

  it('generated fonts, icon CSS, logo and favicon are self-hosted', async () => {
    for (const file of [
      'public/assets/fonts/Vazirmatn-Regular.ttf',
      'public/assets/fonts/Vazirmatn-Bold.ttf',
      'public/assets/fonts/materialdesignicons-webfont.ttf',
      'public/assets/icons.css',
      'public/assets/logo.svg',
      'public/assets/favicon.svg'
    ]) {
      expect(await exists(file), file).toBe(true);
      expect(Bun.file(path.join(ROOT, file)).size, file).toBeGreaterThan(100);
    }
    const icons = await read('public/assets/icons.css');
    expect(icons).toMatch(/@font-face/);
    expect(icons).toMatch(/materialdesignicons-webfont\.ttf/);
    expect(icons).not.toMatch(/https?:\/\//);
    expect([...icons.matchAll(/\.mdi-[a-z0-9-]+::before/g)].length).toBeGreaterThanOrEqual(250);
  });

  it('every icon used by the Vue client exists in the shipped MDI subset and canonical inventory', async () => {
    const icons = await read('public/assets/icons.css');
    const inventory = JSON.parse(await read('design/icons/icons.json')).icons.map((item: { name: string }) =>
      String(item.name).replace(/^mdi-/, '')
    );
    const shipped = new Set([...icons.matchAll(/\.mdi-([a-z0-9-]+)::before/g)].map((match) => match[1]));
    const clientFiles = (await glob(path.join(ROOT, 'src/client'), '**/*.{vue,ts}')).concat([
      path.join(ROOT, 'src/server/domain/catalog.ts')
    ]);
    const used = new Set<string>();
    for (const file of clientFiles) {
      const source = await Bun.file(file).text();
      for (const match of source.matchAll(/icon\(\s*'([a-z0-9-]+)'/g)) used.add(match[1]);
      for (const match of source.matchAll(/icon:\s*'([a-z0-9-]+)'/g)) used.add(match[1]);
      for (const match of source.matchAll(/mdi-([a-z0-9-]+)/g)) used.add(match[1]);
    }
    for (const name of used) expect(shipped.has(name), `missing shipped icon ${name}`).toBe(true);
    for (const name of inventory) expect(shipped.has(name), `canonical icon omitted: ${name}`).toBe(true);
  });

  it('the stylesheet and web app manifest keep the design tokens and RTL contract', async () => {
    const css = await read('public/app.css');
    expect(css).not.toMatch(/@import/);
    expect(css).toMatch(/--primary:\s*#0e6666/i);
    expect(css).toMatch(/prefers-reduced-motion/);
    const manifest = JSON.parse(await read('public/manifest.webmanifest'));
    expect(manifest.dir).toBe('rtl');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#0E6666');
    expect(manifest.icons.every((icon: { src: string }) => icon.src.startsWith('/assets/'))).toBe(true);
  });

  it('the compiled service worker precaches versioned files and never caches private APIs', async () => {
    const source = await read('public/sw.js');
    expect(source).toMatch(/borobiya-static-/);
    expect(source).toMatch(/\/assets\/cache-manifest\.json/);
    expect(source).toMatch(/TILE_LIMIT = 256/);
    expect(source).toMatch(/_public\/map\/tiles\//);
    expect(source).toMatch(/_auth\//);
    expect(source).toMatch(/_user\//);
    expect(source).toMatch(/_admin\//);
  });
});
