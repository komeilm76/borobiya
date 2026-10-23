import { and, asc, count, desc, eq, ilike, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import type { AdminUserListQuery, Mission, UserCategorySummary, UserRole } from "@borobiya/shared";
import type { Database } from "./client";
import { adminAuditLog, categories, categoryUsers, userSessions, users } from "./schema";

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
  categories?: UserCategorySummary[];
  createdAt: Date;
}

export interface AdminUserDeviceRecord {
  id: string;
  /** Same value `GET /_user/devices` exposes, so an admin can see which device a share pins. */
  deviceId: string;
  deviceName: string | null;
  ip: string | null;
  isCurrentDevice: boolean;
  lastActiveAt: Date;
  isOnline: boolean;
}

export interface AdminUserDetailRecord extends AdminUserRecord {
  devices: AdminUserDeviceRecord[];
  missions: Mission[];
}

export interface AdminUserListResult {
  items: AdminUserRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AdminUserStore {
  findAdminActorById(id: string): Promise<AdminActorRecord | null>;
  hasActiveSession(input: { userId: string; sessionId: string; deviceId: string }): Promise<boolean>;
  listUsers(query: AdminUserListQuery): Promise<AdminUserListResult>;
  getUserDetails(id: string, currentSessionId: string): Promise<AdminUserDetailRecord | null>;
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

function escapeLikeSearchTerm(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function readCategoriesByUserIds(
  db: Database,
  userIds: string[]
): Promise<Map<string, UserCategorySummary[]>> {
  const map = new Map<string, UserCategorySummary[]>();
  if (userIds.length === 0) return map;
  const rows = await db
    .select({
      userId: categoryUsers.userId,
      id: categories.id,
      name: categories.name
    })
    .from(categoryUsers)
    .innerJoin(categories, eq(categories.id, categoryUsers.categoryId))
    .where(inArray(categoryUsers.userId, userIds))
    .orderBy(asc(categories.name), asc(categories.id));
  for (const row of rows) {
    const entry: UserCategorySummary = { id: row.id, name: row.name };
    const bucket = map.get(row.userId);
    if (bucket) bucket.push(entry);
    else map.set(row.userId, [entry]);
  }
  return map;
}

/** Drizzle persistence for privileged user lookups/status changes and current admin checks. */
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

  async listUsers(query: AdminUserListQuery): Promise<AdminUserListResult> {
    const conditions: SQL[] = [];
    if (query.q) {
      conditions.push(ilike(users.username, `%${escapeLikeSearchTerm(query.q)}%`));
    }
    if (query.isActive !== undefined) {
      conditions.push(eq(users.isActive, query.isActive));
    }
    if (query.hasCategory !== undefined) {
      const membership = sql`select 1 from "category_users" where "category_users"."user_id" = "users"."id"`;
      conditions.push(query.hasCategory ? sql`exists (${membership})` : sql`not exists (${membership})`);
    }
    const where = and(...conditions);

    const [countResult] = await this.db
      .select({ total: count() })
      .from(users)
      .where(where);
    const total = countResult?.total ?? 0;
    const rows = await this.db
      .select(adminUserSelection)
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), asc(users.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    const categoriesByUser = await readCategoriesByUserIds(this.db, rows.map((row) => row.id));
    const items = rows.map((row) => ({
      ...row,
      categories: categoriesByUser.get(row.id) ?? []
    }));

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit)
    };
  }

  async getUserDetails(id: string, currentSessionId: string): Promise<AdminUserDetailRecord | null> {
    const matchingUsers = await this.db
      .select(adminUserSelection)
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    const user = matchingUsers[0];
    if (!user) return null;

    const [sessions, categoriesByUser] = await Promise.all([
      this.db
        .select({
          id: userSessions.id,
          deviceId: userSessions.deviceId,
          deviceName: userSessions.deviceName,
          ip: userSessions.ip,
          lastActiveAt: userSessions.lastActiveAt,
          isOnline: userSessions.isOnline
        })
        .from(userSessions)
        .where(eq(userSessions.userId, id))
        .orderBy(desc(userSessions.lastActiveAt), asc(userSessions.id)),
      readCategoriesByUserIds(this.db, [id])
    ]);

    return {
      ...user,
      categories: categoriesByUser.get(id) ?? [],
      devices: sessions.map((session) => ({
        ...session,
        isCurrentDevice: session.id === currentSessionId
      })),
      // Missions cannot exist until their SOS domain table is added in T3.5.1.
      missions: []
    };
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
    return createdUsers[0] ? { ...createdUsers[0], categories: [] } : null;
  }

  /** Change status, invalidate refresh sessions on deactivation, and append an audit event atomically. */
  async updateUserActiveStatus(input: {
    adminId: string;
    userId: string;
    isActive: boolean;
  }): Promise<AdminUserRecord | null> {
    return this.db.transaction(async (tx) => {
      const db = tx as unknown as Database;
      const matchingUsers = await tx
        .select(adminUserSelection)
        .from(users)
        .where(eq(users.id, input.userId))
        .for("update")
        .limit(1);
      const currentUser = matchingUsers[0];
      if (!currentUser) return null;

      const categoriesByUser = await readCategoriesByUserIds(db, [input.userId]);
      const userCategories = categoriesByUser.get(input.userId) ?? [];

      // Treat repeated requests as idempotent: don't emit an audit event for a no-op.
      if (currentUser.isActive === input.isActive) {
        return { ...currentUser, categories: userCategories };
      }

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

      return { ...updatedUser, categories: userCategories };
    });
  }
}
