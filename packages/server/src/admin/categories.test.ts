import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { AdminActorRecord, AdminUserStore } from "../db/admin-user-store";
import type {
  CategoryAssignResult,
  CategoryCreateResult,
  CategoryRecord,
  CategoryRemoveMemberResult,
  CategoryStore,
  CategoryUpdateResult
} from "../db/category-store";
import { registerAdminCategoryRoutes } from "./categories";
import { signAccessToken } from "../security/tokens";

const jwtSecret = "a".repeat(48);
const adminId = randomUUID();
const categoryId = "55555555-5555-4555-8555-555555555555";
const otherUserId = "66666666-6666-4666-8666-666666666666";
const incidentTypeId = "77777777-7777-4777-8777-777777777777";
const createdAt = new Date("2026-10-22T10:00:00.000Z");

const activeAdmin: AdminActorRecord = { role: "admin", isActive: true, isSuspended: false };

const catalogRow: CategoryRecord = {
  id: categoryId,
  name: "Mountain Rescue",
  description: "alpine and cliff",
  incidentTypeIds: [incidentTypeId],
  createdAt
};
const catalogPayload = {
  id: categoryId,
  name: "Mountain Rescue",
  description: "alpine and cliff",
  incidentTypeIds: [incidentTypeId],
  createdAt: "2026-10-22T10:00:00.000Z"
};

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function adminToken(): Promise<string> {
  return signAccessToken({ userId: adminId, role: "admin", deviceId: randomUUID(), sessionId: randomUUID() }, jwtSecret);
}

interface StoreOptions {
  list?: CategoryRecord[];
  create?: CategoryCreateResult;
  update?: CategoryUpdateResult;
  assign?: CategoryAssignResult;
  remove?: CategoryRemoveMemberResult;
}

function makeStores(options: StoreOptions = {}) {
  const listCategories = vi.fn(async () => options.list ?? [catalogRow]);
  const createCategory = vi.fn(
    async (_input: Parameters<CategoryStore["createCategory"]>[0]): Promise<CategoryCreateResult> =>
      options.create ?? { status: "created", record: catalogRow }
  );
  const updateCategory = vi.fn(
    async (_input: Parameters<CategoryStore["updateCategory"]>[0]): Promise<CategoryUpdateResult> =>
      options.update ?? { status: "updated", record: catalogRow, changed: true }
  );
  const assignUsers = vi.fn(
    async (_input: Parameters<CategoryStore["assignUsers"]>[0]): Promise<CategoryAssignResult> =>
      options.assign ?? { status: "assigned", added: 1 }
  );
  const removeUser = vi.fn(
    async (_input: Parameters<CategoryStore["removeUser"]>[0]): Promise<CategoryRemoveMemberResult> =>
      options.remove ?? { status: "removed", wasMember: true }
  );
  const store: CategoryStore = { listCategories, createCategory, updateCategory, assignUsers, removeUser };
  const findAdminActorById = vi.fn(async () => activeAdmin);
  const adminStore = { findAdminActorById, hasActiveSession: vi.fn(async () => true) } as unknown as AdminUserStore;
  return { store, adminStore, listCategories, createCategory, updateCategory, assignUsers, removeUser, findAdminActorById };
}

async function buildApp(stores: ReturnType<typeof makeStores>): Promise<FastifyInstance> {
  const app = Fastify();
  await registerAdminCategoryRoutes(app, {
    store: stores.store,
    adminStore: stores.adminStore,
    jwtSecret
  });
  await app.ready();
  apps.push(app);
  return app;
}

function headers(token: string) {
  return { authorization: `Bearer ${token}` };
}

describe("admin category routes", () => {
  it("lists categories with their incident types, no-store", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({ method: "GET", url: "/_admin/categories", headers: headers(await adminToken()) });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual([catalogPayload]);
  });

  it("requires a verified admin before touching any of the stores", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const anonymous = await app.inject({ method: "GET", url: "/_admin/categories" });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json().code).toBe("UNAUTHORIZED");

    const forbidden = await app.inject({
      method: "POST",
      url: "/_admin/categories",
      headers: headers(await signAccessToken({ userId: adminId, role: "user", deviceId: randomUUID(), sessionId: randomUUID() }, jwtSecret)),
      payload: { name: "x", incidentTypeIds: [] }
    });
    expect(forbidden.statusCode).toBe(403);
    expect(stores.createCategory).not.toHaveBeenCalled();
  });

  it("authorizes each request exactly once across all five routes", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const token = await adminToken();

    await app.inject({ method: "GET", url: "/_admin/categories", headers: headers(token) });
    await app.inject({ method: "POST", url: "/_admin/categories", headers: headers(token), payload: { name: "x", incidentTypeIds: [] } });
    await app.inject({ method: "PATCH", url: `/_admin/categories/${categoryId}`, headers: headers(token), payload: { name: "y" } });
    await app.inject({ method: "POST", url: `/_admin/categories/${categoryId}/users`, headers: headers(token), payload: { userIds: [otherUserId] } });
    await app.inject({ method: "DELETE", url: `/_admin/categories/${categoryId}/users/${otherUserId}`, headers: headers(token) });

    expect(stores.findAdminActorById).toHaveBeenCalledTimes(5);
  });

  it("creates with a name, an explicit id set, and a blank description folded to null", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/categories",
      headers: headers(await adminToken()),
      payload: { name: "Mountain Rescue", description: "   ", incidentTypeIds: [incidentTypeId] }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(catalogPayload);
    expect(stores.createCategory).toHaveBeenCalledWith({
      adminId,
      name: "Mountain Rescue",
      description: null,
      incidentTypeIds: [incidentTypeId]
    });
  });

  it("requires `incidentTypeIds` to be present, even as an empty list", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const missing = await app.inject({
      method: "POST",
      url: "/_admin/categories",
      headers: headers(await adminToken()),
      payload: { name: "No specialties" }
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json().issues.map((issue: { path: string[] }) => issue.path.join("."))).toContain("incidentTypeIds");

    const empty = await app.inject({
      method: "POST",
      url: "/_admin/categories",
      headers: headers(await adminToken()),
      payload: { name: "No specialties", incidentTypeIds: [] }
    });
    expect(empty.statusCode).toBe(201);
    expect(stores.createCategory.mock.calls.at(-1)?.[0]).toMatchObject({ incidentTypeIds: [] });
  });

  it("points each unknown incident type at its own index in the caller's array", async () => {
    const ghost = randomUUID();
    const stores = makeStores({ create: { status: "unknown_incident_types", ids: [ghost] } });
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: "/_admin/categories",
      headers: headers(await adminToken()),
      payload: { name: "Mountain Rescue", incidentTypeIds: [incidentTypeId, ghost] }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([
      { code: "unknown_incident_type", message: "One or more incident types do not exist.", path: ["incidentTypeIds", 1] }
    ]);
  });

  it("replaces the incident-type set on a PATCH and 404s an unknown category", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const missingStores = makeStores({ update: { status: "not_found" } });
    const missingApp = await buildApp(missingStores);
    const token = await adminToken();

    const patched = await app.inject({
      method: "PATCH",
      url: `/_admin/categories/${categoryId}`,
      headers: headers(token),
      payload: { incidentTypeIds: [] }
    });
    expect(patched.statusCode).toBe(200);
    expect(stores.updateCategory).toHaveBeenCalledWith({ adminId, id: categoryId, patch: { incidentTypeIds: [] } });

    const missing = await missingApp.inject({
      method: "PATCH",
      url: "/_admin/categories/88888888-8888-4888-8888-888888888888",
      headers: headers(token),
      payload: { name: "Renamed" }
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("CATEGORY_NOT_FOUND");
  });

  it("refuses a PATCH body that names nothing", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "PATCH",
      url: `/_admin/categories/${categoryId}`,
      headers: headers(await adminToken()),
      payload: {}
    });

    expect(response.statusCode).toBe(400);
    expect(stores.updateCategory).not.toHaveBeenCalled();
  });

  it("assigns members and answers no content, whatever it added", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: `/_admin/categories/${categoryId}/users`,
      headers: headers(await adminToken()),
      payload: { userIds: [otherUserId] }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(stores.assignUsers).toHaveBeenCalledWith({ adminId, id: categoryId, userIds: [otherUserId] });
  });

  it("refuses an empty assignment and a duplicate id in the same shape as the share routes do", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const token = await adminToken();

    const empty = await app.inject({
      method: "POST",
      url: `/_admin/categories/${categoryId}/users`,
      headers: headers(token),
      payload: { userIds: [] }
    });
    expect(empty.statusCode).toBe(400);

    const dupe = await app.inject({
      method: "POST",
      url: `/_admin/categories/${categoryId}/users`,
      headers: headers(token),
      payload: { userIds: [otherUserId, otherUserId] }
    });
    expect(dupe.statusCode).toBe(400);
    expect(dupe.json().issues.some((issue: { message: string }) => issue.message === "IDs must be unique.")).toBe(true);
    expect(stores.assignUsers).not.toHaveBeenCalled();
  });

  it("names the index of each unknown user in an assignment", async () => {
    const ghost = randomUUID();
    const stores = makeStores({ assign: { status: "unknown_users", ids: [ghost] } });
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "POST",
      url: `/_admin/categories/${categoryId}/users`,
      headers: headers(await adminToken()),
      payload: { userIds: [ghost, otherUserId] }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues).toEqual([
      { code: "unknown_user", message: "One or more users do not exist.", path: ["userIds", 0] }
    ]);
  });

  it("treats removing a non-member as the success it is, and 404s only a missing category", async () => {
    const stores = makeStores({ remove: { status: "removed", wasMember: false } });
    const app = await buildApp(stores);
    const missingStores = makeStores({ remove: { status: "not_found" } });
    const missingApp = await buildApp(missingStores);
    const token = await adminToken();

    const notMember = await app.inject({
      method: "DELETE",
      url: `/_admin/categories/${categoryId}/users/${otherUserId}`,
      headers: headers(token)
    });
    expect(notMember.statusCode).toBe(200);
    expect(notMember.body).toBe("");

    const missingCategory = await missingApp.inject({
      method: "DELETE",
      url: `/_admin/categories/${categoryId}/users/${otherUserId}`,
      headers: headers(token)
    });
    expect(missingCategory.statusCode).toBe(404);
    expect(missingCategory.json().code).toBe("CATEGORY_NOT_FOUND");
  });

  it("validates both path ids before the store sees either", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);

    const response = await app.inject({
      method: "DELETE",
      url: `/_admin/categories/${categoryId}/users/not-a-uuid`,
      headers: headers(await adminToken())
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().issues.map((issue: { path: string[] }) => issue.path.join("."))).toEqual(["userId"]);
    expect(stores.removeUser).not.toHaveBeenCalled();
  });
});
