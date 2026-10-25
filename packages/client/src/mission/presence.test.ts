import { describe, expect, it } from "vitest";
import type { MissionPresence } from "@shared/index";
import { missionPresenceBadge, missionPresenceLabel, MISSION_DISCONNECT_GRACE_MS } from "./presence";
const now = Date.parse("2026-10-25T12:00:00Z");
const entry = (age: number, online = false): MissionPresence["rescuer"] =>
  ({ online, lastSeenAt: new Date(now - age).toISOString() });
describe("five-minute mission disconnect grace (badge only)", () => {
  it("does not equate unknown state with offline or infer presence from a GPS fix", () => {
    expect(missionPresenceBadge(null, now)).toBe("unknown");
    expect(missionPresenceBadge({ online: false, lastSeenAt: null }, now)).toBe("unknown");
    expect(missionPresenceBadge({ online: true, lastSeenAt: "invalid" }, now)).toBe("unknown");
    expect(missionPresenceBadge(entry(2_000, true), now)).toBe("online");
  });
  it("holds the grace until exactly five minutes, even when the online flag went stale", () => {
    expect(missionPresenceBadge(entry(MISSION_DISCONNECT_GRACE_MS - 1), now)).toBe("grace");
    expect(missionPresenceBadge(entry(70_001, true), now)).toBe("grace");
    expect(missionPresenceBadge(entry(MISSION_DISCONNECT_GRACE_MS), now)).toBe("offline");
    expect(missionPresenceLabel.offline).toContain("بررسی دستی");
  });
});
