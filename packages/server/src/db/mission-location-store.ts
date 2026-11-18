import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Database } from "./client";
import { missions, missionTrackPoints } from "./schema";

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
export interface MissionLocationStore {
  record(input: MissionFix): Promise<({ role: MissionMemberRole; requesterId: string; rescuerId: string } & MissionPolicy) | null>;
  policy(missionId: string, userId: string, accountRole: "user" | "admin"): Promise<({ requesterId: string; rescuerId: string } & MissionPolicy) | null>;
  setPolicy(missionId: string, policy: MissionPolicy): Promise<MissionPolicy | null>;
  history(missionId: string, userId: string, accountRole: "user" | "admin", limit: number): Promise<MissionTrackPoint[] | null>;
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

  async history(missionId: string, userId: string, accountRole: "user" | "admin", limit: number) {
    // Authorization occurs before any coordinates are read. No general share grants this access.
    const [mission] = await this.db.select({ ...columns, status: missions.status }).from(missions)
      .where(and(eq(missions.id, missionId), accountRole === "admin" ? undefined :
        or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId)))).limit(1);
    if (!mission || mission.status !== "completed") return null;
    const permitted: MissionMemberRole[] = accountRole === "admin" ? ["admin", "requester", "rescuer"] :
      userId === mission.requesterId ? ["requester", ...(mission.rescuerVisibleToRequester ? ["rescuer" as const] : []),
        ...(mission.adminVisibleToRequester ? ["admin" as const] : [])] :
        ["rescuer", ...(mission.requesterVisibleToRescuer ? ["requester" as const] : []),
          ...(mission.adminVisibleToRescuer ? ["admin" as const] : [])];
    const rows = await this.db.select({ lat: missionTrackPoints.lat, lon: missionTrackPoints.lon,
      accuracy: missionTrackPoints.accuracy, observedAt: missionTrackPoints.observedAt,
      role: missionTrackPoints.role })
      .from(missionTrackPoints).where(and(eq(missionTrackPoints.missionId, missionId),
        inArray(missionTrackPoints.role, permitted)))
      .orderBy(asc(missionTrackPoints.observedAt), asc(missionTrackPoints.id)).limit(limit);
    return rows.map((row) => ({ ...row, observedAt: row.observedAt.toISOString() }));
  }
}
