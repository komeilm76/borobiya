import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Vue views are not mounted in unit tests; pin the wiring while decisions live in the composable. */
describe("three-role mission live UI (T3.5.7)", () => {
  it("renders the same private room panel from the rescuer desk, requester history and admin dispatch", () => {
    const views = ["../../views/_user/UserMissionView.vue", "../../views/_user/UserSosHistoryView.vue",
      "../../views/_admin/AdminDispatchView.vue"];
    for (const path of views) {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).toContain("<MissionLivePanel");
      expect(source).toContain('import MissionLivePanel from "@/components/mission/MissionLivePanel.vue"');
    }
    expect(readFileSync(new URL("../../views/_user/UserSosHistoryView.vue", import.meta.url), "utf8"))
      .toContain("listRequesterMissions(token, page, id)");
    expect(readFileSync(new URL("../../views/_admin/AdminDispatchView.vue", import.meta.url), "utf8"))
      .toContain("listActiveSosMissions(token, id, true)");
  });

  it("keeps explicit sharing consent, three markers, last-seen text and an accessible stale badge", () => {
    const panel = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
    expect(panel).toContain('aria-label="نقشهٔ موقعیت زندهٔ درخواست‌کننده، امدادگر و مدیر"');
    expect(panel).toContain("member.role === 'rescuer' ? 'امدادگر' : 'مدیر مرکز'");
    expect(panel).toContain("آخرین مشاهده:");
    expect(panel).toContain("member.online ? 'آنلاین' : 'آفلاین'");
    expect(panel).toContain("@click=\"live.startSharing()\"");
    expect(panel).toContain("@click=\"live.stopSharing()\"");
    expect(panel).toContain('aria-live="polite"');
  });
});
