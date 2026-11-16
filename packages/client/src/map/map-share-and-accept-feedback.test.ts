import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";
import { shareCreatedMessage } from "@/sharing/share-feedback";
import { workspaceTabQuery } from "./workspace-tab-query";

// Source-compiled wiring only, never mount Vue SFCs in unit tests (docs/TASKS.md).
const map = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/shell/MapProposalSidebar.vue", import.meta.url), "utf8");
const offers = readFileSync(new URL("../components/shell/ProposalInboxContent.vue", import.meta.url), "utf8");

describe("map share success and mission acceptance", () => {
  it("names the confirmed share type and distinguishes new from renewed grants", () => {
    expect(shareCreatedMessage({ mode: "history", created: 1, reused: 0 })).toContain("تاریخچهٔ مسیر");
    expect(shareCreatedMessage({ mode: "timed", created: 1, reused: 0 })).toContain("موقعیت زنده");
    expect(shareCreatedMessage({ mode: "permanent", created: 0, reused: 1 })).toContain("تمدید شد");
    expect(shareCreatedMessage({ mode: "history", created: 2, reused: 1 })).toContain("ثبت و تمدید شد");
  });

  it("closes both share layers on a fenced server success, then visibly announces it on the map", () => {
    for (const operation of ["createLocationHistoryShare(historyBody, token)", "createLocationShare(body, token)"]) {
      const success = dialog.slice(dialog.indexOf(`await ${operation}`), dialog.indexOf('emit("shared",', dialog.indexOf(`await ${operation}`)));
      expect(success).toContain('if (!submissionFence.isCurrent(submission)) return;');
    }
    expect(dialog.match(/emit\("shared", \{ mode: current\.mode, created: createdCount\.value, reused: reusedCount\.value \}\);/g)).toHaveLength(2);
    expect(map).toContain('if (!shareOpen.value) return;');
    expect(map).toContain('shareOpen.value = false;');
    expect(map).toContain('if (isPhone.value && activeTool.value === "live") closeTool(false);');
    expect(map).toContain('shareSuccess.value = shareCreatedMessage(result);');
    expect(map).toContain('v-if="shareSuccess && !shareOpen" id="map-share-success"');
    expect(map).toContain('role="status" aria-live="polite" tabindex="-1" closable');
    expect(map).toContain('document.getElementById("map-share-success")?.focus({ preventScroll: true });');
    expect(map).toContain('watch(() => auth.user?.id, () => { shareSuccess.value = null; });');
    const descriptor = parse(map).descriptor;
    expect(compileTemplate({ filename: "UserMapView.vue", id: "share-success", source: descriptor.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "UserMapView.vue", id: "share-success", scoped: true, source: descriptor.styles[0]!.content }).errors).toEqual([]);
    expect(descriptor.styles[0]!.content).toContain('.user-map-view__share-success { position: fixed; z-index: 15;');
  });

  it("moves to Missions only on new, confirmed acceptance, consuming one-time offer intents", () => {
    expect(offers).toContain('if (action === "accept" && !mapTripSession.endForMission())');
    expect(offers).toContain('const success = await inbox.decide(id, action');
    expect(map).toContain('watch(() => proposals.acceptedMissionId, (id, previous) => {');
    expect(map).toContain('if (!id || id === previous || auth.user?.role !== "user" || route.path !== "/_user/map") return;');
    expect(map).toContain('void router.replace({ path: "/_user/map", query: workspaceTabQuery(route.query, "missions") });');
    expect(sidebar).toContain('watch(() => props.inbox.acceptedMissionId, (id, previous) => {');
    expect(sidebar).toContain('detailsOpen.value = false;');
    expect(workspaceTabQuery({ tab: "trips", offer: "offer-1", inbox: "1" }, "missions"))
      .toEqual({ tab: "missions" });
  });
});
