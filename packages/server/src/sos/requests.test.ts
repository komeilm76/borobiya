import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { SosIncidentTypeUnavailableError, type SosRequestStore } from "../db/sos-request-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import type { SecurityQuestionsUserRecord, UserSecurityQuestionsStore } from "../db/security-questions-store";
import { registerUserSecurityQuestionsRoute } from "../auth/user-security-questions";
import { parseServerEnv } from "../config/env";
import { registerHttpSecurityPlugins } from "../plugins/security";
import { registerSosRequestRoutes, sosCreateRateLimit, sosRateLimitKey, sosRequestInput } from "./requests";
import { SOS_NEW_REQUEST_EVENT, type RoomEmitter } from "../realtime/socket";

const jwtSecret = "a".repeat(48);
const requesterId = randomUUID();
const incidentTypeId = randomUUID();
const createdAt = new Date("2026-10-22T09:00:00.000Z");
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function accessToken(claims: Record<string, unknown> = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "user", deviceId: randomUUID(), sessionId: randomUUID(), tokenUse: "access", ...claims })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(requesterId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 900)
    .sign(new TextEncoder().encode(jwtSecret));
}

function userRow(overrides: Partial<SecurityQuestionsUserRecord> = {}): SecurityQuestionsUserRecord {
  return {
    id: requesterId,
    username: "field_responder",
    role: "user",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt,
    ...overrides
  };
}

/** A body the shared schema accepts, with the minimal shape §11.2 describes. */
function body(overrides: Record<string, unknown> = {}) {
  return {
    severity: "high",
    description: "Roof collapse, two people unaccounted for inside.",
    incidentTypeId,
    location: { lat: 35.7, lon: 51.4, isManual: false },
    ...overrides
  };
}

/** The limiter lives in a plugin, so a test that counts 429s has to build the app the way `app.ts` does. */
const serverConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: jwtSecret,
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173"
});

async function makeApp(options: {
  user?: SecurityQuestionsUserRecord;
  store?: Partial<SosRequestStore>;
  io?: RoomEmitter;
  withSecurityPlugins?: boolean;
} = {}) {
  const securityStore: UserSecurityQuestionsStore = {
    async findUserById(userId) {
      // Keyed off the token's subject so a test can hand two accounts their own budgets.
      return options.user ? userRow({ ...options.user, id: userId }) : userRow({ id: userId });
    },
    async hasActiveSession() {
      return true;
    },
    async securityQuestionsExist() {
      return true;
    },
    async completeSecurityQuestions() {
      return true;
    }
  };

  const createRequest = vi.fn<SosRequestStore["createRequest"]>(async () => ({
    requestId: randomUUID(),
    status: "pending"
  }));
  const store: SosRequestStore = {
    createRequest: options.store?.createRequest ?? createRequest,
    getRequestById: options.store?.getRequestById
  };

  const app = Fastify({ logger: false });
  if (options.withSecurityPlugins) {
    await registerHttpSecurityPlugins(app, serverConfig);
  }
  await registerUserSecurityQuestionsRoute(app, { store: securityStore, jwtSecret });
  await registerSosRequestRoutes(app, { store, io: options.io });
  await app.ready();
  apps.push(app);
  return { app, createRequest };
}

/** `payload` is a concrete object rather than `unknown`, which is what keeps `inject` typed. */
async function post(app: FastifyInstance, payload: Record<string, unknown>, token: string | null = null) {
  return app.inject({
    method: "POST",
    url: "/_user/sos/requests",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload
  });
}

/** `accessToken` above signs for `requesterId`; this one signs for anybody, for budget isolation. */
async function tokenFor(userId: string) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "user", deviceId: randomUUID(), sessionId: randomUUID(), tokenUse: "access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 900)
    .sign(new TextEncoder().encode(jwtSecret));
}

describe("POST /_user/sos/requests", () => {
  it("files the request and answers with its id and status", async () => {
    const { app, createRequest } = await makeApp();
    const response = await post(app, body({ location: { lat: 35.7, lon: 51.4, accuracy: 12, isManual: true } }), await accessToken());

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ requestId: expect.stringMatching(/^[0-9a-f-]{36}$/), status: "pending" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(createRequest).toHaveBeenCalledWith({
      requesterId,
      severity: "high",
      description: "Roof collapse, two people unaccounted for inside.",
      incidentTypeId,
      location: { lat: 35.7, lon: 51.4, accuracy: 12, isManual: true }
    });
  });

  it("acknowledges a committed request when the notification read fails, using the created input for the event", async () => {
    const emitted = vi.fn();
    const { app, createRequest } = await makeApp({
      store: { getRequestById: async () => { throw new Error("read replica unavailable"); } },
      io: { to: () => ({ emit: emitted }) }
    });
    const response = await post(app, body(), await accessToken());

    expect(response.statusCode).toBe(201);
    expect(createRequest).toHaveBeenCalledTimes(1);
    expect(emitted).toHaveBeenCalledWith(SOS_NEW_REQUEST_EVENT, {
      sosRequest: expect.objectContaining({ id: response.json().requestId, description: body().description })
    });
  });

  it("acknowledges a committed request even when broadcasting to admins fails", async () => {
    const { app, createRequest } = await makeApp({
      io: { to: () => ({ emit: () => { throw new Error("socket unavailable"); } }) }
    });
    const response = await post(app, body(), await accessToken());

    expect(response.statusCode).toBe(201);
    expect(createRequest).toHaveBeenCalledTimes(1);
  });

  it("keeps the 10–500 character rule at both ends and refuses one character outside each", async () => {
    const { app, createRequest } = await makeApp();
    const token = await accessToken();

    expect((await post(app, body({ description: "x".repeat(10) }), token)).statusCode).toBe(201);
    expect((await post(app, body({ description: "x".repeat(500) }), token)).statusCode).toBe(201);

    const tooShort = await post(app, body({ description: "x".repeat(9) }), token);
    const tooLong = await post(app, body({ description: "x".repeat(501) }), token);
    expect(tooShort.statusCode).toBe(400);
    expect(tooShort.json().code).toBe("VALIDATION_ERROR");
    expect(tooLong.statusCode).toBe(400);
    // One issue per rule violated, each pointing at the field — the SOS form can then underline the
    // description box instead of showing a banner that says the request was malformed.
    expect(tooShort.json().issues).toEqual([expect.objectContaining({ path: ["description"] })]);
    expect(tooLong.json().issues).toEqual([expect.objectContaining({ path: ["description"] })]);
    expect(createRequest).toHaveBeenCalledTimes(2);
  });

  it("trims the description before the length rule is judged", async () => {
    const { app, createRequest } = await makeApp();
    const response = await post(app, body({ description: `   ${"y".repeat(12)}   ` }), await accessToken());

    expect(response.statusCode).toBe(201);
    expect(createRequest.mock.calls[0]![0].description).toBe("y".repeat(12));
  });

  it("refuses a severity outside the three the form offers", async () => {
    const { app, createRequest } = await makeApp();
    const response = await post(app, body({ severity: "critical" }), await accessToken());

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([expect.objectContaining({ path: ["severity"] })]);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("refuses a position outside the coordinate range, and a radius that is not a distance", async () => {
    const { app } = await makeApp();
    const token = await accessToken();

    const cases = [
      { location: { lat: 90.1, lon: 51.4, isManual: true }, path: ["location", "lat"] },
      { location: { lat: 35.7, lon: -181, isManual: true }, path: ["location", "lon"] },
      { location: { lat: 35.7, lon: 51.4, accuracy: -1, isManual: true }, path: ["location", "accuracy"] },
      { location: { lat: 35.7, isManual: true }, path: ["location", "lon"] }
    ];
    for (const testCase of cases) {
      const response = await post(app, body({ location: testCase.location }), token);
      expect(response.statusCode).toBe(400);
      expect(response.json().issues).toContainEqual(expect.objectContaining({ path: testCase.path }));
    }
  });

  it("refuses an invented extra field rather than quietly storing part of it", async () => {
    const { app } = await makeApp();
    const response = await post(app, body({ needsBoat: true }), await accessToken());

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([expect.objectContaining({ code: "unrecognized_keys" })]);
  });

  it("refuses a photoUrl and points the client at the upload endpoint", async () => {
    const { app, createRequest } = await makeApp();
    const response = await post(
      app,
      body({ photoUrl: "https://attacker.example/dispatcher-preview.png" }),
      await accessToken()
    );

    // The URL a requester supplies is an address the dispatcher's browser would load to read the
    // evidence, so it never reaches the column: the upload endpoint (T3.2.3) is the only writer.
    expect(response.statusCode).toBe(400);
    const payload = response.json() as { code: string; message: string; issues: Array<Record<string, unknown>> };
    // The words are the deliverable here, so they are asserted rather than compared with the constant
    // that produced them: a client reading this 400 has to be able to find the endpoint and the limit.
    expect(payload.code).toBe("PHOTO_URL_NOT_ACCEPTED");
    expect(payload.message).toContain("POST /_user/sos/requests/<requestId>/photo");
    expect(payload.message).toContain("5 MB");
    expect(payload.issues).toHaveLength(1);
    expect(payload.issues[0]).toMatchObject({ code: "photo_url_not_accepted", path: ["photoUrl"] });
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("names the incident type it could not find in the catalog", async () => {
    const missing = randomUUID();
    const { app } = await makeApp({
      store: {
        createRequest: async (input) => {
          throw new SosIncidentTypeUnavailableError(input.incidentTypeId);
        }
      }
    });
    const response = await post(app, body({ incidentTypeId: missing }), await accessToken());

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      issues: [
        {
          code: "unknown_incident_type",
          message: `The incident type ${missing} does not exist. Pick one of the types an admin has created.`,
          path: ["incidentTypeId"]
        }
      ]
    });
  });

  it("lets an unexpected store failure surface as a server error instead of a 400 the caller cannot act on", async () => {
    const { app } = await makeApp({
      store: {
        createRequest: async () => {
          throw new Error("connection lost");
        }
      }
    });
    const response = await post(app, body(), await accessToken());

    expect(response.statusCode).toBe(500);
  });

  it("is covered by the /_user guard, so the account dispatch may trust is verified", async () => {
    const anonymous = await (await makeApp()).app.inject({ method: "POST", url: "/_user/sos/requests", payload: body() });
    expect(anonymous.statusCode).toBe(401);

    const suspended = await makeApp({ user: userRow({ isSuspended: true }) });
    expect((await post(suspended.app, body(), await accessToken())).statusCode).toBe(403);
    expect((await post(suspended.app, body(), await accessToken())).json().code).toBe("ACCOUNT_SUSPENDED");

    const inactive = await makeApp({ user: userRow({ isActive: false }) });
    expect((await post(inactive.app, body(), await accessToken())).json().code).toBe("ACCOUNT_INACTIVE");

    const onboarding = await makeApp({ user: userRow({ mustCompleteSecurityQuestions: true }) });
    const onboardingResponse = await post(onboarding.app, body(), await accessToken());
    expect(onboardingResponse.statusCode).toBe(403);
    expect(onboardingResponse.json().code).toBe("SECURITY_QUESTIONS_REQUIRED");
  });
});

describe("the per-user SOS throttle (SECURITY §3)", () => {
  it("is the documented 3 per minute, applied after the session guard", () => {
    expect(sosCreateRateLimit).toMatchObject({ max: 3, timeWindow: 60_000, hook: "preHandler", groupId: "sos-requests" });
  });

  it("answers the fourth request in a minute with the shared 429 envelope", async () => {
    const { app, createRequest } = await makeApp({ withSecurityPlugins: true });
    const token = await accessToken();

    const codes: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      codes.push((await post(app, body(), token)).statusCode);
    }

    expect(codes).toEqual([201, 201, 201, 429]);
    expect(createRequest).toHaveBeenCalledTimes(3);
  });

  it("counts refusals too, so a malformed burst is not free", async () => {
    const { app, createRequest } = await makeApp({ withSecurityPlugins: true });
    const token = await accessToken();

    const codes: number[] = [];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      codes.push((await post(app, body({ severity: "catastrophic" }), token)).statusCode);
    }

    expect(codes).toEqual([400, 400, 400, 429]);
    expect(createRequest).not.toHaveBeenCalled();
  });

  it("gives each account its own budget and spends none on anonymous probes", async () => {
    const { app, createRequest } = await makeApp({ withSecurityPlugins: true });
    const first = await accessToken();
    const second = await tokenFor(randomUUID());

    await post(app, body(), first);
    await post(app, body(), first);
    // Nobody else's probes can burn a responder's allowance: an unauthenticated flood is rejected by
    // the session guard before the limiter sees it, and the guard's own 401s are not this route's budget.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      expect((await post(app, body(), null)).statusCode).toBe(401);
    }

    expect((await post(app, body(), first)).statusCode).toBe(201);
    expect((await post(app, body(), second)).statusCode).toBe(201);
    // Three for the first account, one for the second: the anonymous flood above is not in either count.
    expect(createRequest).toHaveBeenCalledTimes(4);
  });

  it("keys on the verified account, and on the socket only when there is no account to trust", () => {
    const authenticated = { authenticatedUser: { userId: requesterId } } as never;
    expect(sosRateLimitKey(authenticated)).toBe(requesterId);
    expect(sosRateLimitKey({ authenticatedUser: null, ip: "203.0.113.9" } as never)).toBe("203.0.113.9");
  });
});

describe("sosRequestInput", () => {
  const user: AuthenticatedUserContext = {
    userId: requesterId,
    username: "field_responder",
    role: "user",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt,
    deviceId: randomUUID(),
    sessionId: randomUUID()
  };

  it("stores a missing accuracy as no report, never as a zero-metre fix", () => {
    const input = sosRequestInput(user, {
      severity: "low",
      description: "smoke seen from ridge",
      incidentTypeId,
      location: { lat: 35.7, lon: 51.4, isManual: true }
    });

    expect(input.location).toEqual({ lat: 35.7, lon: 51.4, accuracy: null, isManual: true });
    expect(input.requesterId).toBe(requesterId);
  });

  it("takes the requester from the verified session, and reports a zero-metre radius as itself", () => {
    const input = sosRequestInput(user, {
      severity: "high",
      description: "injured climber on north face",
      incidentTypeId,
      location: { lat: 35.9, lon: 51.6, accuracy: 0, isManual: false }
    });

    expect(input.requesterId).toBe(requesterId);
    expect(input).not.toHaveProperty("photoUrl");
  });
});
