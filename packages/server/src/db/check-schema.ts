import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { safeMigrationErrorDetails } from "./migration-error";
import { checkSchemaReadiness, REQUIRED_MIGRATION, schemaReadinessMessage } from "./schema-readiness";

const packageRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
loadDotEnv({ path: resolve(packageRoot, "../../.env"), quiet: true });

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required to check the database schema.");
  const client = postgres(databaseUrl, { max: 1 });
  try {
    const state = await checkSchemaReadiness(async (sql) => await client.unsafe(sql));
    if (!state.ready) {
      console.error(schemaReadinessMessage(state));
      process.exitCode = 1;
      return;
    }
    console.info(`Database schema ready (${REQUIRED_MIGRATION}); proposal and mission tables present.`);
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Database schema check failed. Sanitized cause details follow:");
  for (const detail of safeMigrationErrorDetails(error, process.env.DATABASE_URL)) console.error(`  ${detail}`);
  process.exitCode = 1;
});
