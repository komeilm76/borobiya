import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { UserCategorySummary, UserRole } from "@borobiya/shared";
import type { Database } from "./client";
import { categories, categoryUsers, securityQuestions, userSecurityAnswers, userSessions, users } from "./schema";

export interface SecurityQuestionsUserRecord {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  isSuspended: boolean;
  mustCompleteSecurityQuestions: boolean;
  avgRating: number | null;
  createdAt: Date;
}

export interface SecurityQuestionAnswerHash {
  questionId: string;
  answerHash: string;
}

export interface TouchSessionPresenceInput {
  userId: string;
  sessionId: string;
  deviceId: string;
  isOnline: boolean;
  now?: Date;
}

export interface UserSecurityQuestionsStore {
  findUserById(id: string): Promise<SecurityQuestionsUserRecord | null>;
  listUserCategories?(userId: string): Promise<UserCategorySummary[]>;
  hasActiveSession(input: { userId: string; sessionId: string; deviceId: string }): Promise<boolean>;
  touchSessionPresence?(input: TouchSessionPresenceInput): Promise<void>;
  securityQuestionsExist(questionIds: readonly string[]): Promise<boolean>;
  completeSecurityQuestions(input: {
    userId: string;
    answers: readonly SecurityQuestionAnswerHash[];
  }): Promise<boolean>;
}

/** Persists onboarding answers and checks persisted user sessions for authorization. */
export class DrizzleUserSecurityQuestionsStore implements UserSecurityQuestionsStore {
  constructor(private readonly db: Database) {}

  async findUserById(id: string): Promise<SecurityQuestionsUserRecord | null> {
    const matchingUsers = await this.db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        isActive: users.isActive,
        isSuspended: users.isSuspended,
        mustCompleteSecurityQuestions: users.mustCompleteSecurityQuestions,
        avgRating: users.avgRating,
        createdAt: users.createdAt
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return matchingUsers[0] ?? null;
  }

  async listUserCategories(userId: string): Promise<UserCategorySummary[]> {
    return this.db
      .select({ id: categories.id, name: categories.name })
      .from(categoryUsers)
      .innerJoin(categories, eq(categories.id, categoryUsers.categoryId))
      .where(eq(categoryUsers.userId, userId))
      .orderBy(asc(categories.name), asc(categories.id));
  }

  async hasActiveSession(input: { userId: string; sessionId: string; deviceId: string }): Promise<boolean> {
    const sessions = await this.db
      .select({ id: userSessions.id })
      .from(userSessions)
      .where(and(
        eq(userSessions.id, input.sessionId),
        eq(userSessions.userId, input.userId),
        eq(userSessions.deviceId, input.deviceId),
        isNotNull(userSessions.refreshTokenHash)
      ))
      .limit(1);
    return sessions.length === 1;
  }

  async touchSessionPresence(input: TouchSessionPresenceInput): Promise<void> {
    const at = input.now ?? new Date();
    await this.db
      .update(userSessions)
      .set(
        input.isOnline
          ? { isOnline: true, lastActiveAt: at }
          : { isOnline: false }
      )
      .where(
        and(
          eq(userSessions.id, input.sessionId),
          eq(userSessions.userId, input.userId),
          eq(userSessions.deviceId, input.deviceId),
          isNotNull(userSessions.refreshTokenHash)
        )
      );
  }

  async securityQuestionsExist(questionIds: readonly string[]): Promise<boolean> {
    if (questionIds.length === 0) return false;
    const matchingQuestions = await this.db
      .select({ id: securityQuestions.id })
      .from(securityQuestions)
      .where(inArray(securityQuestions.id, [...questionIds]));
    return matchingQuestions.length === questionIds.length;
  }

  async completeSecurityQuestions(input: {
    userId: string;
    answers: readonly SecurityQuestionAnswerHash[];
  }): Promise<boolean> {
    return this.db.transaction(async (transaction) => {
      const completedUsers = await transaction
        .update(users)
        .set({ mustCompleteSecurityQuestions: false })
        .where(and(
          eq(users.id, input.userId),
          eq(users.mustCompleteSecurityQuestions, true)
        ))
        .returning({ id: users.id });
      if (completedUsers.length !== 1) return false;

      await transaction.insert(userSecurityAnswers).values(
        input.answers.map(({ questionId, answerHash }) => ({
          userId: input.userId,
          questionId,
          answerHash
        }))
      );
      return true;
    });
  }
}
