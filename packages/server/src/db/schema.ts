import type { UserRole } from "@borobiya/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

/** Core account table. Status/location fields are added by later database tasks. */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 30 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 10 }).$type<UserRole>().notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("users_username_unique").on(table.username),
    check(
      "users_username_format_check",
      sql`char_length("username") BETWEEN 3 AND 30 AND "username" ~ '^[a-z0-9_]+$'`
    ),
    check("users_role_check", sql`"role" IN ('user', 'admin')`)
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
  (table) => [index("user_sessions_user_id_idx").on(table.userId)]
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SecurityQuestionRow = typeof securityQuestions.$inferSelect;
export type UserSecurityAnswerRow = typeof userSecurityAnswers.$inferSelect;
export type UserSessionRow = typeof userSessions.$inferSelect;
