import type { CancellationType, LocationShareMode, UserRole } from "@borobiya/shared";
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

/** Raw driver-string PostGIS geography; keep generated DDL unquoted and project app coordinates with spatial SQL. */
const geographyPoint = customType<{ data: string; driverData: string }>({
  dataType: () => "geography(Point,4326)"
});

/** Core account and user-state fields; geospatial writes should use PostGIS constructors. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 30 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 10 }).$type<UserRole>().notNull().default("user"),
    isActive: boolean("is_active").notNull().default(true),
    isSuspended: boolean("is_suspended").notNull().default(false),
    mustCompleteSecurityQuestions: boolean("must_complete_security_questions").notNull().default(false),
    avgRating: numeric("avg_rating", { precision: 2, scale: 1, mode: "number" }),
    lastLocation: geographyPoint("last_location"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("users_username_unique").on(table.username),
    check(
      "users_username_format_check",
      sql`char_length("username") BETWEEN 3 AND 30 AND "username" ~ '^[a-z0-9_]+$'`
    ),
    check("users_role_check", sql`"role" IN ('user', 'admin')`),
    check("users_avg_rating_range_check", sql`"avg_rating" IS NULL OR "avg_rating" BETWEEN 0 AND 5`),
    index("idx_users_last_location_gist").using("gist", table.lastLocation)
  ]
);

export const securityQuestions = pgTable("security_questions", {
  id: uuid("id").defaultRandom().primaryKey(),
  text: text("text").notNull().unique("security_questions_text_unique"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const userSecurityAnswers = pgTable(
  "user_security_answers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => securityQuestions.id),
    answerHash: text("answer_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("user_security_answers_user_question_unique").on(table.userId, table.questionId)]
);

export const userSessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deviceId: text("device_id").notNull(),
    deviceName: text("device_name"),
    refreshTokenHash: text("refresh_token_hash"),
    ip: text("ip"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
    isOnline: boolean("is_online").notNull().default(false)
  },
  (table) => [
    index("user_sessions_user_id_idx").on(table.userId),
    uniqueIndex("user_sessions_refresh_token_hash_unique").on(table.refreshTokenHash)
  ]
);

export const locationShares = pgTable(
  "location_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: varchar("mode", { length: 10 }).$type<LocationShareMode>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isRevoked: boolean("is_revoked").notNull().default(false),
    priorityDeviceId: text("priority_device_id"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("location_shares_mode_check", sql`"mode" IN ('timed', 'permanent')`),
    check("location_shares_owner_target_check", sql`"owner_id" <> "target_user_id"`),
    check(
      "location_shares_expiry_mode_check",
      sql`("mode" = 'timed' AND "expires_at" IS NOT NULL) OR ("mode" = 'permanent' AND "expires_at" IS NULL)`
    ),
    index("location_shares_owner_created_at_idx").on(table.ownerId, table.createdAt),
    index("location_shares_target_created_at_idx").on(table.targetUserId, table.createdAt),
    index("location_shares_expires_at_idx").on(table.expiresAt),
    // Partial index for the maintenance sweep over revoked rows: the share table is never truncated
    // (retired rows stay for audit), so a stale-pin repair that had no index to seek would sequential
    // scan every share ever created, once a minute, forever.
    index("location_shares_active_pinned_idx")
      .on(table.ownerId, table.priorityDeviceId)
      .where(sql`"is_revoked" = false and "priority_device_id" is not null`)
  ]
);

/**
 * Append-only live-position history (T2.2.1). Coordinates stay plain `double precision`
 * columns because every reader is user- and time-scoped: the composite index below serves
 * the polyline/window queries, and no consumer needs a spatial radius predicate that would
 * justify a GiST geography index on this table. Monthly partitioning is documented as
 * optional in ARCHITECTURE §8.3 and is intentionally not used while retention is a DELETE job.
 */
export const locationHistory = pgTable(
  "location_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lat: doublePrecision("lat").notNull(),
    lon: doublePrecision("lon").notNull(),
    accuracy: doublePrecision("accuracy"),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("location_history_lat_check", sql`"lat" BETWEEN -90 AND 90`),
    check("location_history_lon_check", sql`"lon" BETWEEN -180 AND 180`),
    check("location_history_accuracy_check", sql`"accuracy" IS NULL OR "accuracy" >= 0`),
    index("idx_location_history_user_time").on(table.userId, table.timestamp)
  ]
);

/**
 * A bounded historical window one account grants to another (T2.2.2). Rows are never
 * cascaded away with an account so a revoked/retained grant stays auditable.
 */
export const locationHistoryShares = pgTable(
  "location_history_shares",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id),
    fromTime: timestamp("from_time", { withTimezone: true }).notNull(),
    toTime: timestamp("to_time", { withTimezone: true }).notNull(),
    // The resolution the owner asked for, kept on the grant so every receiver reads the same window
    // at the same density unless they override it per request (T2.2.4).
    maxPoints: integer("max_points"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("location_history_shares_owner_target_check", sql`"owner_id" <> "target_user_id"`),
    check("location_history_shares_window_check", sql`"to_time" > "from_time"`),
    check("location_history_shares_max_points_check", sql`"max_points" IS NULL OR "max_points" > 0`),
    unique("location_history_shares_owner_target_window_unique").on(
      table.ownerId,
      table.targetUserId,
      table.fromTime,
      table.toTime
    ),
    index("location_history_shares_owner_idx").on(table.ownerId, table.fromTime),
    index("location_history_shares_target_idx").on(table.targetUserId, table.fromTime)
  ]
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => users.id),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: uuid("target_id"),
    meta: jsonb("meta").$type<{ previousIsActive: boolean; isActive: boolean } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    index("admin_audit_log_admin_created_at_idx").on(table.adminId, table.createdAt),
    index("admin_audit_log_target_idx").on(table.targetType, table.targetId)
  ]
);

export const passwordResetChallenges = pgTable(
  "password_reset_challenges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionIds: uuid("question_ids").array().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("password_reset_challenges_user_id_unique").on(table.userId),
    check("password_reset_challenges_question_ids_count_check", sql`cardinality("question_ids") = 3`),
    index("password_reset_challenges_expires_at_idx").on(table.expiresAt)
  ]
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_id_idx").on(table.userId),
    index("password_reset_tokens_expires_at_idx").on(table.expiresAt)
  ]
);

export const cancellationReasons = pgTable(
  "cancellation_reasons",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").$type<CancellationType>().notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    labelFa: text("label_fa"),
    requiresCustomText: boolean("requires_custom_text").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true)
  },
  (table) => [
    check("cancellation_reasons_type_check", sql`"type" IN ('requester', 'rescuer')`),
    check("cancellation_reasons_key_check", sql`"key" ~ '^[a-z][a-z0-9_]*$'`),
    unique("cancellation_reasons_type_key_unique").on(table.type, table.key)
  ]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SecurityQuestionRow = typeof securityQuestions.$inferSelect;
export type UserSecurityAnswerRow = typeof userSecurityAnswers.$inferSelect;
export type UserSessionRow = typeof userSessions.$inferSelect;
export type LocationShareRow = typeof locationShares.$inferSelect;
export type NewLocationShareRow = typeof locationShares.$inferInsert;
export type LocationHistoryRow = typeof locationHistory.$inferSelect;
export type NewLocationHistoryRow = typeof locationHistory.$inferInsert;
export type LocationHistoryShareRow = typeof locationHistoryShares.$inferSelect;
export type NewLocationHistoryShareRow = typeof locationHistoryShares.$inferInsert;
export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;
export type PasswordResetChallengeRow = typeof passwordResetChallenges.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type CancellationReasonRow = typeof cancellationReasons.$inferSelect;
