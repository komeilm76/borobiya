import { z } from "zod";
import { apiRoutes } from "@shared/api";
import { coordinatesSchema, missionNavigationTargetSchema, type MissionNavigationTarget } from "@shared/index";
import { requestJson } from "./http";

const profileSchema = z.enum(["car", "bicycle", "foot"]);
export type TransportProfile = z.infer<typeof profileSchema>;
const elevationPointSchema = z.object({
  distance_m: z.number().finite().nonnegative(),
  elevation_m: z.number().finite()
});
export type ElevationProfilePoint = z.infer<typeof elevationPointSchema>;
const elevationProfileSchema = z.array(elevationPointSchema).min(2).max(96).superRefine((points, context) => {
  if (points[0]?.distance_m !== 0 || points.some((point, index) => index > 0 && point.distance_m < points[index - 1]!.distance_m)) {
    context.addIssue({ code: "custom", message: "Elevation distances must start at zero and follow route order." });
  }
});
const routeSchema = z.object({
  distance_m: z.number().finite().nonnegative(),
  duration_s: z.number().finite().nonnegative(),
  polyline: z.string().min(1).max(200_000),
  // Null/absent means the route crossed missing or void DEM coverage (or a gateway without DEM).
  elevation: z.object({
    gain_m: z.number().finite().nonnegative(), loss_m: z.number().finite().nonnegative(),
    start_m: z.number().finite(), end_m: z.number().finite(),
    source: z.literal("mapzen-skadi"),
    profile: elevationProfileSchema.optional() // Older gateways may return only gain/loss.
  }).nullable().optional()
});
const routesResponseSchema = z.object({
  profile: profileSchema,
  routes: z.array(routeSchema).min(1),
  waypoints: z.array(z.unknown()),
  order: z.array(z.number().int().nonnegative()).optional()
});
export type RouteChoice = z.infer<typeof routeSchema>;

/** Bounds both connecting and reading a reply, including adapters that ignore AbortSignal.
 * Caller cancellation must not wait for a transport that never settles. */
async function boundedNavigationCall<T>(read: (requestSignal: AbortSignal) => Promise<T>, signal: AbortSignal | undefined,
  deadlineMs: number, timeoutCode: string): Promise<T> {
  if (signal?.aborted) throw new DOMException("Navigation request cancelled", "AbortError");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let rejectPending: ((reason: DOMException) => void) | null = null;
  const onAbort = () => {
    controller.abort();
    rejectPending?.(new DOMException("Navigation request cancelled", "AbortError"));
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const deadline = new Promise<never>((_, reject) => {
      rejectPending = reject;
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(timeoutCode));
      }, deadlineMs);
    });
    // Handle cancellation during setup without starting even an aborted read.
    if (signal?.aborted) { onAbort(); return await deadline; }
    return await Promise.race([read(controller.signal), deadline]);
  } finally {
    if (timer !== null) clearTimeout(timer);
    rejectPending = null;
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Allow less time to fetch a scoped target than to calculate a local OSRM route. */
export const MISSION_TARGET_DEADLINE_MS = 12_000;

/** Incident point is authorized by the API using the active rescuer's mission ID, not a public SOS lookup. */
export async function getMissionNavigationTarget(token: string, missionId: string, signal?: AbortSignal): Promise<MissionNavigationTarget> {
  const path = apiRoutes.sos.getMissionNavigationTarget.url.replace(":id", encodeURIComponent(missionId));
  const target = await boundedNavigationCall(async (requestSignal) => missionNavigationTargetSchema.parse(
    await requestJson<unknown>(path, { accessToken: token, signal: requestSignal })
  ), signal, MISSION_TARGET_DEADLINE_MS, "NAVIGATION_TARGET_UNAVAILABLE");
  // A valid coordinate from another mission must never become this rescuer's destination.
  if (target.missionId !== missionId) throw new Error("NAVIGATION_TARGET_MISMATCH");
  return target;
}

export type RoutePoint = { lat: number; lon: number };

/** Keep a stalled proxy or unreadable body from holding the rescuer's route picker indefinitely. */
export const MISSION_ROUTE_DEADLINE_MS = 15_000;

/** Same-origin local routing only. Endpoints are fixed; optimization may reorder intermediate stops. */
export async function getMissionRoutePlan(
  from: RoutePoint, to: RoutePoint, profile: TransportProfile, via: RoutePoint[], optimize: boolean,
  signal?: AbortSignal
): Promise<{ routes: RouteChoice[]; order: number[] }> {
  if (via.length > 6) throw new Error("TOO_MANY_WAYPOINTS");
  if (optimize && via.length === 0) throw new Error("WAYPOINT_REQUIRED");
  const request = {
    from: coordinatesSchema.parse(from), to: coordinatesSchema.parse(to),
    profile: profileSchema.parse(profile),
    ...(via.length ? { via: via.map((point) => coordinatesSchema.parse(point)) } : {}),
    ...(optimize ? { optimize: true } : { alternatives: 2 })
  };
  const parsed = await boundedNavigationCall(async (requestSignal) => {
    const response = await fetch("/route", {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
      credentials: "same-origin", body: JSON.stringify(request), signal: requestSignal
    });
    if (!response.ok) {
      if (response.status === 422) throw new Error("NO_ROUTE");
      throw new Error("ROUTING_UNAVAILABLE");
    }
    return routesResponseSchema.parse(await response.json());
  }, signal, MISSION_ROUTE_DEADLINE_MS, "ROUTING_UNAVAILABLE");
  if (parsed.profile !== profile) throw new Error("ROUTING_UNAVAILABLE");
  const expected = Array.from({ length: via.length + 2 }, (_, index) => index);
  const order = parsed.order ?? expected;
  if ((optimize && !parsed.order) || (!optimize && parsed.order) ||
      order.length !== expected.length || order[0] !== 0 || order.at(-1) !== expected.at(-1) ||
      order.some((index) => index >= order.length) || new Set(order).size !== order.length) {
    throw new Error("ROUTING_UNAVAILABLE");
  }
  // A trip returns one route; the route service may return fewer alternatives than requested.
  return { routes: parsed.routes.slice(0, 3), order };
}

/** Backwards-compatible two-point adapter used by the existing mission route picker. */
export async function getMissionRouteChoices(
  from: RoutePoint, to: RoutePoint, profile: TransportProfile, signal?: AbortSignal
): Promise<RouteChoice[]> {
  return (await getMissionRoutePlan(from, to, profile, [], false, signal)).routes;
}
