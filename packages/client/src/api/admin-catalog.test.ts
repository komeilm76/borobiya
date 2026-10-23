import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "./http";
import {
  assignCategoryUsers,
  createCategory,
  createIncidentType,
  listCategories,
  listIncidentTypes,
  listPublicIncidentTypes,
  removeCategoryUser,
  updateCategory,
  updateIncidentType
} from "./admin-catalog";

const INCIDENT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Flood response",
  slug: "flood-response",
  icon: null,
  color: null,
  description: null,
  createdAt: "2026-10-22T09:00:00.000Z"
};

const CATEGORY = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "River team",
  description: null,
  incidentTypeIds: [INCIDENT.id],
  members: [],
  createdAt: "2026-10-22T09:00:00.000Z"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function stubFetch(reply: () => Response) {
  const fetchMock = vi.fn(async (..._args: [string, RequestInit]) => reply());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The `[url, init]` pair of one recorded call, kept in one place so every assertion reads the same. */
function call(fetchMock: ReturnType<typeof stubFetch>, index = 0): [string, RequestInit] {
  return fetchMock.mock.calls[index] as [string, RequestInit];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("incident catalog calls", () => {
  it("reads the list through the contract's own path and validates what comes back", async () => {
    const fetchMock = stubFetch(() => jsonResponse([INCIDENT]));

    await expect(listIncidentTypes("admin-token")).resolves.toEqual([INCIDENT]);
    const [url, init] = call(fetchMock);
    expect(url).toBe("/api/_admin/incidents");
    expect(init.method).toBe("GET");
    expect((init.headers as Headers).get("authorization")).toBe("Bearer admin-token");
  });

  it("refuses to render a row the shared schema does not recognize, rather than shipping undefined", async () => {
    stubFetch(() => jsonResponse([{ ...INCIDENT, slug: "Flood-Response" }]));

    // The slug rule is shared, so a server that starts returning something the client's schema rejects is
    // a broken contract, not a UI bug to paper over with optional chaining.
    await expect(listIncidentTypes("admin-token")).rejects.toThrow();
  });

  it("sends the create body exactly as the schema allows it", async () => {
    const fetchMock = stubFetch(() => jsonResponse(INCIDENT, 201));

    await expect(createIncidentType({ name: "Flood response" }, "admin-token")).resolves.toEqual(INCIDENT);
    const [url, init] = call(fetchMock);
    expect([url, init.method]).toEqual(["/api/_admin/incidents", "POST"]);
    expect(JSON.parse(String(init.body))).toEqual({ name: "Flood response" });
  });

  it("will not send an empty icon or color, because those fields refuse one and the admin would pay for it", async () => {
    const fetchMock = stubFetch(() => jsonResponse(INCIDENT, 201));

    await expect(createIncidentType({ name: "Flood response", icon: "" }, "admin-token")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("patches one field at a time on the row's own path", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ...INCIDENT, color: "#ef4444" }));

    await expect(updateIncidentType(INCIDENT.id, { color: "#ef4444" }, "admin-token")).resolves.toMatchObject({
      color: "#ef4444"
    });
    const [url, init] = call(fetchMock);
    expect([url, init.method]).toEqual([`/api/_admin/incidents/${INCIDENT.id}`, "PATCH"]);
    expect(JSON.parse(String(init.body))).toEqual({ color: "#ef4444" });
  });

  it("refuses an empty patch locally, which is the 400 the contract says the server would answer", async () => {
    const fetchMock = stubFetch(() => jsonResponse(INCIDENT));

    await expect(updateIncidentType(INCIDENT.id, {}, "admin-token")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses to address a row by something that is not an id", async () => {
    const fetchMock = stubFetch(() => jsonResponse(INCIDENT));

    await expect(updateIncidentType("../../etc/passwd", { name: "Fire" }, "admin-token")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("category calls", () => {
  it("lists categories with their incident-type set", async () => {
    stubFetch(() => jsonResponse([CATEGORY]));

    await expect(listCategories("admin-token")).resolves.toEqual([CATEGORY]);
  });

  it("creates a category with an empty type set, which the route reads as “no types”", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ...CATEGORY, incidentTypeIds: [] }, 201));

    await expect(createCategory({ name: "River team", incidentTypeIds: [] }, "admin-token")).resolves.toMatchObject({
      incidentTypeIds: []
    });
    expect(JSON.parse(String(call(fetchMock)[1].body))).toEqual({
      name: "River team",
      incidentTypeIds: []
    });
  });

  it("replaces the type set on update", async () => {
    const fetchMock = stubFetch(() => jsonResponse(CATEGORY));
    const otherId = "33333333-3333-4333-8333-333333333333";

    await updateCategory(CATEGORY.id, { incidentTypeIds: [otherId] }, "admin-token");
    const [url, init] = call(fetchMock);
    expect([url, init.method]).toEqual([`/api/_admin/categories/${CATEGORY.id}`, "PATCH"]);
    expect(JSON.parse(String(init.body))).toEqual({ incidentTypeIds: [otherId] });
  });

  it("assigns members to a category and tolerates the empty body the route answers with", async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));

    await expect(assignCategoryUsers(CATEGORY.id, ["44444444-4444-4444-8444-444444444444"], "admin-token")).resolves
      .toBeUndefined();
    const [url, init] = call(fetchMock);
    expect([url, init.method]).toEqual([`/api/_admin/categories/${CATEGORY.id}/users`, "POST"]);
    expect(JSON.parse(String(init.body))).toEqual({ userIds: ["44444444-4444-4444-8444-444444444444"] });
  });

  it("will not assign an empty selection, because the schema requires one id", async () => {
    const fetchMock = stubFetch(() => new Response(null, { status: 200 }));

    await expect(assignCategoryUsers(CATEGORY.id, [], "admin-token")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("passes a server refusal through with its code, so the screen can name the entity", async () => {
    stubFetch(() =>
      jsonResponse(
        { error: true, code: "CATEGORY_NOT_FOUND", message: "The requested category does not exist.", issues: [] },
        404
      )
    );

    const error = await updateCategory(CATEGORY.id, { name: "Renamed" }, "admin-token").catch((cause) => cause);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("CATEGORY_NOT_FOUND");
    expect((error as ApiError).status).toBe(404);
  });

  it("removes a member through DELETE /_admin/categories/:id/users/:userId and reads public incident types", async () => {
    const memberId = "44444444-4444-4444-8444-444444444444";
    const deleteFetch = stubFetch(() => new Response(null, { status: 200 }));
    await expect(removeCategoryUser(CATEGORY.id, memberId, "admin-token")).resolves.toBeUndefined();
    const [deleteUrl, deleteInit] = call(deleteFetch);
    expect([deleteUrl, deleteInit.method]).toEqual([
      `/api/_admin/categories/${CATEGORY.id}/users/${memberId}`,
      "DELETE"
    ]);

    const publicFetch = stubFetch(() => jsonResponse([INCIDENT]));
    await expect(listPublicIncidentTypes()).resolves.toEqual([INCIDENT]);
    const [publicUrl, publicInit] = call(publicFetch);
    expect([publicUrl, publicInit.method]).toEqual(["/api/_public/incident-types", "GET"]);
  });
});
