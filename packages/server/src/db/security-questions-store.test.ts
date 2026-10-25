import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./client";
import { DrizzleUserSecurityQuestionsStore } from "./security-questions-store";
import { userSecurityAnswers, userSessions, users } from "./schema";

const answerHashes = Array.from({ length: 5 }, (_, index) => ({
  questionId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  answerHash: `argon2id-hash-${index + 1}`
}));

function makeStore(updatedUsers: unknown[]) {
  let updatedTable: unknown;
  let updateValues: Record<string, unknown> | undefined;
  let insertedTable: unknown;
  let insertedValues: unknown;
  const returning = vi.fn(async () => updatedUsers);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn((values: Record<string, unknown>) => {
    updateValues = values;
    return { where };
  });
  const update = vi.fn((table: unknown) => {
    updatedTable = table;
    return { set };
  });
  const values = vi.fn(async (rows: unknown) => {
    insertedValues = rows;
  });
  const insert = vi.fn((table: unknown) => {
    insertedTable = table;
    return { values };
  });
  const transaction = vi.fn(async (callback: (tx: { update: typeof update; insert: typeof insert }) => unknown) =>
    callback({ update, insert })
  );
  const database = { transaction } as unknown as Database;

  return {
    store: new DrizzleUserSecurityQuestionsStore(database),
    transaction,
    update,
    insert,
    get updatedTable() { return updatedTable; },
    get updateValues() { return updateValues; },
    get insertedTable() { return insertedTable; },
    get insertedValues() { return insertedValues; }
  };
}

class SessionReadBuilder implements PromiseLike<unknown> {
  readonly from = vi.fn((_table: unknown) => this);
  readonly where = vi.fn((_condition?: unknown) => this);
  readonly limit = vi.fn((_limit: number) => this);

  constructor(private readonly result: unknown) {}

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function makeSessionStore(result: unknown[]) {
  const builder = new SessionReadBuilder(result);
  const select = vi.fn(() => builder);
  const store = new DrizzleUserSecurityQuestionsStore({ select } as unknown as Database);
  return { store, builder };
}

describe("DrizzleUserSecurityQuestionsStore", () => {
  it("writes the disconnect timestamp, not only the online timestamp, without reviving revoked sessions", async () => {
    const set = vi.fn(() => ({ where: vi.fn(async () => []) }));
    const db = { update: vi.fn(() => ({ set })) } as unknown as Database;
    const at = new Date("2026-10-25T08:00:00Z");
    await new DrizzleUserSecurityQuestionsStore(db).touchSessionPresence({
      userId: "00000000-0000-4000-8000-000000000099",
      sessionId: "00000000-0000-4000-8000-000000000077",
      deviceId: "00000000-0000-4000-8000-000000000088",
      isOnline: false, now: at
    });
    expect(db.update).toHaveBeenCalledWith(userSessions);
    expect(set).toHaveBeenCalledWith({ isOnline: false, lastActiveAt: at });
    // The write's WHERE clause still requires an unrevoked refresh token (and matching IDs).
    const updateSql = readFileSync(new URL("./security-questions-store.ts", import.meta.url), "utf8");
    expect(updateSql).toContain("isNotNull(userSessions.refreshTokenHash)");
  });

  it("only authorizes a matching session with an unrevoked refresh credential", async () => {
    const identity = {
      userId: "00000000-0000-4000-8000-000000000099",
      sessionId: "00000000-0000-4000-8000-000000000077",
      deviceId: "00000000-0000-4000-8000-000000000088"
    };
    const active = makeSessionStore([{ id: identity.sessionId }]);
    const revoked = makeSessionStore([]);

    await expect(active.store.hasActiveSession(identity)).resolves.toBe(true);
    await expect(revoked.store.hasActiveSession(identity)).resolves.toBe(false);
    expect(active.builder.from).toHaveBeenCalledWith(userSessions);
    expect(active.builder.where).toHaveBeenCalledOnce();
    expect(active.builder.limit).toHaveBeenCalledWith(1);
  });
  it("in one transaction inserts five answer hashes and clears the required-completion flag", async () => {
    const mocks = makeStore([{ id: "00000000-0000-4000-8000-000000000099" }]);
    const completed = await mocks.store.completeSecurityQuestions({
      userId: "00000000-0000-4000-8000-000000000099",
      answers: answerHashes
    });

    expect(completed).toBe(true);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.updatedTable).toBe(users);
    expect(mocks.updateValues).toEqual({ mustCompleteSecurityQuestions: false });
    expect(mocks.insertedTable).toBe(userSecurityAnswers);
    expect(mocks.insertedValues).toEqual(answerHashes.map((answer) => ({
      userId: "00000000-0000-4000-8000-000000000099",
      ...answer
    })));
  });

  it("does not insert answers when the user has already completed onboarding", async () => {
    const mocks = makeStore([]);
    const completed = await mocks.store.completeSecurityQuestions({
      userId: "00000000-0000-4000-8000-000000000099",
      answers: answerHashes
    });

    expect(completed).toBe(false);
    expect(mocks.update).toHaveBeenCalledOnce();
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
