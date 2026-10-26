import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { historyPanelInitiallyOpen } from "./playback-panel";

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
