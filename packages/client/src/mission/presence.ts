import type { MissionPresence } from "@shared/index";

/** Badge only: 5-minute consideration is NOT a mission transition or an automatic cancellation. */
export const MISSION_DISCONNECT_GRACE_MS = 5 * 60_000;
export const PRESENCE_FRESH_MS = 70_000;
export type PresenceBadge = "online" | "grace" | "offline" | "unknown";
export function missionPresenceBadge(entry: MissionPresence["rescuer"] | null, now: number): PresenceBadge {
  if (!entry) return "unknown"; // Failed/unavailable read must not fabricate an offline participant.
  const last = entry.lastSeenAt ? Date.parse(entry.lastSeenAt) : Number.NaN;
  if (!Number.isFinite(last) || last > now + 10_000) return "unknown";
  const age = Math.max(0, now - last);
  if (entry.online && age <= PRESENCE_FRESH_MS) return "online";
  return age < MISSION_DISCONNECT_GRACE_MS ? "grace" : "offline";
}

export const missionPresenceLabel: Record<PresenceBadge, string> = {
  online: "متصل", grace: "اتصال قطع شده · مهلت ۵ دقیقه‌ای", offline: "قطع اتصال بیش از ۵ دقیقه · بررسی دستی",
  unknown: "وضعیت اتصال نامشخص"
};
