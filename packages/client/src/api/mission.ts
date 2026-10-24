import { z } from "zod";
import { apiRoutes } from "@shared/api";
import { cancellationReasonSchema, cancellationSchema, missionSchema, missionDetailSchema, missionTimelineSchema, paginatedResponseSchema, missionRatingSchema,
  type CancellationReason, type Mission, type MissionDetail, type MissionRatingInput, type MissionTimeline } from "@shared/index";
import { requestJson } from "./http";

export async function listRescuerMissions(token: string, page = 1): Promise<{ items: Mission[]; total: number; totalPages: number }> {
  const query = apiRoutes.sos.listMissions.schema.query.parse({ role: "rescuer", page, limit: 20 });
  const params = new URLSearchParams({ role: "rescuer", page: String(query.page), limit: String(query.limit) });
  return paginatedResponseSchema(missionSchema).parse(await requestJson<unknown>(
    `${apiRoutes.sos.listMissions.url}?${params}`, { accessToken: token }
  ));
}

export async function listRequesterMissions(token: string, page = 1, sosRequestId?: string): Promise<{ items: Mission[]; totalPages: number }> {
  const query = apiRoutes.sos.listMissions.schema.query.parse({ role: "requester", page, limit: 50, ...(sosRequestId ? { sosRequestId } : {}) });
  const params = new URLSearchParams({ role: "requester", page: String(query.page), limit: String(query.limit) });
  if (query.sosRequestId) params.set("sosRequestId", query.sosRequestId);
  return paginatedResponseSchema(missionSchema).parse(await requestJson<unknown>(
    `${apiRoutes.sos.listMissions.url}?${params}`, { accessToken: token }
  ));
}

export async function listActiveSosMissions(token: string, sosRequestId: string, includeTerminal = false): Promise<Mission[]> {
  const route = apiRoutes.admin.listSosMissions;
  const id = route.schema.params.parse({ id: sosRequestId }).id;
  return z.array(missionSchema).parse(await requestJson<unknown>(
    `${route.url.replace(":id", encodeURIComponent(id))}${includeTerminal ? "?includeTerminal=true" : ""}`, { accessToken: token }
  ));
}

export async function getMissionTimeline(token: string, missionId: string,
  audience: "admin" | "user", signal?: AbortSignal): Promise<MissionTimeline> {
  const route = audience === "admin" ? apiRoutes.admin.getMissionTimeline : apiRoutes.sos.getMissionTimeline;
  const id = route.schema.params.parse({ id: missionId }).id;
  return missionTimelineSchema.parse(await requestJson<unknown>(route.url.replace(":id", encodeURIComponent(id)),
    { accessToken: token, signal }));
}

export async function getMission(token: string, id: string): Promise<MissionDetail> {
  return missionDetailSchema.parse(await requestJson<unknown>(apiRoutes.sos.getMission.url.replace(":id", encodeURIComponent(id)),
    { accessToken: token }));
}

export async function listRescuerCancellationReasons(token: string): Promise<CancellationReason[]> {
  return z.array(cancellationReasonSchema).parse(await requestJson<unknown>(
    `${apiRoutes.sos.listCancellationReasons.url}?type=rescuer`, { accessToken: token }
  ));
}

export async function cancelRescuerMission(token: string, missionId: string, reasonId: string, customReason?: string): Promise<void> {
  await requestJson<unknown>(apiRoutes.sos.cancelMission.url.replace(":id", encodeURIComponent(missionSchema.shape.id.parse(missionId))), {
    method: "POST", accessToken: token,
    body: cancellationSchema.parse({ cancellationReasonId: reasonId, ...(customReason ? { customReason } : {}) })
  });
}

/** Submit a single requester rating; duplicates are a server-side 409, never an overwrite. */
export async function rateMission(token: string, id: string, input: MissionRatingInput): Promise<void> {
  const route = apiRoutes.sos.rateMission;
  const missionId = route.schema.params.parse({ id }).id;
  await requestJson<unknown>(route.url.replace(":id", encodeURIComponent(missionId)), {
    method: "POST", accessToken: token, body: missionRatingSchema.parse(input)
  });
}
