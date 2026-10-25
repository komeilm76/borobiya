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
  waypoints: z.array(z.unknown())
});
export type RouteChoice = z.infer<typeof routeSchema>;

/** Incident point is authorized by the API using the active rescuer's mission ID, not a public SOS lookup. */
export async function getMissionNavigationTarget(token: string, missionId: string, signal?: AbortSignal): Promise<MissionNavigationTarget> {
  const path = apiRoutes.sos.getMissionNavigationTarget.url.replace(":id", encodeURIComponent(missionId));
  return missionNavigationTargetSchema.parse(await requestJson<unknown>(path, { accessToken: token, signal }));
}

/** Same-origin offline OSRM adapter; never send incident or rescuer coordinates to a third-party origin. */
export async function getMissionRouteChoices(
  from: { lat: number; lon: number }, to: { lat: number; lon: number }, profile: TransportProfile,
  signal?: AbortSignal
): Promise<RouteChoice[]> {
  const request = { from: coordinatesSchema.parse(from), to: coordinatesSchema.parse(to),
    profile: profileSchema.parse(profile), alternatives: 2 };
  const response = await fetch("/route", {
    method: "POST", headers: { "content-type": "application/json", accept: "application/json" },
    credentials: "same-origin", body: JSON.stringify(request), signal
  });
  if (!response.ok) {
    if (response.status === 422) throw new Error("NO_ROUTE");
    throw new Error("ROUTING_UNAVAILABLE");
  }
  const parsed = routesResponseSchema.parse(await response.json());
  if (parsed.profile !== profile) throw new Error("ROUTING_UNAVAILABLE");
  // OSRM may return just one viable route, even when alternatives=2 was requested.
  return parsed.routes.slice(0, 3);
}
