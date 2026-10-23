import { describe, expect, it } from "vitest";
import { errorEnvelopeFor, INTERNAL_ERROR_CODE, INTERNAL_ERROR_MESSAGE } from "./error-envelope";

describe("errorEnvelopeFor", () => {
  it("hides an unexplained failure behind a fixed message", () => {
    const envelope = errorEnvelopeFor({
      message: 'function round(double precision, integer) does not exist\n  at PostgresQuery.execute (...)'
    });

    expect(envelope.status).toBe(500);
    expect(envelope.payload).toEqual({
      error: true,
      code: INTERNAL_ERROR_CODE,
      message: INTERNAL_ERROR_MESSAGE,
      issues: []
    });
    expect(envelope.payload.message).not.toMatch(/round|Postgres|select/i);
  });

  it("treats an absent or absurd status as our fault, never as the caller's", () => {
    for (const statusCode of [undefined, null, "400", 0, 200, 500, 700, 404.5]) {
      expect(errorEnvelopeFor({ statusCode, message: "x" }).status).toBe(500);
    }
  });

  it("keeps a framework 4xx and maps it onto a contract code", () => {
    // Fastify's own codes (FST_ERR_*) are deliberately not passed through: they are not in the
    // contract, and a client that switched on them would break when Fastify renames one.
    const envelope = errorEnvelopeFor({
      statusCode: 400,
      code: "FST_ERR_CTP_INVALID_JSON_BODY",
      message: "Body is not valid JSON but content-type is set to 'application/json'"
    });

    expect(envelope.status).toBe(400);
    expect(envelope.payload.code).toBe("VALIDATION_ERROR");
    expect(envelope.payload.message).toContain("Body is not valid JSON");
  });

  it("has a contract code for every 4xx the framework can raise here", () => {
    expect(errorEnvelopeFor({ statusCode: 401 }).payload.code).toBe("UNAUTHORIZED");
    expect(errorEnvelopeFor({ statusCode: 403 }).payload.code).toBe("FORBIDDEN");
    expect(errorEnvelopeFor({ statusCode: 404 }).payload.code).toBe("NOT_FOUND");
    expect(errorEnvelopeFor({ statusCode: 409 }).payload.code).toBe("CONFLICT");
    expect(errorEnvelopeFor({ statusCode: 413 }).payload.code).toBe("PAYLOAD_TOO_LARGE");
    expect(errorEnvelopeFor({ statusCode: 429 }).payload.code).toBe("RATE_LIMITED");
  });

  it("keeps a 503 as a retry signal without shipping the framework's text", () => {
    const envelope = errorEnvelopeFor({ statusCode: 503, message: "Service Unavailable" });

    expect(envelope.status).toBe(503);
    expect(envelope.payload.code).toBe("SERVICE_UNAVAILABLE");
    expect(envelope.payload.message).toBe(INTERNAL_ERROR_MESSAGE);
  });

  it("falls back to a generic message when a 4xx carries none", () => {
    expect(errorEnvelopeFor({ statusCode: 400, message: "   " }).payload.message).toBe(
      "The request could not be completed."
    );
  });
});
