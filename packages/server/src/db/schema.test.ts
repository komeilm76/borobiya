import { readFileSync, readdirSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  adminAuditLog,
  categories,
  categoryIncidentTypes,
  categoryUsers,
  incidentTypes,
  locationHistory,
  sosRequests,
  locationHistoryShares,
  locationShares,
  passwordResetChallenges,
  passwordResetTokens,
  userSecurityAnswers,
  userSessions,
  users
} from "./schema";

describe("users database schema", () => {
  it("declares one answer per user/question with both foreign keys", () => {
    const config = getTableConfig(userSecurityAnswers);
    const columns = new Map(config.columns.map((column) => [column.name, column]));

    expect(config.uniqueConstraints.some(({ name }) => name === "user_security_answers_user_question_unique")).toBe(true);
    expect(config.foreignKeys).toHaveLength(2);
    expect(columns.get("answer_hash")?.notNull).toBe(true);
  });

  it("declares account flags, bounded ratings, and indexed PostGIS location", () => {
    const config = getTableConfig(users);
    const columns = new Map(config.columns.map((column) => [column.name, column]));

    for (const [name, defaultValue] of [
      ["is_active", true],
      ["is_suspended", false],
      ["must_complete_security_questions", false]
    ] as const) {
      const column = columns.get(name);
      expect(column?.notNull).toBe(true);
      expect(column?.hasDefault).toBe(true);
      expect(column?.default).toBe(defaultValue);
    }

    const avgRating = columns.get("avg_rating");
    expect(avgRating?.getSQLType()).toBe("numeric(2, 1)");
    expect(avgRating?.notNull).toBe(false);
    expect(config.checks.some(({ name }) => name === "users_avg_rating_range_check")).toBe(true);

    const lastLocation = columns.get("last_location");
    expect(lastLocation?.getSQLType()).toBe("geography(Point,4326)");
    expect(lastLocation?.notNull).toBe(false);
    expect(
      config.indexes.some(
        ({ config: indexConfig }) =>
          indexConfig.name === "idx_users_last_location_gist" && indexConfig.method === "gist"
      )
    ).toBe(true);
  });

  it("indexes and uniquely constrains stored refresh-token hashes", () => {
    const config = getTableConfig(userSessions);
    const refreshTokenHashIndex = config.indexes.find(
      ({ config: indexConfig }) => indexConfig.name === "user_sessions_refresh_token_hash_unique"
    );

    expect(refreshTokenHashIndex?.config.unique).toBe(true);
    const indexedColumnNames = refreshTokenHashIndex?.config.columns
      .map((column) => ("name" in column ? column.name : undefined))
      .filter((name): name is string => typeof name === "string");
    expect(indexedColumnNames).toEqual(["refresh_token_hash"]);
  });

  it("stores short-lived recovery challenges and one-time hashed password reset tokens", () => {
    const challengeConfig = getTableConfig(passwordResetChallenges);
    const tokenConfig = getTableConfig(passwordResetTokens);
    const challengeColumns = new Map(challengeConfig.columns.map((column) => [column.name, column]));
    const tokenColumns = new Map(tokenConfig.columns.map((column) => [column.name, column]));

    expect(challengeColumns.get("question_ids")?.getSQLType()).toBe("uuid[]");
    expect(challengeColumns.get("expires_at")?.notNull).toBe(true);
    expect(challengeColumns.get("consumed_at")?.notNull).toBe(false);
    expect(challengeConfig.uniqueConstraints.some(({ name }) => name === "password_reset_challenges_user_id_unique")).toBe(true);
    expect(challengeConfig.checks.some(({ name }) => name === "password_reset_challenges_question_ids_count_check")).toBe(true);

    expect(tokenColumns.get("token_hash")?.notNull).toBe(true);
    expect(tokenConfig.uniqueConstraints.some(({ name }) => name === "password_reset_tokens_token_hash_unique")).toBe(true);
    expect(tokenConfig.indexes.some(({ config: indexConfig }) => indexConfig.name === "password_reset_tokens_user_id_idx")).toBe(true);

    const migrationSql = readFileSync(new URL("../../drizzle/0004_spotty_captain_midlands.sql", import.meta.url), "utf8");
    expect(migrationSql).toContain('CREATE TABLE "password_reset_challenges"');
    expect(migrationSql).toContain('CREATE TABLE "password_reset_tokens"');
    expect(migrationSql).toContain('CONSTRAINT "password_reset_tokens_token_hash_unique" UNIQUE("token_hash")');
  });

  it("stores constrained live location shares with owner, target, and expiry indexes", () => {
    const config = getTableConfig(locationShares);
    const columns = new Map(config.columns.map((column) => [column.name, column]));
    const checkNames = config.checks.map(({ name }) => name);
    const indexNames = config.indexes.map(({ config: indexConfig }) => indexConfig.name);

    expect(columns.get("owner_id")?.notNull).toBe(true);
    expect(columns.get("target_user_id")?.notNull).toBe(true);
    expect(columns.get("mode")?.notNull).toBe(true);
    expect(columns.get("expires_at")?.notNull).toBe(false);
    expect(columns.get("is_revoked")?.notNull).toBe(true);
    expect(columns.get("is_revoked")?.default).toBe(false);
    expect(columns.get("priority_device_id")?.notNull).toBe(false);
    expect(columns.get("note")?.notNull).toBe(false);
    expect(columns.get("created_at")?.notNull).toBe(true);
    expect(columns.get("created_at")?.hasDefault).toBe(true);
    expect(config.foreignKeys).toHaveLength(2);
    expect(checkNames).toEqual([
      "location_shares_mode_check",
      "location_shares_owner_target_check",
      "location_shares_expiry_mode_check"
    ]);
    expect(indexNames).toEqual([
      "location_shares_owner_created_at_idx",
      "location_shares_target_created_at_idx",
      "location_shares_expires_at_idx",
      "location_shares_active_pinned_idx"
    ]);
    // Partial index for the maintenance sweeps: retired rows stay for audit, so an unpredicated
    // scan of this table grows forever.
    const pinnedIndex = config.indexes.find(
      ({ config: indexConfig }) => indexConfig.name === "location_shares_active_pinned_idx"
    );
    expect(pinnedIndex?.config.where).toBeTruthy();

    const migrationNames = readdirSync(new URL("../../drizzle/", import.meta.url)).filter((name) =>
      /^0006_.*\.sql$/.test(name)
    );
    expect(migrationNames).toHaveLength(1);
    const migrationName = migrationNames[0];
    if (!migrationName) throw new Error("The location-shares migration is missing.");
    const migrationSql = readFileSync(new URL(`../../drizzle/${migrationName}`, import.meta.url), "utf8");

    expect(migrationSql).toContain(`CREATE TABLE "location_shares"`);
    expect(migrationSql).toContain(`CONSTRAINT "location_shares_mode_check" CHECK ("mode" IN ('timed', 'permanent'))`);
    expect(migrationSql).toContain(`CONSTRAINT "location_shares_owner_target_check" CHECK ("owner_id" <> "target_user_id")`);
    expect(migrationSql).toContain(
      `CONSTRAINT "location_shares_expiry_mode_check" CHECK (("mode" = 'timed' AND "expires_at" IS NOT NULL) OR ("mode" = 'permanent' AND "expires_at" IS NULL))`
    );
    expect((migrationSql.match(/ON DELETE cascade/g) ?? [])).toHaveLength(2);
    expect(migrationSql).toContain(`CREATE INDEX "location_shares_expires_at_idx"`);
  });

  it("persists the admin audit trail with an admin foreign key and query indexes", () => {
    const config = getTableConfig(adminAuditLog);
    const columns = new Map(config.columns.map((column) => [column.name, column]));
    const indexNames = config.indexes.map(({ config: indexConfig }) => indexConfig.name);

    expect(columns.has("id")).toBe(true);
    expect(columns.get("admin_id")?.notNull).toBe(true);
    expect(columns.get("action")?.notNull).toBe(true);
    expect(columns.get("target_type")?.notNull).toBe(false);
    expect(columns.get("target_id")?.notNull).toBe(false);
    expect(columns.get("meta")?.getSQLType()).toBe("jsonb");
    expect(columns.get("created_at")?.notNull).toBe(true);
    expect(config.foreignKeys).toHaveLength(1);
    expect(indexNames).toEqual([
      "admin_audit_log_admin_created_at_idx",
      "admin_audit_log_target_idx"
    ]);

    const migrationSql = readFileSync(new URL("../../drizzle/0005_tidy_imperial_guard.sql", import.meta.url), "utf8");
    expect(migrationSql).toContain('CREATE TABLE "admin_audit_log"');
    expect(migrationSql).toContain('"admin_id" uuid NOT NULL');
    expect(migrationSql).toContain('CONSTRAINT "admin_audit_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id")');
    expect(migrationSql).toContain('"meta" jsonb');
    expect(migrationSql).toContain('CREATE INDEX "admin_audit_log_admin_created_at_idx"');
  });

  it("enables PostGIS before declaring the unquoted geography column", () => {
    const migrationSql = readFileSync(new URL("../../drizzle/0002_lazy_shiver_man.sql", import.meta.url), "utf8");
    const extensionPosition = migrationSql.indexOf("CREATE EXTENSION IF NOT EXISTS postgis;");
    const geographyPosition = migrationSql.indexOf('ADD COLUMN "last_location" geography(Point,4326)');

    expect(extensionPosition).toBeGreaterThanOrEqual(0);
    expect(geographyPosition).toBeGreaterThan(extensionPosition);
    expect(migrationSql).not.toContain('"geography(Point,4326)"');
  });
});

describe("location history schema (T2.2.1/T2.2.2)", () => {
  it("stores bounded fixes with a user/time index and cascade deletes", () => {
    const config = getTableConfig(locationHistory);
    const columns = new Map(config.columns.map((column) => [column.name, column]));

    expect(columns.get("id")?.getSQLType()).toBe("bigserial");
    expect(columns.get("user_id")?.notNull).toBe(true);
    expect(columns.get("lat")?.getSQLType()).toBe("double precision");
    expect(columns.get("lon")?.getSQLType()).toBe("double precision");
    expect(columns.get("accuracy")?.notNull).toBe(false);
    expect(columns.get("timestamp")?.notNull).toBe(true);
    expect(config.foreignKeys).toHaveLength(1);
    expect(config.checks.map(({ name }) => name)).toEqual([
      "location_history_lat_check",
      "location_history_lon_check",
      "location_history_accuracy_check"
    ]);
    expect(config.indexes.map(({ config: indexConfig }) => indexConfig.name)).toEqual([
      "idx_location_history_user_time"
    ]);
  });

  it("grants one bounded, non-self window per owner/target pair", () => {
    const config = getTableConfig(locationHistoryShares);
    const columns = new Map(config.columns.map((column) => [column.name, column]));

    expect(columns.get("from_time")?.notNull).toBe(true);
    expect(columns.get("to_time")?.notNull).toBe(true);
    // The requested sampling resolution rides on the grant, nullable because "no preference" is legal.
    expect(columns.get("max_points")?.notNull).toBe(false);
    expect(config.foreignKeys).toHaveLength(2);
    expect(config.checks.map(({ name }) => name)).toEqual([
      "location_history_shares_owner_target_check",
      "location_history_shares_window_check",
      "location_history_shares_max_points_check"
    ]);
    expect(
      config.uniqueConstraints.some(({ name }) => name === "location_history_shares_owner_target_window_unique")
    ).toBe(true);
    expect(config.indexes.map(({ config: indexConfig }) => indexConfig.name)).toEqual([
      "location_history_shares_owner_idx",
      "location_history_shares_target_idx"
    ]);
  });

  it("creates both tables, indexes, and constraints in the T2.2 migration", () => {
    const migrationNames = readdirSync(new URL("../../drizzle/", import.meta.url)).filter((name) =>
      /^0007_.*\.sql$/.test(name)
    );
    expect(migrationNames).toHaveLength(1);
    const migrationName = migrationNames[0];
    if (!migrationName) throw new Error("The location-history migration is missing.");
    const migrationSql = readFileSync(new URL(`../../drizzle/${migrationName}`, import.meta.url), "utf8");

    expect(migrationSql).toContain('CREATE TABLE "location_history" (\n\t"id" bigserial PRIMARY KEY NOT NULL');
    expect(migrationSql).toContain('CREATE TABLE "location_history_shares"');
    expect(migrationSql).toContain('"lat" double precision NOT NULL');
    expect(migrationSql).toContain('"accuracy" double precision');
    expect(migrationSql).toContain('CONSTRAINT "location_history_lat_check" CHECK ("lat" BETWEEN -90 AND 90)');
    expect(migrationSql).toContain('CONSTRAINT "location_history_shares_window_check" CHECK ("to_time" > "from_time")');
    expect(migrationSql).toContain(
      'CONSTRAINT "location_history_shares_owner_target_window_unique" UNIQUE("owner_id","target_user_id","from_time","to_time")'
    );
    expect(migrationSql).toContain('CREATE INDEX "idx_location_history_user_time" ON "location_history" USING btree ("user_id","timestamp")');
    // History rows follow the account away; share grants must survive until their own retention pass.
    expect((migrationSql.match(/ON DELETE cascade/g) ?? [])).toHaveLength(1);
    expect(migrationSql).not.toContain("DROP TABLE");
    expect(migrationSql).not.toContain("ALTER TABLE \"users\"");
  });

  it("adds max_points to history grants without disturbing existing windows", () => {
    const migrationNames = readdirSync(new URL("../../drizzle/", import.meta.url)).filter((name) =>
      /^0009_.*\.sql$/.test(name)
    );
    expect(migrationNames).toHaveLength(1);
    const migrationSql = readFileSync(new URL(`../../drizzle/${migrationNames[0]}`, import.meta.url), "utf8");

    expect(migrationSql).toContain('ALTER TABLE "location_history_shares" ADD COLUMN "max_points" integer;');
    expect(migrationSql).toContain(
      'ADD CONSTRAINT "location_history_shares_max_points_check" CHECK ("max_points" IS NULL OR "max_points" > 0)'
    );
    // A nullable column with a value-free check: no backfill, no rewrite of grants already handed out.
    expect(migrationSql).not.toMatch(/DROP|DELETE|UPDATE|SET NOT NULL/i);
  });

  it("adds the sweep's partial index as an index-only migration", () => {
    const migrationNames = readdirSync(new URL("../../drizzle/", import.meta.url)).filter((name) =>
      /^0008_.*\.sql$/.test(name)
    );
    expect(migrationNames).toHaveLength(1);
    const migrationSql = readFileSync(new URL(`../../drizzle/${migrationNames[0]}`, import.meta.url), "utf8");

    expect(migrationSql.trim()).toBe(
      'CREATE INDEX "location_shares_active_pinned_idx" ON "location_shares" USING btree ("owner_id","priority_device_id") WHERE "is_revoked" = false and "priority_device_id" is not null;'
    );
    // Nothing but an index: no table rewrite, no data statement, and no drop that could lose a
    // share row a receiver is still reading.
    expect(migrationSql.trim().split("\n")).toHaveLength(1);
    expect(migrationSql).not.toMatch(/DROP|DELETE|UPDATE|ALTER TABLE/i);
  });
});

describe("categories and incident catalog (T3.1.1)", () => {
  const migrationNames = readdirSync(new URL("../../drizzle/", import.meta.url)).filter((name) =>
    /^0010_.*\.sql$/.test(name)
  );

  it("declares the incident catalog with a unique slug and no invented format rules", () => {
    const config = getTableConfig(incidentTypes);
    const columns = new Map(config.columns.map((column) => [column.name, column]));

    expect(columns.get("id")?.hasDefault).toBe(true);
    expect(columns.get("name")?.notNull).toBe(true);
    expect(columns.get("slug")?.notNull).toBe(true);
    for (const optional of ["icon", "color", "description"]) {
      expect(columns.get(optional)?.notNull, optional).toBe(false);
    }
    // `created_at` is NOT NULL with a default (tightened by 0011) because the shared response schemas
    // require `createdAt`; a nullable column there leaks a `Date | null` no route can answer with.
    expect(columns.get("created_at")?.hasDefault).toBe(true);
    expect(columns.get("created_at")?.notNull).toBe(true);
    expect(config.uniqueConstraints.map(({ name }) => name)).toEqual(["incident_types_slug_unique"]);
    expect(config.checks).toHaveLength(0);
    expect(config.foreignKeys).toHaveLength(0);
  });

  it("declares a category as a name plus membership, nothing else", () => {
    const config = getTableConfig(categories);
    expect(config.columns.map((column) => column.name)).toEqual(["id", "name", "description", "created_at"]);
    expect(config.columns.find((column) => column.name === "created_at")?.notNull).toBe(true);
    expect(config.indexes).toHaveLength(0);
    expect(config.foreignKeys).toHaveLength(0);
  });

  for (const [label, table, columns] of [
    ["category_incident_types", categoryIncidentTypes, ["category_id", "incident_type_id"]],
    ["category_users", categoryUsers, ["category_id", "user_id"]]
  ] as const) {
    it(`makes ${label} a composite-key pivot whose rows die with either side`, () => {
      const config = getTableConfig(table);
      expect(config.uniqueConstraints).toHaveLength(0);
      expect(config.indexes).toHaveLength(0);
      expect(config.primaryKeys.map((key) => key.name)).toEqual([`${label}_pkey`]);
      // Both halves cascade: the row is a pairing, so it cannot outlive either side, and a stale pairing
      // would keep a deleted incident type answering a live category (or a deleted user in a group).
      expect(config.foreignKeys).toHaveLength(2);
      for (const fk of config.foreignKeys) {
        expect(fk.onDelete).toBe("cascade");
        expect(fk.onUpdate).toBe("no action");
      }
      // Exactly two NOT NULL columns and no defaults: a membership row is always written on purpose,
      // never implied by an insert (T3.1.4 starts every account in no category).
      expect(config.columns.map((column) => column.name)).toEqual([...columns]);
      expect(config.columns.filter((column) => column.notNull).map((column) => column.name)).toEqual([...columns]);
      expect(config.columns.some((column) => column.hasDefault)).toBe(false);
    });
  }

  it("tightens the catalog timestamps to NOT NULL, backfilling before the constraint", () => {
    const names = readdirSync(new URL("../../drizzle/", import.meta.url)).filter((n) => /^0011_.*\.sql$/.test(n));
    expect(names).toHaveLength(1);
    const name = names[0];
    if (!name) throw new Error("The catalog timestamp migration is missing.");
    const sqlText = readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), "utf8");

    for (const table of ["categories", "incident_types"]) {
      // Without the backfill, `SET NOT NULL` fails outright on a database that already has rows.
      expect(sqlText, table).toContain(`UPDATE "${table}" SET "created_at" = now() WHERE "created_at" IS NULL`);
      expect(sqlText, table).toContain(`ALTER TABLE "${table}" ALTER COLUMN "created_at" SET NOT NULL`);
      expect(sqlText.indexOf(`UPDATE "${table}"`), table).toBeLessThan(sqlText.indexOf(`ALTER TABLE "${table}"`));
    }
  });

  it("ships the four tables as one generated migration, with the pivots' keys and cascades", () => {
    expect(migrationNames).toHaveLength(1);
    const name = migrationNames[0];
    if (!name) throw new Error("The categories/incident-types migration is missing.");
    const sql = readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), "utf8");

    for (const table of ["incident_types", "categories", "category_incident_types", "category_users"]) {
      expect(sql, table).toContain(`CREATE TABLE "${table}"`);
    }
    expect(sql).toContain('CONSTRAINT "incident_types_slug_unique" UNIQUE("slug")');
    expect(sql).toContain('CONSTRAINT "category_users_pkey" PRIMARY KEY("category_id","user_id")');
    expect(sql).toContain('CONSTRAINT "category_incident_types_pkey" PRIMARY KEY("category_id","incident_type_id")');
    for (const fk of [
      '"category_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade',
      '"category_users_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade',
      '"category_incident_types_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade',
      '"category_incident_types_incident_type_id_incident_types_id_fk" FOREIGN KEY ("incident_type_id") REFERENCES "public"."incident_types"("id") ON DELETE cascade'
    ]) {
      expect(sql, fk).toContain(fk);
    }
    // No membership is seeded by the DDL itself — T3.1.4 starts every account unassigned, so the only
    // defaults in this migration are the two `gen_random_uuid()` primary keys and `created_at`.
    expect(sql).not.toMatch(/INSERT INTO "category_(users|incident_types)"/);
    expect(sql.match(/DEFAULT gen_random_uuid\(\)/g) ?? []).toHaveLength(2);
    expect(sql.match(/DEFAULT now\(\)/g) ?? []).toHaveLength(2);
  });
});

describe("sos request table (T3.2.1)", () => {
  const migrationNames = readdirSync(new URL("../../drizzle/", import.meta.url)).filter((name) =>
    /^0012_.*\.sql$/.test(name)
  );

  it("declares the request with its three owners and no cascades", () => {
    const config = getTableConfig(sosRequests);
    const columns = new Map(config.columns.map((column) => [column.name, column]));

    expect(columns.get("requester_id")?.notNull).toBe(true);
    expect(columns.get("incident_type_id")?.notNull).toBe(true);
    expect(columns.get("location")?.getSQLType()).toBe("geography(Point,4326)");
    expect(columns.get("location")?.notNull).toBe(true);
    // The device may not know how accurate it is, and a photo is optional until T3.2.3 exists.
    expect(columns.get("accuracy")?.notNull).toBe(false);
    expect(columns.get("photo_url")?.notNull).toBe(false);
    for (const name of ["is_manual", "status", "created_at"]) {
      expect(columns.get(name)?.notNull, name).toBe(true);
      expect(columns.get(name)?.hasDefault, name).toBe(true);
    }
    expect(config.foreignKeys).toHaveLength(3);
    // No cascade anywhere on this table: an account being deleted must not erase that somebody asked for
    // help, and an incident type must not be deletable out from under a request naming it.
    for (const fk of config.foreignKeys) {
      expect(fk.onDelete).toBe("no action");
    }
    expect(config.indexes).toHaveLength(0);
    expect(config.uniqueConstraints).toHaveLength(0);
  });

  it("restates the body's own bounds as database checks, so no row can exist that the API would refuse", () => {
    const config = getTableConfig(sosRequests);
    const names = config.checks.map(({ name }) => name);
    expect(names).toEqual([
      "sos_requests_severity_check",
      "sos_requests_description_length_check",
      "sos_requests_status_check"
    ]);
    // A cancellation cross-check belongs to T3.6, where §11.7C's rule is being implemented; guessing it
    // here would make this table the authority on a decision that task has not made yet.
    expect(names.filter((name) => name.includes("cancellation"))).toEqual([]);
  });

  it("generates the DDL the diagram describes", () => {
    expect(migrationNames).toHaveLength(1);
    const name = migrationNames[0];
    if (!name) throw new Error("The sos_requests migration is missing.");
    const sql = readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), "utf8");

    expect(sql).toContain('CREATE TABLE "sos_requests"');
    expect(sql).toContain('"location" "geography(Point,4326)" NOT NULL');
    expect(sql).toContain("\"status\" text DEFAULT 'pending' NOT NULL");
    expect(sql).toContain('"is_manual" boolean DEFAULT false NOT NULL');
    expect(sql).toContain('"created_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(sql).toContain('CONSTRAINT "sos_requests_description_length_check" CHECK (char_length("description") BETWEEN 10 AND 500)');
    expect(sql).toContain(
      `CONSTRAINT "sos_requests_status_check" CHECK ("status" IN ('pending', 'dispatched', 'accepted', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired', 'completed'))`
    );
    for (const fk of [
      '"sos_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action',
      '"sos_requests_incident_type_id_incident_types_id_fk" FOREIGN KEY ("incident_type_id") REFERENCES "public"."incident_types"("id") ON DELETE no action',
      '"sos_requests_cancellation_reason_id_cancellation_reasons_id_fk" FOREIGN KEY ("cancellation_reason_id") REFERENCES "public"."cancellation_reasons"("id") ON DELETE no action'
    ]) {
      expect(sql, fk).toContain(fk);
    }
    // The nearest-responder index (T3.3.1) is a measured decision for that query, not a guess here.
    expect(sql).not.toContain("CREATE INDEX");
    expect(sql).not.toContain("GIST");
  });
});
