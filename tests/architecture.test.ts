// @vitest-environment node
import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { ROOT } from '../src/server/core/config.ts';

const read = (relative: string): Promise<string> => Bun.file(path.join(ROOT, relative)).text();
const exists = (relative: string): Promise<boolean> => Bun.file(path.join(ROOT, relative)).exists();

/** Lists files below a directory with Bun's glob. */
async function glob(directory: string, pattern: string): Promise<string[]> {
  const found: string[] = [];
  for await (const relative of new Bun.Glob(pattern).scan({ cwd: directory, onlyFiles: true })) {
    found.push(path.join(directory, relative));
  }
  return found.sort();
}

/**
 * Lists repository source files, excluding generated output, dependencies and the design
 * archive. This is the file set every "no hand-authored JavaScript" rule is checked against.
 *
 * @returns Absolute paths of active source files.
 */
async function sourceFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const pattern of ['src/**/*.{ts,vue}', 'scripts/**/*.ts', 'tests/**/*.ts', '*.ts', '*.json']) {
    for (const file of await glob(ROOT, pattern)) files.push(file);
  }
  return files;
}

describe('architecture guards', () => {
  it('the toolchain is Bun-only and carries no Node.js runtime artifacts', async () => {
    const manifest = JSON.parse(await read('package.json'));
    expect(manifest.packageManager).toBe('bun@1.4.4');
    expect(manifest.engines).toBeUndefined();
    expect(await read('.bun-version')).toMatch(/^1\.4\.4/);
    expect(await exists('bun.lock')).toBe(true);
    for (const legacy of ['package-lock.json', 'pnpm-lock.yaml', 'packages', 'map-server', 'borobiya', 'yarn.lock']) {
      expect(await exists(legacy), legacy).toBe(false);
    }
    for (const dependency of Object.keys(manifest.devDependencies ?? {})) {
      expect(dependency, dependency).not.toBe('@types/node');
    }
    for (const script of Object.values(manifest.scripts) as string[]) {
      expect(script).not.toMatch(/\b(npm|npx|node)\s/);
      expect(script).not.toMatch(/--disable-warning=ExperimentalWarning/);
    }
  });

  it('active TypeScript sources never import Node.js compatibility modules', async () => {
    const offenders: string[] = [];
    for (const file of await sourceFiles()) {
      const source = await Bun.file(file).text();
      const relative = path.relative(ROOT, file);
      for (const match of source.matchAll(/from '(node:[a-z]+)(\/[^']*)?'/g)) {
        const allowed = ['node:crypto', 'node:path', 'node:fs', 'node:os', 'node:vm', 'node:url', 'node:test'];
        if (!allowed.includes(match[1])) offenders.push(`${relative}: ${match[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the Bun-only runtime modules are the ones the server actually imports', async () => {
    expect(await read('src/server/app.ts')).toMatch(/Bun\.serve/);
    expect(await read('src/server/db/database.ts')).toMatch(/from 'bun:sqlite'/);
    expect(await read('src/server/core/crypto.ts')).toMatch(/Bun\.password/);
    expect(await read('src/server/core/static.ts')).toMatch(/Bun\.file/);
    for (const forbidden of ['node:sqlite', 'createServer(', 'http.createServer', 'node:http']) {
      for (const file of ['src/server/app.ts', 'src/server/db/database.ts', 'src/server/core/crypto.ts']) {
        expect(await read(file), `${file} contains ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('no hand-authored JavaScript ships as source', async () => {
    for (const pattern of ['src/**/*.{js,mjs,cjs}', 'scripts/**/*.{js,mjs,cjs}', 'tests/**/*.{js,mjs,cjs}']) {
      expect(await glob(ROOT, pattern)).toEqual([]);
    }
    expect(await exists('public/js/protocol.js')).toBe(false);
  });

  it('the Vue client is composed of typed SFCs, typed router and typed stores', async () => {
    const views = await glob(path.join(ROOT, 'src/client/views'), '**/*.vue');
    expect(views.length).toBeGreaterThanOrEqual(20);
    for (const view of views) {
      const source = await Bun.file(view).text();
      expect(source, path.relative(ROOT, view)).toMatch(/<script setup lang="ts">/);
    }
    const stores = await glob(path.join(ROOT, 'src/client/stores'), '*.ts');
    expect(stores.length).toBe(7);
    for (const store of stores) {
      const source = await Bun.file(store).text();
      expect(source, path.relative(ROOT, store)).toMatch(/defineStore\(/);
      expect(source, path.relative(ROOT, store)).toMatch(/lang="ts"|: string|: ComputedRef|Ref</);
    }
    const router = await read('src/client/router/index.ts');
    expect(router).toMatch(/createRouter\(/);
    expect(router).toMatch(/RouteRecordRaw/);
    for (const name of ['adminOverview', 'adminDispatch', 'mission', 'companions', 'talk']) {
      expect(router, name).toContain(name);
    }
    expect(router).toMatch(/\(\) => import\('@\/views\//);
  });

  it('the declarative route layer, shared protocol and realtime choreography are wired', async () => {
    const routes = await read('src/server/routes/index.ts');
    expect(routes).toMatch(/router\.add\(/);
    expect(routes).toContain("'/_auth/login'");
    expect(routes).toContain("'/_user/sos'");
    expect(routes).toContain("'/_admin/dispatch'");
    expect(routes).toContain("'/_public/openapi.json'");
    const protocol = await read('src/shared/protocol.ts');
    expect(protocol).toMatch(/export const WS_EVENTS/);
    expect(protocol).toMatch(/export const SOS_STATUS/);
    expect(protocol).toMatch(/export const AUDIO/);
    expect(await read('src/server/services/realtime.ts')).toMatch(/shared\/protocol\.ts/);
    expect(await read('src/client/utils/realtime-client.ts')).toMatch(/protocol/);
    expect(await read('src/server/db/unit-of-work.ts')).toMatch(/hub\.publish/);
    expect(await read('src/server/db/unit-of-work.ts')).toMatch(/transaction/);
  });

  it('animation is declarative first and honours reduced motion', async () => {
    const motion = await read('src/client/composables/useMotionPreferences.ts');
    expect(motion).toMatch(/usePreferredReducedMotion/);
    expect(motion).toMatch(/reduced\.value \? 0/);
    const presets = await read('src/client/motion/index.ts');
    expect(presets).toMatch(/revealTimeline/);
    expect(presets).toMatch(/MotionPlugin/);
    const layouts = await Promise.all([
      read('src/client/layouts/MapLayout.vue'),
      read('src/client/layouts/AdminLayout.vue'),
      read('src/client/layouts/AuthLayout.vue')
    ]);
    expect(layouts.some((layout) => layout.includes('<Transition'))).toBe(true);
    expect(layouts.some((layout) => layout.includes('motion.fast'))).toBe(true);
  });

  it('the test suite is comprehensive and free of the old Python design tests', async () => {
    const tests = (await glob(path.join(ROOT, 'tests'), '*.test.ts')).map((file) => path.basename(file)).sort();
    for (const name of [
      'core.test.ts',
      'api.test.ts',
      'auth.test.ts',
      'security.test.ts',
      'realtime.test.ts',
      'journeys.test.ts',
      'architecture.test.ts',
      'assets.test.ts',
      'acceptance.test.ts',
      'accessibility.test.ts',
      'performance.test.ts',
      'database.test.ts',
      'service-worker.test.ts',
      'components.test.ts',
      'stores.test.ts',
      'composables.test.ts',
      'views.test.ts',
      'map-shell.test.ts',
      'command-palette.test.ts',
      'sos-store.test.ts',
      'recovery-view.test.ts',
      'profile-devices.test.ts',
      'api-contract.test.ts',
      'admin-overview-view.test.ts',
      'mission-view.test.ts',
      'sos-view.test.ts',
      'register-view.test.ts',
      'talk-view.test.ts',
      'login-view.test.ts',
      'users-view.test.ts',
      'onboarding-view.test.ts',
      'dispatch-view.test.ts',
      'groups-view.test.ts',
      'admin-layout.test.ts',
      'settings-view.test.ts',
      'app-shell.test.ts',
      'users-service.test.ts',
      'map-view.test.ts',
      'companions-view.test.ts',
      'realtime-store.test.ts',
      'motion.test.ts',
      'talk-floor.test.ts',
      'map-canvas.test.ts',
      'map-store.test.ts',
      'config.test.ts',
      'admin-views.test.ts',
      'admin-guards.test.ts',
      'realtime-guards.test.ts',
      'service-guards.test.ts',
      'sos-guards.test.ts',
      'core-edges.test.ts',
      'router-guard.test.ts',
      'toast-host.test.ts',
      'api-client.test.ts',
      'shared-geo.test.ts',
      'offline-store.test.ts',
      'websocket-hub.test.ts',
      'realtime-client.test.ts',
      'smoke.test.ts'
    ]) {
      expect(tests, name).toContain(name);
    }
    const oldDesignTests = (await glob(path.join(ROOT, 'design'), '**/*.py')).filter((file) =>
      /^(test_|.*_test)\.py$/.test(path.basename(file))
    );
    expect(oldDesignTests).toEqual([]);
    const journeys = await read('tests/journeys.test.ts');
    expect(journeys).toMatch(/hypothetical requester journey/);
    expect(journeys).toMatch(/hypothetical administrator journey/);
  });

  it('documentation describes the Bun and Vue toolchain instead of the retired Node one', async () => {
    const documents = (await glob(path.join(ROOT, 'docs'), '*.md')).concat([path.join(ROOT, 'README.md')]);
    const stale: string[] = [];
    for (const document of documents) {
      const relative = path.relative(ROOT, document);
      const text = await Bun.file(document).text();
      for (const match of text.matchAll(/`(npm (?:ci|run|test|start)|npx [a-z-]+)`/g)) {
        stale.push(`${relative}: ${match[1]}`);
      }
      if (/\bhashes? (?:use|with) scrypt\b|node --experimental-transform-types/.test(text)) {
        stale.push(`${relative}: legacy Node runtime claim`);
      }
      expect(text, relative).not.toMatch(/Node\.js 22\.12/);
    }
    expect(stale).toEqual([]);
    const manifest = JSON.parse(await read('package.json'));
    const protocol = await read('src/shared/protocol.ts');
    expect(protocol).toContain(`APP_VERSION = '${manifest.version}'`);
    expect(await read('docs/RELEASE_NOTES.md')).toContain(`## Version ${manifest.version}`);
  });

  it('every required practical document exists, is substantial and is English-only', async () => {
    const required = [
      'README.md',
      'design/README.md',
      'design/auth/README.md',
      'design/icons/README.md',
      'design/admin-panel/README.md',
      'design/map-page/README.md',
      'docs/README.md',
      'docs/ARCHITECTURE.md',
      'docs/API.md',
      'docs/WEBSOCKET.md',
      'docs/DEVELOPMENT.md',
      'docs/DEPLOYMENT.md',
      'docs/USER_MANUAL.md',
      'docs/ADMIN_MANUAL.md',
      'docs/TESTING.md',
      'docs/SECURITY.md',
      'docs/PERFORMANCE.md',
      'docs/AUTOMATION.md',
      'docs/DESIGN_SYSTEM.md',
      'docs/LEGACY_REVIEW.md',
      'docs/STATUS.md',
      'docs/ACCEPTANCE.md',
      'docs/RELEASE_NOTES.md',
      'docs/OPERATIONS.md'
    ];
    const arabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;
    for (const relative of required) {
      const text = await read(relative);
      expect(text.trim().length, relative).toBeGreaterThanOrEqual(500);
      expect(text, relative).toMatch(/^#\s+\S/m);
      expect(arabic.test(text), relative).toBe(false);
      expect(text, relative).not.toMatch(/\b(TODO|TBD|lorem ipsum|junk text|placeholder screenshot)\b/i);
    }
    for (const file of [
      ...(await glob(path.join(ROOT, 'docs'), '**/*.md')),
      ...(await glob(path.join(ROOT, 'design'), '**/*.md'))
    ]) {
      expect(arabic.test(await Bun.file(file).text()), path.relative(ROOT, file)).toBe(false);
    }
  });

  it('canonical design images remain intact and meet the reference inventory', async () => {
    const images = await glob(path.join(ROOT, 'design'), '**/*.{png,svg}');
    expect(images.length).toBeGreaterThanOrEqual(150);
    for (const reference of [
      'design/auth/01-login.png',
      'design/auth/15-dark.png',
      'design/map-page/navigation/01-map-idle.png',
      'design/map-page/sos/03-sos-compose.png',
      'design/map-page/mission/05-mission-accepted.png',
      'design/admin-panel/dashboard/01-overview.png',
      'design/admin-panel/users/01-list.png',
      'design/icons/01-overview.png'
    ]) {
      expect(await exists(reference), reference).toBe(true);
      expect(Bun.file(path.join(ROOT, reference)).size, reference).toBeGreaterThan(100);
    }
  });
});
