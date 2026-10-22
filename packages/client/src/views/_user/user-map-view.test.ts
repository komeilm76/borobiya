import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The view's wiring rules, pinned by reading the component source.
 *
 * This workspace does not mount Vue components in tests (no jsdom, no `@vue/test-utils`) and cannot run
 * maplibre at all, so the ordering decisions that only exist inside a `.vue` file would otherwise be
 * unprotected. They are worth pinning because they are exactly the kind a later edit breaks quietly: a
 * swapped paint order leaves the history line on top of the live markers, and a camera call added to a
 * peer watcher makes the map lurch every few seconds.
 */
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");

function body(name: string): string {
  const start = view.indexOf(`function ${name}(`);
  expect(start, `UserMapView.vue should define ${name}`).toBeGreaterThan(-1);
  const next = view.indexOf("\nfunction ", start + 1);
  return view.slice(start, next === -1 ? view.length : next);
}

describe("UserMapView live overlay", () => {
  it("paints the live markers before playback, so the layer playback sits under exists", () => {
    const ready = body("onMapReady");
    expect(ready.indexOf("paintLive()")).toBeLessThan(ready.indexOf("paintPlayback()"));
  });

  it("names the live layer as playback's `beforeId` only when maplibre can find it", () => {
    const state = body("playbackMapState");
    expect(state).toContain("getLayer(LIVE_BOTTOM_LAYER_ID)");
    expect(state).toContain("beforeLayerId: LIVE_BOTTOM_LAYER_ID");
  });

  it("keeps every live paint on the shared planner instead of calling maplibre directly", () => {
    expect(body("paintLive")).toContain("planOverlaySync");
    expect(body("paintLive")).not.toMatch(/instance\.(addLayer|addSource|setData)/);
  });

  it("removes both overlays on teardown, so leaving the map leaves nothing behind", () => {
    const teardown = view.slice(view.indexOf("onBeforeUnmount("));
    expect(teardown).toContain("planPlaybackRemoval");
    expect(teardown).toContain("planOverlayRemoval");
  });

  it("never moves the camera for a peer, only for a loaded track", () => {
    expect(view.match(/instance\.(fitBounds|easeTo)\(/g)).toHaveLength(2);
    expect(body("frameCamera")).toContain("fitBounds");
    expect(body("paintLive")).not.toMatch(/fitBounds|easeTo/);
  });

  it("renders the live panel and no longer claims that live positions are missing", () => {
    expect(view).toContain('<LiveCompanionPanel :api="live" />');
    expect(view).not.toContain("هنوز روی این نقشه نمی‌آید");
  });

  it("passes its own id to the composable, because the server echoes our fixes back to us", () => {
    expect(view).toMatch(/ownUserId: computed\(\(\) => auth\.user\?\.id \?\? null\)/);
  });
});

describe("LiveCompanionPanel", () => {
  it("renders and dispatches only — the sentences come from the pure module", () => {
    // If the component could invent an empty state, "nobody shared with you" and "our read failed" would
    // become the same sentence again, which is the bug this phase keeps re-fixing.
    expect(panel).not.toContain("هنوز کسی");
    expect(panel).not.toContain("برقرار");
    expect(panel).toContain("connectionTitle(api.connected.value)");
    expect(panel).toContain("api.status.value.line");
    expect(panel).toContain("ageWords(peer.ageMs)");
  });

  it("announces itself politely instead of at every update", () => {
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
  });

  it("offers the retry the status line promises", () => {
    expect(panel).toContain('v-if="api.readFailed.value"');
    expect(panel).toContain("api.refresh()");
    expect(panel).toContain("تازه‌سازی فهرست");
  });

  it("paints its legend dot from the map's own colors", () => {
    expect(panel).toContain("liveMarkerColors(theme.isDark)");
    expect(panel).toContain("peer.stale ? colors.stale : colors.live");
  });

  it("touches no map or maplibre API", () => {
    expect(panel).not.toMatch(/maplibre|getLayer|fitBounds|addLayer/);
  });
});
