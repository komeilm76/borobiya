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
  readonly missingColumns: readonly string[];
  readonly ready: boolean;
}

const missionPolicyColumns = ["rescuer_visible_to_requester", "requester_visible_to_rescuer",
  "admin_visible_to_requester", "admin_visible_to_rescuer"] as const;

/** Read-only schema probe against the API's database. A journal row alone cannot
 * prove that mission policy columns or foreground trip permissions still exist after schema drift. */
export async function checkSchemaReadiness(query: (sql: string) => Promise<readonly Record<string, unknown>[]>): Promise<SchemaReadiness> {
  const [tables] = await query(`SELECT
    to_regclass('drizzle.__drizzle_migrations')::text AS journal,
    to_regclass('public.mission_proposals')::text AS proposals,
    to_regclass('public.missions')::text AS missions,
    to_regclass('public.mission_track_points')::text AS track_points,
    to_regclass('public.mission_suggested_routes')::text AS suggested_routes,
    to_regclass('public.location_trips')::text AS location_trips`);
  const missingTables = ([
    ["drizzle.__drizzle_migrations", tables?.journal],
    ["public.mission_proposals", tables?.proposals],
    ["public.missions", tables?.missions],
    ["public.mission_track_points", tables?.track_points],
    ["public.mission_suggested_routes", tables?.suggested_routes],
    ["public.location_trips", tables?.location_trips]
  ] as const).filter(([, found]) => !found).map(([name]) => name);
  const present = tables?.missions ? await query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions'
      AND column_name IN ('rescuer_visible_to_requester', 'requester_visible_to_rescuer',
        'admin_visible_to_requester', 'admin_visible_to_rescuer')`) : [];
  const found = new Set(present.map((row) => row.column_name));
  const missingColumns = tables?.missions ? missionPolicyColumns.filter((name) => !found.has(name)) : [];
  const [last] = tables?.journal ? await query("SELECT max(created_at) AS latest FROM drizzle.__drizzle_migrations") : [];
  const timestamp = last?.latest == null ? null : Number(last.latest);
  const latestAppliedAt = timestamp !== null && Number.isFinite(timestamp) ? timestamp : null;
  return { latestAppliedAt, missingTables, missingColumns,
    ready: missingTables.length === 0 && missingColumns.length === 0 && latestAppliedAt !== null &&
      latestAppliedAt >= REQUIRED_MIGRATION_TIMESTAMP };
}

export function schemaReadinessMessage(state: SchemaReadiness): string {
  const missing = state.missingTables.length ? ` Missing tables: ${state.missingTables.join(", ")}.` : "";
  const columns = state.missingColumns.length ? ` Missing mission columns: ${state.missingColumns.join(", ")}.` : "";
  const drift = state.latestAppliedAt !== null && state.latestAppliedAt >= REQUIRED_MIGRATION_TIMESTAMP &&
    (state.missingTables.length > 0 || state.missingColumns.length > 0);
  if (drift) return `Database migration checkpoint is at or beyond ${REQUIRED_MIGRATION}, but required schema objects are missing.${missing}${columns} ` +
    "Stop: back up and reconcile the database with an operator; rerunning migrations cannot repair a checkpoint that is already newer. " +
    "Do not delete the database volume or edit the migration journal.";
  return `Database schema is behind the checked-in ${REQUIRED_MIGRATION} migration.${missing}${columns} ` +
    "Apply the reviewed migrations to the SAME database as the API with " +
    "`bun --filter @borobiya/server db:migrate:runtime` (host) or " +
    "`docker compose run --rm --build api bun src/db/migrate.ts` (Compose). " +
    "Do not reset or delete the database volume.";
}
