import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import {
  activeOwnedSharesQuery,
  DrizzleLocationShareStore
} from "../db/location-share-store";
import { DrizzleLocationHistoryStore } from "../db/location-history-store";
import { parseServerEnv } from "../config/env";
import { SHARE_ENDED_EVENT, userRoom } from "../realtime/socket";
import { runLocationJobs } from "./jobs";

/**
 * Real-PostgreSQL execution tests for the non-PostGIS checks in `P2-A2` (`docs/TASKS.md`), plus
 * every journaled Drizzle migration in `drizzle/meta/_journal.json`.
 *
 * PGlite embeds standard PostgreSQL in WASM without the PostGIS C extension, so every journaled
 * migration (`0000`–`0012` and future entries) runs directly after stripping only the two
 * PostGIS-specific statements (`CREATE EXTENSION postgis` and the GiST index) and replacing unquoted
 * `geography(Point,4326)` column types with `text` (which also catches accidental identifier quoting
 * such as `"geography(Point,4326)"`). Real PostGIS spatial operations remain covered on the target VM
 * (`docs/UBUNTU_VM_RUNBOOK.md` § 6.8).
 */

const DAY_MS = 24 * 60 * 60 * 1_000;
const MINUTE_MS = 60_000;

let pg: PGlite;
let db: Database;
let shareStore: DrizzleLocationShareStore;
let historyStore: DrizzleLocationHistoryStore;

let aliceId: string;
let bobId: string;
let carolId: string;
let daveId: string;

beforeAll(async () => {
  pg = new PGlite();
  const journal = JSON.parse(
    readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")
  ) as { entries: { tag: string }[] };

  const skippedPostgisStatements: string[] = [];
  let geographyColumnCount = 0;

  for (const { tag } of journal.entries) {
    const raw = readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean);

    for (const statement of statements) {
      if (/\bpostgis\b|\bUSING\s+gist\s*\(/i.test(statement)) {
        skippedPostgisStatements.push(statement.replace(/\s+/g, " "));
        continue;
      }
      const adapted = statement.replace(/(?<!")geography\(Point,4326\)(?!")/g, () => {
        geographyColumnCount += 1;
        return "text";
      });
      await pg.exec(adapted);
    }
  }

  // Guard: pin the exact PostGIS-only statements across the migration journal.
  expect(skippedPostgisStatements).toEqual([
    "CREATE EXTENSION IF NOT EXISTS postgis;",
    'CREATE INDEX "idx_users_last_location_gist" ON "users" USING gist ("last_location");'
  ]);
  expect(geographyColumnCount).toBe(2);

  db = drizzle(pg, { schema }) as unknown as Database;
  shareStore = new DrizzleLocationShareStore(db);
  historyStore = new DrizzleLocationHistoryStore(db);
});

afterAll(async () => {
  await pg.close();
});

beforeEach(async () => {
  await pg.exec(`
    TRUNCATE TABLE
      "location_history_shares",
      "location_history",
      "location_shares",
      "user_sessions",
      "user_security_answers",
      "users"
    RESTART IDENTITY CASCADE;
  `);

  aliceId = randomUUID();
  bobId = randomUUID();
  carolId = randomUUID();
  daveId = randomUUID();

  for (const [id, username] of [
    [aliceId, "alice_pglite"],
    [bobId, "bob_pglite"],
    [carolId, "carol_pglite"],
    [daveId, "dave_pglite"]
  ] as const) {
    await pg.query(
      `INSERT INTO "users" ("id", "username", "password_hash", "role", "is_active", "is_suspended")
       VALUES ($1, $2, 'argon2id$test', 'user', true, false)`,
      [id, username]
    );
  }
});

describe("P2-A2 execution against real PostgreSQL (PGlite)", () => {
  it("prunes only rows older than LOCATION_HISTORY_RETENTION_DAYS across batches, preserves the boundary, and deletes nothing on re-run", async () => {
    const now = new Date("2026-10-23T09:00:00.000Z");
    const retentionDays = 90;
    const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);

    // 10 expired rows ordered oldest-first so batch limits can prove strictly-oldest deletion order.
    for (let index = 10; index >= 1; index -= 1) {
      const staleTime = new Date(cutoff.getTime() - index * MINUTE_MS);
      await pg.query(
        `INSERT INTO "location_history" ("user_id", "lat", "lon", "accuracy", "timestamp", "created_at")
         VALUES ($1, $2, $3, 8.5, $4, $4)`,
        [aliceId, 35.68 + index * 0.001, 51.38 + index * 0.001, staleTime.toISOString()]
      );
    }

    // Exact cutoff row (`created_at == cutoff`) + fresh row inside retention window: both must survive.
    const insideWindow = new Date(now.getTime() - 2 * DAY_MS);
    await pg.query(
      `INSERT INTO "location_history" ("user_id", "lat", "lon", "accuracy", "timestamp", "created_at")
       VALUES ($1, 35.7001, 51.4001, 5, $2, $2),
              ($1, 35.7002, 51.4002, 4, $3, $3)`,
      [aliceId, cutoff.toISOString(), insideWindow.toISOString()]
    );

    // First verify bounded batch behavior directly (`4 + 4 + 2 = 10`, then `0`).
    expect(await historyStore.pruneOlderThan({ olderThan: cutoff, limit: 4 })).toBe(4);
    expect(await historyStore.pruneOlderThan({ olderThan: cutoff, limit: 4 })).toBe(4);
    expect(await historyStore.pruneOlderThan({ olderThan: cutoff, limit: 4 })).toBe(2);
    expect(await historyStore.pruneOlderThan({ olderThan: cutoff, limit: 4 })).toBe(0);

    // Add 3 more overdue rows for another user and run the full `runLocationJobs` retention pass + re-run.
    for (let index = 1; index <= 3; index += 1) {
      const staleTime = new Date(cutoff.getTime() - index * DAY_MS);
      await pg.query(
        `INSERT INTO "location_history" ("user_id", "lat", "lon", "timestamp", "created_at")
         VALUES ($1, 35.71, 51.41, $2, $2)`,
        [bobId, staleTime.toISOString()]
      );
    }

    const firstPass = await runLocationJobs({
      shareStore,
      historyStore,
      retentionDays,
      now: () => now
    });
    expect(firstPass).toEqual({
      expiredShares: 0,
      repairedPins: 0,
      prunedHistoryRows: 3,
      prunedBatches: 1,
      failures: []
    });

    const secondPass = await runLocationJobs({
      shareStore,
      historyStore,
      retentionDays,
      now: () => now
    });
    expect(secondPass.prunedHistoryRows).toBe(0);
    expect(secondPass.failures).toEqual([]);

    const survivors = await pg.query<{ lat: number; created_at: Date }>(
      `SELECT "lat", "created_at" FROM "location_history" ORDER BY "id" ASC`
    );
    expect(survivors.rows.map((row) => row.lat)).toEqual([35.7001, 35.7002]);
  });

  it("marks overdue timed shares is_revoked = true, leaves active timed and permanent shares untouched, and never re-emits on repeat sweeps", async () => {
    const baseNow = new Date(Date.now());
    const overdueExpiry = new Date(baseNow.getTime() + 10 * MINUTE_MS);
    const futureExpiry = new Date(baseNow.getTime() + 120 * MINUTE_MS);

    const [timedSoon, timedLater, permanent] = await Promise.all([
      shareStore.createShares({
        ownerId: aliceId,
        targetUserIds: [bobId],
        mode: "timed",
        expiresAt: overdueExpiry,
        note: "30m walk",
        priorityDeviceId: null
      }),
      shareStore.createShares({
        ownerId: aliceId,
        targetUserIds: [carolId],
        mode: "timed",
        expiresAt: futureExpiry,
        note: "shift",
        priorityDeviceId: null
      }),
      shareStore.createShares({
        ownerId: aliceId,
        targetUserIds: [daveId],
        mode: "permanent",
        expiresAt: null,
        note: "family",
        priorityDeviceId: null
      })
    ]);

    const sweepTime = new Date(baseNow.getTime() + 11 * MINUTE_MS);
    const emitted: { room: string; event: string; payload: unknown }[] = [];
    const io = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        }
      })
    };

    const sweep = await runLocationJobs(
      { shareStore, historyStore, retentionDays: 90, io, now: () => sweepTime },
      { expiry: true, prune: false }
    );
    expect(sweep).toEqual({
      expiredShares: 1,
      repairedPins: 0,
      prunedHistoryRows: 0,
      prunedBatches: 0,
      failures: []
    });
    expect(emitted).toEqual([
      {
        room: userRoom(bobId),
        event: SHARE_ENDED_EVENT,
        payload: {
          shareId: timedSoon.shares[0]!.id,
          userId: aliceId,
          reason: "expired"
        }
      }
    ]);

    // Repeat sweep one minute later must touch 0 rows and emit 0 duplicate notifications.
    const repeatSweep = await runLocationJobs(
      {
        shareStore,
        historyStore,
        retentionDays: 90,
        io,
        now: () => new Date(sweepTime.getTime() + MINUTE_MS)
      },
      { expiry: true, prune: false }
    );
    expect(repeatSweep.expiredShares).toBe(0);
    expect(emitted).toHaveLength(1);

    const rows = await pg.query<{ id: string; mode: string; is_revoked: boolean }>(
      `SELECT "id", "mode", "is_revoked" FROM "location_shares"`
    );
    const byId = new Map(rows.rows.map((row) => [row.id, row]));
    expect(byId.get(timedSoon.shares[0]!.id)).toMatchObject({ mode: "timed", is_revoked: true });
    expect(byId.get(timedLater.shares[0]!.id)).toMatchObject({ mode: "timed", is_revoked: false });
    expect(byId.get(permanent.shares[0]!.id)).toMatchObject({ mode: "permanent", is_revoked: false });
  });

  it("inserts a fresh share row after expiry rather than reviving or overwriting the expired audit row", async () => {
    const first = await shareStore.createShares({
      ownerId: aliceId,
      targetUserIds: [bobId],
      mode: "timed",
      expiresAt: new Date(Date.now() + 5 * MINUTE_MS),
      note: "first window",
      priorityDeviceId: null
    });
    const firstId = first.shares[0]!.id;

    // Retire the share through the real expiry job.
    const futureClock = new Date(Date.now() + 6 * MINUTE_MS);
    const expired = await shareStore.expireOverdueShares({ now: futureClock });
    expect(expired).toEqual([{ id: firstId, ownerId: aliceId, targetUserId: bobId }]);

    // Re-sharing with the same target creates a distinct active row while preserving the retired row.
    const second = await shareStore.createShares({
      ownerId: aliceId,
      targetUserIds: [bobId],
      mode: "timed",
      expiresAt: new Date(Date.now() + 60 * MINUTE_MS),
      note: "second window",
      priorityDeviceId: null
    });
    const secondId = second.shares[0]!.id;

    expect(second.createdShareIds).toEqual([secondId]);
    expect(second.reusedShareIds).toEqual([]);
    expect(secondId).not.toBe(firstId);

    const allRows = await pg.query<{ id: string; is_revoked: boolean; note: string | null }>(
      `SELECT "id", "is_revoked", "note"
       FROM "location_shares"
       WHERE "owner_id" = $1 AND "target_user_id" = $2
       ORDER BY "created_at" ASC`,
      [aliceId, bobId]
    );
    expect(allRows.rows).toEqual([
      { id: firstId, is_revoked: true, note: "first window" },
      { id: secondId, is_revoked: false, note: "second window" }
    ]);

    const activeOwned = await activeOwnedSharesQuery(db, { userId: aliceId, limit: 20 });
    expect(activeOwned.map((row) => row.id)).toEqual([secondId]);
  });

  it("re-points stale priority_device_id pins on PostgreSQL only when exactly one live device remains", async () => {
    const deadDevice = randomUUID();
    const laptopDevice = randomUUID();
    const tabletDevice = randomUUID();

    // Two live sessions (`laptopDevice`, `tabletDevice`) plus one logged-out session (`deadDevice`, null hash).
    await pg.query(
      `INSERT INTO "user_sessions" ("user_id", "device_id", "refresh_token_hash")
       VALUES ($1, $2, NULL),
              ($1, $3, 'live-hash-laptop'),
              ($1, $4, 'live-hash-tablet')`,
      [aliceId, deadDevice, laptopDevice, tabletDevice]
    );

    const created = await shareStore.createShares({
      ownerId: aliceId,
      targetUserIds: [bobId],
      mode: "permanent",
      expiresAt: null,
      note: null,
      priorityDeviceId: deadDevice
    });
    const shareId = created.shares[0]!.id;

    // Two live distinct devices remain -> server must NOT guess between `laptopDevice` and `tabletDevice`.
    expect(await shareStore.repairStaleSharePins({ now: new Date() })).toBe(0);

    // Log out `tabletDevice` so `laptopDevice` is the single remaining live device -> auto-repoints cleanly.
    await pg.query(
      `UPDATE "user_sessions" SET "refresh_token_hash" = NULL WHERE "device_id" = $1`,
      [tabletDevice]
    );
    expect(await shareStore.repairStaleSharePins({ now: new Date() })).toBe(1);
    expect(await shareStore.repairStaleSharePins({ now: new Date() })).toBe(0);

    const row = await pg.query<{ priority_device_id: string | null }>(
      `SELECT "priority_device_id" FROM "location_shares" WHERE "id" = $1`,
      [shareId]
    );
    expect(row.rows[0]?.priority_device_id).toBe(laptopDevice);
  });

  it("reads a receiver's history only while a matching grant is held, and refuses it after revocation", async () => {
    const fromTime = new Date("2026-10-20T00:00:00.000Z");
    const toTime = new Date("2026-10-21T00:00:00.000Z");
    await pg.query(`INSERT INTO "location_history" ("user_id", "lat", "lon", "timestamp")
      VALUES ($1, 35.7, 51.4, $2), ($1, 35.8, 51.5, $3)`,
      [aliceId, fromTime.toISOString(), new Date(fromTime.getTime() + MINUTE_MS).toISOString()]);
    const grant = await historyStore.createHistoryShares({
      ownerId: aliceId, targetUserIds: [bobId], fromTime, toTime, maxPoints: 1
    });
    const shareId = grant.shares[0]!.id;
    expect(await historyStore.readSharedHistoryWindow({
      shareId, targetUserId: carolId, defaultReadPoints: 100
    })).toBeNull();
    const window = await historyStore.readSharedHistoryWindow({
      shareId, targetUserId: bobId, defaultReadPoints: 100
    });
    expect(window?.totalPoints).toBe(2);
    expect(window?.points).toHaveLength(1);
    expect(window?.points[0]?.lat).toBe(35.7);
    expect(await historyStore.deleteHistoryShare({ shareId, ownerId: aliceId })).toBe(true);
    expect(await historyStore.readSharedHistoryWindow({
      shareId, targetUserId: bobId, defaultReadPoints: 100
    })).toBeNull();
  });

  it("executes historyWindowQuery window functions, stride sampling, and revokeShare ownership checks on PostgreSQL", async () => {
    const start = new Date("2026-10-20T00:00:00.000Z");
    const end = new Date("2026-10-20T01:00:00.000Z");

    // 25 points inside `[start, end)` plus one point on `end` (excluded by half-open `< toTime`).
    for (let index = 0; index <= 25; index += 1) {
      const pointTime = new Date(start.getTime() + index * (end.getTime() - start.getTime()) / 25);
      await pg.query(
        `INSERT INTO "location_history" ("user_id", "lat", "lon", "accuracy", "timestamp")
         VALUES ($1, $2, 51.4, 6, $3)`,
        [aliceId, 35.0 + index * 0.01, pointTime.toISOString()]
      );
    }

    const sampled = await historyStore.readHistoryWindow({
      userId: aliceId,
      fromTime: start,
      toTime: end,
      maxPoints: 6
    });
    expect(sampled.totalPoints).toBe(25);
    expect(sampled.points.length).toBeLessThanOrEqual(6);
    expect(sampled.points[0]?.lat).toBeCloseTo(35.0, 6);
    // Stride = ceil(25 / 6) = 5 -> indices 0, 5, 10, 15, 20.
    expect(sampled.points.map((point) => Number(point.lat.toFixed(2)))).toEqual([
      35.0,
      35.05,
      35.1,
      35.15,
      35.2
    ]);

    const share = await shareStore.createShares({
      ownerId: aliceId,
      targetUserIds: [bobId],
      mode: "permanent",
      expiresAt: null,
      note: null,
      priorityDeviceId: null
    });
    const shareId = share.shares[0]!.id;

    // Foreign caller cannot revoke or detect existence; owner revokes once and gets idempotent status after.
    expect(await shareStore.revokeShare({ ownerId: carolId, shareId })).toEqual({ status: "not-found" });
    expect(await shareStore.revokeShare({ ownerId: aliceId, shareId })).toEqual({
      status: "revoked",
      share: { id: shareId, ownerId: aliceId, targetUserId: bobId }
    });
    expect(await shareStore.revokeShare({ ownerId: aliceId, shareId })).toEqual({
      status: "already-revoked"
    });
  });

  it("enforces schema CHECK constraints and refuses startup when LOCATION_HISTORY_MAX_SHARE_DAYS > LOCATION_HISTORY_RETENTION_DAYS", async () => {
    await expect(
      pg.query(
        `INSERT INTO "location_shares" ("owner_id", "target_user_id", "mode", "expires_at")
         VALUES ($1, $2, 'permanent', now() + interval '1 hour')`,
        [aliceId, bobId]
      )
    ).rejects.toThrow(/location_shares_expiry_mode_check/);

    await expect(
      pg.query(
        `INSERT INTO "location_shares" ("owner_id", "target_user_id", "mode", "expires_at")
         VALUES ($1, $1, 'permanent', NULL)`,
        [aliceId]
      )
    ).rejects.toThrow(/location_shares_owner_target_check/);

    await expect(
      pg.query(
        `INSERT INTO "location_history_shares" ("owner_id", "target_user_id", "from_time", "to_time", "max_points")
         VALUES ($1, $2, '2026-10-20T02:00:00Z', '2026-10-20T01:00:00Z', 100)`,
        [aliceId, bobId]
      )
    ).rejects.toThrow(/location_history_shares_window_check/);

    await expect(
      pg.query(
        `INSERT INTO "location_history_shares" ("owner_id", "target_user_id", "from_time", "to_time", "max_points")
         VALUES ($1, $2, '2026-10-20T01:00:00Z', '2026-10-20T02:00:00Z', 0)`,
        [aliceId, bobId]
      )
    ).rejects.toThrow(/location_history_shares_max_points_check/);

    const baseEnv = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
      JWT_SECRET: "a".repeat(48),
      JWT_REFRESH_SECRET: "b".repeat(48),
      CORS_ORIGINS: "http://localhost:5173"
    };

    expect(() =>
      parseServerEnv({
        ...baseEnv,
        LOCATION_HISTORY_RETENTION_DAYS: "30",
        LOCATION_HISTORY_MAX_SHARE_DAYS: "31"
      })
    ).toThrow(/LOCATION_HISTORY_MAX_SHARE_DAYS/);

    expect(
      parseServerEnv({
        ...baseEnv,
        LOCATION_HISTORY_RETENTION_DAYS: "30",
        LOCATION_HISTORY_MAX_SHARE_DAYS: "30"
      }).locationHistoryMaxShareDays
    ).toBe(30);

    // Outgoing realtime fan-out omits deactivated or suspended recipients even if a share row exists.
    await shareStore.createShares({
      ownerId: aliceId,
      targetUserIds: [bobId, carolId, daveId],
      mode: "permanent",
      expiresAt: null,
      note: null,
      priorityDeviceId: null
    });
    await pg.query(`UPDATE "users" SET "is_active" = false WHERE "id" = $1`, [carolId]);
    await pg.query(`UPDATE "users" SET "is_suspended" = true WHERE "id" = $1`, [daveId]);

    const outgoing = await shareStore.listActiveOutgoingShares(aliceId);
    expect(outgoing.map((row) => row.targetUserId)).toEqual([bobId]);
  });
});
