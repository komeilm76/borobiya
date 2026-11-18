import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
import type { Database } from "./client";
import { missions, missionSuggestedRoutes, missionTrackPoints } from "./schema";

const ACTIVE = ["pending", "on_the_way", "arrived", "in_progress"] as const;
export type MissionMemberRole = "requester" | "rescuer" | "admin";
export interface MissionPolicy {
  rescuerVisibleToRequester: boolean;
  requesterVisibleToRescuer: boolean;
  adminVisibleToRequester: boolean;
  adminVisibleToRescuer: boolean;
}
export interface MissionFix {
  missionId: string; userId: string; accountRole: "user" | "admin";
  lat: number; lon: number; accuracy: number | null; observedAt: Date;
}
export interface MissionTrackPoint {
  lat: number; lon: number; accuracy: number | null; observedAt: string; role: MissionMemberRole;
}
export interface SuggestedMissionRoute {
  profile: "car" | "bicycle" | "foot"; polyline: string; distanceM: number; selectedAt: string;
}
export interface MissionTracePage {
  points: MissionTrackPoint[]; nextCursor: number | null; suggestedRoute: SuggestedMissionRoute | null;
}
export interface MissionLocationStore {
  record(input: MissionFix): Promise<({ role: MissionMemberRole; requesterId: string; rescuerId: string } & MissionPolicy) | null>;
  policy(missionId: string, userId: string, accountRole: "user" | "admin"): Promise<({ requesterId: string; rescuerId: string } & MissionPolicy) | null>;
  setPolicy(missionId: string, policy: MissionPolicy): Promise<MissionPolicy | null>;
  saveSuggestedRoute(missionId: string, rescuerId: string, input: Omit<SuggestedMissionRoute, "selectedAt">): Promise<boolean>;
  history(missionId: string, userId: string, accountRole: "user" | "admin", limit: number, cursor?: number): Promise<MissionTracePage | null>;
}

const columns = { requesterId: missions.requesterId, rescuerId: missions.rescuerId,
  rescuerVisibleToRequester: missions.rescuerVisibleToRequester,
  requesterVisibleToRescuer: missions.requesterVisibleToRescuer,
  adminVisibleToRequester: missions.adminVisibleToRequester,
  adminVisibleToRescuer: missions.adminVisibleToRescuer };

/** Mission GPS never enters general location history, users.last_location, or public sharing.
 * The row lock serializes a terminal transition with the trace insert. */
export class DrizzleMissionLocationStore implements MissionLocationStore {
  constructor(private readonly db: Database) {}

  async record(input: MissionFix) {
    return this.db.transaction(async (tx) => {
      const [mission] = await tx.select({ ...columns, status: missions.status })
        .from(missions).where(eq(missions.id, input.missionId)).for("share");
      if (!mission || !ACTIVE.includes(mission.status as typeof ACTIVE[number])) return null;
      const role: MissionMemberRole | null = input.accountRole === "admin" ? "admin" :
        input.userId === mission.requesterId ? "requester" : input.userId === mission.rescuerId ? "rescuer" : null;
      if (!role) return null;
      await tx.insert(missionTrackPoints).values({ missionId: input.missionId,
        userId: input.userId, role, lat: input.lat, lon: input.lon,
        accuracy: input.accuracy, observedAt: input.observedAt });
      const { status: _status, ...scoped } = mission;
      return { ...scoped, role };
    });
  }

  async policy(missionId: string, userId: string, accountRole: "user" | "admin") {
    const [row] = await this.db.select(columns).from(missions).where(and(eq(missions.id, missionId),
      inArray(missions.status, ACTIVE), accountRole === "admin" ? undefined :
        or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId)))).limit(1);
    return row ?? null;
  }

  async setPolicy(missionId: string, policy: MissionPolicy) {
    const [row] = await this.db.update(missions).set(policy).where(and(eq(missions.id, missionId),
      inArray(missions.status, ACTIVE))).returning(columns);
    return row ? { rescuerVisibleToRequester: row.rescuerVisibleToRequester,
      requesterVisibleToRescuer: row.requesterVisibleToRescuer,
      adminVisibleToRequester: row.adminVisibleToRequester,
      adminVisibleToRescuer: row.adminVisibleToRescuer } : null;
  }

  async saveSuggestedRoute(missionId: string, rescuerId: string, input: Omit<SuggestedMissionRoute, "selectedAt">) {
    return this.db.transaction(async (tx) => {
      const [mission] = await tx.select({ status: missions.status }).from(missions)
        .where(and(eq(missions.id, missionId), eq(missions.rescuerId, rescuerId))).for("share");
      if (!mission || !ACTIVE.includes(mission.status as typeof ACTIVE[number])) return false;
      await tx.insert(missionSuggestedRoutes).values({ missionId, ...input, selectedAt: new Date() })
        .onConflictDoUpdate({ target: missionSuggestedRoutes.missionId,
          set: { ...input, selectedAt: new Date() } });
      return true;
    });
  }

  async history(missionId: string, userId: string, accountRole: "user" | "admin", limit: number, cursor = 0) {
    // Authorization occurs before any coordinates or route geometry are read.
    const [mission] = await this.db.select({ ...columns, status: missions.status }).from(missions)
      .where(and(eq(missions.id, missionId), accountRole === "admin" ? undefined :
        or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId)))).limit(1);
    if (!mission || mission.status !== "completed") return null;
    const permitted: MissionMemberRole[] = accountRole === "admin" ? ["admin", "requester", "rescuer"] :
      userId === mission.requesterId ? ["requester", ...(mission.rescuerVisibleToRequester ? ["rescuer" as const] : []),
        ...(mission.adminVisibleToRequester ? ["admin" as const] : [])] :
        ["rescuer", ...(mission.requesterVisibleToRescuer ? ["requester" as const] : []),
          ...(mission.adminVisibleToRescuer ? ["admin" as const] : [])];
    const rows = await this.db.select({ id: missionTrackPoints.id, lat: missionTrackPoints.lat, lon: missionTrackPoints.lon,
      accuracy: missionTrackPoints.accuracy, observedAt: missionTrackPoints.observedAt,
      role: missionTrackPoints.role })
      .from(missionTrackPoints).where(and(eq(missionTrackPoints.missionId, missionId),
        inArray(missionTrackPoints.role, permitted), gt(missionTrackPoints.id, cursor)))
      .orderBy(asc(missionTrackPoints.id)).limit(limit + 1);
    const [route] = await this.db.select({ profile: missionSuggestedRoutes.profile, polyline: missionSuggestedRoutes.polyline,
      distanceM: missionSuggestedRoutes.distanceM, selectedAt: missionSuggestedRoutes.selectedAt })
      .from(missionSuggestedRoutes).where(eq(missionSuggestedRoutes.missionId, missionId)).limit(1);
    const selected = rows.slice(0, limit);
    return { points: selected.map(({ id: _id, ...row }) => ({ ...row, observedAt: row.observedAt.toISOString() })),
      nextCursor: rows.length > limit ? selected.at(-1)!.id : null,
      // The selected route begins at the rescuer's position; never return it to a
      // requester whose rescuer location is hidden, even after completion.
      suggestedRoute: route && (accountRole === "admin" || userId === mission.rescuerId ||
        mission.rescuerVisibleToRequester) ? { ...route, selectedAt: route.selectedAt.toISOString() } : null };
  }
}
