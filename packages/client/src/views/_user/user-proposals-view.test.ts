import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeRecords } from "../../router";

const view = readFileSync(new URL("./UserProposalsView.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");

describe("rescuer inbox markup and route", () => {
  it("has a guarded user route reachable from the bell and navigation", () => {
    expect(routeRecords.find((item) => item.path === "/_user/proposals")?.component).toEqual(expect.any(Function));
    expect(app).toContain('to="/_user/proposals"');
    expect(app).toContain("path: '/_user/proposals'");
  });

  it("provides a focused incident map, consent-based distance and signed photo access", () => {
    expect(view).toContain("<MapCanvas");
    expect(view).toContain("@click=\"locateMe\"");
    expect(view).toContain("getSosPhotoSrc");
    expect(view).toContain('referrerpolicy="no-referrer"');
    expect(view).not.toContain(':src="selected.details.sosRequest.photoUrl"');
  });

  it("shows the accepted incident map, explicit location consent, and a two-point fitBounds camera", () => {
    expect(view).toContain('v-if="inbox.acceptedOffer?.details"');
    expect(view).toContain('aria-label="نمای مأموریت پذیرفته‌شده"');
    expect(view).toContain("missionMapCamera(incident, myPosition.value)");
    expect(view).toContain("map.fitBounds(camera.bounds");
    expect(view).toContain('v-if="!myPosition"');
    expect(view).toContain("موقعیت شما فقط با اجازهٔ دستگاه");
  });

  it("requires confirmation and discloses other offers will close when one is accepted", () => {
    expect(view).toContain('confirmAction = \'accept\'');
    expect(view).toContain("پیشنهادهای دیگر شما خودکار بسته می‌شوند");
    expect(view).toContain("inbox.decide(id, action");
    expect(view).toContain("if (success) { confirmAction.value = null; declineReason.value = \"\"; }");
    expect(view).toContain("v-textarea");
  });
});
