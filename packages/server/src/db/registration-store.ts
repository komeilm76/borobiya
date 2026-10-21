import { eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { securityQuestions, userSecurityAnswers, users } from "./schema";

export interface RegistrationAnswerHash {
  questionId: string;
  answerHash: string;
}

export interface RegisteredUserRecord {
  id: string;
  username: string;
  createdAt: Date;
}

export interface UserRegistrationStore {
  usernameExists(username: string): Promise<boolean>;
  securityQuestionsExist(questionIds: readonly string[]): Promise<boolean>;
  createUserWithAnswers(input: {
    username: string;
    passwordHash: string;
    answers: readonly RegistrationAnswerHash[];
  }): Promise<RegisteredUserRecord | null>;
}

/** Drizzle-backed registration persistence. User and answer rows commit atomically. */
export class DrizzleUserRegistrationStore implements UserRegistrationStore {
  constructor(private readonly db: Database) {}

  async usernameExists(username: string): Promise<boolean> {
    const existingUser = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return existingUser.length > 0;
  }

  async securityQuestionsExist(questionIds: readonly string[]): Promise<boolean> {
    if (questionIds.length === 0) return false;

    const existingQuestions = await this.db
      .select({ id: securityQuestions.id })
      .from(securityQuestions)
      .where(inArray(securityQuestions.id, [...questionIds]));
    return existingQuestions.length === questionIds.length;
  }

  async createUserWithAnswers(input: {
    username: string;
    passwordHash: string;
    answers: readonly RegistrationAnswerHash[];
  }): Promise<RegisteredUserRecord | null> {
    return this.db.transaction(async (transaction) => {
      const insertedUsers = await transaction
        .insert(users)
        .values({ username: input.username, passwordHash: input.passwordHash })
        .onConflictDoNothing({ target: users.username })
        .returning({ id: users.id, username: users.username, createdAt: users.createdAt });
      const user = insertedUsers[0];
      if (!user) return null;

      await transaction.insert(userSecurityAnswers).values(
        input.answers.map(({ questionId, answerHash }) => ({
          userId: user.id,
          questionId,
          answerHash
        }))
      );
      return user;
    });
  }
}
