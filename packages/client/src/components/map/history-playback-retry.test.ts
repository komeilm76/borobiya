import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contract only: docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const panel = readFileSync(new URL("./HistoryPlaybackPanel.vue", import.meta.url), "utf8");

describe("history track recovery", () => {
  it("offers a reachable retry of the same range or grant after a request failure", () => {
    expect(panel).toContain('v-if="api.loadIssue.value === \'request_failed\' && !api.loading.value"');
    expect(panel).toContain('class="history-playback__retry"');
    expect(panel).toContain('@click="api.load()"');
    expect(panel).toContain(".history-playback__retry { min-height: 44px;");
  });
});
