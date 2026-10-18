import { eq } from "drizzle-orm";
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

export interface UserLoginStore {
  findUserByUsername(username: string): Promise<LoginUserRecord | null>;
  createSession(session: LoginSessionInput): Promise<void>;
}

/** Drizzle-backed login lookups and persisted refresh-token sessions. */
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
}
