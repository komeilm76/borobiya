import { and, eq, inArray } from "drizzle-orm";
import type { UserRole } from "@borobiya/shared";
import type { Database } from "./client";
import { securityQuestions, userSecurityAnswers, users } from "./schema";

export interface SecurityQuestionsUserRecord {
  id: string;
  role: UserRole;
  isActive: boolean;
  isSuspended: boolean;
  mustCompleteSecurityQuestions: boolean;
}

export interface SecurityQuestionAnswerHash {
  questionId: string;
  answerHash: string;
}

export interface UserSecurityQuestionsStore {
  findUserById(id: string): Promise<SecurityQuestionsUserRecord | null>;
  securityQuestionsExist(questionIds: readonly string[]): Promise<boolean>;
  completeSecurityQuestions(input: {
    userId: string;
    answers: readonly SecurityQuestionAnswerHash[];
  }): Promise<boolean>;
}

/** Persists onboarding answers and clears the required-completion flag atomically. */
export class DrizzleUserSecurityQuestionsStore implements UserSecurityQuestionsStore {
  constructor(private readonly db: Database) {}

  async findUserById(id: string): Promise<SecurityQuestionsUserRecord | null> {
    const matchingUsers = await this.db
      .select({
        id: users.id,
        role: users.role,
        isActive: users.isActive,
        isSuspended: users.isSuspended,
        mustCompleteSecurityQuestions: users.mustCompleteSecurityQuestions
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return matchingUsers[0] ?? null;
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
