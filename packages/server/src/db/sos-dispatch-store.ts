import { and, asc, count, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { MissionProposalStatus, MissionStatus, NearestResponder, SosRequestStatus } from "@borobiya/shared";
import type { Database } from "./client";
import {
  adminAuditLog,
  categories,
  incidentTypes,
  categoryIncidentTypes,
  categoryUsers,
  missions,
  missionStatusHistory,
  missionProposals,
  sosRequests,
  userSessions,
  users
} from "./schema";
import type { SosRequestRecord } from "./sos-request-store";

export const NEAREST_RESPONDERS_DEFAULT_LIMIT = 10;

const DISPATCHABLE_SOS_STATUSES = new Set<SosRequestStatus>([
  "pending",
  "dispatched",
  "cancelled_by_rescuer"
]);

/** Mission rows, not just the user's cached busy flag, are authoritative for availability. */
const ACTIVE_MISSION_STATUSES: MissionStatus[] = ["pending", "on_the_way", "arrived", "in_progress"];

export interface MissionProposalRecord {
  id: string;
  sosRequestId: string;
  rescuerId: string;
  status: MissionProposalStatus;
  createdAt: Date;
}

export interface PendingProposalRecord extends MissionProposalRecord {
  details?: {
    incidentTypeName: string;
    requesterName: string;
    sosRequest: {
      severity: SosRequestRecord["severity"];
      description: string;
      location: { lat: number; lon: number; accuracy?: number; isManual: boolean };
      photoUrl: string | null;
      createdAt: string;
    };
  };
}

export function missionProposalPayload(proposal: MissionProposalRecord) {
  return {
    id: proposal.id,
    sosRequestId: proposal.sosRequestId,
    rescuerId: proposal.rescuerId,
    status: proposal.status,
    createdAt: proposal.createdAt.toISOString()
  };
}

export type FindNearestRespondersResult =
  | { status: "not_found" }
  | { status: "ok"; responders: NearestResponder[] };

export type DispatchValidationIssue =
  | {
      code: "unknown_rescuer" | "self_dispatch_not_allowed" | "rescuer_unavailable";
      rescuerId: string;
      path: ["rescuerIds", number];
    }
  | {
      code: "rescuer_on_mission";
      rescuerId: string;
      path: ["rescuerIds", number];
    };

export type DispatchSosResult =
  | { status: "not_found" }
  | { status: "invalid_status"; currentStatus: SosRequestStatus }
  | { status: "invalid_rescuers"; issues: DispatchValidationIssue[] }
  | { status: "rescuer_busy"; issues: DispatchValidationIssue[] }
  | {
      status: "dispatched";
      proposals: MissionProposalRecord[];
      notifiedProposals: MissionProposalRecord[];
      sosRequest: SosRequestRecord;
    };

export interface DispatchSosInput {
  sosRequestId: string;
  rescuerIds: string[];
  adminId: string;
}

export type AcceptProposalResult =
  | { status: "not_found" }
  | { status: "not_pending" }
  | { status: "on_mission" }
  | { status: "sos_closed" }
  | { status: "accepted" | "already_accepted"; missionId: string; sosRequestId: string; requesterId: string; proposal: MissionProposalRecord };

export interface SosDispatchStore {
  acceptProposal?(proposalId: string, rescuerId: string): Promise<AcceptProposalResult>;
  declineProposal?(proposalId: string, rescuerId: string, reason?: string): Promise<"declined" | "not_found" | "not_pending">;
  findNearestResponders(sosRequestId: string, limit?: number): Promise<FindNearestRespondersResult>;
  dispatchResponders?(input: DispatchSosInput): Promise<DispatchSosResult>;
  listProposalsByRequest?(sosRequestId: string): Promise<MissionProposalRecord[]>;
  listPendingProposals?(rescuerId: string, page: number, limit: number): Promise<{ items: PendingProposalRecord[]; total: number }>;
}

function toValidDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function createPlaceholderSosDispatchStore(): SosDispatchStore {
  return {
    findNearestResponders: async () => ({ status: "not_found" }),
    dispatchResponders: async () => ({ status: "not_found" }),
    listProposalsByRequest: async () => [],
    listPendingProposals: async () => ({ items: [], total: 0 }),
    acceptProposal: async () => ({ status: "not_found" }),
    declineProposal: async () => "not_found"
  };
}

export class DrizzleSosDispatchStore implements SosDispatchStore {
  public constructor(private readonly db: Database) {}

  public async findNearestResponders(
    sosRequestId: string,
    limit: number = NEAREST_RESPONDERS_DEFAULT_LIMIT
  ): Promise<FindNearestRespondersResult> {
    const requestRows = await this.db
      .select({
        id: sosRequests.id,
        requesterId: sosRequests.requesterId,
        incidentTypeId: sosRequests.incidentTypeId
      })
      .from(sosRequests)
      .where(eq(sosRequests.id, sosRequestId))
      .limit(1);

    const targetRequest = requestRows[0];
    if (!targetRequest) {
      return { status: "not_found" };
    }

    const distanceExpr = sql<number>`ST_Distance(
      "users"."last_location",
      (SELECT "sos_requests"."location" FROM "sos_requests" WHERE "sos_requests"."id" = ${sosRequestId})
    )::double precision`;

    const categoryNameExpr = sql<string | null>`(
      SELECT string_agg("categories"."name", '، ' ORDER BY "categories"."name" ASC, "categories"."id" ASC)
      FROM "category_users"
      INNER JOIN "categories" ON "categories"."id" = "category_users"."category_id"
      INNER JOIN "category_incident_types" ON "category_incident_types"."category_id" = "categories"."id"
      WHERE "category_users"."user_id" = "users"."id"
        AND "category_incident_types"."incident_type_id" = ${targetRequest.incidentTypeId}
    )`;

    const lastActiveAtExpr = sql<Date | string>`COALESCE(
      (SELECT MAX("user_sessions"."last_active_at") FROM "user_sessions" WHERE "user_sessions"."user_id" = "users"."id"),
      "users"."created_at"
    )`;

    const rows = await this.db
      .select({
        userId: users.id,
        username: users.username,
        distance: distanceExpr,
        avgRating: users.avgRating,
        categoryName: categoryNameExpr,
        lastActiveAt: lastActiveAtExpr
      })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          eq(users.isSuspended, false),
          eq(users.isOnMission, false),
          sql`NOT EXISTS (
            SELECT 1 FROM ${missions}
            WHERE ${missions.rescuerId} = ${users.id}
              AND ${inArray(missions.status, ACTIVE_MISSION_STATUSES)}
          )`,
          isNotNull(users.lastLocation),
          ne(users.id, targetRequest.requesterId),
          sql`EXISTS (
            SELECT 1
            FROM "category_users"
            INNER JOIN "category_incident_types"
              ON "category_incident_types"."category_id" = "category_users"."category_id"
            WHERE "category_users"."user_id" = "users"."id"
              AND "category_incident_types"."incident_type_id" = ${targetRequest.incidentTypeId}
          )`
        )
      )
      .orderBy(
        asc(distanceExpr),
        sql`COALESCE("users"."avg_rating", 0) DESC`,
        asc(users.id)
      )
      .limit(limit);

    return {
      status: "ok",
      responders: rows.map((row) => ({
        userId: row.userId,
        username: row.username,
        distance: Number(row.distance),
        avgRating: row.avgRating === null ? null : Number(row.avgRating),
        categoryName: row.categoryName ?? null,
        lastActiveAt: toValidDate(row.lastActiveAt).toISOString()
      }))
    };
  }

  public async dispatchResponders(input: DispatchSosInput): Promise<DispatchSosResult> {
    return this.db.transaction(async (tx) => {
      const [reqRow] = await tx
        .select({
          id: sosRequests.id,
          requesterId: sosRequests.requesterId,
          severity: sosRequests.severity,
          description: sosRequests.description,
          incidentTypeId: sosRequests.incidentTypeId,
          lat: sql<number>`ST_Y("sos_requests"."location"::geometry)`,
          lon: sql<number>`ST_X("sos_requests"."location"::geometry)`,
          accuracy: sosRequests.accuracy,
          isManual: sosRequests.isManual,
          photoUrl: sosRequests.photoUrl,
          status: sosRequests.status,
          cancellationReasonId: sosRequests.cancellationReasonId,
          cancellationCustomText: sosRequests.cancellationCustomText,
          cancelledAt: sosRequests.cancelledAt,
          createdAt: sosRequests.createdAt
        })
        .from(sosRequests)
        .where(eq(sosRequests.id, input.sosRequestId))
        .for("update");

      if (!reqRow) {
        return { status: "not_found" };
      }

      if (!DISPATCHABLE_SOS_STATUSES.has(reqRow.status)) {
        return { status: "invalid_status", currentStatus: reqRow.status };
      }

      const candidateUsers = await tx
        .select({
          id: users.id,
          isActive: users.isActive,
          isSuspended: users.isSuspended,
          isOnMission: users.isOnMission
        })
        .from(users)
        .where(inArray(users.id, input.rescuerIds))
        .orderBy(asc(users.id))
        .for("update");

      const userById = new Map(candidateUsers.map((candidate) => [candidate.id, candidate]));
      // Match the nearest and acceptance guards even if is_on_mission was left stale.
      // The ordered user locks above serialize this with competing acceptance transactions.
      const activeMissionRows = await tx.select({ rescuerId: missions.rescuerId })
        .from(missions)
        .where(and(
          inArray(missions.rescuerId, input.rescuerIds),
          inArray(missions.status, ACTIVE_MISSION_STATUSES)
        ));
      const busyRescuerIds = new Set(activeMissionRows.map((row) => row.rescuerId));
      const invalidIssues: DispatchValidationIssue[] = [];
      const busyIssues: DispatchValidationIssue[] = [];

      input.rescuerIds.forEach((rescuerId, idx) => {
        const candidate = userById.get(rescuerId);
        if (!candidate) {
          invalidIssues.push({ code: "unknown_rescuer", rescuerId, path: ["rescuerIds", idx] });
          return;
        }
        if (rescuerId === reqRow.requesterId) {
          invalidIssues.push({ code: "self_dispatch_not_allowed", rescuerId, path: ["rescuerIds", idx] });
          return;
        }
        if (!candidate.isActive || candidate.isSuspended) {
          invalidIssues.push({ code: "rescuer_unavailable", rescuerId, path: ["rescuerIds", idx] });
          return;
        }
        if (candidate.isOnMission || busyRescuerIds.has(rescuerId)) {
          busyIssues.push({ code: "rescuer_on_mission", rescuerId, path: ["rescuerIds", idx] });
        }
      });

      if (invalidIssues.length > 0) {
        return { status: "invalid_rescuers", issues: invalidIssues };
      }

      if (busyIssues.length > 0) {
        return { status: "rescuer_busy", issues: busyIssues };
      }

      const existingProposals = await tx
        .select({
          id: missionProposals.id,
          sosRequestId: missionProposals.sosRequestId,
          rescuerId: missionProposals.rescuerId,
          status: missionProposals.status,
          createdAt: missionProposals.createdAt
        })
        .from(missionProposals)
        .where(
          and(
            eq(missionProposals.sosRequestId, input.sosRequestId),
            inArray(missionProposals.rescuerId, input.rescuerIds)
          )
        );
      const existingByRescuer = new Map(existingProposals.map((proposal) => [proposal.rescuerId, proposal]));

      const allProposalsByRescuer = new Map<string, MissionProposalRecord>();
      const notifiedProposals: MissionProposalRecord[] = [];

      for (const rescuerId of input.rescuerIds) {
        const existing = existingByRescuer.get(rescuerId);
        if (existing && existing.status === "pending") {
          allProposalsByRescuer.set(rescuerId, existing);
          continue;
        }

        if (existing) {
          // A previous decision may still be in flight or retried by a client. Rotating
          // the public id makes it impossible for that stale accept/decline to decide
          // this new dispatch generation (the unique SOS/rescuer pair remains intact).
          const [reopened] = await tx
            .update(missionProposals)
            .set({ id: sql`gen_random_uuid()`, status: "pending", declineReason: null, createdAt: new Date() })
            .where(eq(missionProposals.id, existing.id))
            .returning({
              id: missionProposals.id,
              sosRequestId: missionProposals.sosRequestId,
              rescuerId: missionProposals.rescuerId,
              status: missionProposals.status,
              createdAt: missionProposals.createdAt
            });
          if (reopened) {
            allProposalsByRescuer.set(rescuerId, reopened);
            notifiedProposals.push(reopened);
          }
          continue;
        }

        const [created] = await tx
          .insert(missionProposals)
          .values({
            sosRequestId: input.sosRequestId,
            rescuerId,
            status: "pending"
          })
          .returning({
            id: missionProposals.id,
            sosRequestId: missionProposals.sosRequestId,
            rescuerId: missionProposals.rescuerId,
            status: missionProposals.status,
            createdAt: missionProposals.createdAt
          });
        if (created) {
          allProposalsByRescuer.set(rescuerId, created);
          notifiedProposals.push(created);
        }
      }

      if (reqRow.status !== "dispatched") {
        await tx
          .update(sosRequests)
          .set({ status: "dispatched" })
          .where(eq(sosRequests.id, input.sosRequestId));
      }

      const proposals = input.rescuerIds
        .map((rescuerId) => allProposalsByRescuer.get(rescuerId))
        .filter((proposal): proposal is MissionProposalRecord => Boolean(proposal));

      await tx.insert(adminAuditLog).values({
        adminId: input.adminId,
        action: "sos_dispatched",
        targetType: "sos_request",
        targetId: input.sosRequestId,
        meta: {
          rescuerIds: input.rescuerIds,
          proposalIds: proposals.map((proposal) => proposal.id)
        }
      });

      const sosRequest: SosRequestRecord = {
        id: reqRow.id,
        requesterId: reqRow.requesterId,
        severity: reqRow.severity,
        description: reqRow.description,
        incidentTypeId: reqRow.incidentTypeId,
        location: {
          lat: Number(reqRow.lat),
          lon: Number(reqRow.lon),
          accuracy: reqRow.accuracy === null ? null : Number(reqRow.accuracy),
          isManual: reqRow.isManual
        },
        photoUrl: reqRow.photoUrl,
        status: "dispatched",
        cancellationReasonId: reqRow.cancellationReasonId,
        cancellationCustomText: reqRow.cancellationCustomText,
        cancelledAt: reqRow.cancelledAt ? toValidDate(reqRow.cancelledAt) : null,
        createdAt: toValidDate(reqRow.createdAt)
      };

      return {
        status: "dispatched",
        proposals,
        notifiedProposals,
        sosRequest
      };
    });
  }

  public async acceptProposal(proposalId: string, rescuerId: string): Promise<AcceptProposalResult> {
    return this.db.transaction(async (tx): Promise<AcceptProposalResult> => {
      // Follow dispatch's lock order: SOS first, then rescuer. A different accept/dispatch
      // transaction cannot create two missions for one rescuer or deadlock by reversing the order.
      const [candidate] = await tx.select({ sosRequestId: missionProposals.sosRequestId })
        .from(missionProposals)
        .where(and(eq(missionProposals.id, proposalId), eq(missionProposals.rescuerId, rescuerId)))
        .limit(1);
      if (!candidate) return { status: "not_found" };

      const [request] = await tx.select({ id: sosRequests.id, requesterId: sosRequests.requesterId, status: sosRequests.status })
        .from(sosRequests).where(eq(sosRequests.id, candidate.sosRequestId)).for("update");
      if (!request) return { status: "not_found" };
      const [rescuer] = await tx.select({ id: users.id, isOnMission: users.isOnMission })
        .from(users).where(eq(users.id, rescuerId)).for("update");
      if (!rescuer) return { status: "not_found" };
      const [proposal] = await tx.select({
        id: missionProposals.id,
        sosRequestId: missionProposals.sosRequestId,
        rescuerId: missionProposals.rescuerId,
        status: missionProposals.status,
        createdAt: missionProposals.createdAt
      }).from(missionProposals)
        .where(and(eq(missionProposals.id, proposalId), eq(missionProposals.rescuerId, rescuerId)))
        .for("update");
      if (!proposal || proposal.sosRequestId !== request.id) return { status: "not_found" };

      if (proposal.status === "accepted") {
        const [existing] = await tx.select({ id: missions.id }).from(missions)
          .where(and(eq(missions.sosRequestId, request.id), eq(missions.rescuerId, rescuerId)))
          .orderBy(desc(missions.createdAt)).limit(1);
        return existing
          ? { status: "already_accepted", missionId: existing.id, sosRequestId: request.id, requesterId: request.requesterId, proposal }
          : { status: "not_pending" };
      }
      if (proposal.status !== "pending") return { status: "not_pending" };
      if (request.status !== "dispatched" && request.status !== "accepted") return { status: "sos_closed" };
      const activeMissions = await tx.select({ id: missions.id }).from(missions)
        .where(and(eq(missions.rescuerId, rescuerId), inArray(missions.status, ACTIVE_MISSION_STATUSES))).limit(1);
      if (rescuer.isOnMission || activeMissions.length > 0) return { status: "on_mission" };

      const [created] = await tx.insert(missions).values({
        sosRequestId: request.id,
        requesterId: request.requesterId,
        rescuerId
      }).returning({ id: missions.id });
      if (!created) throw new Error("Mission insert returned no row.");
      await tx.insert(missionStatusHistory).values({
        missionId: created.id,
        toStatus: "pending",
        changedBy: rescuerId
      });
      const [accepted] = await tx.update(missionProposals).set({ status: "accepted" })
        .where(eq(missionProposals.id, proposal.id))
        .returning({ id: missionProposals.id, status: missionProposals.status });
      if (!accepted) throw new Error("Accepted proposal disappeared inside transaction.");
      await tx.update(missionProposals).set({ status: "declined" }).where(and(
        eq(missionProposals.rescuerId, rescuerId),
        eq(missionProposals.status, "pending"),
        ne(missionProposals.id, proposal.id)
      ));
      await tx.update(users).set({ isOnMission: true }).where(eq(users.id, rescuerId));
      await tx.update(sosRequests).set({ status: "accepted" }).where(eq(sosRequests.id, request.id));
      return {
        status: "accepted", missionId: created.id, sosRequestId: request.id,
        requesterId: request.requesterId, proposal: { ...proposal, status: "accepted" }
      };
    });
  }

  public async declineProposal(
    proposalId: string,
    rescuerId: string,
    reason?: string
  ): Promise<"declined" | "not_found" | "not_pending"> {
    // The conditional update is the decision's linearization point. A concurrent accept
    // either sees the declined row or wins and makes this update affect zero rows.
    const [updated] = await this.db.update(missionProposals)
      .set({ status: "declined", declineReason: reason ?? null })
      .where(and(
        eq(missionProposals.id, proposalId),
        eq(missionProposals.rescuerId, rescuerId),
        eq(missionProposals.status, "pending")
      ))
      .returning({ id: missionProposals.id });
    if (updated) return "declined";
    const [existing] = await this.db.select({ status: missionProposals.status })
      .from(missionProposals)
      .where(and(eq(missionProposals.id, proposalId), eq(missionProposals.rescuerId, rescuerId)))
      .limit(1);
    if (!existing) return "not_found";
    return existing.status === "declined" ? "declined" : "not_pending";
  }

  public async listPendingProposals(rescuerId: string, page: number, limit: number): Promise<{ items: PendingProposalRecord[]; total: number }> {
    const where = and(eq(missionProposals.rescuerId, rescuerId), eq(missionProposals.status, "pending"));
    const [rows, totals] = await Promise.all([
      this.db.select({
        id: missionProposals.id,
        sosRequestId: missionProposals.sosRequestId,
        rescuerId: missionProposals.rescuerId,
        status: missionProposals.status,
        createdAt: missionProposals.createdAt,
        incidentTypeName: incidentTypes.name,
        requesterName: users.username,
        severity: sosRequests.severity,
        description: sosRequests.description,
        lat: sql<number>`ST_Y(${sosRequests.location}::geometry)`,
        lon: sql<number>`ST_X(${sosRequests.location}::geometry)`,
        accuracy: sosRequests.accuracy,
        isManual: sosRequests.isManual,
        photoUrl: sosRequests.photoUrl,
        requestCreatedAt: sosRequests.createdAt
      }).from(missionProposals)
        .innerJoin(sosRequests, eq(sosRequests.id, missionProposals.sosRequestId))
        .innerJoin(incidentTypes, eq(incidentTypes.id, sosRequests.incidentTypeId))
        .innerJoin(users, eq(users.id, sosRequests.requesterId))
        .where(where)
        .orderBy(desc(missionProposals.createdAt), asc(missionProposals.id))
        .limit(limit).offset((page - 1) * limit),
      this.db.select({ total: count() }).from(missionProposals).where(where)
    ]);
    // The WHERE is scoped to the verified rescuer before any joined incident, photo or
    // requester details can enter the response. Coordinates are returned only for that offer.
    return { items: rows.map((row) => ({
      id: row.id, sosRequestId: row.sosRequestId, rescuerId: row.rescuerId,
      status: row.status, createdAt: toValidDate(row.createdAt),
      details: {
        incidentTypeName: row.incidentTypeName,
        requesterName: row.requesterName,
        sosRequest: {
          severity: row.severity, description: row.description,
          location: {
            lat: Number(row.lat), lon: Number(row.lon), isManual: row.isManual,
            ...(row.accuracy === null ? {} : { accuracy: Number(row.accuracy) })
          },
          photoUrl: row.photoUrl, createdAt: toValidDate(row.requestCreatedAt).toISOString()
        }
      }
    })), total: totals[0]?.total ?? 0 };
  }

  public async listProposalsByRequest(sosRequestId: string): Promise<MissionProposalRecord[]> {
    return this.db
      .select({
        id: missionProposals.id,
        sosRequestId: missionProposals.sosRequestId,
        rescuerId: missionProposals.rescuerId,
        status: missionProposals.status,
        createdAt: missionProposals.createdAt
      })
      .from(missionProposals)
      .where(eq(missionProposals.sosRequestId, sosRequestId))
      .orderBy(asc(missionProposals.createdAt), asc(missionProposals.id));
  }
}
