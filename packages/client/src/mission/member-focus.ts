import type { MissionMarkerStatus } from "./live-marker-sync";

/** Map focus may only use fresh private mission fixes, never last-known/stale coordinates. */
export function freshMissionMemberCamera(members: readonly MissionMarkerStatus[], role: MissionMarkerStatus["role"]):
  [number, number] | null {
  const member = members.find((item) => item.role === role);
  return member?.fresh && member.entry ? [member.entry.lon, member.entry.lat] : null;
}
