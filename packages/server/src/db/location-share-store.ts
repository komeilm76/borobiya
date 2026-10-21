import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { LocationShareMode } from "@borobiya/shared";
import type { Database } from "./client";
import { locationShares, users } from "./schema";

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
   * Creates one active share per target, reusing (and extending, for timed shares)
   * an existing active share for the same owner/target/mode so a repeated request is idempotent.
   */
  createShares(input: CreateLocationSharesInput): Promise<CreatedLocationShares>;
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
      const shares: LocationShareRecord[] = [];
      const createdShareIds: string[] = [];
      const reusedShareIds: string[] = [];

      for (const targetUserId of input.targetUserIds) {
        const [existing] = await transaction
          .select(locationShareSelection)
          .from(locationShares)
          .where(and(
            eq(locationShares.ownerId, input.ownerId),
            eq(locationShares.targetUserId, targetUserId),
            eq(locationShares.mode, input.mode),
            eq(locationShares.isRevoked, false),
            input.mode === "timed"
              ? gt(locationShares.expiresAt, new Date())
              : isNull(locationShares.expiresAt)
          ))
          .orderBy(desc(locationShares.expiresAt))
          .limit(1);

        if (existing) {
          // A longer timed request extends the current share instead of stacking duplicates.
          const extendTo = input.mode === "timed" &&
            input.expiresAt !== null &&
            (existing.expiresAt === null || input.expiresAt.getTime() > existing.expiresAt.getTime())
            ? input.expiresAt
            : undefined;
          const [updated] = extendTo
            ? await transaction
                .update(locationShares)
                .set({ expiresAt: extendTo, ...(input.note !== null ? { note: input.note } : {}) })
                .where(eq(locationShares.id, existing.id))
                .returning(locationShareSelection)
            : [existing];

          const reused = updated ?? existing;
          shares.push(reused);
          reusedShareIds.push(reused.id);
          continue;
        }

        const [created] = await transaction
          .insert(locationShares)
          .values({
            ownerId: input.ownerId,
            targetUserId,
            mode: input.mode,
            expiresAt: input.expiresAt,
            note: input.note
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
