import { createApp } from './app.ts';
import { loadConfig } from './core/config.ts';
import { openDatabase, seedDatabase } from './db/database.ts';

/**
 * Seeds catalogs and the bootstrap administrator without starting an HTTP server.
 * Used by `bun run db:seed`, `setup` and `db:reset`.
 */
async function seedOnly(): Promise<void> {
  const config = loadConfig();
  const database = openDatabase(config);
  const result = await seedDatabase(database, config);
  database.close();
  console.log(`[borobiya] database ready: ${config.databasePath}`);
  console.log(`[borobiya] administrator: ${result.adminUsername} (password comes from .env)`);
  if (result.demoPassword) console.log(`[borobiya] demo users: saeed.k, reza.m, maryam.a / ${result.demoPassword}`);
}

/**
 * Starts the single Bun process that serves the Vue SPA, the JSON API, generated assets,
 * deterministic SVG tiles and WebSocket upgrades.
 */
async function main(): Promise<void> {
  if (process.argv.includes('--seed-only')) {
    await seedOnly();
    return;
  }
  const app = await createApp();
  const info = await app.listen();
  console.log(`[borobiya] ${info.url}`);
  console.log(`[borobiya] runtime: bun ${Bun.version}, environment: ${app.config.environment}, map dataset: ${app.config.dataVersion}`);
  if (app.seed.demoPassword) console.log(`[borobiya] demo password: ${app.seed.demoPassword}`);
  console.log('[borobiya] health: GET /_public/health | API: GET /_public/openapi.json');
  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    console.log(`[borobiya] received ${signal}, closing`);
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      console.error(error);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[borobiya] startup failed', error);
  process.exit(1);
});
