import type { CancellationType, LocationShareMode, UserRole } from "@borobiya/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  index,
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
    index("location_shares_expires_at_idx").on(table.expiresAt)
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
export type AdminAuditLogRow = typeof adminAuditLog.$inferSelect;
export type PasswordResetChallengeRow = typeof passwordResetChallenges.$inferSelect;
export type PasswordResetTokenRow = typeof passwordResetTokens.$inferSelect;
export type CancellationReasonRow = typeof cancellationReasons.$inferSelect;
