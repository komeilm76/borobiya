import { and, eq } from "drizzle-orm";
import type { UserRole } from "@borobiya/shared";
import type { Database } from "./client";
import { userSessions, users } from "./schema";

export interface LoginUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  isSuspended: boolean;
  mustCompleteSecurityQuestions: boolean;
}

export interface LoginSessionInput {
  id: string;
  userId: string;
  deviceId: string;
  deviceName: string | null;
  refreshTokenHash: string;
  ip: string;
  lastActiveAt: Date;
  isOnline: boolean;
}

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  deviceId: string;
  refreshTokenHash: string;
  role: UserRole;
  isActive: boolean;
  isSuspended: boolean;
}

export interface UserLoginStore {
  findUserByUsername(username: string): Promise<LoginUserRecord | null>;
  createSession(session: LoginSessionInput): Promise<void>;
  findSessionByRefreshTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
  rotateRefreshToken(input: {
    sessionId: string;
    currentTokenHash: string;
    nextTokenHash: string;
    lastActiveAt: Date;
  }): Promise<boolean>;
  revokeSession(sessionId: string, userId: string): Promise<boolean>;
  revokeSessionByRefreshTokenHash(tokenHash: string): Promise<boolean>;
}

/** Drizzle-backed credential lookups and persisted refresh-token sessions. */
export class DrizzleUserLoginStore implements UserLoginStore {
  constructor(private readonly db: Database) {}

  async findUserByUsername(username: string): Promise<LoginUserRecord | null> {
    const matchingUsers = await this.db
      .select({
        id: users.id,
        username: users.username,
        passwordHash: users.passwordHash,
        role: users.role,
        isActive: users.isActive,
        isSuspended: users.isSuspended,
        mustCompleteSecurityQuestions: users.mustCompleteSecurityQuestions
      })
      .from(users)
      .where(eq(users.username, username))
      .limit(1);
    return matchingUsers[0] ?? null;
  }

  async createSession(session: LoginSessionInput): Promise<void> {
    await this.db.insert(userSessions).values(session);
  }

  async findSessionByRefreshTokenHash(tokenHash: string): Promise<RefreshSessionRecord | null> {
    const matchingSessions = await this.db
      .select({
        id: userSessions.id,
        userId: userSessions.userId,
        deviceId: userSessions.deviceId,
        refreshTokenHash: userSessions.refreshTokenHash,
        role: users.role,
        isActive: users.isActive,
        isSuspended: users.isSuspended
      })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .where(eq(userSessions.refreshTokenHash, tokenHash))
      .limit(1);
    const session = matchingSessions[0];
    if (!session?.refreshTokenHash) return null;
    return session as RefreshSessionRecord;
  }

  async rotateRefreshToken(input: {
    sessionId: string;
    currentTokenHash: string;
    nextTokenHash: string;
    lastActiveAt: Date;
  }): Promise<boolean> {
    const updated = await this.db
      .update(userSessions)
      .set({
        refreshTokenHash: input.nextTokenHash,
        lastActiveAt: input.lastActiveAt
      })
      .where(and(
        eq(userSessions.id, input.sessionId),
        eq(userSessions.refreshTokenHash, input.currentTokenHash)
      ))
      .returning({ id: userSessions.id });
    return updated.length === 1;
  }

  async revokeSession(sessionId: string, userId: string): Promise<boolean> {
    const revoked = await this.db
      .update(userSessions)
      .set({ refreshTokenHash: null, isOnline: false })
      .where(and(eq(userSessions.id, sessionId), eq(userSessions.userId, userId)))
      .returning({ id: userSessions.id });
    return revoked.length === 1;
  }

  async revokeSessionByRefreshTokenHash(tokenHash: string): Promise<boolean> {
    const revoked = await this.db
      .update(userSessions)
      .set({ refreshTokenHash: null, isOnline: false })
      .where(eq(userSessions.refreshTokenHash, tokenHash))
      .returning({ id: userSessions.id });
    return revoked.length === 1;
  }
}
