import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileTemplate, parse } from "vue/compiler-sfc";

const map = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");
const offers = readFileSync(new URL("../components/shell/ProposalInboxContent.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.vue", import.meta.url), "utf8");

// Never mount Vue SFCs in unit tests (docs/TASKS.md).
describe("trip to mission acceptance guard", () => {
  it("keeps the map instance through offer and future tab query changes", () => {
    expect(app).toContain(":key=\"route.name === 'user-map' || route.name === 'admin-dispatch' ? route.path : route.fullPath\"");
    expect(compileTemplate({ filename: "App.vue", id: "map-route-key", source: parse(app).descriptor.template!.content }).errors).toEqual([]);
  });
  it("registers a synchronous trip stop, including a weak-GPS pending Start", () => {
    expect(map).toContain('const unregisterTrip = mapTripSession.register(clearPointRoute);');
    expect(map).toContain('watch([() => journey.navigating.value, () => journey.navigationPending.value]');
    expect(map).toContain('mapTripSession.update(active || pending);');
    expect(map).toContain('unregisterTrip();');
    expect(map).toContain('journey.clear(); // Also cancels any in-flight route/replan and removes both endpoint pins.');
  });
  it("requires explicit trip-ending consent and never submits the acceptance if Stop fails", () => {
    expect(offers).toContain('پایان سفر فعلی و شروع مأموریت');
    expect(offers).toContain('اگر ثبت ناموفق باشد، سفر قبلی خودکار بازنمی‌گردد.');
    const stop = offers.indexOf('if (action === "accept" && !mapTripSession.endForMission())');
    const accept = offers.indexOf('const success = await inbox.decide(id, action');
    expect(stop).toBeGreaterThan(0);
    expect(accept).toBeGreaterThan(stop);
    expect(offers).toContain('tripEndError.value = "پایان سفر تأیید نشد؛ مأموریت پذیرفته نشد. سفر را متوقف کنید و دوباره تلاش کنید.";');
    expect(compileTemplate({ filename: "ProposalInboxContent.vue", id: "trip-handoff", source: parse(offers).descriptor.template!.content }).errors).toEqual([]);
  });
});
