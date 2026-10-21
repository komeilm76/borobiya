import { describe, expect, it, vi } from "vitest";
import type { AdminUserListQuery } from "@borobiya/shared";
import type { Database } from "./client";
import {
  DrizzleAdminUserStore,
  type AdminUserRecord
} from "./admin-user-store";
import { adminAuditLog, userSessions, users } from "./schema";

function makeStore(returnedUsers: unknown[]) {
  let insertedTable: unknown;
  let insertedValues: Record<string, unknown> | undefined;
  let conflictTarget: unknown;
  const returning = vi.fn(async () => returnedUsers);
  const onConflictDoNothing = vi.fn((options: { target: unknown }) => {
    conflictTarget = options.target;
    return { returning };
  });
  const values = vi.fn((input: Record<string, unknown>) => {
    insertedValues = input;
    return { onConflictDoNothing };
  });
  const insert = vi.fn((table: unknown) => {
    insertedTable = table;
    return { values };
  });
  const database = { insert } as unknown as Database;
  return {
    store: new DrizzleAdminUserStore(database),
    insert,
    returning,
    get insertedTable() { return insertedTable; },
    get insertedValues() { return insertedValues; },
    get conflictTarget() { return conflictTarget; }
  };
}

class ReadQueryBuilder implements PromiseLike<unknown> {
  readonly from = vi.fn((_table: unknown) => this);
  readonly where = vi.fn((_condition?: unknown) => this);
  readonly orderBy = vi.fn((..._order: unknown[]) => this);
  readonly limit = vi.fn((_limit: number) => this);
  readonly offset = vi.fn((_offset: number) => this);

  constructor(private readonly result: unknown) {}

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function makeReadStore(results: unknown[][]) {
  const builders: ReadQueryBuilder[] = [];
  const select = vi.fn((_selection: unknown) => {
    const builder = new ReadQueryBuilder(results[builders.length] ?? []);
    builders.push(builder);
    return builder;
  });
  const database = { select } as unknown as Database;
  return {
    store: new DrizzleAdminUserStore(database),
    select,
    builders
  };
}

function makeStatusStore(currentUser: AdminUserRecord | null, updatedUser: AdminUserRecord | null = currentUser) {
  let selectedTable: unknown;
  let insertedTable: unknown;
  let auditValues: unknown;
  const updateTables: unknown[] = [];
  const setValues: unknown[] = [];

  const selectResult = vi.fn(async () => currentUser === null ? [] : [currentUser]);
  const limit = vi.fn(() => selectResult());
  const forUpdate = vi.fn(() => ({ limit }));
  const whereSelect = vi.fn(() => ({ for: forUpdate }));
  const from = vi.fn((table: unknown) => {
    selectedTable = table;
    return { where: whereSelect };
  });
  const select = vi.fn(() => ({ from }));

  const returning = vi.fn(async () => updatedUser === null ? [] : [updatedUser]);
  const whereUserUpdate = vi.fn(() => ({ returning }));
  const whereSessionUpdate = vi.fn(async () => undefined);
  const setUserUpdate = vi.fn((values: unknown) => {
    setValues.push(values);
    return { where: whereUserUpdate };
  });
  const setSessionUpdate = vi.fn((values: unknown) => {
    setValues.push(values);
    return { where: whereSessionUpdate };
  });
  const update = vi.fn((table: unknown) => {
    updateTables.push(table);
    return { set: table === users ? setUserUpdate : setSessionUpdate };
  });

  const values = vi.fn(async (input: unknown) => {
    auditValues = input;
  });
  const insert = vi.fn((table: unknown) => {
    insertedTable = table;
    return { values };
  });
  const transactionContext = { select, update, insert };
  const transaction = vi.fn(async (callback: (tx: typeof transactionContext) => Promise<unknown>) =>
    callback(transactionContext)
  );
  const database = { transaction } as unknown as Database;

  return {
    store: new DrizzleAdminUserStore(database),
    transaction,
    select,
    get selectedTable() { return selectedTable; },
    forUpdate,
    update,
    updateTables,
    setValues,
    whereSessionUpdate,
    insert,
    values,
    get insertedTable() { return insertedTable; },
    get auditValues() { return auditValues; }
  };
}

const createdUser: AdminUserRecord = {
  id: "61e5295a-9381-4bc5-844c-3cf0f52df30e",
  username: "new_responder",
  role: "user",
  isActive: true,
  mustCompleteSecurityQuestions: true,
  avgRating: null,
  createdAt: new Date("2026-10-18T12:00:00.000Z")
};

const adminId = "81e5295a-9381-4bc5-844c-3cf0f52df30e";

describe("DrizzleAdminUserStore", () => {
  it("recognizes only persisted, unrevoked sessions for the matching user and device", async () => {
    const identity = {
      userId: "81e5295a-9381-4bc5-844c-3cf0f52df30e",
      sessionId: "71e5295a-9381-4bc5-844c-3cf0f52df30e",
      deviceId: "51e5295a-9381-4bc5-844c-3cf0f52df30e"
    };
    const active = makeReadStore([[{ id: identity.sessionId }]]);
    const revoked = makeReadStore([[]]);

    await expect(active.store.hasActiveSession(identity)).resolves.toBe(true);
    await expect(revoked.store.hasActiveSession(identity)).resolves.toBe(false);
    expect(active.builders[0]?.from).toHaveBeenCalledWith(userSessions);
    expect(active.builders[0]?.where).toHaveBeenCalledOnce();
    expect(active.builders[0]?.limit).toHaveBeenCalledWith(1);
  });

  it("searches users by username/status and returns stable paginated results", async () => {
    const mocks = makeReadStore([[{ total: 6 }], [createdUser]]);
    const query: AdminUserListQuery = {
      q: "ali%_",
      isActive: false,
      hasCategory: false,
      page: 2,
      limit: 5
    };
    const result = await mocks.store.listUsers(query);

    expect(result).toEqual({
      items: [createdUser],
      total: 6,
      page: 2,
      limit: 5,
      totalPages: 2
    });
    expect(mocks.select).toHaveBeenCalledTimes(2);
    expect(mocks.builders[0]?.where).toHaveBeenCalledOnce();
    expect(mocks.builders[1]?.where).toHaveBeenCalledOnce();
    expect(mocks.builders[1]?.orderBy).toHaveBeenCalledOnce();
    expect(mocks.builders[1]?.limit).toHaveBeenCalledWith(5);
    expect(mocks.builders[1]?.offset).toHaveBeenCalledWith(5);
  });

  it("returns no users for hasCategory=true until category assignments are introduced", async () => {
    const mocks = makeReadStore([]);
    const result = await mocks.store.listUsers({ hasCategory: true, page: 3, limit: 10 });

    expect(result).toEqual({ items: [], total: 0, page: 3, limit: 10, totalPages: 0 });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns account devices and marks only the requesting admin's session as current", async () => {
    const sessionId = "81e5295a-9381-4bc5-844c-3cf0f52df30e";
    const session = {
      id: sessionId,
      deviceName: "Firefox on Linux",
      ip: "192.0.2.4",
      lastActiveAt: createdUser.createdAt,
      isOnline: true
    };
    const mocks = makeReadStore([[createdUser], [session]]);
    const result = await mocks.store.getUserDetails(createdUser.id, sessionId);

    expect(result).toEqual({
      ...createdUser,
      devices: [{ ...session, isCurrentDevice: true }],
      missions: []
    });
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });

  it("returns null without querying device sessions when the user is missing", async () => {
    const mocks = makeReadStore([[]]);
    const result = await mocks.store.getUserDetails(createdUser.id, "81e5295a-9381-4bc5-844c-3cf0f52df30e");

    expect(result).toBeNull();
    expect(mocks.select).toHaveBeenCalledOnce();
  });

  it("persists only the user row, requires question completion, and leaves the active default intact", async () => {
    const mocks = makeStore([createdUser]);
    const result = await mocks.store.createAdminCreatedUser({
      username: "new_responder",
      passwordHash: "argon2id-password-hash"
    });

    expect(result).toEqual(createdUser);
    expect(mocks.insert).toHaveBeenCalledTimes(1);
    expect(mocks.insertedTable).toBe(users);
    expect(mocks.insertedValues).toEqual({
      username: "new_responder",
      passwordHash: "argon2id-password-hash",
      role: "user",
      mustCompleteSecurityQuestions: true
    });
    expect(mocks.insertedValues).not.toHaveProperty("isActive");
    expect(mocks.conflictTarget).toBe(users.username);
  });

  it("persists an explicitly supplied inactive state", async () => {
    const mocks = makeStore([{ ...createdUser, isActive: false }]);
    await mocks.store.createAdminCreatedUser({
      username: "new_responder",
      passwordHash: "argon2id-password-hash",
      isActive: false
    });

    expect(mocks.insertedValues).toMatchObject({
      role: "user",
      mustCompleteSecurityQuestions: true,
      isActive: false
    });
  });

  it("returns null for the unique-username conflict", async () => {
    const mocks = makeStore([]);
    const result = await mocks.store.createAdminCreatedUser({
      username: "new_responder",
      passwordHash: "argon2id-password-hash"
    });

    expect(result).toBeNull();
    expect(mocks.returning).toHaveBeenCalledOnce();
  });

  it("deactivates users, revokes all refresh sessions, and audits the change atomically", async () => {
    const inactiveUser = { ...createdUser, isActive: false };
    const mocks = makeStatusStore(createdUser, inactiveUser);
    const result = await mocks.store.updateUserActiveStatus({
      adminId,
      userId: createdUser.id,
      isActive: false
    });

    expect(result).toEqual(inactiveUser);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.selectedTable).toBe(users);
    expect(mocks.forUpdate).toHaveBeenCalledWith("update");
    expect(mocks.updateTables).toEqual([users, userSessions]);
    expect(mocks.setValues).toEqual([
      { isActive: false },
      { refreshTokenHash: null, isOnline: false }
    ]);
    expect(mocks.whereSessionUpdate).toHaveBeenCalledOnce();
    expect(mocks.insertedTable).toBe(adminAuditLog);
    expect(mocks.auditValues).toEqual({
      adminId,
      action: "user_deactivated",
      targetType: "user",
      targetId: createdUser.id,
      meta: { previousIsActive: true, isActive: false }
    });
  });

  it("audits reactivation without changing sessions", async () => {
    const inactiveUser = { ...createdUser, isActive: false };
    const mocks = makeStatusStore(inactiveUser, createdUser);
    const result = await mocks.store.updateUserActiveStatus({
      adminId,
      userId: createdUser.id,
      isActive: true
    });

    expect(result).toEqual(createdUser);
    expect(mocks.updateTables).toEqual([users]);
    expect(mocks.auditValues).toEqual({
      adminId,
      action: "user_activated",
      targetType: "user",
      targetId: createdUser.id,
      meta: { previousIsActive: false, isActive: true }
    });
  });

  it("does not create audit rows or mutate sessions for an idempotent status request", async () => {
    const mocks = makeStatusStore(createdUser);
    const result = await mocks.store.updateUserActiveStatus({
      adminId,
      userId: createdUser.id,
      isActive: true
    });

    expect(result).toEqual(createdUser);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not write an audit row when the target user does not exist", async () => {
    const mocks = makeStatusStore(null);
    const result = await mocks.store.updateUserActiveStatus({
      adminId,
      userId: createdUser.id,
      isActive: false
    });

    expect(result).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
