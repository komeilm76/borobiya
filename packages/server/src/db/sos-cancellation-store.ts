import { and, asc, count, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { CancellationInput, CancellationReason } from "@borobiya/shared";
import type { Database } from "./client";
import { adminAlerts, cancellationReasons, missionProposals, missions, missionStatusHistory, sosRequests, users } from "./schema";

export interface RequesterCancellationNotice {
  missionId: string;
  sosRequestId: string;
  requesterId: string;
  rescuerId: string;
  reason: string;
  at: string;
}

export type RequestCancellationResult =
  | { status: "not_found" | "invalid_reason" | "custom_reason_required" | "custom_reason_not_allowed" | "already_in_progress" | "unchanged" }
  | { status: "cancelled"; notices: RequesterCancellationNotice[] };

export interface RescuerCancellationNotice {
  missionId: string;
  sosRequestId: string;
  requesterId: string;
  rescuerId: string;
  reason: string;
  rescuerLocation: { lat: number; lon: number } | null;
  at: string;
  reviewRequired: boolean;
}

export type RescuerCancellationResult =
  | { status: "not_found" | "invalid_reason" | "custom_reason_required" | "custom_reason_not_allowed" | "not_active" | "unchanged" }
  | { status: "cancelled"; notice: RescuerCancellationNotice };

export interface SosCancellationStore {
  listReasons(type: "requester" | "rescuer"): Promise<CancellationReason[]>;
  cancelRequestAsRequester(requestId: string, requesterId: string, input: CancellationInput): Promise<RequestCancellationResult>;
  cancelMissionAsRescuer(missionId: string, rescuerId: string, input: CancellationInput): Promise<RescuerCancellationResult>;
}

export class DrizzleSosCancellationStore implements SosCancellationStore {
  constructor(private readonly db: Database) {}

  async listReasons(type: "requester" | "rescuer"): Promise<CancellationReason[]> {
    return this.db.select().from(cancellationReasons)
      .where(and(eq(cancellationReasons.type, type), eq(cancellationReasons.isActive, true)))
      .orderBy(cancellationReasons.key);
  }

  async cancelRequestAsRequester(requestId: string, requesterId: string, input: CancellationInput): Promise<RequestCancellationResult> {
    return this.db.transaction(async (tx): Promise<RequestCancellationResult> => {
      // All acceptance, progress and cancellation paths lock SOS before responder/mission.
      // The request cannot gain a newly accepted mission while this row is locked.
      const [request] = await tx.select().from(sosRequests)
        .where(and(eq(sosRequests.id, requestId), eq(sosRequests.requesterId, requesterId)))
        .for("update");
      if (!request) return { status: "not_found" };
      if (request.status === "cancelled_by_requester") return { status: "unchanged" };
      if (!["pending", "dispatched", "accepted"].includes(request.status)) return { status: "already_in_progress" };
      const active = ["pending", "on_the_way", "arrived", "in_progress"] as const;
      const activeRows = await tx.select({ id: missions.id, rescuerId: missions.rescuerId })
        .from(missions).where(and(eq(missions.sosRequestId, request.id), inArray(missions.status, [...active])))
        .orderBy(asc(missions.rescuerId), asc(missions.id));
      // An accepted SOS with no active mission must not be rewritten as a requester cancel.
      // Treat unexpected pending/dispatched+active rows as live missions, not stale offers.
      if (request.status === "accepted" && !activeRows.length) return { status: "already_in_progress" };
      const [reason] = await tx.select().from(cancellationReasons)
        .where(and(eq(cancellationReasons.id, input.cancellationReasonId), eq(cancellationReasons.type, "requester"),
          eq(cancellationReasons.isActive, true)));
      if (!reason) return { status: "invalid_reason" };
      if (reason.requiresCustomText && !input.customReason) return { status: "custom_reason_required" };
      if (!reason.requiresCustomText && input.customReason) return { status: "custom_reason_not_allowed" };
      const rescuerIds = [...new Set(activeRows.map((row) => row.rescuerId))].sort();
      if (rescuerIds.length) {
        const lockedUsers = await tx.select({ id: users.id }).from(users)
          .where(inArray(users.id, rescuerIds)).orderBy(asc(users.id)).for("update");
        if (lockedUsers.length !== rescuerIds.length) throw new Error("An active mission rescuer disappeared during cancellation.");
      }
      const lockedMissions = activeRows.length ? await tx.select().from(missions)
        .where(inArray(missions.id, activeRows.map((row) => row.id)))
        .orderBy(asc(missions.id)).for("update") : [];
      if (lockedMissions.length !== activeRows.length || lockedMissions.some((row) =>
        row.sosRequestId !== request.id || !active.includes(row.status as typeof active[number]))) {
        throw new Error("Active mission changed under a locked SOS.");
      }
      const now = new Date();
      await tx.update(sosRequests).set({ status: "cancelled_by_requester", cancellationReasonId: reason.id,
        cancellationCustomText: input.customReason ?? null, cancelledAt: now
      }).where(eq(sosRequests.id, request.id));
      // Pending proposals remain non-actionable whether this SOS had a mission or not.
      await tx.update(missionProposals).set({ status: "expired" })
        .where(and(eq(missionProposals.sosRequestId, request.id), eq(missionProposals.status, "pending")));
      for (const mission of lockedMissions) {
        await tx.update(missions).set({ status: "cancelled_by_requester", cancelledBy: "requester",
          cancellationReasonId: reason.id, cancellationCustomText: input.customReason ?? null,
          cancelledAt: now, updatedAt: now
        }).where(eq(missions.id, mission.id));
        await tx.insert(missionStatusHistory).values({ missionId: mission.id,
          fromStatus: mission.status, toStatus: "cancelled_by_requester", changedBy: requesterId, createdAt: now
        });
      }
      for (const rescuerId of rescuerIds) {
        const [otherActive] = await tx.select({ id: missions.id }).from(missions)
          .where(and(eq(missions.rescuerId, rescuerId), inArray(missions.status, [...active]))).limit(1);
        if (!otherActive) await tx.update(users).set({ isOnMission: false }).where(eq(users.id, rescuerId));
      }
      return { status: "cancelled", notices: lockedMissions.map((mission) => ({
        missionId: mission.id, sosRequestId: request.id, requesterId, rescuerId: mission.rescuerId,
        reason: reason.label, at: now.toISOString()
      })) };
    });
  }

  async cancelMissionAsRescuer(missionId: string, rescuerId: string, input: CancellationInput): Promise<RescuerCancellationResult> {
    return this.db.transaction(async (tx): Promise<RescuerCancellationResult> => {
      // Discover the request without locking the mission. Proposal acceptance and progress
      // both lock SOS → rescuer → mission; recheck identity and status under those locks.
      const [candidate] = await tx.select({ sosRequestId: missions.sosRequestId }).from(missions)
        .where(and(eq(missions.id, missionId), eq(missions.rescuerId, rescuerId))).limit(1);
      if (!candidate) return { status: "not_found" };
      const [sos] = await tx.select({ id: sosRequests.id, status: sosRequests.status }).from(sosRequests)
        .where(eq(sosRequests.id, candidate.sosRequestId)).for("update");
      if (!sos) return { status: "not_found" };
      const [rescuer] = await tx.select({ id: users.id,
        lat: sql<number | null>`ST_Y(${users.lastLocation}::geometry)::float8`,
        lon: sql<number | null>`ST_X(${users.lastLocation}::geometry)::float8`
      }).from(users).where(eq(users.id, rescuerId)).for("update");
      if (!rescuer) return { status: "not_found" };
      const [mission] = await tx.select().from(missions)
        .where(and(eq(missions.id, missionId), eq(missions.rescuerId, rescuerId))).for("update");
      if (!mission || mission.sosRequestId !== sos.id) return { status: "not_found" };
      if (mission.status === "cancelled_by_rescuer") return { status: "unchanged" };
      const active = ["pending", "on_the_way", "arrived", "in_progress"] as const;
      if (!active.includes(mission.status as typeof active[number])) return { status: "not_active" };
      if (sos.status !== "accepted") return { status: "not_active" };
      const [reason] = await tx.select().from(cancellationReasons).where(and(
        eq(cancellationReasons.id, input.cancellationReasonId), eq(cancellationReasons.type, "rescuer"),
        eq(cancellationReasons.isActive, true)
      ));
      if (!reason) return { status: "invalid_reason" };
      if (reason.requiresCustomText && !input.customReason) return { status: "custom_reason_required" };
      if (!reason.requiresCustomText && input.customReason) return { status: "custom_reason_not_allowed" };
      const now = new Date();
      await tx.update(missions).set({ status: "cancelled_by_rescuer", cancelledBy: "rescuer",
        cancellationReasonId: reason.id, cancellationCustomText: input.customReason ?? null,
        cancelledAt: now, updatedAt: now
      }).where(eq(missions.id, mission.id));
      await tx.insert(missionStatusHistory).values({ missionId: mission.id,
        fromStatus: mission.status, toStatus: "cancelled_by_rescuer", changedBy: rescuerId, createdAt: now
      });
      const [otherRescuerMission] = await tx.select({ id: missions.id }).from(missions)
        .where(and(eq(missions.rescuerId, rescuerId), inArray(missions.status, [...active]))).limit(1);
      if (!otherRescuerMission) await tx.update(users).set({ isOnMission: false }).where(eq(users.id, rescuerId));
      const [otherSosMission] = await tx.select({ id: missions.id }).from(missions)
        .where(and(eq(missions.sosRequestId, sos.id), inArray(missions.status, [...active]))).limit(1);
      if (!otherSosMission) await tx.update(sosRequests).set({ status: "cancelled_by_rescuer" })
        .where(and(eq(sosRequests.id, sos.id), eq(sosRequests.status, "accepted")));
      // The 3rd cancellation in the UTC day is a durable admin-review flag. "Other"
      // requires independent admin approval even on the first occurrence. Never delay
      // releasing an unable responder just because an admin has not reviewed their reason.
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const end = new Date(start.getTime() + 86_400_000);
      const [daily] = await tx.select({ total: count() }).from(missions).where(and(
        eq(missions.rescuerId, rescuerId), eq(missions.status, "cancelled_by_rescuer"),
        gte(missions.cancelledAt, start), lt(missions.cancelledAt, end)
      ));
      const reviewRequired = (daily?.total ?? 0) > 2 || reason.key === "other";
      if ((daily?.total ?? 0) > 2) await tx.insert(adminAlerts).values({
        type: "rescuer_cancel_review", userId: rescuerId, missionId: mission.id,
        details: { countToday: daily?.total, date: start.toISOString().slice(0, 10) }
      }).onConflictDoNothing();
      if (reason.key === "other") await tx.insert(adminAlerts).values({
        type: "rescuer_other_reason_approval", userId: rescuerId, missionId: mission.id,
        details: { reasonId: reason.id }
      }).onConflictDoNothing();
      return { status: "cancelled", notice: {
        missionId: mission.id, sosRequestId: sos.id, requesterId: mission.requesterId,
        rescuerId, reason: reason.label, rescuerLocation: rescuer.lat === null || rescuer.lon === null
          ? null : { lat: rescuer.lat, lon: rescuer.lon }, at: now.toISOString(), reviewRequired
      } };
    });
  }
}
