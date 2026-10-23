import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * One place where an error that no handler answered becomes a response.
 *
 * Before this existed, a thrown database error reached Fastify's default handler and serialized as
 * `{ statusCode: 500, error: "Internal Server Error", message: "<the driver's text>" }`. That is two
 * problems at once: the client's `requestJson` reads `code`/`message`/`issues` (there is no `code`, so
 * every UI falls back to a generic line no matter what happened), and the message is an internal
 * detail — the username search outage was diagnosable from the browser because it answered
 * `function round(double precision, integer) does not exist`, which names a column-free but
 * otherwise exact description of our SQL. A 500 should carry a code the client can switch on and
 * nothing a visitor can read as a map of the schema.
 */

/** The code a client sees when the failure was not the client's. */
export const INTERNAL_ERROR_CODE = "INTERNAL_ERROR";

/** A fixed sentence: the detail belongs in the server log, never in the body. */
export const INTERNAL_ERROR_MESSAGE = "The request could not be completed. Try again shortly.";

/**
 * Fastify's own 4xx failures (a malformed JSON body, an unsupported content type, a payload over the
 * limit) reach the handler with a `FST_ERR_*` code. Those are not contract codes, so they are mapped
 * by status instead of passed through: a client that switched on `FST_ERR_CTP_EMPTY_JSON_BODY` would
 * break the moment Fastify renames it. 5xx statuses are kept (a 503 means "retry") but always carry
 * the generic message.
 */
const codeByStatus: Readonly<Record<number, string>> = {
  400: "VALIDATION_ERROR",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  429: "RATE_LIMITED",
  503: "SERVICE_UNAVAILABLE"
};

export interface ErrorEnvelopeInput {
  statusCode?: unknown;
  message?: unknown;
  name?: unknown;
  /**
   * Read and deliberately unused. Fastify's own codes (`FST_ERR_CTP_EMPTY_JSON_BODY` and friends) are
   * not contract codes, so a client that switched on them would break the moment Fastify renames one;
   * the status decides the code we ship.
   */
  code?: unknown;
}

export interface ErrorEnvelope {
  status: number;
  payload: { error: true; code: string; message: string; issues: unknown[] };
}

/** Pure so the mapping is testable without booting Fastify. */
export function errorEnvelopeFor(error: ErrorEnvelopeInput): ErrorEnvelope {
  const declared = typeof error.statusCode === "number" && Number.isInteger(error.statusCode)
    ? error.statusCode
    : undefined;
  // A status outside the 4xx/5xx range (or absent) is not something to report to a client, so it
  // becomes 500. Inside it the status is kept: collapsing a 503 to 500 would throw away the one
  // distinction a client acts on — "retry later" rather than "give up".
  const status = declared !== undefined && declared >= 400 && declared < 600 ? declared : 500;
  const code = codeByStatus[status] ?? INTERNAL_ERROR_CODE;

  // Only 4xx may keep its own text: a 4xx here comes from framework code (a body Fastify could not
  // parse), never from a store. Anything 5xx is ours, so its detail goes to the log and not the body.
  if (status >= 500) {
    return { status, payload: { error: true, code, message: INTERNAL_ERROR_MESSAGE, issues: [] } };
  }

  const message = typeof error.message === "string" && error.message.trim().length > 0
    ? error.message
    : "The request could not be completed.";
  return { status, payload: { error: true, code, message, issues: [] } };
}

/**
 * Registered before the routes so it also covers failures raised inside hooks (rate limiting builds
 * its own envelope and never reaches here). The original error is logged for 5xx precisely because
 * the response no longer carries it.
 */
export function registerErrorEnvelope(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request: FastifyRequest, reply: FastifyReply) => {
    const envelope = errorEnvelopeFor(error as ErrorEnvelopeInput);
    if (envelope.status >= 500) {
      request.log.error({ err: error, route: request.routeOptions?.url }, "unhandled request failure");
    }
    return reply
      .code(envelope.status)
      .header("cache-control", "no-store")
      .send(envelope.payload);
  });
}
