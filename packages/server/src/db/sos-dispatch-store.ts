import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import type { MissionProposalStatus, NearestResponder, SosRequestStatus } from "@borobiya/shared";
import type { Database } from "./client";
import {
  adminAuditLog,
  categories,
  categoryIncidentTypes,
  categoryUsers,
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

export interface MissionProposalRecord {
  id: string;
  sosRequestId: string;
  rescuerId: string;
  status: MissionProposalStatus;
  createdAt: Date;
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

export interface SosDispatchStore {
  findNearestResponders(sosRequestId: string, limit?: number): Promise<FindNearestRespondersResult>;
  dispatchResponders?(input: DispatchSosInput): Promise<DispatchSosResult>;
  listProposalsByRequest?(sosRequestId: string): Promise<MissionProposalRecord[]>;
}

function toValidDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function createPlaceholderSosDispatchStore(): SosDispatchStore {
  return {
    findNearestResponders: async () => ({ status: "not_found" }),
    dispatchResponders: async () => ({ status: "not_found" }),
    listProposalsByRequest: async () => []
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
        .where(inArray(users.id, input.rescuerIds));

      const userById = new Map(candidateUsers.map((candidate) => [candidate.id, candidate]));
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
        if (candidate.isOnMission) {
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
          const [reopened] = await tx
            .update(missionProposals)
            .set({ status: "pending", createdAt: new Date() })
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
