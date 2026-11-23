import { z } from "zod";
import { apiRoutes } from "@shared/api";
import { cancellationReasonSchema, cancellationSchema, missionStatusUpdateSchema, missionSchema, missionDetailSchema, missionTimelineSchema, missionPresenceSchema, missionBriefSchema, paginatedResponseSchema, missionRatingSchema,
  type CancellationReason, type Mission, type MissionDetail, type MissionRatingInput, type MissionTimeline, type MissionPresence, type MissionBrief } from "@shared/index";
import { requestJson } from "./http";

export async function listRescuerMissions(token: string, page = 1): Promise<{ items: Mission[]; total: number; totalPages: number }> {
  const query = apiRoutes.sos.listMissions.schema.query.parse({ role: "rescuer", page, limit: 20 });
  const params = new URLSearchParams({ role: "rescuer", page: String(query.page), limit: String(query.limit) });
  return paginatedResponseSchema(missionSchema).parse(await requestJson<unknown>(
    `${apiRoutes.sos.listMissions.url}?${params}`, { accessToken: token, cache: "no-store" }
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

/** An active-mission, participant/admin-scoped transport snapshot (never GPS coordinates). */
export async function getMissionPresence(token: string, missionId: string, signal?: AbortSignal): Promise<MissionPresence> {
  const route = apiRoutes.sos.getMissionPresence;
  const id = route.schema.params.parse({ id: missionId }).id;
  return missionPresenceSchema.parse(await requestJson<unknown>(route.url.replace(":id", encodeURIComponent(id)),
    { accessToken: token, signal }));
}

export async function getMissionBrief(token: string, missionId: string, signal?: AbortSignal): Promise<MissionBrief> {
  const route = apiRoutes.sos.getMissionBrief;
  const id = route.schema.params.parse({ id: missionId }).id;
  const brief = missionBriefSchema.parse(await requestJson<unknown>(route.url.replace(":id", encodeURIComponent(id)), {
    accessToken: token, cache: "no-store", signal
  }));
  if (brief.missionId !== id) throw new Error("MISSION_BRIEF_MISMATCH");
  return brief;
}

export async function getMission(token: string, id: string, signal?: AbortSignal): Promise<MissionDetail> {
  return missionDetailSchema.parse(await requestJson<unknown>(apiRoutes.sos.getMission.url.replace(":id", encodeURIComponent(id)),
    { accessToken: token, signal }));
}

/** Only the assigned rescuer may request the next ordered step; the response is the persisted mission. */
export async function advanceRescuerMission(token: string, id: string, status: Mission["status"]): Promise<Mission> {
  const route = apiRoutes.sos.updateMissionStatus;
  const missionId = route.schema.params.parse({ id }).id;
  const body = missionStatusUpdateSchema.parse({ status });
  const result = missionSchema.parse(await requestJson<unknown>(route.url.replace(":id", encodeURIComponent(missionId)), {
    method: "PATCH", accessToken: token, body
  }));
  if (result.id !== missionId || result.status !== status) throw new Error("Mission status response did not match the requested step.");
  return result;
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

export const missionLocationPolicySchema = z.strictObject({
  requesterId: z.string().uuid().optional(), rescuerId: z.string().uuid().optional(),
  rescuerVisibleToRequester: z.boolean(), requesterVisibleToRescuer: z.boolean(),
  adminVisibleToRequester: z.boolean(), adminVisibleToRescuer: z.boolean()
});
export type MissionLocationPolicy = Omit<z.infer<typeof missionLocationPolicySchema>, "requesterId" | "rescuerId">;
export async function getMissionLocationPolicy(token: string, id: string): Promise<MissionLocationPolicy> {
  return missionLocationPolicySchema.parse(await requestJson<unknown>(
    `/_user/missions/${encodeURIComponent(missionSchema.shape.id.parse(id))}/location-policy`,
    { accessToken: token, cache: "no-store" }));
}
export async function putMissionLocationPolicy(token: string, id: string, policy: MissionLocationPolicy): Promise<MissionLocationPolicy> {
  return missionLocationPolicySchema.parse(await requestJson<unknown>(
    `/_user/missions/${encodeURIComponent(missionSchema.shape.id.parse(id))}/location-policy`,
    { method: "PUT", body: policy, accessToken: token, cache: "no-store" }));
}

const missionTracePointSchema = z.strictObject({
  role: z.enum(["requester", "rescuer", "admin"]), lat: z.number().finite().min(-90).max(90),
  lon: z.number().finite().min(-180).max(180),
  accuracy: z.number().finite().nonnegative().nullable(), observedAt: z.iso.datetime({ offset: true })
});
const suggestedRouteSchema = z.strictObject({
  profile: z.enum(["car", "bicycle", "foot"]), polyline: z.string().min(1).max(200_000),
  distanceM: z.number().finite().nonnegative(), selectedAt: z.iso.datetime({ offset: true })
});
const tracePageSchema = z.strictObject({
  points: z.array(missionTracePointSchema).max(1000), nextCursor: z.number().int().positive().nullable(),
  suggestedRoute: suggestedRouteSchema.nullable()
});
export type MissionTracePoint = z.infer<typeof missionTracePointSchema>;
export type MissionTrace = { points: MissionTracePoint[]; suggestedRoute: z.infer<typeof suggestedRouteSchema> | null;
  incomplete: boolean };

/** Page by durable insert ID; never silently treat a capped or failed history as a full GPS trace. */
export const MISSION_TRACE_DEADLINE_MS = 45_000;

export async function getMissionLocationTrace(token: string, id: string, signal?: AbortSignal): Promise<MissionTrace> {
  if (signal?.aborted) throw new DOMException("Mission trace cancelled", "AbortError");
  const path = `/_user/missions/${encodeURIComponent(missionSchema.shape.id.parse(id))}/location-trace`;
  const request = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (error: Error) => void = () => undefined;
  const onAbort = () => {
    cancel(new DOMException("Mission trace cancelled", "AbortError"));
    request.abort();
  };
  const deadline = new Promise<never>((_resolve, reject) => {
    cancel = reject;
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      reject(new Error("MISSION_TRACE_UNAVAILABLE"));
      request.abort();
    }, MISSION_TRACE_DEADLINE_MS);
  });
  try {
    // A service worker can ignore abort while connecting or reading a body.
    // Race the entire sequence, not just each page's initial fetch.
    return await Promise.race([loadTracePages(path, token, request.signal), deadline]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

async function loadTracePages(path: string, token: string, signal: AbortSignal): Promise<MissionTrace> {
  const points: MissionTracePoint[] = [];
  let cursor: number | null = null;
  let suggestedRoute: MissionTrace["suggestedRoute"] = null;
  for (let page = 0; page < 20; page++) {
    if (signal.aborted) throw new DOMException("Mission trace cancelled", "AbortError");
    const result = tracePageSchema.parse(await requestJson<unknown>(
      `${path}${cursor ? `?cursor=${cursor}` : ""}`, { accessToken: token, cache: "no-store", signal }));
    // A late response from a transport that ignored abort must not start more
    // pages for a mission panel that has already timed out or been closed.
    if (signal.aborted) throw new DOMException("Mission trace cancelled", "AbortError");
    points.push(...result.points);
    suggestedRoute = result.suggestedRoute;
    if (!result.nextCursor) return { points, suggestedRoute, incomplete: false };
    // The server pages by monotonically increasing durable insert ID. A
    // backwards cursor can replay old GPS pages and fabricate a complete trace.
    if (result.nextCursor <= (cursor ?? 0) || result.points.length === 0) throw new Error("INVALID_MISSION_TRACE_CURSOR");
    cursor = result.nextCursor;
  }
  return { points, suggestedRoute, incomplete: true };
}

/** Snapshot the route preview selected by the assigned rescuer when guidance starts. */
export async function saveSuggestedMissionRoute(token: string, id: string, route: {
  polyline: string; profile: "car" | "bicycle" | "foot"; distanceM: number
}): Promise<void> {
  await requestJson<unknown>(`/_user/missions/${encodeURIComponent(missionSchema.shape.id.parse(id))}/suggested-route`, {
    method: "POST", accessToken: token, body: route
  });
}
