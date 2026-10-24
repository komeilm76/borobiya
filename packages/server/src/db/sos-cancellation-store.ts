import { and, eq, inArray } from "drizzle-orm";
import type { CancellationInput, CancellationReason } from "@borobiya/shared";
import type { Database } from "./client";
import { cancellationReasons, missionProposals, missions, sosRequests } from "./schema";

export type RequestCancellationResult =
  | { status: "not_found" | "invalid_reason" | "custom_reason_required" | "custom_reason_not_allowed" | "already_in_progress" }
  | { status: "cancelled" | "unchanged" };

export interface SosCancellationStore {
  listReasons(type: "requester" | "rescuer"): Promise<CancellationReason[]>;
  cancelUnaccepted(requestId: string, requesterId: string, input: CancellationInput): Promise<RequestCancellationResult>;
}

export class DrizzleSosCancellationStore implements SosCancellationStore {
  constructor(private readonly db: Database) {}

  async listReasons(type: "requester" | "rescuer"): Promise<CancellationReason[]> {
    return this.db.select().from(cancellationReasons)
      .where(and(eq(cancellationReasons.type, type), eq(cancellationReasons.isActive, true)))
      .orderBy(cancellationReasons.key);
  }

  async cancelUnaccepted(requestId: string, requesterId: string, input: CancellationInput): Promise<RequestCancellationResult> {
    return this.db.transaction(async (tx): Promise<RequestCancellationResult> => {
      // Dispatch and acceptance lock the SOS first. The requester must use the same lock
      // order: accepting the last offer and cancelling the request cannot both win.
      const [request] = await tx.select().from(sosRequests)
        .where(and(eq(sosRequests.id, requestId), eq(sosRequests.requesterId, requesterId)))
        .for("update");
      if (!request) return { status: "not_found" };
      if (request.status === "cancelled_by_requester") return { status: "unchanged" };
      // Active mission cancellation is T3.6.4, and must release the rescuer atomically.
      // Never mark an accepted SOS cancelled without also handling its mission.
      if (request.status !== "pending" && request.status !== "dispatched") return { status: "already_in_progress" };
      const [activeMission] = await tx.select({ id: missions.id }).from(missions)
        .where(and(eq(missions.sosRequestId, request.id), inArray(missions.status, ["pending", "on_the_way", "arrived", "in_progress"])))
        .limit(1);
      if (activeMission) return { status: "already_in_progress" };
      const [reason] = await tx.select().from(cancellationReasons)
        .where(and(eq(cancellationReasons.id, input.cancellationReasonId), eq(cancellationReasons.type, "requester"), eq(cancellationReasons.isActive, true)));
      if (!reason) return { status: "invalid_reason" };
      if (reason.requiresCustomText && !input.customReason) return { status: "custom_reason_required" };
      if (!reason.requiresCustomText && input.customReason) return { status: "custom_reason_not_allowed" };
      const now = new Date();
      await tx.update(sosRequests).set({
        status: "cancelled_by_requester", cancellationReasonId: reason.id,
        cancellationCustomText: input.customReason ?? null, cancelledAt: now
      }).where(eq(sosRequests.id, request.id));
      // Withdraw pending offers so they immediately disappear from responder inboxes.
      await tx.update(missionProposals).set({ status: "expired" })
        .where(and(eq(missionProposals.sosRequestId, request.id), inArray(missionProposals.status, ["pending"])));
      return { status: "cancelled" };
    });
  }
}
