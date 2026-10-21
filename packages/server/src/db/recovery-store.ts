import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import type { Database } from "./client";
import {
  passwordResetChallenges,
  passwordResetTokens,
  securityQuestions,
  userSecurityAnswers,
  userSessions,
  users
} from "./schema";

export interface RecoveryAnswerRecord {
  questionId: string;
  text: string;
  answerHash: string;
}

export interface RecoveryAccountRecord {
  id: string;
  answers: RecoveryAnswerRecord[];
}

export interface RecoveryQuestionRecord {
  questionId: string;
  text: string;
}

export interface RecoveryChallengeRecord {
  id: string;
  questionIds: string[];
}

export interface UserRecoveryStore {
  findAccountByUsername(username: string): Promise<RecoveryAccountRecord | null>;
  listSecurityQuestions(): Promise<RecoveryQuestionRecord[]>;
  saveRecoveryChallenge(input: {
    userId: string;
    questionIds: readonly string[];
    createdAt: Date;
    expiresAt: Date;
  }): Promise<string | null>;
  findActiveRecoveryChallenge(userId: string, now: Date): Promise<RecoveryChallengeRecord | null>;
  issuePasswordResetToken(input: {
    userId: string;
    challengeId: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }): Promise<boolean>;
  isPasswordResetTokenValid(tokenHash: string, now: Date): Promise<boolean>;
  resetPasswordWithToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<boolean>;
}

/** Drizzle-backed security-question recovery, one-time challenges, and one-time reset tokens. */
export class DrizzleUserRecoveryStore implements UserRecoveryStore {
  constructor(private readonly db: Database) {}

  async findAccountByUsername(username: string): Promise<RecoveryAccountRecord | null> {
    const matchingUsers = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    const user = matchingUsers[0];
    if (!user) return null;

    const answerRows = await this.db
      .select({
        questionId: userSecurityAnswers.questionId,
        text: securityQuestions.text,
        answerHash: userSecurityAnswers.answerHash
      })
      .from(userSecurityAnswers)
      .innerJoin(securityQuestions, eq(userSecurityAnswers.questionId, securityQuestions.id))
      .where(eq(userSecurityAnswers.userId, user.id));

    return { id: user.id, answers: answerRows };
  }

  async listSecurityQuestions(): Promise<RecoveryQuestionRecord[]> {
    return this.db
      .select({ questionId: securityQuestions.id, text: securityQuestions.text })
      .from(securityQuestions);
  }

  async saveRecoveryChallenge(input: {
    userId: string;
    questionIds: readonly string[];
    createdAt: Date;
    expiresAt: Date;
  }): Promise<string | null> {
    const challengeId = randomUUID();
    const saved = await this.db
      .insert(passwordResetChallenges)
      .values({
        id: challengeId,
        userId: input.userId,
        questionIds: [...input.questionIds],
        createdAt: input.createdAt,
        expiresAt: input.expiresAt
      })
      .onConflictDoUpdate({
        target: passwordResetChallenges.userId,
        set: {
          id: challengeId,
          questionIds: [...input.questionIds],
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
          consumedAt: null
        }
      })
      .returning({ id: passwordResetChallenges.id });
    return saved[0]?.id ?? null;
  }

  async findActiveRecoveryChallenge(userId: string, now: Date): Promise<RecoveryChallengeRecord | null> {
    const challenges = await this.db
      .select({ id: passwordResetChallenges.id, questionIds: passwordResetChallenges.questionIds })
      .from(passwordResetChallenges)
      .where(and(
        eq(passwordResetChallenges.userId, userId),
        isNull(passwordResetChallenges.consumedAt),
        gt(passwordResetChallenges.expiresAt, now)
      ))
      .limit(1);
    return challenges[0] ?? null;
  }

  async issuePasswordResetToken(input: {
    userId: string;
    challengeId: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }): Promise<boolean> {
    return this.db.transaction(async (transaction) => {
      const consumedChallenge = await transaction
        .update(passwordResetChallenges)
        .set({ consumedAt: input.now })
        .where(and(
          eq(passwordResetChallenges.id, input.challengeId),
          eq(passwordResetChallenges.userId, input.userId),
          isNull(passwordResetChallenges.consumedAt),
          gt(passwordResetChallenges.expiresAt, input.now)
        ))
        .returning({ userId: passwordResetChallenges.userId });
      if (consumedChallenge.length !== 1) return false;

      // The most recently verified recovery challenge supersedes any older reset token.
      await transaction
        .delete(passwordResetTokens)
        .where(lt(passwordResetTokens.expiresAt, input.now));
      await transaction
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.userId, input.userId));
      await transaction.insert(passwordResetTokens).values({
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdAt: input.now
      });
      return true;
    });
  }

  async isPasswordResetTokenValid(tokenHash: string, now: Date): Promise<boolean> {
    const tokens = await this.db
      .select({ id: passwordResetTokens.id })
      .from(passwordResetTokens)
      .where(and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        gt(passwordResetTokens.expiresAt, now)
      ))
      .limit(1);
    return tokens.length === 1;
  }

  async resetPasswordWithToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }): Promise<boolean> {
    return this.db.transaction(async (transaction) => {
      // DELETE ... RETURNING claims the token atomically; a concurrent replay gets no row.
      const claimedTokens = await transaction
        .delete(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.tokenHash, input.tokenHash),
          gt(passwordResetTokens.expiresAt, input.now)
        ))
        .returning({ userId: passwordResetTokens.userId });
      const token = claimedTokens[0];
      if (!token) return false;

      const changedUsers = await transaction
        .update(users)
        .set({ passwordHash: input.passwordHash })
        .where(eq(users.id, token.userId))
        .returning({ id: users.id });
      if (changedUsers.length !== 1) return false;

      // Password changes revoke every outstanding reset/recovery path and refresh session.
      await transaction.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, token.userId));
      await transaction
        .update(passwordResetChallenges)
        .set({ consumedAt: input.now })
        .where(and(
          eq(passwordResetChallenges.userId, token.userId),
          isNull(passwordResetChallenges.consumedAt)
        ));
      await transaction
        .update(userSessions)
        .set({ refreshTokenHash: null, isOnline: false })
        .where(eq(userSessions.userId, token.userId));
      return true;
    });
  }
}
