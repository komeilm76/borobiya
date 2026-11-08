import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/u;

function walk(directory: string, extension: string): string[] {
  const output: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...walk(absolute, extension));
    else if (entry.name.endsWith(extension)) output.push(absolute);
  }
  return output;
}
const read = (relative: string) => readFileSync(path.join(ROOT, relative), 'utf8');

test('the clean rebuild has zero runtime dependencies and no legacy workspace paths', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(Object.keys(pkg.dependencies || {}), []);
  assert.equal(pkg.engines.node, '>=22.12.0');
  assert.ok(pkg.devDependencies.typescript);
  assert.ok(existsSync(path.join(ROOT, 'package-lock.json')));
  for (const legacy of ['packages', 'map-server', 'bun.lock', 'vitest.config.ts', 'pnpm-lock.yaml']) {
    assert.equal(existsSync(path.join(ROOT, legacy)), false, legacy);
  }
  const scripts = JSON.stringify(pkg.scripts);
  assert.doesNotMatch(scripts, /bun|vitest|pnpm/);
  assert.match(scripts, /--disable-warning=ExperimentalWarning/);
});

test('the architecture keeps pure domain modules free of infrastructure imports', () => {
  for (const file of walk(path.join(ROOT, 'src/domain'), '.ts')) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from ['"]node:/, path.relative(ROOT, file));
    assert.doesNotMatch(source, /from ['"]\.\.\/(db|services|core)\//, path.relative(ROOT, file));
  }
  const geo = read('src/domain/geo.ts');
  assert.match(geo, /public\/js\/geo\.js/);
  const database = read('src/db/database.ts');
  assert.match(database, /node:sqlite/);
  assert.match(database, /CREATE TABLE/);
  const unit = read('src/db/unit-of-work.ts');
  assert.match(unit, /hub\.publish/);
  assert.match(unit, /transaction/);
  const app = read('src/app.ts');
  assert.match(app, /createServices/);
  assert.match(app, /WebSocketHub/);
  assert.match(app, /UnitOfWork/);
  assert.match(app, /StaticFiles/);
});

test('the declarative route layer and shared protocol connect server and browser', () => {
  const routes = read('src/routes/index.ts');
  assert.match(routes, /router\.add\(/);
  assert.match(routes, /'\/_auth\/login'/);
  assert.match(routes, /'\/_user\/sos'/);
  assert.match(routes, /'\/_admin\/dispatch'/);
  assert.match(routes, /'\/_public\/openapi\.json'/);
  const protocol = read('public/js/protocol.js');
  assert.match(protocol, /export const WS_EVENTS/);
  assert.match(protocol, /export const SOS_STATUS/);
  assert.match(protocol, /export const AUDIO/);
  assert.match(read('src/services/realtime.ts'), /public\/js\/protocol\.js/);
  assert.match(read('public/js/transport.js'), /protocol\.js/);
});

test('the new test suite is comprehensive and free of old Python design tests', () => {
  const tests = readdirSync(path.join(ROOT, 'tests')).filter((file) => file.endsWith('.test.ts')).sort();
  for (const name of ['core.test.ts', 'api.test.ts', 'auth.test.ts', 'security.test.ts', 'realtime.test.ts', 'journeys.test.ts', 'architecture.test.ts', 'assets.test.ts', 'acceptance.test.ts', 'accessibility.test.ts', 'performance.test.ts', 'database.test.ts']) {
    assert.ok(tests.includes(name), name);
  }
  const oldDesignTests = walk(path.join(ROOT, 'design'), '.py').filter((file) => /^(test_|.*_test)\.py$/.test(path.basename(file)));
  assert.deepEqual(oldDesignTests, []);
  const journeys = read('tests/journeys.test.ts');
  assert.match(journeys, /hypothetical requester journey/);
  assert.match(journeys, /hypothetical administrator journey/);
});

test('every required practical document exists, is substantial and is English-only', () => {
  const required = ['README.md', 'design/README.md', 'design/auth/README.md', 'design/icons/README.md',
    'design/admin-panel/README.md', 'design/map-page/README.md', 'docs/README.md', 'docs/ARCHITECTURE.md',
    'docs/API.md', 'docs/WEBSOCKET.md', 'docs/DEVELOPMENT.md', 'docs/DEPLOYMENT.md', 'docs/USER_MANUAL.md',
    'docs/ADMIN_MANUAL.md', 'docs/TESTING.md', 'docs/SECURITY.md', 'docs/PERFORMANCE.md',
    'docs/AUTOMATION.md', 'docs/DESIGN_SYSTEM.md', 'docs/LEGACY_REVIEW.md', 'docs/STATUS.md',
    'docs/ACCEPTANCE.md', 'docs/RELEASE_NOTES.md', 'docs/OPERATIONS.md'];
  for (const relative of required) {
    const absolute = path.join(ROOT, relative);
    assert.ok(existsSync(absolute), relative);
    const text = readFileSync(absolute, 'utf8');
    assert.ok(text.trim().length >= 500, relative);
    assert.match(text, /^#\s+\S/m, relative);
    assert.equal(ARABIC.test(text), false, relative);
    assert.doesNotMatch(text, /\b(TODO|TBD|lorem ipsum|junk text|placeholder screenshot)\b/i, relative);
  }
  for (const file of [...walk(path.join(ROOT, 'docs'), '.md'), ...walk(path.join(ROOT, 'design'), '.md')]) {
    const text = readFileSync(file, 'utf8');
    assert.equal(ARABIC.test(text), false, path.relative(ROOT, file));
  }
});

test('canonical design images remain intact and meet the reference inventory', () => {
  const images = walk(path.join(ROOT, 'design'), '.png').concat(walk(path.join(ROOT, 'design'), '.svg'));
  assert.ok(images.length >= 100);
  for (const reference of [
    'design/auth/01-login.png', 'design/auth/15-dark.png',
    'design/map-page/navigation/01-map-idle.png', 'design/map-page/sos/03-sos-compose.png',
    'design/map-page/mission/05-mission-accepted.png', 'design/admin-panel/dashboard/01-overview.png',
    'design/admin-panel/users/01-list.png', 'design/icons/01-overview.png'
  ]) {
    const absolute = path.join(ROOT, reference);
    assert.ok(existsSync(absolute) && statSync(absolute).size > 100, reference);
  }
});
