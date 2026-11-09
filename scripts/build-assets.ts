#!/usr/bin/env bun
/**
 * Generates browser assets from the canonical `design/` folder:
 * the Material Design Icons subset, self-hosted fonts, logo, favicon and the
 * deterministic, timestamp-free service-worker cache manifest.
 *
 * Repeated runs on an unchanged tree produce byte-identical output, so generated
 * assets never dirty the checkout. All IO uses Bun's file and glob APIs.
 */
import path from 'node:path';
import { ROOT as REPOSITORY_ROOT } from '../src/server/core/config.ts';

/** Repository root; resolved from the server config so scripts and tests agree. */
const ROOT = REPOSITORY_ROOT;
const PUBLIC = path.join(ROOT, 'public');
const ASSETS = path.join(PUBLIC, 'assets');
const FONTS = path.join(ASSETS, 'fonts');
const DESIGN_ASSETS = path.join(ROOT, 'design/map-page/_generator/assets');
const MDI_CSS = path.join(DESIGN_ASSETS, 'materialdesignicons.css');
const ICON_INVENTORY = path.join(ROOT, 'design/icons/icons.json');

/** Icons the interface uses that are not part of the canonical inventory. */
const EXTRA_ICONS = [
  'account', 'account-arrow-right-outline', 'account-cancel-outline', 'account-check-outline',
  'alert-circle', 'arrow-down', 'arrow-up', 'battery', 'bell-alert-outline', 'bookmark',
  'bullseye-arrow', 'camera-outline', 'car-emergency', 'cellphone-link', 'chart-bar',
  'check-circle', 'check-circle-outline', 'circle-medium', 'circle-outline',
  'clipboard-list-outline', 'clipboard-text-outline', 'close-circle', 'cloud-check-outline',
  'cloud-sync-outline', 'compass-outline', 'connection', 'cursor-default-outline',
  'database', 'delete-outline', 'earth', 'eye-off-outline', 'eye-outline',
  'file-chart-outline', 'filter-variant', 'flag-outline', 'format-list-bulleted', 'gas-station',
  'gesture-tap-hold', 'hand-back-left', 'hand-back-right', 'heart-pulse', 'image-outline',
  'lan-connect', 'latitude', 'list-status', 'loading', 'lock-alert', 'logout', 'longitude',
  'map-marker-check-outline', 'map-marker-distance', 'map-marker-path', 'map-marker-radius-outline',
  'map-marker-plus-outline', 'memory', 'message-text-outline', 'microphone', 'microphone-off',
  'network-outline', 'phone-hangup', 'play-circle-outline', 'pulse', 'radiobox-marked',
  'ray-start-arrow', 'ray-end-arrow', 'robot-off-outline', 'school-outline', 'send',
  'shield-check-outline', 'shield-edit-outline', 'shopping-outline', 'signal', 'star', 'sync',
  'table-edit', 'tag', 'target', 'theme-light-dark', 'timer-sand-empty', 'upload-outline',
  'view-dashboard-outline', 'web', 'wifi', 'wifi-off', 'wrench-outline'
];

/**
 * Recursively lists files below a directory with Bun's native glob.
 *
 * @param directory Absolute directory to scan.
 * @param extension Optional extension filter such as `.js`.
 * @returns Sorted absolute file paths.
 */
async function listFiles(directory: string, extension?: string): Promise<string[]> {
  // `Bun.Glob.scan` throws ENOENT for a directory that does not exist yet, which happens on a
  // clean checkout before the first Vite build has written `public/js`. A missing directory simply
  // has no files, so `bun run assets` stays runnable on its own in CI and locally. Do not gate this
  // on a `Bun.file()` existence check: that helper is file-only and reports false for directories.
  const glob = new Bun.Glob(extension ? `**/*${extension}` : '**/*');
  const output: string[] = [];
  try {
    for await (const relative of glob.scan({ cwd: directory, onlyFiles: true })) {
      output.push(path.join(directory, relative));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return [];
  }
  return output.sort();
}

/** Reads a UTF-8 text file with `Bun.file`. */
async function readText(target: string): Promise<string> {
  return Bun.file(target).text();
}

/**
 * Returns the sorted set of icon names required by the shipped interface:
 * the explicit list above, the canonical inventory and every `mdi-` reference in
 * the design generators.
 *
 * @returns Sorted icon names without the `mdi-` prefix.
 */
async function iconNames(): Promise<string[]> {
  const names = new Set(EXTRA_ICONS);
  const inventory = JSON.parse(await readText(ICON_INVENTORY)) as { icons?: Array<{ name: string }> };
  for (const icon of inventory.icons ?? []) names.add(String(icon.name).replace(/^mdi-/, ''));
  for (const directory of [
    'design/auth/_generator',
    'design/icons/_generator',
    'design/admin-panel/_generator',
    'design/map-page/_generator'
  ]) {
    const absolute = path.join(ROOT, directory);
    for (const file of await listFiles(absolute, '.py')) {
      for (const match of (await readText(file)).matchAll(/mdi-([a-z0-9-]+)/g)) names.add(match[1]);
    }
  }
  return [...names].sort();
}

/**
 * Builds the icon stylesheet from the canonical MDI font metadata.
 *
 * @returns The generated CSS text.
 * @throws When the interface references an icon the canonical font does not define.
 */
async function buildIconCss(): Promise<string> {
  const css = await readText(MDI_CSS);
  const rules = new Map(
    [...css.matchAll(/\.mdi-([a-z0-9-]+)::before\s*\{\s*content:\s*"([^"]+)";/g)].map((match) => [match[1], match[2]] as const)
  );
  const lines = [
    '/* Generated by scripts/build-assets.ts. Source: design/map-page/_generator/assets. */',
    '@font-face {',
    '  font-family: "Material Design Icons";',
    '  src: url("/assets/fonts/materialdesignicons-webfont.ttf") format("truetype");',
    '  font-weight: normal; font-style: normal; font-display: block;',
    '}',
    '.mdi::before {',
    '  display: inline-block; font: normal normal normal 24px/1 "Material Design Icons";',
    '  font-size: inherit; line-height: inherit; vertical-align: middle;',
    '  text-rendering: auto; -webkit-font-smoothing: antialiased;',
    '}',
    '.mdi { display: inline-flex; align-items: center; justify-content: center; }'
  ];
  const missing: string[] = [];
  for (const name of await iconNames()) {
    const content = rules.get(name);
    if (!content) {
      missing.push(name);
      continue;
    }
    lines.push(`.mdi-${name}::before { content: "${content}"; }`);
  }
  if (missing.length) throw new Error(`Unknown MDI icons: ${missing.join(', ')}`);
  return `${lines.join('\n')}\n`;
}

/** Copies the self-hosted fonts from the canonical design assets. */
async function copyFonts(): Promise<void> {
  for (const file of await listFiles(path.join(DESIGN_ASSETS, 'fonts'), '.ttf')) {
    await Bun.write(path.join(FONTS, path.basename(file)), Bun.file(file));
  }
  await Bun.write(
    path.join(FONTS, 'materialdesignicons-webfont.ttf'),
    Bun.file(path.join(DESIGN_ASSETS, 'materialdesignicons-webfont.ttf'))
  );
}

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Borobiya">
  <rect width="64" height="64" rx="18" fill="#0E6666"/>
  <circle cx="32" cy="32" r="17" fill="none" stroke="#E4F0EE" stroke-width="3"/>
  <circle cx="32" cy="32" r="5" fill="#E4F0EE"/>
  <path d="M32 9v10M32 45v10M9 32h10M45 32h10" stroke="#D9B45D" stroke-width="3" stroke-linecap="round"/>
  <circle cx="46" cy="18" r="4" fill="#D9B45D"/>
</svg>
`;

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#0E6666"/><circle cx="16" cy="16" r="8" fill="none" stroke="#fff" stroke-width="2"/><circle cx="16" cy="16" r="2.5" fill="#fff"/><circle cx="23" cy="9" r="2" fill="#D9B45D"/></svg>
`;

/**
 * Lists every static file the service worker precaches, sorted and de-duplicated.
 *
 * @returns Web-root paths such as `/js/main.js`.
 */
export async function staticFiles(): Promise<string[]> {
  const output: string[] = [];
  const add = async (file: string): Promise<void> => {
    if (await Bun.file(path.join(PUBLIC, file)).exists()) output.push(`/${file}`);
  };
  await add('index.html');
  await add('app.css');
  await add('manifest.webmanifest');
  await add('sw.js');
  for (const file of await listFiles(path.join(PUBLIC, 'js'), '.js')) {
    output.push(`/js/${path.relative(path.join(PUBLIC, 'js'), file).split(path.sep).join('/')}`);
  }
  for (const file of await listFiles(ASSETS)) {
    const relative = `/assets/${path.relative(ASSETS, file).split(path.sep).join('/')}`;
    if (!relative.endsWith('cache-manifest.json')) output.push(relative);
  }
  return [...new Set(output)].sort();
}

/** Shape of the generated service-worker cache manifest. */
interface CacheManifest {
  version: string;
  precache: string[];
  runtime: { tileLimit: number; apiCaching: boolean };
}

/**
 * Writes the deterministic cache manifest.
 * The version hashes file names and contents only — there is deliberately no timestamp.
 *
 * @returns The generated manifest.
 */
export async function writeManifest(): Promise<CacheManifest> {
  const files = (await staticFiles()).filter((file) => file !== '/assets/cache-manifest.json');
  const hasher = new Bun.CryptoHasher('sha256');
  for (const file of files) {
    hasher.update(file);
    hasher.update(await Bun.file(path.join(PUBLIC, file.slice(1))).arrayBuffer());
  }
  const precache = [...new Set(['/', ...files.filter((file) => file !== '/index.html')])].sort();
  const manifest: CacheManifest = {
    version: hasher.digest('hex').slice(0, 16),
    precache,
    runtime: { tileLimit: 256, apiCaching: false }
  };
  await Bun.write(path.join(ASSETS, 'cache-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

/**
 * Copies static files that belong to the client but are not processed by Vite
 * (the web app manifest) into the generated `public/` root.
 *
 * @returns The copied web-root paths.
 */
export async function copyClientPublic(): Promise<string[]> {
  const source = path.join(ROOT, 'src/client/public');
  const copied: string[] = [];
  for (const file of await listFiles(source)) {
    const relative = path.relative(source, file).split(path.sep).join('/');
    const target = path.join(PUBLIC, relative);
    const directory = target.slice(0, target.lastIndexOf('/'));
    await Bun.spawn(['mkdir', '-p', directory], { stdout: 'ignore', stderr: 'ignore' }).exited;
    await Bun.write(target, Bun.file(file));
    copied.push(`/${relative}`);
  }
  return copied.sort();
}

/**
 * Runs the complete asset generation step.
 *
 * @returns The generated cache manifest.
 */
export async function buildAssets(): Promise<{ manifest: CacheManifest }> {
  await Bun.spawn(['mkdir', '-p', FONTS], { stdout: 'ignore', stderr: 'ignore' }).exited;
  await copyClientPublic();
  await copyFonts();
  await Bun.write(path.join(ASSETS, 'icons.css'), await buildIconCss());
  await Bun.write(path.join(ASSETS, 'logo.svg'), LOGO);
  await Bun.write(path.join(ASSETS, 'favicon.svg'), FAVICON);
  return { manifest: await writeManifest() };
}

if (import.meta.main) {
  const { manifest } = await buildAssets();
  console.log(`assets: ${manifest.precache.length} cache entries, version ${manifest.version}`);
}
