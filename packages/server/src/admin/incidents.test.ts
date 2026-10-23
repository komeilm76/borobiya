import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { AdminActorRecord, AdminUserStore } from "../db/admin-user-store";
import type {
  IncidentTypeCreateResult,
  IncidentTypeRecord,
  IncidentTypeStore,
  IncidentTypeUpdateResult
} from "../db/incident-type-store";
import { registerAdminIncidentRoutes } from "./incidents";
import { signAccessToken } from "../security/tokens";

const jwtSecret = "a".repeat(48);
const adminId = randomUUID();
const typeId = "33333333-3333-4333-8333-333333333333";
const createdAt = new Date("2026-10-22T09:00:00.000Z");

const activeAdmin: AdminActorRecord = { role: "admin", isActive: true, isSuspended: false };

const catalogRow: IncidentTypeRecord = {
  id: typeId,
  name: "Flood response",
  slug: "flood-response",
  icon: "wave",
  color: null,
  description: null,
  createdAt
};
const catalogPayload = {
  id: typeId,
  name: "Flood response",
  slug: "flood-response",
  icon: "wave",
  color: null,
  description: null,
  createdAt: "2026-10-22T09:00:00.000Z"
};

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function token(role: "admin" | "user" = "admin", sessionId = randomUUID()): Promise<string> {
  return signAccessToken({ userId: adminId, role, deviceId: randomUUID(), sessionId }, jwtSecret);
}

interface StoreOptions {
  list?: IncidentTypeRecord[];
  create?: IncidentTypeCreateResult;
  update?: IncidentTypeUpdateResult;
}

function makeStores(options: StoreOptions = {}) {
  const createIncidentType = vi.fn(
    async (_input: Parameters<IncidentTypeStore["createIncidentType"]>[0]): Promise<IncidentTypeCreateResult> =>
      options.create ?? { status: "created", record: catalogRow }
  );
  const updateIncidentType = vi.fn(
    async (_input: Parameters<IncidentTypeStore["updateIncidentType"]>[0]): Promise<IncidentTypeUpdateResult> =>
      options.update ?? { status: "updated", record: catalogRow, changed: true }
  );
  const listIncidentTypes = vi.fn(async () => options.list ?? [catalogRow]);
  const store: IncidentTypeStore = { listIncidentTypes, createIncidentType, updateIncidentType };

  const findAdminActorById = vi.fn(async () => activeAdmin);
  const hasActiveSession = vi.fn(async () => true);
  const adminStore = { findAdminActorById, hasActiveSession } as unknown as AdminUserStore;

  return { store, adminStore, createIncidentType, updateIncidentType, listIncidentTypes, findAdminActorById };
}

async function buildApp(stores: ReturnType<typeof makeStores>): Promise<FastifyInstance> {
  const app = Fastify();
  await registerAdminIncidentRoutes(app, {
    store: stores.store,
    adminStore: stores.adminStore,
    jwtSecret
  });
  await app.ready();
  apps.push(app);
  return app;
}

describe("admin incident-type routes", () => {
  it("lists the catalog with no-store and the shared payload shape", async () => {
    const stores = makeStores({ list: [catalogRow] });
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "GET",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual([catalogPayload]);
  });

  it("answers 401 without a bearer token and 403 to a non-admin", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const anonymous = await app.inject({ method: "GET", url: "/_admin/incidents" });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().code).toBe("UNAUTHORIZED");

    const ordinary = await app.inject({
      method: "GET",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token("user")}` }
    });
    expect(ordinary.statusCode).toBe(403);
    expect(ordinary.json().code).toBe("ADMIN_REQUIRED");
    expect(stores.listIncidentTypes, "a rejected request must not reach the store").not.toHaveBeenCalled();
  });

  it("authorizes once per request, not once per check the handler needs", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "Flood response" }
    });

    // A handler that calls the authorizer again to fetch the admin id doubles every account/session
    // lookup per request — and writes a second reply if the recheck fails after the first passed.
    expect(stores.findAdminActorById).toHaveBeenCalledOnce();
    expect(stores.createIncidentType).toHaveBeenCalledOnce();
  });

  it("derives the slug from the name and answers 201 with the stored row", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "  Mountain Rescue!! ", description: "   " }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(catalogPayload);
    expect(stores.createIncidentType).toHaveBeenCalledWith({
      adminId,
      name: "Mountain Rescue!!",
      slug: "mountain-rescue",
      icon: null,
      color: null,
      // A field an admin left blank arrives as whitespace and is stored as nothing, not as "".
      description: null
    });
  });

  it("keeps an explicit slug, which is the only way to name a type the derivation cannot handle", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "سیل", slug: "flood" }
    });

    expect(response.statusCode).toBe(201);
    expect(stores.createIncidentType.mock.calls[0]?.[0]).toMatchObject({ slug: "flood" });
  });

  it("refuses a name it cannot slugify, and says what to do about it", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "!!! ???" }
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.issues).toEqual([
      {
        code: "invalid_incident_slug",
        message:
          'The name "!!! ???" does not reduce to a usable slug: a slug is lowercase letters, digits, and single ' +
          "hyphens, at most 64 characters. Shorten the name or send a `slug` of your own.",
        path: ["slug"]
      }
    ]);
    expect(stores.createIncidentType).not.toHaveBeenCalled();
  });

  // The sentence these pin used to be "this name has no letters or digits to build a slug from", which is true
  // of `عسل` and untrue about a pasted paragraph: a long name is refused because the *slug* would not fit. The
  // refusal now quotes the value it is refusing and states the rule, so the admin can see which of the two
  // fixes (rename, or send a slug) applies to the input in front of them.
  it("refuses a name with nothing to slugify, naming it in the reply", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "عسل" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0].message).toContain('The name "عسل" does not reduce to a usable slug');
    expect(stores.createIncidentType).not.toHaveBeenCalled();
  });

  it("does not echo an oversized name back in full when the slug rule refuses it", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const name = "flood-".repeat(20); // 120 characters: longer than a slug may be, so derivation refuses

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name }
    });

    expect(response.statusCode).toBe(400);
    const message: string = response.json().issues[0].message;
    expect(message).toContain("does not reduce to a usable slug");
    expect(message).toContain("flood-".repeat(10)); // the capped prefix it quotes
    expect(message).not.toContain(name);
    expect(message.length).toBeLessThan(400);
  });

  // Both halves of the coherence rule, in the route that used to enforce only one of them: a derived slug and a
  // typed slug must be legal or illegal for the same reason. `a-` slugifies to one legal character, so it is
  // stored rather than refused — the floor is "at least one character", not a number the API invents.
  it("accepts a one-character derivation, the same length an explicit slug may have", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "a-" }
    });

    expect(response.statusCode).toBe(201);
    expect(stores.createIncidentType.mock.calls[0]?.[0]).toMatchObject({ name: "a-", slug: "a" });
  });

  it("refuses an explicit slug longer than 64 characters, which used to be storable", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "Flood", slug: "f".repeat(65) }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues[0]).toMatchObject({ path: ["slug"] });
    expect(response.json().issues[0].code).not.toBe("invalid_incident_slug"); // zod's own length issue, same as any other field
    expect(stores.createIncidentType).not.toHaveBeenCalled();
  });

  it("rejects a malformed body through the shared schema, including unknown keys", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "", isOfficial: true }
    });

    expect(response.statusCode).toBe(400);
    // Zod reports an unknown key of a strict object at the object's own level, not under the key's name.
    const issues = response.json().issues as { code: string; path: string[] }[];
    expect(issues.map((issue) => [issue.code, issue.path.join(".")])).toEqual([
      ["too_small", "name"],
      ["unrecognized_keys", ""]
    ]);
  });

  it("answers 409 with the type that already owns the slug", async () => {
    const stores = makeStores({ create: { status: "slug_taken", conflict: { slug: "flood", name: "Flood" } } });
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "Flood" }
    });

    expect(response.statusCode).toBe(409);
    const body = response.json();
    expect(body.code).toBe("INCIDENT_TYPE_SLUG_TAKEN");
    expect(body.message).toBe('"Flood" already uses the slug "flood". Choose a different name or slug.');
    expect(body.issues).toEqual([
      { code: "incident_type_slug_taken", message: body.message, path: ["slug"], slug: "flood" }
    ]);
  });

  it("falls back to a nameless refusal when the conflicting row is gone by the time we look", async () => {
    const stores = makeStores({ create: { status: "slug_taken", conflict: { slug: "flood", name: null } } });
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "Flood" }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().message).toBe('The slug "flood" is already in use by another incident type.');
    expect(response.json().issues[0].slug).toBe("flood");
  });

  it("updates through the same payload rules and 404s an unknown id", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const unknown = makeStores({ update: { status: "not_found" } });
    const unknownApp = await buildApp(unknown);
    const headers = { authorization: `Bearer ${await token()}` };

    const ok = await app.inject({ method: "PATCH", url: `/_admin/incidents/${typeId}`, headers, payload: { color: null } });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual(catalogPayload);
    expect(stores.updateIncidentType).toHaveBeenCalledWith({
      adminId,
      id: typeId,
      // `color: null` clears; nothing else is touched, and an absent `slug` stays out of the patch entirely.
      patch: { color: null }
    });

    const missing = await unknownApp.inject({
      method: "PATCH",
      url: "/_admin/incidents/44444444-4444-4444-8444-444444444444",
      headers,
      payload: { name: "Renamed" }
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("INCIDENT_TYPE_NOT_FOUND");
  });

  it("re-derives the slug on a rename and refuses a collision with another type", async () => {
    const stores = makeStores({ update: { status: "slug_taken", conflict: { slug: "fire", name: "Fire service" } } });
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "PATCH",
      url: `/_admin/incidents/${typeId}`,
      headers: { authorization: `Bearer ${await token()}` },
      payload: { name: "Fire" }
    });

    expect(stores.updateIncidentType).toHaveBeenCalledWith({ adminId, id: typeId, patch: { name: "Fire", slug: "fire" } });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("INCIDENT_TYPE_SLUG_TAKEN");
  });

  it("leaves the slug out of the patch when neither name nor slug is sent", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    await app.inject({
      method: "PATCH",
      url: `/_admin/incidents/${typeId}`,
      headers: { authorization: `Bearer ${await token()}` },
      payload: { description: "updated notes", color: null }
    });

    expect(stores.updateIncidentType.mock.calls[0]?.[0]).toMatchObject({
      patch: { description: "updated notes", color: null }
    });
  });

  it("takes a blank description as cleared but refuses a blank icon, which has its own spelling", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const blankDescription = await app.inject({
      method: "PATCH",
      url: `/_admin/incidents/${typeId}`,
      headers: { authorization: `Bearer ${await token()}` },
      payload: { description: "   " }
    });
    expect(blankDescription.statusCode).toBe(200);
    expect(stores.updateIncidentType.mock.calls[0]?.[0]).toMatchObject({ patch: { description: null } });

    const blankIcon = await app.inject({
      method: "PATCH",
      url: `/_admin/incidents/${typeId}`,
      headers: { authorization: `Bearer ${await token()}` },
      payload: { icon: "" }
    });
    expect(blankIcon.statusCode).toBe(400);
    expect(stores.updateIncidentType).toHaveBeenCalledOnce();
  });

  it("refuses an empty PATCH before touching the store", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "PATCH",
      url: `/_admin/incidents/${typeId}`,
      headers: { authorization: `Bearer ${await token()}` },
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
    expect(stores.updateIncidentType).not.toHaveBeenCalled();
  });

  it("reports both path and body problems in one 400", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "PATCH",
      url: "/_admin/incidents/not-a-uuid",
      headers: { authorization: `Bearer ${await token()}` },
      payload: { slug: "Not A Slug" }
    });

    expect(response.statusCode).toBe(400);
    const issues = response.json().issues as { path: string[] }[];
    expect(issues.map((issue) => issue.path.join("."))).toEqual(["id", "slug"]);
  });
});
