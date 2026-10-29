import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";
import { historyPanelInitiallyOpen, playbackSpeedLabel } from "./playback-panel";

const panel = readFileSync(new URL("../components/map/HistoryPlaybackPanel.vue", import.meta.url), "utf8");

describe("history panel entry state", () => {
  it("starts compact on a phone and open on a larger map", () => {
    expect(historyPanelInitiallyOpen(true, undefined)).toBe(false);
    expect(historyPanelInitiallyOpen(true, "  ")).toBe(false);
    expect(historyPanelInitiallyOpen(false, undefined)).toBe(true);
  });

  it("opens a shared-history deep link even on a narrow screen", () => {
    expect(historyPanelInitiallyOpen(true, "a-share-id")).toBe(true);
    expect(historyPanelInitiallyOpen(true, ["a-share-id", "another"])).toBe(true);
    expect(historyPanelInitiallyOpen(true, [null])).toBe(false);
  });

  it("formats speed labels in Persian without changing the numeric playback rates", () => {
    expect([1, 4, 16, 60].map(playbackSpeedLabel)).toEqual(["۱×", "۴×", "۱۶×", "۶۰×"]);
    expect(panel).toContain("label: playbackSpeedLabel(value)");
    expect(panel).toContain("const speedOptions = PLAYBACK_SPEEDS.map((value) => ({ value,");
  });

  it("does not offer stale-track controls during a pending range or grant read", () => {
    const quickPlay = panel.match(/<v-btn\s+v-if="[^"]+"\s+class="history-playback__quick-play"/)?.[0];
    expect(quickPlay).toContain("!api.loading.value");
    const transport = panel.split('class="history-playback__transport" role="group" aria-label="کنترل پخش"')[1]!
      .split("</div>")[0]!;
    expect(transport.match(/:disabled="!api.canPlay.value \|\| api.loading.value"/g)).toHaveLength(4);
    const slider = panel.match(/<v-slider[\s\S]*?\/>/)?.[0];
    expect(slider).toContain(':disabled="!api.canPlay.value || api.loading.value"');
  });

  it("owns the return-to-track action beside playback controls, not under place search", () => {
    const view = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");
    expect(view).toContain(':show-return-to-track="userControlledCamera && playback.frames.value.length > 0"');
    expect(view).toContain('@return-to-track="showTrack"');
    const searchArea = view.split('<aside class="user-map-view__search">')[1]?.split("</aside>")[0];
    expect(searchArea).not.toContain("بازگشت به مسیر");
    expect(panel).toContain("'history-playback--away': showReturnToTrack");
    expect(panel).toContain('v-if="showReturnToTrack"');
    expect(panel).toContain('class="history-playback__return"');
    expect(panel).toContain('prepend-icon="mdi-map-marker-path"');
    expect(panel).toContain('@click="emit(\'return-to-track\')"');
    expect(panel).toContain('بازگشت به مسیر');
    const { descriptor } = parse(panel);
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "HistoryPlaybackPanel.vue", id: "data-v-test", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toMatch(/\.history-playback--away \.history-playback__header\[data-v-test\]/);
    expect(css.code).toMatch(/\.history-playback__return\[data-v-test\]:focus-visible/);
  });

  it("keeps the playback actions while giving the compact panel a readable status and host-aware layout", () => {
    expect(panel).toContain('class="history-playback__indicator"');
    expect(panel).toContain('class="history-playback__actions"');
    expect(panel).toContain("api.playing.value ? 'توقف' : 'پخش'");
    expect(panel).toContain('class="history-playback__transport" role="group" aria-label="کنترل پخش"');
    expect(panel).toContain('aria-label="جابه‌جایی در مسیر"');
    expect(panel).toContain('aria-label="سرعت پخش"');
    expect(panel).toContain('role="status" aria-live="polite">{{ statusLine }}');
    expect(panel).toMatch(/\.history-playback \{[^}]*container-type: inline-size;/);
    expect(panel).toMatch(/\.history-playback__preview \{[^}]*white-space: normal;/);
    expect(panel).toMatch(/@container \(max-width: 320px\) \{[\s\S]*?\.history-playback__actions \{[^}]*grid-column: 1 \/ -1;/);
    expect(panel).toMatch(/\.history-playback__transport \{[^}]*flex-wrap: wrap;/);
    expect(panel).toMatch(/\.history-playback__fields \{[^}]*flex-wrap: wrap;/);
    expect(panel).toMatch(/\.history-playback__field \{[^}]*min-width: min\(10rem, 100%\);/);
  });

  it("keeps the distinct history controls wired to the same playback API", () => {
    for (const action of [
      '@update:model-value="chooseSource"', '@update:model-value="chooseGrant"',
      '@click="api.selectPreset(preset.days)"', '@click="applyManualRange"',
      '@click="api.stepPrevious()"', '@click="api.stepNext()"',
      '@update:model-value="chooseSpeed"', '@update:model-value="scrub"'
    ]) expect(panel).toContain(action);
    expect(panel.match(/@click="api\.toggle\(\)"/g)).toHaveLength(2);
    expect(panel).toContain(':disabled="!api.canPlay.value || api.loading.value"');
  });

  it("compiles the dark sticky header and narrow-card actions as reachable CSS", () => {
    const { descriptor } = parse(panel);
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "HistoryPlaybackPanel.vue", id: "data-v-test", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toMatch(/@container \(max-width: 320px\)[\s\S]*?\.history-playback__actions\[data-v-test\]/);
    expect(css.code).toContain(":root.dark .history-playback__header");
  });

  it("renders a compact narrow-screen preview with accessible controls and a bounded expansion", () => {
    expect(panel).toContain('window.matchMedia("(max-width: 1023px)").matches');
    expect(panel).toContain("historyPanelInitiallyOpen(isNarrow, route.query.historyShare)");
    expect(panel).toContain('v-else class="history-playback__preview" role="status"');
    expect(panel).toContain('aria-controls="history-playback-controls"');
    expect(panel).toContain('id="history-playback-controls" v-show="isOpen"');
    expect(panel).toContain('class="history-playback__quick-play"');
    expect(panel).toContain("isOpen.value = true;\n      props.api.selectSource(\"grant\")");
    expect(panel).toMatch(/@media \(max-width: 1023px\)[\s\S]*?max-height: min\(56dvh, 26rem\);/);
    expect(panel).toContain(".history-playback:not(.history-playback--open) {");
  });
});
