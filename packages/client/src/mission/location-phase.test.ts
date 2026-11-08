import { computed, ref, watch } from "vue";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { missionLocationAnnouncement } from "./location-phase";

describe("mission location announcements", () => {
  it("does not announce another timestamp when a member's freshness state is unchanged", () => {
    const members = ref<Array<{
      role: "requester" | "rescuer" | "admin";
      entry: { timestamp: string } | null;
      fresh: boolean;
    }>>([
      { role: "requester", entry: { timestamp: "2026-10-23T10:00:00Z" }, fresh: true },
      { role: "rescuer", entry: null, fresh: false },
      { role: "admin", entry: null, fresh: false }
    ]);
    const announcement = computed(() => missionLocationAnnouncement(members.value));
    const heard: string[] = [];
    const stop = watch(announcement, (value) => heard.push(value), { flush: "sync" });
    try {
      expect(announcement.value).toContain("درخواست‌کننده، موقعیت تازه");
      expect(announcement.value).toContain("امدادگر، اشتراک آغاز نشده");
      expect(announcement.value).toContain("تازگی موقعیت");
      members.value = [
        { role: "requester", entry: { timestamp: "2026-10-23T10:00:01Z" }, fresh: true },
        ...members.value.slice(1)
      ];
      expect(heard).toEqual([]); // GPS ticks still update the visible last-seen time
      members.value = members.value.map((member) => member.role === "requester" ? { ...member, fresh: false } : member);
      expect(heard).toHaveLength(1);
      expect(heard[0]).toContain("درخواست‌کننده، موقعیت قدیمی");
      members.value = members.value.map((member) => member.role === "requester" ? { ...member, entry: null } : member);
      expect(heard).toHaveLength(2);
      expect(heard[1]).toContain("درخواست‌کننده، اشتراک آغاز نشده");
    } finally { stop(); }
  });

  it("keeps the frequently changing member details outside the live region", () => {
    const panel = readFileSync(new URL("../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");
    expect(panel).not.toContain('class="live-panel__members" aria-live="polite"');
    expect(panel).toContain('role="status" aria-live="polite" aria-atomic="true">{{ locationAnnouncement }}');
    expect(panel).toContain("missionLocationAnnouncement(live.participantStatus.value)");
    expect(panel).toContain("آخرین مشاهده:"); // the real timestamp remains available on demand
  });
});
