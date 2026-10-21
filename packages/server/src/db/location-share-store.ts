import { and, desc, eq, gt, inArray, isNull } from "drizzle-orm";
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
}
