import { createHmac } from "node:crypto";
import type { RecoveryQuestionRecord } from "../db/recovery-store";

const DECOY_SET_SIZE = 5;

/**
 * Select a stable, username-specific decoy set. Valid accounts always draw challenges from
 * their fixed five saved questions, so unknown accounts must not visibly draw from all questions
 * across repeated requests. A keyed ranking keeps the synthetic set unpredictable to clients.
 */
export function selectRecoveryDecoySet(
  questions: readonly RecoveryQuestionRecord[],
  username: string,
  secret: string
): RecoveryQuestionRecord[] {
  return questions
    .map((question) => ({
      question,
      rank: createHmac("sha256", secret)
        .update(`borobiya:recovery-decoy:v1\0${username}\0${question.questionId}`)
        .digest("hex")
    }))
    .sort((left, right) => {
      if (left.rank < right.rank) return -1;
      if (left.rank > right.rank) return 1;
      if (left.question.questionId < right.question.questionId) return -1;
      if (left.question.questionId > right.question.questionId) return 1;
      return 0;
    })
    .slice(0, DECOY_SET_SIZE)
    .map(({ question }) => ({ ...question }));
}
