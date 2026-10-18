import { eq } from "drizzle-orm";
import type { UserRole } from "@borobiya/shared";
import type { Database } from "./client";
import { users } from "./schema";

export interface AdminActorRecord {
  role: UserRole;
  isActive: boolean;
  isSuspended: boolean;
}

export interface AdminCreatedUserRecord {
  id: string;
  username: string;
  role: UserRole;
  isActive: boolean;
  mustCompleteSecurityQuestions: boolean;
  avgRating: number | null;
  createdAt: Date;
}

export interface AdminUserStore {
  findAdminActorById(id: string): Promise<AdminActorRecord | null>;
  createAdminCreatedUser(input: {
    username: string;
    passwordHash: string;
    isActive?: boolean;
  }): Promise<AdminCreatedUserRecord | null>;
}

/** Drizzle persistence for privileged user creation and current admin account checks. */
export class DrizzleAdminUserStore implements AdminUserStore {
  constructor(private readonly db: Database) {}

  async findAdminActorById(id: string): Promise<AdminActorRecord | null> {
    const matchingUsers = await this.db
      .select({ role: users.role, isActive: users.isActive, isSuspended: users.isSuspended })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return matchingUsers[0] ?? null;
  }

  async createAdminCreatedUser(input: {
    username: string;
    passwordHash: string;
    isActive?: boolean;
  }): Promise<AdminCreatedUserRecord | null> {
    const createdUsers = await this.db
      .insert(users)
      .values({
        username: input.username,
        passwordHash: input.passwordHash,
        role: "user",
        mustCompleteSecurityQuestions: true,
        ...(input.isActive === undefined ? {} : { isActive: input.isActive })
      })
      .onConflictDoNothing({ target: users.username })
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        isActive: users.isActive,
        mustCompleteSecurityQuestions: users.mustCompleteSecurityQuestions,
        avgRating: users.avgRating,
        createdAt: users.createdAt
      });
    return createdUsers[0] ?? null;
  }
}
