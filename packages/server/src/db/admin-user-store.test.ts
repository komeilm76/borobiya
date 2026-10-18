import { describe, expect, it, vi } from "vitest";
import type { Database } from "./client";
import { DrizzleAdminUserStore } from "./admin-user-store";
import { users } from "./schema";

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

const createdUser = {
  id: "61e5295a-9381-4bc5-844c-3cf0f52df30e",
  username: "new_responder",
  role: "user" as const,
  isActive: true,
  mustCompleteSecurityQuestions: true,
  avgRating: null,
  createdAt: new Date("2026-10-18T12:00:00.000Z")
};

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
});
