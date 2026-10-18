import { describe, expect, it, vi } from "vitest";
import type { Database } from "./client";
import { DrizzleAdminUserStore, type AdminUserRecord } from "./admin-user-store";
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
