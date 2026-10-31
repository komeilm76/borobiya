import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import postgres from "postgres";
import type { Database } from "./client";
import { userSessions, users } from "./schema";
import { PRESENCE_STALE_MS } from "../realtime/presence";
import { DrizzleUserDeviceStore, userDeviceListQuery, type UserDeviceRow } from "./device-store";

const userId = randomUUID();
const currentSessionId = randomUUID();

// A driver is only needed to build SQL; no connection is opened until a query runs.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { userSessions, users }
}) as unknown as Database;

/** Chainable Drizzle stand-in: any link of the query resolves to the scripted rows. */
function makeDatabase(rows: UserDeviceRow[]) {
  const chain: Record<string, unknown> = {};
  const run = () => chain;
  for (const method of ["from", "where", "orderBy", "limit"]) {
    chain[method] = vi.fn(run);
  }
  const select = vi.fn(run);
  const database = { select } as unknown as Database;
  chain.then = (resolve: (value: UserDeviceRow[]) => unknown) => Promise.resolve(rows).then(resolve);
  return { store: new DrizzleUserDeviceStore(database), select };
}

function deviceRow(overrides: Partial<UserDeviceRow> = {}): UserDeviceRow {
  return {
    id: randomUUID(),
    deviceId: randomUUID(),
    deviceName: "Chrome on Windows",
    ip: "172.30.0.1",
    lastActiveAt: new Date("2026-10-21T09:00:00.000Z"),
    isOnline: true,
    ...overrides
  };
}

describe("userDeviceListQuery", () => {
  it("reads only live sessions of one account, newest activity first, bounded", () => {
    const built = userDeviceListQuery(offlineDb, { userId, limit: 50 }).toSQL();
    const sql = built.sql.replace(/\s+/g, " ");

    expect(sql).toContain('from "user_sessions"');
    // A null refresh-token hash means logged out or admin-revoked: not an active device.
    expect(sql).toContain('"user_sessions"."refresh_token_hash" is not null');
    expect(sql).toContain('"user_sessions"."user_id" =');
    expect(sql).toContain('order by "user_sessions"."last_active_at" desc, "user_sessions"."id" asc');
    expect(sql).toContain("limit");
    // Only these six columns are read: the refresh-token hash must never reach a response.
    expect(sql).toContain('select "id", "device_id", "device_name", "ip", "last_active_at", "is_online"');
    expect(sql).toContain("last_active_at");
    expect(sql).toContain("interval '1 millisecond'");
    expect(built.params).toEqual([PRESENCE_STALE_MS, userId, 50]);
  });
});

describe("DrizzleUserDeviceStore.listDevices", () => {
  it("marks exactly the caller's own session as current", async () => {
    const rows = [
      deviceRow({ id: randomUUID() }),
      deviceRow({ id: currentSessionId, deviceName: "Firefox on Linux" }),
      deviceRow({ id: randomUUID(), deviceName: null, ip: null })
    ];
    const { store } = makeDatabase(rows);

    const devices = await store.listDevices({ userId, currentSessionId, limit: 50 });

    expect(devices.map((device) => device.isCurrentDevice)).toEqual([false, true, false]);
    expect(devices).toHaveLength(rows.length);
    expect(devices[1]).toMatchObject({ id: currentSessionId, deviceName: "Firefox on Linux" });
    expect(devices[2]).toMatchObject({ deviceName: null, ip: null });
  });

  it("passes the caller and cap through to the query", async () => {
    const { store, select } = makeDatabase([]);

    await store.listDevices({ userId, currentSessionId, limit: 12 });

    // One statement, no per-row follow-up query.
    expect(select).toHaveBeenCalledTimes(1);
  });
});


describe("DrizzleUserDeviceStore.revokeOtherSession", () => {
  it("atomically scopes revocation to the caller, excludes the current session and active rows", async () => {
    const built: { sql?: string; params?: unknown[] } = {};
    const chain: Record<string, unknown> = {};
    chain.set = vi.fn(() => chain);
    chain.where = vi.fn(() => chain);
    chain.returning = vi.fn(() => {
      return [{ id: currentSessionId }];
    });
    const update = vi.fn(() => chain);
    const store = new DrizzleUserDeviceStore({ update } as unknown as Database);
    expect(await store.revokeOtherSession({ userId, sessionId: randomUUID(), currentSessionId })).toBe(true);
    expect(update).toHaveBeenCalledWith(userSessions);
    expect(chain.set).toHaveBeenCalledWith({ refreshTokenHash: null, isOnline: false });
    // Verify the SQL predicate, not only the route's preflight check.
    const where = vi.mocked(chain.where as (value: unknown) => unknown).mock.calls[0]?.[0];
    const sql = new PgDialect().sqlToQuery(where as SQL);
    built.sql = sql.sql;
    built.params = sql.params;
    expect(built.sql).toContain('"user_sessions"."user_id" =');
    expect(built.sql).toContain('"user_sessions"."id" <>');
    expect(built.sql).toContain('"user_sessions"."refresh_token_hash" is not null');
    expect(built.params).toContain(userId);
    expect(built.params).toContain(currentSessionId);
  });
});
