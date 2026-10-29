import { readFileSync } from "node:fs";
import { computed, ref, shallowRef, watch } from "vue";
import { describe, expect, it, vi } from "vitest";
import { planMissionMarkerSync, type MissionMarkerSnapshot } from "./live-marker-sync";

const panel = readFileSync(new URL("../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");
const status = (role: "requester" | "rescuer" | "admin", lat: number | null, fresh = true) => ({
  role, entry: lat === null ? null : { lat, lon: 51.4 }, fresh
});

describe("mission map marker work is proportional to visible changes", () => {
  it("does not rebuild unchanged peers, but moves fixes and replaces only a marker whose stale scale changes", () => {
    const previous: Partial<Record<"requester" | "rescuer" | "admin", MissionMarkerSnapshot>> = {
      requester: { lat: 35.7, lon: 51.4, fresh: true },
      rescuer: { lat: 35.8, lon: 51.4, fresh: true }
    };
    const same = [status("requester", 35.7), status("rescuer", 35.8), status("admin", null)];
    expect(planMissionMarkerSync(previous, same)).toEqual([]);
    expect(planMissionMarkerSync(previous, [status("requester", 35.71), ...same.slice(1)]))
      .toEqual([{ role: "requester", kind: "move", next: { lat: 35.71, lon: 51.4, fresh: true } }]);
    expect(planMissionMarkerSync(previous, [same[0]!, status("rescuer", 35.8, false), same[2]!]))
      .toEqual([{ role: "rescuer", kind: "replace", next: { lat: 35.8, lon: 51.4, fresh: false } }]);
    expect(planMissionMarkerSync(previous, [same[0]!, status("rescuer", null), status("admin", 35.9)]))
      .toEqual([{ role: "rescuer", kind: "remove" },
        { role: "admin", kind: "replace", next: { lat: 35.9, lon: 51.4, fresh: true } }]);
    expect(planMissionMarkerSync(previous, [status("requester", null), status("rescuer", null), status("admin", null)]))
      .toEqual([{ role: "requester", kind: "remove" }, { role: "rescuer", kind: "remove" }]);
    expect(planMissionMarkerSync(previous, [])).toEqual([
      { role: "requester", kind: "remove" }, { role: "rescuer", kind: "remove" }
    ]);
  });

  it("does not trigger a marker rebuild on one-second clock-only ticks, but clears synchronously on logout", () => {
    const now = ref(0);
    const locations = shallowRef<{ requester?: { lat: number; lon: number } }>({ requester: { lat: 35.7, lon: 51.4 } });
    const freshness = computed(() => [Boolean(locations.value.requester && now.value < 30_000)]);
    const sync = vi.fn();
    watch([() => locations.value, () => freshness.value.join(",")], sync, { flush: "sync" });
    now.value = 1000;
    expect(sync).not.toHaveBeenCalled();
    now.value = 31_000;
    expect(sync).toHaveBeenCalledTimes(1);
    locations.value = {};
    expect(sync).toHaveBeenCalledTimes(2); // no Vue nextTick/private marker leak
    expect(panel).toContain('planMissionMarkerSync(paintedMarkers, live.participantStatus.value)');
    expect(panel).toContain('() => live.participantStatus.value.map((member) => member.fresh).join(",")');
    expect(panel).toContain('{ flush: "sync" }');
    expect(panel).not.toContain('watch(() => [live.locations.value, ...live.participantStatus.value.map((member) => member.fresh)], syncMarkers)');
  });
});
