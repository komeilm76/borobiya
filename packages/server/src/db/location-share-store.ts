import { and, desc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { LocationShareMode } from "@borobiya/shared";
import type { Database } from "./client";
import { locationShares, userSessions, users } from "./schema";
import { ownerAdvisoryLockSql } from "./owner-lock";

export interface LocationShareRecord {
  id: string;
  ownerId: string;
  targetUserId: string;
  mode: LocationShareMode;
  expiresAt: Date | null;
  isRevoked: boolean;
  priorityDeviceId: string | null;
  note: string | null;
  createdAt: Date;
}

export interface ShareTargetAssessment {
  /** Active, non-suspended accounts that are not the owner. */
  eligible: string[];
  /** The owner tried to share with their own account. */
  self: string[];
  /** Ids with no matching user row. */
  missing: string[];
  /** Existing accounts that cannot receive a share because they are inactive or suspended. */
  unavailable: string[];
}

export interface CreateLocationSharesInput {
  ownerId: string;
  targetUserIds: string[];
  mode: LocationShareMode;
  expiresAt: Date | null;
  note: string | null;
  /**
   * The device allowed to feed these shares (spec §7.3). Resolved by the route — never trusted from
   * the client verbatim — and applied to reused shares too, so re-choosing a device can take effect
   * without revoking and re-creating every share.
   */
  priorityDeviceId: string | null;
}

export interface CreatedLocationShares {
  shares: LocationShareRecord[];
  createdShareIds: string[];
  reusedShareIds: string[];
}

export type LocationShareRevocation = "revoked" | "already-revoked" | "not-found";

/** A received share plus the owner's identity and last known position. */
export interface ReceivedLocationShareRecord extends LocationShareRecord {
  owner: {
    id: string;
    username: string;
    lastLocation: { lat: number; lon: number } | null;
  };
}

/** The minimum a realtime fan-out needs to know about one active outgoing share. */
export interface ActiveOutgoingShare {
  targetUserId: string;
  priorityDeviceId: string | null;
}

export interface LocationShareStore {
  /** Classifies the requested recipients against the current user table. */
  assessShareTargets(input: {
    ownerId: string;
    targetUserIds: readonly string[];
  }): Promise<ShareTargetAssessment>;
  /**
   * Creates one active share per target, reusing (and extending, for timed shares) an existing active
   * share for the same owner/target so a repeated request is idempotent — and re-pointing it when the
   * request changes the arrangement, because "one hour" must not leave a permanent row underneath.
   */
  createShares(input: CreateLocationSharesInput): Promise<CreatedLocationShares>;
  /**
   * Marks every timed share whose window has closed as inactive and returns how many rows
   * changed. Rows are kept for audit, and revocation is the same inactive flag, so readers
   * that forgot an expiry filter still cannot see expired shares after this job has run.
   */
  expireOverdueShares(input: { now: Date }): Promise<number>;
  /**
   * Re-points the active shares of accounts that now have exactly one live device, when the device
   * they pin has no live session left. Returns how many rows were re-pointed. Without this, logging
   * out of the only broadcasting device would leave every share pinned to a dead device, and
   * `location:update` (T2.3.4) would reject every fix — the marker would freeze silently.
   */
  repairStaleSharePins(input: { now: Date }): Promise<number>;
  /**
   * Revokes one owned share immediately. Revoking a share that is already revoked is a no-op,
   * and a share owned by someone else is indistinguishable from a missing one (`not-found`).
   */
  revokeShare(input: { ownerId: string; shareId: string }): Promise<LocationShareRevocation>;
  /**
   * Active shares only (not revoked and not past `expiresAt`), newest first and capped per
   * list. Receivers additionally see the owner's username and last server-known position.
   */
  /** Active outgoing shares for realtime routing: unrevoked and unexpired, newest first. */
  listActiveOutgoingShares(userId: string): Promise<ActiveOutgoingShare[]>;
  listActiveShares(input: {
    userId: string;
    limit: number;
  }): Promise<{ owned: LocationShareRecord[]; sharedWithMe: ReceivedLocationShareRecord[] }>;
}

/**
 * A (owner, target) pair holds at most one active row per mode under the reuse rule below, so this
 * cap is headroom for rows written before the rule existed: a pair that somehow holds more converges
 * on the next request instead of being refused or silently left doubled.
 */
const MAX_ACTIVE_SHARE_ROWS_PER_PAIR = 4;

/** The stored state a reuse decision reads. */
export interface ShareReuseCandidate {
  mode: LocationShareMode;
  expiresAt: Date | null;
  priorityDeviceId: string | null;
}

/** What the caller asked for, in the same shape the row is stored in. */
export interface ShareReuseRequest {
  mode: LocationShareMode;
  expiresAt: Date | null;
  note: string | null;
  priorityDeviceId: string | null;
}

/** The columns to write over an existing row; empty means the existing row already says this. */
export interface ShareReusePatch {
  mode?: LocationShareMode;
  expiresAt?: Date | null;
  note?: string;
  priorityDeviceId?: string;
}

/**
 * Decides what a repeated share request does to the active row it found for that recipient.
 *
 * - **A different mode replaces the arrangement.** This is the case that used to be a bug: the reuse
 *   lookup filtered on `mode`, so asking for one hour while a permanent share was open inserted a
 *   *second* row, the picker reported one share created, and the recipient kept seeing the owner
 *   forever. Narrowing has to actually narrow.
 * - **The same mode extends only forward** for timed shares (a shorter window from a repeat request
 *   must not silently un-share someone mid-operation; the way to shorten is a revoke, or the mode
 *   switch above), and never shortens a permanent row's expiry because it has none.
 * - **`note` travels with a change to the window**, as before: a no-op repeat must not blank it.
 * - **The device pin is orthogonal** to the window, so it is applied in every branch — that is what
 *   lets re-choosing a device take effect without revoking and re-creating every share.
 *
 * Pure, because the interesting part is the decision and the row-writing around it is mechanics.
 */
export function planShareReuse(
  existing: ShareReuseCandidate,
  request: ShareReuseRequest
): ShareReusePatch {
  const patch: ShareReusePatch = {};

  if (existing.mode !== request.mode && request.mode === "timed" && request.expiresAt === null) {
    // `location_shares_expiry_mode_check` refuses a timed row without an expiry, so this would die in
    // the middle of the transaction with a constraint error. The route cannot produce it (the schema
    // pairs `timed` with a positive duration); failing here says which assumption broke.
    throw new Error("A timed share needs an expiry before it can replace another mode.");
  }

  if (existing.mode !== request.mode) {
    patch.mode = request.mode;
    patch.expiresAt = request.expiresAt;
    if (request.note !== null) patch.note = request.note;
  } else if (
    request.mode === "timed" &&
    request.expiresAt !== null &&
    (existing.expiresAt === null || request.expiresAt.getTime() > existing.expiresAt.getTime())
  ) {
    patch.expiresAt = request.expiresAt;
    if (request.note !== null) patch.note = request.note;
  }

  if (
    request.priorityDeviceId !== null &&
    request.priorityDeviceId !== existing.priorityDeviceId
  ) {
    patch.priorityDeviceId = request.priorityDeviceId;
  }

  return patch;
}

const locationShareSelection = {
  id: locationShares.id,
  ownerId: locationShares.ownerId,
  targetUserId: locationShares.targetUserId,
  mode: locationShares.mode,
  expiresAt: locationShares.expiresAt,
  isRevoked: locationShares.isRevoked,
  priorityDeviceId: locationShares.priorityDeviceId,
  note: locationShares.note,
  createdAt: locationShares.createdAt
};

/**
 * Moves the active shares of single-device accounts onto their only live device, but only while the
 * pinned device has no live session left. Accounts with two or more live devices are deliberately
 * untouched: there the choice belongs to the user, and the next `POST /_user/location/share` asks for
 * it again (`409 PRIORITY_DEVICE_REQUIRED`). The two `is_revoked = false and priority_device_id is not
 * null` conditions exist so this statement can seek `location_shares_active_pinned_idx` (0008) instead
 * of sequential-scanning a table whose retired rows are kept forever. Exported for SQL-shape tests.
 */
export function repairStaleSharePinsQuery(db: Database, now: Date) {
  // One correlated fragment, reused three times: the account's live sessions.
  const liveSessionsOfOwner = sql`from ${userSessions} where ${userSessions.userId} = ${locationShares.ownerId} and ${userSessions.refreshTokenHash} is not null`;

  return db
    .update(locationShares)
    .set({ priorityDeviceId: sql`(select min(${userSessions.deviceId}) ${liveSessionsOfOwner})` })
    .where(and(
      eq(locationShares.isRevoked, false),
      sql`(${locationShares.expiresAt} IS NULL OR ${locationShares.expiresAt} > ${now})`,
      isNotNull(locationShares.priorityDeviceId),
      // Exactly one live *device* (distinct, so several sessions of one client-supplied device id
      // still count once), which makes re-pointing a certainty rather than a guess between
      // alternatives.
      sql`(select count(distinct ${userSessions.deviceId}) ${liveSessionsOfOwner}) = 1`,
      sql`not exists (select 1 ${liveSessionsOfOwner} and ${userSessions.deviceId} = ${locationShares.priorityDeviceId})`
    ));
}

/**
 * One statement that retires every timed share whose window has closed. Permanent shares keep a
 * null expiry and are therefore untouched. Exported so the SQL shape is testable on its own.
 */
export function expireOverdueSharesQuery(db: Database, now: Date) {
  return db
    .update(locationShares)
    .set({ isRevoked: true })
    .where(and(
      eq(locationShares.isRevoked, false),
      and(isNotNull(locationShares.expiresAt), lte(locationShares.expiresAt, now))
    ));
}

/** Persists live-location shares and classifies candidate recipients. */
export class DrizzleLocationShareStore implements LocationShareStore {
  constructor(private readonly db: Database) {}

  async assessShareTargets(input: {
    ownerId: string;
    targetUserIds: readonly string[];
  }): Promise<ShareTargetAssessment> {
    const targets = [...new Set(input.targetUserIds)];
    const assessment: ShareTargetAssessment = { eligible: [], self: [], missing: [], unavailable: [] };
    const lookup = targets.filter((targetUserId) => {
      if (targetUserId === input.ownerId) {
        assessment.self.push(targetUserId);
        return false;
      }
      return true;
    });
    if (lookup.length === 0) return assessment;

    const rows = await this.db
      .select({ id: users.id, isActive: users.isActive, isSuspended: users.isSuspended })
      .from(users)
      .where(inArray(users.id, lookup));
    const byId = new Map(rows.map((row) => [row.id, row]));

    for (const targetUserId of lookup) {
      const row = byId.get(targetUserId);
      if (!row) assessment.missing.push(targetUserId);
      else if (!row.isActive || row.isSuspended) assessment.unavailable.push(targetUserId);
      else assessment.eligible.push(targetUserId);
    }
    return assessment;
  }

  async createShares(input: CreateLocationSharesInput): Promise<CreatedLocationShares> {
    return this.db.transaction(async (transaction) => {
      // See `ownerAdvisoryLockSql`: the reuse-or-insert decision below is a read-then-write with no
      // unique constraint to fall back on, so concurrent requests of one account must not each create
      // an active row for the same recipient.
      await transaction.execute(ownerAdvisoryLockSql(input.ownerId));

      const shares: LocationShareRecord[] = [];
      const createdShareIds: string[] = [];
      const reusedShareIds: string[] = [];

      for (const targetUserId of input.targetUserIds) {
        // Deliberately not filtered by `mode`: one recipient has one active arrangement, and the
        // request redefines it. `order by expires_at desc` puts a permanent row (`NULL`) first, which
        // is the wider of the two, so reusing it and overwriting its window can only narrow.
        const active = await transaction
          .select(locationShareSelection)
          .from(locationShares)
          .where(and(
            eq(locationShares.ownerId, input.ownerId),
            eq(locationShares.targetUserId, targetUserId),
            eq(locationShares.isRevoked, false),
            sql`(${locationShares.expiresAt} IS NULL OR ${locationShares.expiresAt} > now())`
          ))
          .orderBy(desc(locationShares.expiresAt))
          .limit(MAX_ACTIVE_SHARE_ROWS_PER_PAIR);

        const keeper = active.find((row) => row.mode === input.mode) ?? active[0];
        const siblings = keeper ? active.filter((row) => row.id !== keeper.id) : [];
        if (siblings.length > 0) {
          // Retire the other active rows for this pair rather than leave a second arrangement live
          // behind the one the caller just described. This also cleans up the duplicates the
          // previous mode-filtered lookup created.
          await transaction
            .update(locationShares)
            .set({ isRevoked: true })
            .where(inArray(locationShares.id, siblings.map((row) => row.id)));
        }

        if (keeper) {
          const patch = planShareReuse(keeper, {
            mode: input.mode,
            expiresAt: input.expiresAt,
            note: input.note,
            priorityDeviceId: input.priorityDeviceId
          });
          const [updated] = Object.keys(patch).length > 0
            ? await transaction
                .update(locationShares)
                .set(patch)
                .where(eq(locationShares.id, keeper.id))
                .returning(locationShareSelection)
            : [keeper];

          if (!updated) {
            // Same stance as the insert below: a write that answers with no row means the row is gone
            // (the only writer that can take it is the account's `on delete cascade`), and reporting the
            // stale `keeper` as reused would tell the caller their extension landed when nothing exists.
            throw new Error("Location share update returned no row.");
          }
          shares.push(updated);
          reusedShareIds.push(updated.id);
          continue;
        }

        const [created] = await transaction
          .insert(locationShares)
          .values({
            ownerId: input.ownerId,
            targetUserId,
            mode: input.mode,
            expiresAt: input.expiresAt,
            note: input.note,
            priorityDeviceId: input.priorityDeviceId
          })
          .returning(locationShareSelection);
        if (!created) {
          throw new Error("Location share insert returned no row.");
        }
        shares.push(created);
        createdShareIds.push(created.id);
      }

      return { shares, createdShareIds, reusedShareIds };
    });
  }

  async listActiveOutgoingShares(userId: string): Promise<ActiveOutgoingShare[]> {
    const rows = await this.db
      .select({
        targetUserId: locationShares.targetUserId,
        priorityDeviceId: locationShares.priorityDeviceId
      })
      .from(locationShares)
      .where(and(
        eq(locationShares.ownerId, userId),
        eq(locationShares.isRevoked, false),
        sql`(${locationShares.expiresAt} IS NULL OR ${locationShares.expiresAt} > now())`
      ))
      .orderBy(desc(locationShares.createdAt));
    return rows.map((row) => ({
      targetUserId: row.targetUserId,
      priorityDeviceId: row.priorityDeviceId ?? null
    }));
  }

  async listActiveShares(input: {
    userId: string;
    limit: number;
  }): Promise<{ owned: LocationShareRecord[]; sharedWithMe: ReceivedLocationShareRecord[] }> {
    const activeConditions = [
      eq(locationShares.isRevoked, false),
      sql`(${locationShares.expiresAt} IS NULL OR ${locationShares.expiresAt} > now())`
    ];

    const owned = await this.db
      .select(locationShareSelection)
      .from(locationShares)
      .where(and(eq(locationShares.ownerId, input.userId), ...activeConditions))
      .orderBy(desc(locationShares.createdAt))
      .limit(input.limit);

    const receivedRows = await this.db
      .select({
        ...locationShareSelection,
        ownerUsername: users.username,
        // PostGIS stores X as longitude and Y as latitude.
        ownerLat: sql<string | null>`ST_Y(${users.lastLocation}::geometry)`,
        ownerLon: sql<string | null>`ST_X(${users.lastLocation}::geometry)`
      })
      .from(locationShares)
      .innerJoin(users, eq(users.id, locationShares.ownerId))
      .where(and(eq(locationShares.targetUserId, input.userId), ...activeConditions))
      .orderBy(desc(locationShares.createdAt))
      .limit(input.limit);

    return {
      owned,
      sharedWithMe: receivedRows.map((row) => {
        const lat = row.ownerLat === null ? Number.NaN : Number(row.ownerLat);
        const lon = row.ownerLon === null ? Number.NaN : Number(row.ownerLon);
        return {
          id: row.id,
          ownerId: row.ownerId,
          targetUserId: row.targetUserId,
          mode: row.mode,
          expiresAt: row.expiresAt,
          isRevoked: row.isRevoked,
          priorityDeviceId: row.priorityDeviceId,
          note: row.note,
          createdAt: row.createdAt,
          owner: {
            id: row.ownerId,
            username: row.ownerUsername,
            lastLocation: Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
          }
        };
      })
    };
  }

  async expireOverdueShares(input: { now: Date }): Promise<number> {
    const expired = await expireOverdueSharesQuery(this.db, input.now).returning({ id: locationShares.id });
    return expired.length;
  }

  async repairStaleSharePins(input: { now: Date }): Promise<number> {
    const repaired = await repairStaleSharePinsQuery(this.db, input.now).returning({ id: locationShares.id });
    return repaired.length;
  }

  async revokeShare(input: { ownerId: string; shareId: string }): Promise<LocationShareRevocation> {
    const [revoked] = await this.db
      .update(locationShares)
      .set({ isRevoked: true })
      .where(and(
        eq(locationShares.id, input.shareId),
        eq(locationShares.ownerId, input.ownerId),
        eq(locationShares.isRevoked, false)
      ))
      .returning({ id: locationShares.id });
    if (revoked) return "revoked";

    // Only a still-owned active or revoked row may report success; anything else is 404 so the
    // endpoint never reveals whether another account owns the requested id.
    const [existing] = await this.db
      .select({ id: locationShares.id })
      .from(locationShares)
      .where(and(eq(locationShares.id, input.shareId), eq(locationShares.ownerId, input.ownerId)))
      .limit(1);
    return existing ? "already-revoked" : "not-found";
  }
}
