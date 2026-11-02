import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAdminSettings,
  getAdminStats,
  listAdminAlerts,
  listAdminAudit,
  resolveAdminAlert,
  updateAdminSetting
} from "./admin-governance";

const alertId = "88888888-8888-4888-8888-888888888888";
const entry = {
  id: "00000000-0000-4000-8000-000000000001",
  adminId: "00000000-0000-4000-8000-000000000002",
  adminUsername: "ops_admin",
  action: "category_created",
  targetType: "category",
  targetId: null,
  meta: { name: "Mountain Rescue" },
  createdAt: "2026-10-22T10:00:00.000Z"
};
const alert = {
  id: alertId,
  type: "rescuer_cancel_review",
  userId: "00000000-0000-4000-8000-000000000003",
  username: "field_rescuer",
  missionId: "00000000-0000-4000-8000-000000000004",
  sosRequestId: "00000000-0000-4000-8000-000000000005",
  details: { countToday: 3 },
  createdAt: "2026-10-22T10:00:00.000Z",
  resolvedAt: null
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

describe("admin governance API", () => {
  it("drops empty filters from the audit query and validates the page", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [entry], total: 1, page: 1, limit: 25, totalPages: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await listAdminAudit("admin-token", { action: "category_created", targetType: "", page: 1, limit: 25 });

    expect(page.items).toEqual([entry]);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/_admin/audit?action=category_created&page=1&limit=25");
  });

  it("sends the resolved filter as a boolean string", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ items: [alert], total: 1, page: 1, limit: 20, totalPages: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    await listAdminAlerts("admin-token", { resolved: false });

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("/api/_admin/alerts?resolved=false");
  });

  it("resolves an alert with POST and returns the parsed row", async () => {
    const resolved = { ...alert, resolvedAt: "2026-10-22T11:00:00.000Z" };
    const fetchMock = vi.fn(async () => jsonResponse(resolved));
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveAdminAlert("admin-token", alertId);

    expect(result.resolvedAt).toBe("2026-10-22T11:00:00.000Z");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/_admin/alerts/${alertId}/resolve`);
    expect(init.method).toBe("POST");
  });

  it("unwraps the settings registry and writes one key through PUT", async () => {
    const setting = {
      key: "alerts.cancellation_daily_threshold",
      value: 2,
      defaultValue: 2,
      updatedAt: null,
      updatedByUsername: null
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [setting] }))
      .mockResolvedValueOnce(jsonResponse({ ...setting, value: 4 }));
    vi.stubGlobal("fetch", fetchMock);

    const items = await getAdminSettings("admin-token");
    expect(items).toEqual([setting]);

    const updated = await updateAdminSetting("admin-token", "alerts.cancellation_daily_threshold", 4);
    expect(updated.value).toBe(4);

    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe("/api/_admin/settings/alerts.cancellation_daily_threshold");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ value: 4 });
  });

  it("rejects a value the shared registry refuses before it reaches the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateAdminSetting("admin-token", "alerts.other_reason_notify", 3)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses the aggregate counters", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ counts: { pending: 2, completed: 5 }, activeMissions: 1, onlineUsers: 7 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const stats = await getAdminStats("admin-token");

    expect(stats).toEqual({ counts: { pending: 2, completed: 5 }, activeMissions: 1, onlineUsers: 7 });
  });
});
