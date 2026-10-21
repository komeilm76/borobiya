import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { UserRole } from "@borobiya/shared";
import type { Database } from "./client";
import { securityQuestions, userSecurityAnswers, userSessions, users } from "./schema";

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

export interface UserSecurityQuestionsStore {
  findUserById(id: string): Promise<SecurityQuestionsUserRecord | null>;
  hasActiveSession(input: { userId: string; sessionId: string; deviceId: string }): Promise<boolean>;
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
