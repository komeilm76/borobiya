import { afterEach, describe, expect, it, vi } from "vitest";
import { adminUserListQuerySchema } from "@shared/index";
import { ApiError } from "./http";
import { listAdminUsers, updateAdminUserStatus } from "./admin-users";

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
