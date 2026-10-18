import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  passwordResetChallenges,
  passwordResetTokens,
  userSessions,
  users
} from "./schema";

describe("users database schema", () => {
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

  it("enables PostGIS before declaring the unquoted geography column", () => {
    const migrationSql = readFileSync(new URL("../../drizzle/0002_lazy_shiver_man.sql", import.meta.url), "utf8");
    const extensionPosition = migrationSql.indexOf("CREATE EXTENSION IF NOT EXISTS postgis;");
    const geographyPosition = migrationSql.indexOf('ADD COLUMN "last_location" geography(Point,4326)');

    expect(extensionPosition).toBeGreaterThanOrEqual(0);
    expect(geographyPosition).toBeGreaterThan(extensionPosition);
    expect(migrationSql).not.toContain('"geography(Point,4326)"');
  });
});
