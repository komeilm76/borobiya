import { and, asc, count, desc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { Mission, MissionPresence, MissionNavigationTarget, MissionProgressStatus, MissionStatus, MissionTimeline, CancellationReasonDetail, MissionRatingInput } from "@borobiya/shared";
import { readCancellationReason } from "./cancellation-detail";
import type { Database } from "./client";
import { PRESENCE_STALE_MS } from "../realtime/presence";
import { missions, missionRatings, missionStatusHistory, sosRequests, userSessions, users } from "./schema";

const NEXT_STATUS: Partial<Record<MissionStatus, MissionProgressStatus>> = {
  pending: "on_the_way",
  on_the_way: "arrived",
  arrived: "in_progress",
  in_progress: "completed"
};
const ACTIVE_STATUSES: MissionStatus[] = ["pending", "on_the_way", "arrived", "in_progress"];

export type MissionProgressResult =
  | { status: "not_found" }
  | { status: "invalid_transition"; currentStatus: MissionStatus }
  | { status: "updated" | "unchanged"; mission: Mission };

export type MissionRatingResult = "rated" | "not_found" | "not_completed" | "already_rated";

export interface MissionProgressStore {
  findMission(id: string, userId: string, role: "admin" | "user"): Promise<Mission | null>;
  findNavigationTarget(id: string, rescuerId: string): Promise<MissionNavigationTarget | null>;
  findActiveMissionPresence?(id: string, userId: string, role: "admin" | "user"): Promise<MissionPresence | null>;
  listMissions(userId: string, role: "requester" | "rescuer", page: number, limit: number, sosRequestId?: string): Promise<{
    items: Mission[]; total: number; page: number; limit: number; totalPages: number
  }>;
  listActiveRequestMissions?(sosRequestId: string, includeTerminal?: boolean): Promise<Mission[]>;
  findTimeline?(missionId: string, userId: string, role: "admin" | "user"): Promise<MissionTimeline | null>;
  getCancellationReason?(id: string | null, customText: string | null): Promise<CancellationReasonDetail | null>;
  advanceStatus(missionId: string, rescuerId: string, nextStatus: MissionProgressStatus): Promise<MissionProgressResult>;
  /** Atomic insert; only the requester may rate a completed mission once. */
  rateMission?(missionId: string, requesterId: string, input: MissionRatingInput): Promise<MissionRatingResult>;
  getRating?(missionId: string): Promise<number | null>;
  /** Only active-mission participants or a currently authenticated admin may subscribe to the private mission room. */
  canJoinMissionRoom?(missionId: string, userId: string, role: "admin" | "user"): Promise<boolean>;
  /** Active, participant-scoped sender role; admins observe but never publish GPS to a mission. */
  missionLocationRole?(missionId: string, userId: string, role?: "admin" | "user"): Promise<"requester" | "rescuer" | "admin" | null>;
}

/** A retry of the same step is a no-op, but skipping, reversing or reviving terminal states is never legal. */
export function missionTransition(current: MissionStatus, requested: MissionProgressStatus): "updated" | "unchanged" | "invalid_transition" {
  if (current === requested) return "unchanged";
  return NEXT_STATUS[current] === requested ? "updated" : "invalid_transition";
}

export class DrizzleMissionProgressStore implements MissionProgressStore {
  constructor(private readonly db: Database) {}

  getCancellationReason(id: string | null, customText: string | null) {
    return readCancellationReason(this.db, id, customText);
  }

  async findMission(id: string, userId: string, role: "admin" | "user"): Promise<Mission | null> {
    const [row] = await this.db.select().from(missions).where(and(eq(missions.id, id),
      role === "admin" ? undefined : or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId)))).limit(1);
    return row ? toMission(row) : null;
  }

  async getRating(missionId: string): Promise<number | null> {
    const [row] = await this.db.select({ rating: missionRatings.rating }).from(missionRatings)
      .where(eq(missionRatings.missionId, missionId)).limit(1);
    return row?.rating ?? null;
  }

  async rateMission(missionId: string, requesterId: string, input: MissionRatingInput): Promise<MissionRatingResult> {
    // This lookup is requester-scoped: foreign and unknown missions have the same result.
    const [mission] = await this.db.select({ status: missions.status, rescuerId: missions.rescuerId })
      .from(missions).where(and(eq(missions.id, missionId), eq(missions.requesterId, requesterId))).limit(1);
    if (!mission) return "not_found";
    if (mission.status !== "completed") return "not_completed";
    // The unique index is the concurrency arbiter. A read-then-insert duplicate check
    // would allow simultaneous retries to race into a 500; the trigger also verifies
    // the completed mission and participant identities in the writing transaction.
    const inserted = await this.db.insert(missionRatings).values({
      missionId, raterId: requesterId, rateeId: mission.rescuerId,
      rating: input.rating, comment: input.comment || null
    }).onConflictDoNothing({ target: [missionRatings.missionId, missionRatings.raterId] })
      .returning({ id: missionRatings.id });
    return inserted.length ? "rated" : "already_rated";
  }

  async findActiveMissionPresence(id: string, userId: string, role: "admin" | "user"): Promise<MissionPresence | null> {
    // Authorization is inside this query. Never read a foreign mission and filter it in JS.
    const [row] = await this.db.select({ requesterId: missions.requesterId, rescuerId: missions.rescuerId })
      .from(missions).where(and(eq(missions.id, id), inArray(missions.status, ACTIVE_STATUSES),
        role === "admin" ? undefined : or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId))))
      .limit(1);
    if (!row) return null;
    const sessions = await this.db.select({ userId: userSessions.userId,
      isOnline: userSessions.isOnline, lastActiveAt: userSessions.lastActiveAt })
      .from(userSessions).where(and(inArray(userSessions.userId, [row.requesterId, row.rescuerId]),
        isNotNull(userSessions.refreshTokenHash)));
    const now = Date.now();
    const describe = (id: string) => {
      const entries = sessions.filter((entry) => entry.userId === id);
      const last = entries.reduce<Date | null>((latest, entry) =>
        !latest || entry.lastActiveAt > latest ? entry.lastActiveAt : latest, null);
      return { online: entries.some((entry) => entry.isOnline &&
        now - entry.lastActiveAt.getTime() <= PRESENCE_STALE_MS && entry.lastActiveAt.getTime() <= now + 10_000),
        lastSeenAt: last?.toISOString() ?? null };
    };
    return { missionId: id, requester: describe(row.requesterId), rescuer: describe(row.rescuerId) };
  }

  async findNavigationTarget(id: string, rescuerId: string): Promise<MissionNavigationTarget | null> {
    // Scope in SQL, not by filtering a globally readable request after the fact.
    // A terminal/foreign/unknown mission returns the same null; neither grants navigation.
    const [row] = await this.db.select({
      missionId: missions.id,
      lat: sql<number>`ST_Y(${sosRequests.location}::geometry)::float8`,
      lon: sql<number>`ST_X(${sosRequests.location}::geometry)::float8`
    }).from(missions).innerJoin(sosRequests, eq(sosRequests.id, missions.sosRequestId))
      .where(and(eq(missions.id, id), eq(missions.rescuerId, rescuerId),
        inArray(missions.status, ACTIVE_STATUSES))).limit(1);
    return row ? { missionId: row.missionId, incident: { lat: row.lat, lon: row.lon } } : null;
  }

  async listMissions(userId: string, role: "requester" | "rescuer", page: number, limit: number, sosRequestId?: string) {
    const filter = and(role === "rescuer" ? eq(missions.rescuerId, userId) : eq(missions.requesterId, userId),
      sosRequestId ? eq(missions.sosRequestId, sosRequestId) : undefined);
    const [rows, totals] = await Promise.all([
      this.db.select().from(missions).where(filter)
        .orderBy(sql`CASE WHEN ${missions.status} IN ('pending','on_the_way','arrived','in_progress') THEN 0 ELSE 1 END`,
          desc(missions.updatedAt), desc(missions.id))
        .limit(limit).offset((page - 1) * limit),
      this.db.select({ total: count() }).from(missions).where(filter)
    ]);
    const total = totals[0]?.total ?? 0;
    return { items: rows.map(toMission), total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async listActiveRequestMissions(sosRequestId: string, includeTerminal = false): Promise<Mission[]> {
    const rows = await this.db.select().from(missions).where(and(eq(missions.sosRequestId, sosRequestId),
      includeTerminal ? undefined : inArray(missions.status, ACTIVE_STATUSES)))
      .orderBy(desc(missions.createdAt), desc(missions.id));
    return rows.map(toMission);
  }

  async findTimeline(missionId: string, userId: string, role: "admin" | "user"): Promise<MissionTimeline | null> {
    // Authorization is performed before the history read; unlike a bare history-table lookup,
    // an empty timeline must not make a foreign mission look different from an unknown one.
    const owned = await this.findMission(missionId, userId, role);
    if (!owned) return null;
    const rows = await this.db.select({
      id: missionStatusHistory.id, missionId: missionStatusHistory.missionId,
      fromStatus: missionStatusHistory.fromStatus, toStatus: missionStatusHistory.toStatus,
      changedBy: missionStatusHistory.changedBy, createdAt: missionStatusHistory.createdAt
    }).from(missionStatusHistory).where(eq(missionStatusHistory.missionId, missionId))
      // JS Date timestamps have millisecond precision: two legitimate transitions can
      // share a timestamp. UUIDs are random and must never determine their causal order.
      .orderBy(asc(missionStatusHistory.createdAt), sql<number>`CASE ${missionStatusHistory.toStatus}
        WHEN 'pending' THEN 0 WHEN 'on_the_way' THEN 1 WHEN 'arrived' THEN 2
        WHEN 'in_progress' THEN 3 ELSE 4 END`, asc(missionStatusHistory.id));
    return rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  }

  async canJoinMissionRoom(missionId: string, userId: string, role: "admin" | "user"): Promise<boolean> {
    const [row] = await this.db.select({ id: missions.id }).from(missions)
      .where(and(eq(missions.id, missionId), inArray(missions.status, ACTIVE_STATUSES), role === "admin" ? undefined :
        or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId))))
      .limit(1);
    return Boolean(row);
  }

  async missionLocationRole(missionId: string, userId: string, role: "admin" | "user" = "user"): Promise<"requester" | "rescuer" | "admin" | null> {
    const [row] = await this.db.select({ requesterId: missions.requesterId, rescuerId: missions.rescuerId })
      .from(missions).where(and(eq(missions.id, missionId), inArray(missions.status, ACTIVE_STATUSES),
        role === "admin" ? undefined : or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId)))).limit(1);
    return !row ? null : role === "admin" ? "admin" : row.rescuerId === userId ? "rescuer" : "requester";
  }

  async advanceStatus(missionId: string, rescuerId: string, nextStatus: MissionProgressStatus): Promise<MissionProgressResult> {
    return this.db.transaction(async (tx): Promise<MissionProgressResult> => {
      // Follow proposal-accept's SOS -> rescuer -> mission lock order. The first lookup
      // discovers the lock target only; authorization and state are rechecked under locks.
      const [candidate] = await tx.select({ sosRequestId: missions.sosRequestId })
        .from(missions).where(and(eq(missions.id, missionId), eq(missions.rescuerId, rescuerId))).limit(1);
      if (!candidate) return { status: "not_found" };
      const [sos] = await tx.select({ id: sosRequests.id }).from(sosRequests)
        .where(eq(sosRequests.id, candidate.sosRequestId)).for("update");
      if (!sos) return { status: "not_found" };
      const [rescuer] = await tx.select({ id: users.id }).from(users)
        .where(eq(users.id, rescuerId)).for("update");
      if (!rescuer) return { status: "not_found" };
      const [row] = await tx.select().from(missions)
        .where(and(eq(missions.id, missionId), eq(missions.rescuerId, rescuerId))).for("update");
      if (!row || row.sosRequestId !== sos.id) return { status: "not_found" };
      const decision = missionTransition(row.status, nextStatus);
      if (decision === "invalid_transition") return { status: decision, currentStatus: row.status };
      if (decision === "unchanged") return { status: decision, mission: toMission(row) };

      const changedAt = new Date();
      const [updated] = await tx.update(missions).set({ status: nextStatus, updatedAt: changedAt })
        .where(eq(missions.id, missionId)).returning();
      if (!updated) throw new Error("Mission disappeared during locked status update.");
      await tx.insert(missionStatusHistory).values({
        missionId, fromStatus: row.status, toStatus: nextStatus, changedBy: rescuerId, createdAt: changedAt
      });
      if (nextStatus === "completed") {
        const [otherRescuerMission] = await tx.select({ id: missions.id }).from(missions)
          .where(and(eq(missions.rescuerId, rescuerId), inArray(missions.status, ACTIVE_STATUSES))).limit(1);
        if (!otherRescuerMission) await tx.update(users).set({ isOnMission: false }).where(eq(users.id, rescuerId));
        const [otherSosMission] = await tx.select({ id: missions.id }).from(missions)
          .where(and(eq(missions.sosRequestId, sos.id), inArray(missions.status, ACTIVE_STATUSES))).limit(1);
        if (!otherSosMission) await tx.update(sosRequests).set({ status: "completed" })
          .where(and(eq(sosRequests.id, sos.id), eq(sosRequests.status, "accepted")));
      }
      return { status: "updated", mission: toMission(updated) };
    });
  }
}

export function toMission(row: typeof missions.$inferSelect): Mission {
  return {
    id: row.id, sosRequestId: row.sosRequestId, rescuerId: row.rescuerId,
    requesterId: row.requesterId, status: row.status, cancelledBy: row.cancelledBy,
    cancellationReasonId: row.cancellationReasonId, cancellationCustomText: row.cancellationCustomText,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
  };
}
