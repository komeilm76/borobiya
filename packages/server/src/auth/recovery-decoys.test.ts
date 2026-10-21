import { describe, expect, it } from "vitest";
import { selectRecoveryDecoySet } from "./recovery-decoys";

const questions = Array.from({ length: 15 }, (_, index) => ({
  questionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  text: `Question ${index + 1}?`
}));

describe("recovery decoy question pools", () => {
  it("selects a stable five-question pool independent of catalog ordering", () => {
    const selected = selectRecoveryDecoySet(questions, "unknown_user", "secret-for-tests");
    const reordered = selectRecoveryDecoySet([...questions].reverse(), "unknown_user", "secret-for-tests");

    expect(selected).toHaveLength(5);
    expect(selected).toEqual(reordered);
    expect(selected.every(({ questionId }) => questions.some((question) => question.questionId === questionId))).toBe(true);
  });

  it("returns the available catalog when fewer than five decoys exist", () => {
    expect(selectRecoveryDecoySet(questions.slice(0, 3), "unknown_user", "secret-for-tests")).toHaveLength(3);
  });
});
