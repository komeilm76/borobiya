import { config as loadDotEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const packageRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
loadDotEnv({ path: resolve(packageRoot, "../../.env"), quiet: true });

/**
 * Runtime migration runner for environments where drizzle-kit (a devDependency)
 * is unavailable—notably the production API image, which ships the checked-in
 * `drizzle/` SQL folder but no drizzle-kit. Applies exactly the same reviewed
 * migrations as `bun run db:migrate` on a development host:
 *
 *   docker compose run --rm api bun src/db/migrate.ts
 */
async function migrateDatabase(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to migrate the database.");
  }

  const client = postgres(databaseUrl, { max: 1 });
  try {
    await migrate(drizzle(client), {
      migrationsFolder: resolve(packageRoot, "drizzle")
    });
    console.info("Database migrations applied.");
  } finally {
    await client.end();
  }
}

migrateDatabase().catch(() => {
  console.error("Database migration failed. Check DATABASE_URL and database availability; no credentials were logged.");
  process.exitCode = 1;
});
