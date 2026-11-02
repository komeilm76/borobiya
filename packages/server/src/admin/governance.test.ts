import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { AdminActorRecord, AdminUserStore } from "../db/admin-user-store";
import type { AdminAlertStore } from "../db/admin-alert-store";
import type { AdminAuditStore } from "../db/admin-audit-store";
import type { AdminStatsStore } from "../db/admin-stats-store";
import type { AppSettingsStore } from "../db/app-settings-store";
import { adminSettingDefinitions } from "@borobiya/shared";
import { registerAdminGovernanceRoutes } from "./governance";
import { signAccessToken } from "../security/tokens";

const jwtSecret = "g".repeat(48);
const adminId = randomUUID();
const alertId = "88888888-8888-4888-8888-888888888888";
const missionId = "99999999-9999-4999-8999-999999999999";
const sosRequestId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rescuerId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const createdAt = "2026-10-22T10:00:00.000Z";
const activeAdmin: AdminActorRecord = { role: "admin", isActive: true, isSuspended: false };

const alertRecord = {
  id: alertId,
  type: "rescuer_cancel_review",
  userId: rescuerId,
  username: "field_rescuer",
  missionId,
  sosRequestId,
  details: { countToday: 3 },
  createdAt,
  resolvedAt: null
};

const auditRecord = {
  id: randomUUID(),
  adminId,
  adminUsername: "ops_admin",
  action: "category_created",
  targetType: "category",
  targetId: null,
  meta: { name: "Mountain Rescue" },
  createdAt
};

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function adminToken(): Promise<string> {
  return signAccessToken({ userId: adminId, role: "admin", deviceId: randomUUID(), sessionId: randomUUID() }, jwtSecret);
}

function makeStores() {
  const listEntries = vi.fn<AdminAuditStore["listEntries"]>(async () => ({ items: [auditRecord], total: 1 }));
  const listAlerts = vi.fn<AdminAlertStore["listAlerts"]>(async () => ({ items: [alertRecord], total: 1 }));
  const resolveAlert = vi.fn<AdminAlertStore["resolveAlert"]>(async () => ({
    status: "resolved" as const,
    changed: true,
    alert: { ...alertRecord, resolvedAt: "2026-10-22T11:00:00.000Z" }
  }));
  const readAll = vi.fn<AppSettingsStore["readAll"]>(async () => [
    {
      key: "alerts.cancellation_daily_threshold",
      value: 2,
      defaultValue: 2,
      updatedAt: null,
      updatedByUsername: null
    },
    { key: "alerts.other_reason_notify", value: true, defaultValue: true, updatedAt: null, updatedByUsername: null }
  ]);
  const readValue = vi.fn<AppSettingsStore["readValue"]>(async () => 2);
  const write = vi.fn<AppSettingsStore["write"]>(async (input) => {
    const message = input.value === 999 ? "between 0 and 50" : null;
    if (message !== null) return { status: "invalid" as const, message };
    return {
      status: "updated" as const,
      changed: true,
      setting: {
        key: input.key,
        value: input.value,
        defaultValue: adminSettingDefinitions[input.key].defaultValue,
        updatedAt: createdAt,
        updatedByUsername: "ops_admin"
      }
    };
  });
  const readStats = vi.fn<AdminStatsStore["readStats"]>(async () => ({
    counts: { pending: 2, completed: 1 },
    activeMissions: 1,
    onlineUsers: 3
  }));
  const findAdminActorById = vi.fn(async () => activeAdmin);
  return {
    auditStore: { listEntries } as AdminAuditStore,
    alertStore: { listAlerts, resolveAlert } as AdminAlertStore,
    settingsStore: { readAll, readValue, write } as AppSettingsStore,
    statsStore: { readStats } as AdminStatsStore,
    adminStore: { findAdminActorById, hasActiveSession: vi.fn(async () => true) } as unknown as AdminUserStore,
    listEntries,
    listAlerts,
    resolveAlert,
    readAll,
    write,
    readStats
  };
}

async function buildApp(stores: ReturnType<typeof makeStores>): Promise<FastifyInstance> {
  const app = Fastify();
  await registerAdminGovernanceRoutes(app, {
    auditStore: stores.auditStore,
    alertStore: stores.alertStore,
    settingsStore: stores.settingsStore,
    statsStore: stores.statsStore,
    adminStore: stores.adminStore,
    jwtSecret
  });
  await app.ready();
  apps.push(app);
  return app;
}

describe("admin governance routes", () => {
  it("refuses every surface without an admin token", async () => {
    const app = await buildApp(makeStores());
    for (const [method, url] of [
      ["GET", "/_admin/audit"],
      ["GET", "/_admin/alerts"],
      ["GET", "/_admin/settings"],
      ["GET", "/_admin/stats"],
      ["POST", `/_admin/alerts/${alertId}/resolve`],
      ["PUT", "/_admin/settings/alerts.other_reason_notify"]
    ] as const) {
      const response = await app.inject({ method, url, payload: method === "GET" ? undefined : { value: true } });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it("pages the audit trail and passes the filters through to the store", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const response = await app.inject({
      method: "GET",
      url: `/_admin/audit?action=category_created&limit=5&page=2`,
      headers: { authorization: `Bearer ${await adminToken()}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, page: 2, limit: 5, totalPages: 1 });
    expect(stores.listEntries).toHaveBeenCalledWith(expect.objectContaining({ action: "category_created", page: 2, limit: 5 }));
  });

  it("rejects an audit window that is not a timestamp", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const response = await app.inject({
      method: "GET",
      url: "/_admin/audit?from=yesterday",
      headers: { authorization: `Bearer ${await adminToken()}` }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
    expect(stores.listEntries).not.toHaveBeenCalled();
  });

  it("lists alerts with the resolved filter and reports the page metadata", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const response = await app.inject({
      method: "GET",
      url: "/_admin/alerts?resolved=false",
      headers: { authorization: `Bearer ${await adminToken()}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1, totalPages: 1, items: [{ id: alertId, sosRequestId }] });
    expect(stores.listAlerts).toHaveBeenCalledWith(expect.objectContaining({ resolved: false }));
  });

  it("resolves an alert for the calling admin and 404s an unknown one", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const token = await adminToken();
    const resolved = await app.inject({
      method: "POST",
      url: `/_admin/alerts/${alertId}/resolve`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().resolvedAt).toBe("2026-10-22T11:00:00.000Z");
    expect(stores.resolveAlert).toHaveBeenCalledWith({ id: alertId, adminId });

    stores.resolveAlert.mockResolvedValueOnce({ status: "not_found" });
    const missing = await app.inject({
      method: "POST",
      url: `/_admin/alerts/${randomUUID()}/resolve`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("ALERT_NOT_FOUND");
  });

  it("returns the whole settings registry, defaults included", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const response = await app.inject({
      method: "GET",
      url: "/_admin/settings",
      headers: { authorization: `Bearer ${await adminToken()}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item: { key: string }) => item.key)).toEqual([
      "alerts.cancellation_daily_threshold",
      "alerts.other_reason_notify"
    ]);
  });

  it("writes a setting, refuses an out-of-range value, and 404s a key it does not know", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const token = await adminToken();

    const updated = await app.inject({
      method: "PUT",
      url: "/_admin/settings/alerts.cancellation_daily_threshold",
      headers: { authorization: `Bearer ${token}` },
      payload: { value: 4 }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ value: 4, updatedByUsername: "ops_admin" });
    expect(stores.write).toHaveBeenCalledWith({
      key: "alerts.cancellation_daily_threshold",
      value: 4,
      adminId
    });

    const outOfRange = await app.inject({
      method: "PUT",
      url: "/_admin/settings/alerts.cancellation_daily_threshold",
      headers: { authorization: `Bearer ${token}` },
      payload: { value: 999 }
    });
    expect(outOfRange.statusCode).toBe(400);
    expect(outOfRange.json().code).toBe("SETTING_OUT_OF_RANGE");

    const unknown = await app.inject({
      method: "PUT",
      url: "/_admin/settings/alerts.not_a_setting",
      headers: { authorization: `Bearer ${token}` },
      payload: { value: true }
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().code).toBe("SETTING_NOT_FOUND");
  });

  it("serves the aggregate counters", async () => {
    const stores = makeStores();
    const app = await buildApp(stores);
    const response = await app.inject({
      method: "GET",
      url: "/_admin/stats",
      headers: { authorization: `Bearer ${await adminToken()}` }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ counts: { pending: 2, completed: 1 }, activeMissions: 1, onlineUsers: 3 });
  });
});
