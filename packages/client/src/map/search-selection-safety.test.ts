import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileTemplate, parse } from "vue/compiler-sfc";

// Source-pinned, never mount Vue SFCs (docs/TASKS.md).
const view = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");
const route = readFileSync(new URL("../composables/use-point-route.ts", import.meta.url), "utf8");
const select = view.slice(view.indexOf('function selectPlace(place: GeocodeResult'), view.indexOf('const playbackStyle ='));
const marker = view.slice(view.indexOf('function syncSelectedPlaceMarker(): void'), view.indexOf('watch(() => isSelectedSearchDestination.value'));

describe("safe search result selection on the shared map", () => {
  it("does not clear active navigation or start a personal trip before mission verification", () => {
    expect(route).toContain('clear(); point.value = { ...candidate }; sheetOpen.value = true;');
    expect(select).toContain('auth.user?.role === "user" && !missionShare.verified');
    expect(select).toContain('journey.navigating.value || journey.navigationPending.value');
    expect(select.indexOf('if (!missionActive.value && mode.value !== "missions" && auth.user?.role === "user" && !missionShare.verified)'))
      .toBeLessThan(select.indexOf('if (!placeSearch.select(place)) return;'));
    expect(select.indexOf('journey.navigating.value || journey.navigationPending.value'))
      .toBeLessThan(select.indexOf('instance.flyTo('));
    expect(select.indexOf('journey.navigating.value || journey.navigationPending.value'))
      .toBeLessThan(select.indexOf('journey.select({ lat: place.lat, lon: place.lon }, place)'));
    expect(view).toContain('v-dialog :model-value="!!blockedSearchReason"');
    expect(view).toContain('سفر فعلی فعال است.');
    expect(view).toContain('وضعیت مأموریت هنوز از سرور تأیید نشده است.');
    expect(view).toContain('blockedSearchReason.value = null;'); // Account/assignment change invalidates the dialog.
    const hold = view.slice(view.indexOf('function attachHold('), view.indexOf('const pointer = (event: PointerEvent)', view.indexOf('function attachHold(')));
    expect(hold).toContain('mode.value !== "trips" ||');
    expect(hold).toContain('(auth.user.role === "user" && !missionShare.verified) ||');
    expect(hold.indexOf('!missionShare.verified')).toBeLessThan(hold.indexOf('journey.select({ lat: location.lat, lon: location.lng })'));
  });

  it("keeps the Trips tab open for an unverified mission without starting an unsafe route", () => {
    expect(view).toContain('auth.user?.role !== "user" || missionShare.verified');
    expect(view).toContain('mapTripSession.navigating.value, missionActive.value,');
    expect(view).toContain('مرور آزاد است، ایجاد مسیر پس از تأیید وضعیت مأموریت');
    expect(select).toContain('blockedSearchReason.value = "وضعیت مأموریت هنوز از سرور تأیید نشده است.');
    expect(select).toContain('if (!placeSearch.select(place)) return;');
  });

  it("does not advertise an unavailable stop or trip planner on idle Missions pins", () => {
    expect(marker).toContain('const station = !!missionShare.mission;');
    expect(marker).toContain('const exploring = mode.value === "missions" && !missionActive.value;');
    expect(marker).toContain('exploring || blockedTrip ? null : "map-point-route-sheet"');
    expect(marker).toContain('element.removeAttribute("aria-controls");');
    expect(marker).toContain('"نمایش مکان روی نقشه"');
    expect(view).toContain('watch([() => missionShare.verified, () => journey.navigating.value, () => journey.navigationPending.value],');
    expect(compileTemplate({ source: parse(view).descriptor.template!.content,
      filename: "UserMapView.vue", id: "search-selection-safety" }).errors).toEqual([]);
  });
});
