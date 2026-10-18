import {
  securityQuestionsResponseSchema,
  type SecurityQuestion
} from "@shared/index";
import { publicApiRoutes, requestJson } from "./http";

let catalogPromise: Promise<SecurityQuestion[]> | null = null;

export function getSecurityQuestions(): Promise<SecurityQuestion[]> {
  if (!catalogPromise) {
    catalogPromise = requestJson<unknown>(publicApiRoutes.securityQuestions.url)
      .then((response) => {
        const questions = securityQuestionsResponseSchema.parse(response);
        if (questions.length < 5) throw new Error("The security-question catalog has fewer than five prompts.");
        return questions;
      })
      .catch((error: unknown) => {
        catalogPromise = null;
        throw error;
      });
  }
  return catalogPromise;
}
