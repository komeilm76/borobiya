import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { UserSearchRow, UserSearchStore } from "../db/user-search-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import { registerUserSearchRoute, searchTotalPages } from "./search";
import { registerErrorEnvelope } from "../plugins/error-envelope";

const callerId = randomUUID();
const apps: FastifyInstance[] = [];

function hit(overrides: Partial<UserSearchRow> = {}): UserSearchRow {
  return {
    id: randomUUID(),
    username: "field_responder",
    avgRating: 4.5,
    isOnline: true,
    distanceKm: 12.4,
    ...overrides
  };
}

async function makeApp(options: { searchUsers?: UserSearchStore["searchUsers"] } = {}) {
  const searchUsers = vi.fn<UserSearchStore["searchUsers"]>(
    options.searchUsers ?? (async () => ({ items: [hit()], total: 41 }))
  );

  const user: AuthenticatedUserContext = {
    userId: callerId,
    role: "user",
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    username: "caller",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt: new Date("2026-10-21T09:00:00.000Z")
  } as AuthenticatedUserContext;

  const app = Fastify({ logger: false });
  // The real app installs this before its routes, so the route under test answers a thrown store
  // error the way production does rather than with Fastify's default serialization.
  registerErrorEnvelope(app);
  app.decorateRequest("authenticatedUser", null);
  app.addHook("preHandler", async (request, reply) => {
    if (request.headers.authorization !== "Bearer test-token") {
      return reply.code(401).send({ error: true, code: "UNAUTHORIZED", message: "Missing token.", issues: [] });
    }
    request.authenticatedUser = user;
  });
  await registerUserSearchRoute(app, { store: { searchUsers } as unknown as UserSearchStore });
  apps.push(app);
  return { app, searchUsers };
}

function search(app: FastifyInstance, query = "q=field_resp") {
  return app.inject({
    method: "GET",
    url: `/_user/users/search?${query}`,
    headers: { authorization: "Bearer test-token" }
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("searchTotalPages", () => {
  it("rounds up and answers zero for an empty result", () => {
    expect(searchTotalPages(0, 20)).toBe(0);
    expect(searchTotalPages(41, 20)).toBe(3);
    expect(searchTotalPages(40, 20)).toBe(2);
  });
});

describe("GET /_user/users/search", () => {
  it("refuses before any lookup when the session is not verified", async () => {
    const { app, searchUsers } = await makeApp();

    const response = await app.inject({ method: "GET", url: "/_user/users/search?q=field_resp" });

    expect(response.statusCode).toBe(401);
    expect(searchUsers).not.toHaveBeenCalled();
  });

  it("supports bounded authenticated browsing without a term, but rejects a single character", async () => {
    const { app, searchUsers } = await makeApp();
    const browse = await search(app, "page=1&limit=20");
    const tooShort = await search(app, "q=f");
    expect(browse.statusCode).toBe(200);
    expect(searchUsers).toHaveBeenCalledTimes(1);
    expect(searchUsers.mock.calls[0]![0]).toMatchObject({ term: "", sort: "username", radiusKm: null, page: 1, limit: 20 });
    expect(tooShort.statusCode).toBe(400);
    expect(tooShort.json().issues[0].code).toBe("q_too_short");
  });

  it("answers a store failure with the documented envelope and no description of the failure", async () => {
    // The shape of the outage this slice shipped with: PostgreSQL refusing an unresolved
    // `round(double precision, integer)` overload. A 500 must let the client retry, not read our
    // SQL out loud to whoever asks for a username.
    const { app } = await makeApp({
      searchUsers: async () => {
        throw new Error(
          'function round(double precision, integer) does not exist while selecting "users"."last_location"'
        );
      }
    });

    const response = await search(app);

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: true,
      code: "INTERNAL_ERROR",
      message: "The request could not be completed. Try again shortly.",
      issues: []
    });
    expect(response.body).not.toContain("round");
    expect(response.body).not.toContain("last_location");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("forwards category and incidentType filters to the search store and projects category names", async () => {
    const categoryId = randomUUID();
    const specialtyId = randomUUID();
    const { app, searchUsers } = await makeApp({
      searchUsers: async () => ({
        items: [hit({ category: "Mountain Rescue، Road Rescue" })],
        total: 1
      })
    });

    const response = await search(app, `q=field&category=${categoryId}&incidentType=${specialtyId}`);

    expect(response.statusCode).toBe(200);
    expect(searchUsers).toHaveBeenCalledWith(
      expect.objectContaining({
        term: "field",
        category: categoryId,
        incidentType: specialtyId
      })
    );
    expect(response.json().items[0]).toMatchObject({
      category: "Mountain Rescue، Road Rescue"
    });
  });

  it("treats a cleared control as no filter at all", async () => {
    const { app } = await makeApp();

    const response = await search(app, "q=field_resp&category=&incidentType=");

    expect(response.statusCode).toBe(200);
  });

  it("maps a page onto the contract and reports the whole total", async () => {
    const { app, searchUsers } = await makeApp();

    const response = await search(app, "q=%20field_resp%20&page=3&limit=25");

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(searchUsers).toHaveBeenCalledWith({
      term: "field_resp",
      sort: "distance",
      radiusKm: null,
      category: null,
      incidentType: null,
      minRating: null,
      online: null,
      callerId,
      reference: null,
      page: 3,
      limit: 25
    });
    expect(response.json()).toEqual({
      items: [
        {
          id: expect.any(String),
          username: "field_responder",
          category: null,
          avgRating: 4.5,
          isOnline: true,
          distance: 12.4
        }
      ],
      total: 41,
      page: 3,
      limit: 25,
      totalPages: 2
    });
  });

  it("forwards bounded radius and explicit username sorting without losing the distance reference", async () => {
    const { app, searchUsers } = await makeApp();
    const result = await search(app, "radiusKm=2.5&sort=username&lat=35.7&lon=51.4&category=");
    expect(result.statusCode).toBe(200);
    expect(searchUsers.mock.calls[0]![0]).toMatchObject({ term: "", sort: "username",
      radiusKm: 2.5, reference: { lat: 35.7, lon: 51.4 } });
    expect((await search(app, "q=a&radiusKm=2.5")).statusCode).toBe(400);
    expect((await search(app, "radiusKm=500.1")).statusCode).toBe(400);
    expect((await search(app, "sort=invalid")).statusCode).toBe(400);
  });

  it("prefers explicit coordinates and keeps them together", async () => {
    const { app, searchUsers } = await makeApp();

    const both = await search(app, "q=field&lat=35.7&lon=51.4");
    const half = await search(app, "q=field&lat=35.7");

    expect(both.statusCode).toBe(200);
    expect(searchUsers.mock.calls[0]![0]).toMatchObject({ reference: { lat: 35.7, lon: 51.4 } });
    // The shared schema owns the pairing rule, so the route does not have to restate it.
    expect(half.statusCode).toBe(400);
    expect(half.json().code).toBe("VALIDATION_ERROR");
  });

  it("keeps false distinct from absent for the online filter", async () => {
    const { app, searchUsers } = await makeApp();

    await search(app, "q=field&online=false");
    await search(app, "q=field&online=true");

    expect(searchUsers.mock.calls[0]![0].online).toBe(false);
    expect(searchUsers.mock.calls[1]![0].online).toBe(true);
  });

  it("passes a rating floor through and answers an empty page cleanly", async () => {
    const { app, searchUsers } = await makeApp({ searchUsers: async () => ({ items: [], total: 0 }) });

    const response = await search(app, "q=field&minRating=4");

    expect(searchUsers.mock.calls[0]![0].minRating).toBe(4);
    expect(response.json()).toEqual({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
  });

  it("reports a missing position as null rather than dropping the account", async () => {
    const { app } = await makeApp({
      searchUsers: async () => ({
        items: [
          hit({ distanceKm: null, avgRating: null, isOnline: false }),
          hit({ username: "field_volunteer", distanceKm: 0.1 })
        ],
        total: 2
      })
    });

    const body = (await search(app, "q=field")).json();

    expect(body.items[0]).toMatchObject({ avgRating: null, distance: null, isOnline: false });
    expect(body.items[1]).toMatchObject({ username: "field_volunteer", distance: 0.1 });
    expect(body.totalPages).toBe(1);
  });
});
