import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("../../components/mission/MissionMapCards.vue", import.meta.url), "utf8");

describe("mission status actions at narrow/zoomed widths (source-pinned)", () => {
  it("bounds the manual next-step action and wraps its label without changing its handler", () => {
    expect(view).toMatch(/<div v-if="desk.nextStatus.value && !desk.terminalHold.value" class="mission-desk__next-step"[\s\S]*?@click="desk.advanceStatus\(\)"/);
    expect(view).toContain('.mission-desk__next-step :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; white-space: normal; }');
    expect(view).toContain('.mission-desk__next-step :deep(.v-btn__content) { white-space: normal; text-align: center; }');
  });
});
