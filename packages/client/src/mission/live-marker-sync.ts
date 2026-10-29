import type { MissionLocationEvent } from "@shared/index";

type Role = MissionLocationEvent["role"];
export type MissionMarkerSnapshot = { lat: number; lon: number; fresh: boolean };
export type MissionMarkerStatus = { role: Role; entry: { lat: number; lon: number } | null | undefined; fresh: boolean };
export type MissionMarkerOp =
  | { role: Role; kind: "remove" }
  | { role: Role; kind: "replace" | "move"; next: MissionMarkerSnapshot };

/** Pure diff; no MapLibre import in the route chunk. A scale change requires a new
 * marker (MapLibre has no setScale), while a position change can reuse its DOM node. */
export function planMissionMarkerSync(
  previous: Partial<Record<Role, MissionMarkerSnapshot>>, statuses: readonly MissionMarkerStatus[]
): MissionMarkerOp[] {
  const ops: MissionMarkerOp[] = [];
  const seen = new Set<Role>();
  for (const { role, entry, fresh } of statuses) {
    seen.add(role);
    const old = previous[role];
    if (!entry) {
      if (old) ops.push({ role, kind: "remove" });
      continue;
    }
    const next = { lat: entry.lat, lon: entry.lon, fresh };
    if (!old || old.fresh !== fresh) ops.push({ role, kind: "replace", next });
    else if (old.lat !== next.lat || old.lon !== next.lon) ops.push({ role, kind: "move", next });
  }
  // A future caller may omit a role entirely (e.g. after an account boundary).
  // The marker must never survive just because it is absent from the new snapshot.
  for (const role of ["requester", "rescuer", "admin"] as const) {
    if (previous[role] && !seen.has(role)) ops.push({ role, kind: "remove" });
  }
  return ops;
}
