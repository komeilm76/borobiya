import type {
  CancellationType,
  LocationShareMode,
  MissionProposalStatus,
  MissionStatus,
  Severity,
  SosRequestStatus,
  UserRole
} from "@borobiya/shared";
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
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

/**
 * Raw driver-string PostGIS geography. The spelling matters at the byte level: a reviewed migration
 * once wrote the column type as one quoted identifier, "geography(Point,4326)", and Postgres read that
 * as a type whose *name* contains the parentheses — `42704: type ... does not exist`, on every fresh
 * database, while ALTER TABLE ADD COLUMN (which emits it bare) worked fine. scripts/test_migration_sql.py
 * refuses that shape in the checked-in SQL now, so the rule is enforced and not just remembered.
 * Project app coordinates with spatial SQL.
 */
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
    isOnMission: boolean("is_on_mission").notNull().default(false),
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
    // Per-action by nature: `user_deactivated` records prior/new state, `incident_type_created` records a
    // slug. Typing this to one action's payload made every new audited action a schema edit, so it is an
    // open object and each writer owns its own shape.
    meta: jsonb("meta").$type<Record<string, unknown> | null>(),
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

/**
 * Incident catalog and responder categories (T3.1.1) — the four tables `docs/DIAGRAMS/ERD.md` groups as
 * "Categories & Incidents", declared in the shape that document specifies, with nothing invented on top.
 *
 * `incident_types` is a table rather than an enum because admins extend it at runtime (T3.1.2), and its
 * `slug` is the stable handle a seed can be idempotent against — hence unique. `icon` and `color` are
 * deliberately free text with no CHECK: they are display hints the admin UI owns, and a format rule the
 * spec does not state would only ever be enforced against the app's own guess.
 *
 * `created_at` is `NOT NULL DEFAULT now()`, one step past the ERD's `DEFAULT now()`, and the reason is not
 * tidiness: `incidentTypeSchema.createdAt`/`categorySchema.createdAt` in `@borobiya/shared` are required
 * strings, so a row with no creation time has no legal response body — the nullable column leaked straight
 * into the store's record type as `Date | null` and left the route with nothing honest to answer. The
 * diagram was corrected in the same commit rather than left to drift from the schema.
 */
export const incidentTypes = pgTable(
  "incident_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    icon: text("icon"),
    color: text("color"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("incident_types_slug_unique").on(table.slug)]
);

/** A responder group. It has no rules of its own beyond a name: membership lives in the pivots below. */
export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

/**
 * Which incident types a category answers — the set the nearest-responder query (T3.3.1) intersects an
 * incoming SOS against. Cascade on both sides: the pivot describes a pairing, so it cannot outlive either
 * half of it, and a deleted incident type must not leave a category claiming to answer it.
 */
export const categoryIncidentTypes = pgTable(
  "category_incident_types",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    incidentTypeId: uuid("incident_type_id")
      .notNull()
      .references(() => incidentTypes.id, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.categoryId, table.incidentTypeId], name: "category_incident_types_pkey" })]
);

/**
 * Who belongs to which category. An account with no rows here is in no category — that is the starting
 * state T3.1.4 requires, which is why there is no default membership, no trigger, and nothing in the seed
 * that assigns anybody.
 *
 * The primary key leads on `category_id`, matching the ERD, so "who is in this category" (the admin
 * assignment screen) is the indexed direction and "which categories is this user in" (the search
 * projection, and T3.3.1's filter) is a scan of a table whose rows are one per membership. A reverse
 * index is a measured decision for whichever of those reads first needs one at real volume, not a
 * speculative addition here.
 */
export const categoryUsers = pgTable(
  "category_users",
  {
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" })
  },
  (table) => [primaryKey({ columns: [table.categoryId, table.userId], name: "category_users_pkey" })]
);

/**
 * An SOS as raised by a requester (T3.2.1) — the row every later Phase 3 piece hangs off: dispatch
 * (T3.3) proposes against it, a mission (T3.5) becomes from it, cancellation (T3.6) writes back to it.
 * Declared as `docs/DIAGRAMS/ERD.md` specifies, with two differences that are both recorded below.
 *
 * `requester_id` and `incident_type_id` are plain `REFERENCES` with no cascade, unlike the category pivots.
 * That is the ERD's choice and it is the right one to keep: an account being deleted must not erase the
 * record that somebody asked for help, and an incident type must not be deletable out from under a request
 * that names it. Deactivating a user is what the admin surface does; deleting them is not.
 */
export const sosRequests = pgTable(
  "sos_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requesterId: uuid("requester_id")
      .notNull()
      .references(() => users.id),
    severity: text("severity").$type<Severity>().notNull(),
    /**
     * Length is bounded here as well as in `sosRequestSchema`: the request body's `min(10).max(500)` is
     * the same rule, and a CHECK means a row cannot exist that the API would refuse to return.
     */
    description: text("description").notNull(),
    incidentTypeId: uuid("incident_type_id")
      .notNull()
      .references(() => incidentTypes.id),
    location: geographyPoint("location").notNull(),
    accuracy: doublePrecision("accuracy"),
    /** True when a human picked the point on the map because the device fix was unusable (T3.2.2). */
    isManual: boolean("is_manual").notNull().default(false),
    photoUrl: text("photo_url"),
    status: text("status").$type<SosRequestStatus>().notNull().default("pending"),
    cancellationReasonId: uuid("cancellation_reason_id").references(() => cancellationReasons.id),
    cancellationCustomText: text("cancellation_custom_text"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("sos_requests_severity_check", sql`"severity" IN ('low', 'medium', 'high')`),
    check("sos_requests_description_length_check", sql`char_length("description") BETWEEN 10 AND 500`),
    check(
      "sos_requests_status_check",
      sql`"status" IN ('pending', 'dispatched', 'accepted', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired', 'completed')`
    )
    // No index here, including no GiST on `location`, matching the ERD: the shape that will actually pay is
    // T3.3.1's nearest query over *open* requests, which wants a partial index on the live statuses and
    // should be written when that predicate exists — the active-pinned share index above is that precedent.
    // Nor a cancellation cross-check: which of reason/custom text are required is §11.7C's rule, and the
    // cancellation task (T3.6) is where that becomes a constraint instead of a guess.
  ]
);

export const missionProposals = pgTable(
  "mission_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sosRequestId: uuid("sos_request_id")
      .notNull()
      .references(() => sosRequests.id, { onDelete: "cascade" }),
    rescuerId: uuid("rescuer_id")
      .notNull()
      .references(() => users.id),
    status: text("status").$type<MissionProposalStatus>().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("mission_proposals_request_rescuer_unique").on(table.sosRequestId, table.rescuerId),
    check("mission_proposals_status_check", sql`"status" IN ('pending', 'accepted', 'declined', 'expired')`),
    index("mission_proposals_rescuer_status_idx").on(table.rescuerId, table.status)
  ]
);

// Missions are durable incidents, not disposable category memberships: deleting a user or SOS
// must not silently erase a rescue record. Only the history rows cascade with their mission.
export const missions = pgTable(
  "missions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sosRequestId: uuid("sos_request_id").notNull().references(() => sosRequests.id),
    rescuerId: uuid("rescuer_id").notNull().references(() => users.id),
    requesterId: uuid("requester_id").notNull().references(() => users.id),
    status: text("status").$type<MissionStatus>().notNull().default("pending"),
    cancelledBy: text("cancelled_by").$type<"requester" | "rescuer" | "admin" | "system">(),
    cancellationReasonId: uuid("cancellation_reason_id").references(() => cancellationReasons.id),
    cancellationCustomText: text("cancellation_custom_text"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("missions_status_check", sql`"status" IN ('pending', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired')`),
    check("missions_cancelled_by_check", sql`"cancelled_by" IS NULL OR "cancelled_by" IN ('requester', 'rescuer', 'admin', 'system')`),
    check("missions_distinct_participants_check", sql`"rescuer_id" <> "requester_id"`),
    index("missions_sos_request_id_idx").on(table.sosRequestId),
    index("missions_rescuer_status_idx").on(table.rescuerId, table.status),
    index("missions_requester_id_idx").on(table.requesterId)
  ]
);

export const missionStatusHistory = pgTable(
  "mission_status_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    missionId: uuid("mission_id").notNull().references(() => missions.id, { onDelete: "cascade" }),
    fromStatus: text("from_status").$type<MissionStatus>(),
    toStatus: text("to_status").$type<MissionStatus>().notNull(),
    changedBy: uuid("changed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    check("mission_status_history_from_check", sql`"from_status" IS NULL OR "from_status" IN ('pending', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired')`),
    check("mission_status_history_to_check", sql`"to_status" IN ('pending', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled_by_requester', 'cancelled_by_rescuer', 'expired')`),
    index("mission_status_history_mission_created_idx").on(table.missionId, table.createdAt)
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
export type IncidentTypeRow = typeof incidentTypes.$inferSelect;
export type NewIncidentTypeRow = typeof incidentTypes.$inferInsert;
export type CategoryRow = typeof categories.$inferSelect;
export type NewCategoryRow = typeof categories.$inferInsert;
export type CategoryIncidentTypeRow = typeof categoryIncidentTypes.$inferSelect;
export type CategoryUserRow = typeof categoryUsers.$inferSelect;
export type SosRequestRow = typeof sosRequests.$inferSelect;
export type NewSosRequestRow = typeof sosRequests.$inferInsert;
export type MissionProposalRow = typeof missionProposals.$inferSelect;
export type NewMissionProposalRow = typeof missionProposals.$inferInsert;
export type MissionRow = typeof missions.$inferSelect;
export type NewMissionRow = typeof missions.$inferInsert;
export type MissionStatusHistoryRow = typeof missionStatusHistory.$inferSelect;
export type NewMissionStatusHistoryRow = typeof missionStatusHistory.$inferInsert;
