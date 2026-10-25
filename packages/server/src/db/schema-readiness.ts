import { readFileSync } from "node:fs";

const journal = JSON.parse(readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
  entries: { tag: string; when: number }[];
};
const latest = journal.entries.at(-1);
if (!latest) throw new Error("The database migration journal is empty.");

export const REQUIRED_MIGRATION = latest.tag;
export const REQUIRED_MIGRATION_TIMESTAMP = latest.when;

export interface SchemaReadiness {
  readonly latestAppliedAt: number | null;
  readonly missingTables: readonly string[];
  readonly ready: boolean;
}

/** Read-only schema probe. Never run migrations implicitly when starting the development app. */
export async function checkSchemaReadiness(query: (sql: string) => Promise<readonly Record<string, unknown>[]>): Promise<SchemaReadiness> {
  const [tables] = await query(`SELECT
    to_regclass('drizzle.__drizzle_migrations')::text AS journal,
    to_regclass('public.mission_proposals')::text AS proposals,
    to_regclass('public.missions')::text AS missions`);
  const missingTables = ([
    ["drizzle.__drizzle_migrations", tables?.journal],
    ["public.mission_proposals", tables?.proposals],
    ["public.missions", tables?.missions]
  ] as const).filter(([, found]) => !found).map(([name]) => name);
  const [last] = tables?.journal ? await query("SELECT max(created_at) AS latest FROM drizzle.__drizzle_migrations") : [];
  const timestamp = last?.latest == null ? null : Number(last.latest);
  const latestAppliedAt = timestamp !== null && Number.isFinite(timestamp) ? timestamp : null;
  return { latestAppliedAt, missingTables,
    ready: missingTables.length === 0 && latestAppliedAt !== null && latestAppliedAt >= REQUIRED_MIGRATION_TIMESTAMP };
}

export function schemaReadinessMessage(state: SchemaReadiness): string {
  const missing = state.missingTables.length ? ` Missing: ${state.missingTables.join(", ")}.` : "";
  return `Database schema is behind the checked-in ${REQUIRED_MIGRATION} migration.${missing} ` +
    "Apply the reviewed migrations to the SAME database as the API with " +
    "`bun --filter @borobiya/server db:migrate:runtime` (host) or " +
    "`docker compose run --rm --build api bun src/db/migrate.ts` (Compose). " +
    "Do not reset or delete the database volume.";
}
