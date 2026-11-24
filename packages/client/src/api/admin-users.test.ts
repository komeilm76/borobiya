import { afterEach, describe, expect, it, vi } from "vitest";
import { adminUserListQuerySchema } from "@shared/index";
import { ApiError } from "./http";
import { createAdminUser, getAdminUser, listAdminUsers, updateAdminUserStatus } from "./admin-users";

const user = {
  id: "00000000-0000-4000-8000-000000000099",
  username: "rescue_user1",
  role: "user" as const,
  mustCompleteSecurityQuestions: false,
  isActive: true,
  avgRating: null,
  categories: [],
  createdAt: "2026-10-19T10:00:00.000Z"
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("admin user API", () => {
  it("provisions a user without security answers and expects onboarding on first login", async () => {
    const created = { ...user, mustCompleteSecurityQuestions: true };
    const fetchMock = vi.fn(async () => jsonResponse(created, 201));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createAdminUser({ username: "new_responder", password: "SecurePass123", isActive: true }, "admin-token"))
      .resolves.toEqual(created);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/_admin/users");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer admin-token");
    expect(JSON.parse(String(init.body))).toEqual({ username: "new_responder", password: "SecurePass123", isActive: true });
    expect(JSON.parse(String(init.body))).not.toHaveProperty("securityQuestions");
  });

  it("rejects invalid provisioning input before a request and propagates username conflicts", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ code: "USERNAME_TAKEN", message: "Taken." }, 409));
    vi.stubGlobal("fetch", fetchMock);
    await expect(createAdminUser({ username: "Wrong Case", password: "short", isActive: true }, "admin-token"))
      .rejects.toThrow();
    await expect(createAdminUser({ username: "new_responder", password: "SecurePass123", securityQuestions: [] } as unknown as Parameters<typeof createAdminUser>[0], "admin-token"))
      .rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(createAdminUser({ username: "new_responder", password: "SecurePass123", isActive: false }, "admin-token"))
      .rejects.toMatchObject({ status: 409, code: "USERNAME_TAKEN" });
  });

  it("loads the exact sender profile through the admin-only detail route, without caching", async () => {
    const detail = { ...user, devices: [], missions: [] };
    const fetchMock = vi.fn(async () => jsonResponse(detail));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    await expect(getAdminUser(user.id, "admin-token", controller.signal)).resolves.toEqual(detail);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/_admin/users/${user.id}`);
    expect(init.method).toBe("GET");
    expect(init.signal).toBe(controller.signal);
    expect(init.cache).toBe("no-store");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer admin-token");
  });

  it("rejects invalid sender IDs and malformed profiles instead of displaying another account", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ ...user, id: "00000000-0000-4000-8000-000000000098", devices: [], missions: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getAdminUser("not-a-uuid", "admin-token")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(getAdminUser(user.id, "admin-token")).rejects.toThrow();
  });

  it("serializes normalized search, status, and pagination filters and validates the page", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      items: [user],
      total: 6,
      page: 2,
      limit: 5,
      totalPages: 2
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await listAdminUsers({ q: " responder ", isActive: false, page: 2, limit: 5 }, "admin-token");

    expect(result).toMatchObject({ items: [user], total: 6, page: 2, limit: 5, totalPages: 2 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/_admin/users?q=responder&isActive=false&page=2&limit=5");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer admin-token");
    expect(init.credentials).toBe("same-origin");
  });

  it("rejects invalid list filters before sending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const query = { q: "x".repeat(31), page: 1, limit: 20 };

    expect(() => adminUserListQuerySchema.parse(query)).toThrow();
    await expect(listAdminUsers(query, "admin-token")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("changes account status with the admin PATCH endpoint and validates its response", async () => {
    const deactivatedUser = { ...user, isActive: false };
    const fetchMock = vi.fn(async () => jsonResponse(deactivatedUser));
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateAdminUserStatus(user.id, false, "admin-token")).resolves.toEqual(deactivatedUser);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/_admin/users/${user.id}/status`);
    expect(init.method).toBe("PATCH");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer admin-token");
    expect(JSON.parse(String(init.body))).toEqual({ isActive: false });
  });

  it("validates the user id before sending a status change", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateAdminUserStatus("not-a-uuid", false, "admin-token")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves typed API failures from status updates", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({
      error: true,
      code: "USER_NOT_FOUND",
      message: "The requested user does not exist.",
      issues: []
    }, 404)));

    await expect(updateAdminUserStatus(user.id, false, "admin-token"))
      .rejects.toMatchObject({ name: "ApiError", status: 404, code: "USER_NOT_FOUND" });
    await expect(updateAdminUserStatus(user.id, false, "admin-token"))
      .rejects.toBeInstanceOf(ApiError);
  });
});
