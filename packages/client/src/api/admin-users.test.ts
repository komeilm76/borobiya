import { afterEach, describe, expect, it, vi } from "vitest";
import { adminUserListQuerySchema } from "@shared/index";
import { ApiError } from "./http";
import { getAdminUser, listAdminUsers, updateAdminUserStatus } from "./admin-users";

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

  it("reads one account with its devices and missions from the detail route", async () => {
    const detail = {
      ...user,
      devices: [
        {
          id: "00000000-0000-4000-8000-0000000000aa",
          deviceId: "00000000-0000-4000-8000-0000000000bb",
          deviceName: "iPhone 15",
          ip: "192.0.2.10",
          isCurrentDevice: false,
          lastActiveAt: "2026-11-02T09:40:00.000Z",
          isOnline: true
        }
      ],
      missions: [
        {
          id: "00000000-0000-4000-8000-0000000000cc",
          sosRequestId: "00000000-0000-4000-8000-0000000000dd",
          rescuerId: user.id,
          requesterId: "00000000-0000-4000-8000-0000000000ee",
          status: "completed" as const,
          cancelledBy: null,
          cancellationReasonId: null,
          cancellationCustomText: null,
          cancelledAt: null,
          createdAt: "2026-10-20T08:00:00.000Z",
          updatedAt: "2026-10-20T09:00:00.000Z"
        }
      ]
    };
    const fetchMock = vi.fn(async () => jsonResponse(detail));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdminUser(user.id, "admin-token")).resolves.toMatchObject({
      username: "rescue_user1",
      devices: [{ deviceName: "iPhone 15", isOnline: true }],
      missions: [{ status: "completed" }]
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/_admin/users/${user.id}`);
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer admin-token");
  });

  it("refuses a malformed detail payload instead of rendering half an account", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ ...user, devices: "nope", missions: [] })));

    await expect(getAdminUser(user.id, "admin-token")).rejects.toThrow();
  });

  it("validates the id before asking the detail route", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getAdminUser("not-a-uuid", "admin-token")).rejects.toThrow();
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
