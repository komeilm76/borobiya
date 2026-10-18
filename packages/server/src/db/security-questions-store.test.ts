import { describe, expect, it, vi } from "vitest";
import type { Database } from "./client";
import { DrizzleUserSecurityQuestionsStore } from "./security-questions-store";
import { userSecurityAnswers, users } from "./schema";

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

describe("DrizzleUserSecurityQuestionsStore", () => {
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
