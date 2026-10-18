import { eq } from "drizzle-orm";
import type { UserRole } from "@borobiya/shared";
import type { Database } from "./client";
import { adminAuditLog, userSessions, users } from "./schema";

export interface AdminActorRecord {
  role: UserRole;
  isActive: boolean;
  isSuspended: boolean;
}

export interface AdminUserRecord {
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
  }): Promise<AdminUserRecord | null>;
  updateUserActiveStatus(input: {
    adminId: string;
    userId: string;
    isActive: boolean;
  }): Promise<AdminUserRecord | null>;
}

const adminUserSelection = {
  id: users.id,
  username: users.username,
  role: users.role,
  isActive: users.isActive,
  mustCompleteSecurityQuestions: users.mustCompleteSecurityQuestions,
  avgRating: users.avgRating,
  createdAt: users.createdAt
};

/** Drizzle persistence for privileged user creation/status changes and current admin checks. */
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
  }): Promise<AdminUserRecord | null> {
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
      .returning(adminUserSelection);
    return createdUsers[0] ?? null;
  }

  /** Change status, invalidate refresh sessions on deactivation, and append an audit event atomically. */
  async updateUserActiveStatus(input: {
    adminId: string;
    userId: string;
    isActive: boolean;
  }): Promise<AdminUserRecord | null> {
    return this.db.transaction(async (tx) => {
      const matchingUsers = await tx
        .select(adminUserSelection)
        .from(users)
        .where(eq(users.id, input.userId))
        .for("update")
        .limit(1);
      const currentUser = matchingUsers[0];
      if (!currentUser) return null;

      // Treat repeated requests as idempotent: don't emit an audit event for a no-op.
      if (currentUser.isActive === input.isActive) return currentUser;

      const updatedUsers = await tx
        .update(users)
        .set({ isActive: input.isActive })
        .where(eq(users.id, input.userId))
        .returning(adminUserSelection);
      const updatedUser = updatedUsers[0];
      if (!updatedUser) return null;

      if (!input.isActive) {
        await tx
          .update(userSessions)
          .set({ refreshTokenHash: null, isOnline: false })
          .where(eq(userSessions.userId, input.userId));
      }

      await tx.insert(adminAuditLog).values({
        adminId: input.adminId,
        action: input.isActive ? "user_activated" : "user_deactivated",
        targetType: "user",
        targetId: input.userId,
        meta: { previousIsActive: currentUser.isActive, isActive: input.isActive }
      });

      return updatedUser;
    });
  }
}
