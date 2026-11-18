import { config as loadDotEnv } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { safeMigrationErrorDetails } from "./migration-error";
import { checkSchemaReadiness, schemaReadinessMessage } from "./schema-readiness";

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
    // Drizzle compares only the latest created_at. A row from a different branch
    // with a larger timestamp can make migrate() return successfully while it
    // silently skips required earlier files. Never report success in that state.
    const state = await checkSchemaReadiness(async (sql) => await client.unsafe(sql));
    if (!state.ready) throw new Error(schemaReadinessMessage(state));
    console.info("Database migrations applied and required schema verified.");
  } finally {
    await client.end();
  }
}

migrateDatabase().catch((error: unknown) => {
  console.error("Database migration failed. Sanitized cause details follow; credentials were redacted.");
  const details = safeMigrationErrorDetails(error, process.env.DATABASE_URL);
  if (details.length === 0) {
    console.error("  No safe error details were available.");
  } else {
    for (const detail of details) console.error(`  ${detail}`);
  }
  process.exitCode = 1;
});
