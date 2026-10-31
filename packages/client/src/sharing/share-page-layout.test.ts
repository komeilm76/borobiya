import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contracts only — docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const map = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");
const shares = readFileSync(new URL("../views/_user/UserLocationSharesView.vue", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");

describe("sharing surface by device size", () => {
  it("keeps the phone map form fullscreen without forcing desktop or tablet fullscreen", () => {
    expect(map).toContain('<ShareDialog v-model="shareOpen" :fullscreen="isPhone"');
    expect(map).toContain('const isPhone = useMediaQuery("(max-width: 599px)")');
    expect(map).not.toContain('<ShareDialog v-model="shareOpen" fullscreen');
    expect(dialog).toContain(':fullscreen="fullscreen ?? $vuetify.display.xs"');
    expect(dialog).toContain(':close-on-back="!fullscreen"');
    expect(dialog).toContain('max-width="660"');
    expect(dialog).toContain('    scrollable\n');
  });

  it("removes the standalone live-broadcast bar from shares but keeps the list, form and priority refresh", () => {
    expect(shares).not.toContain("LiveBroadcastBar");
    expect(shares).toContain('<ShareLists ref="shareLists"');
    expect(shares).toContain('<ShareDialog v-model="shareOpen"');
    expect(shares).toContain('void broadcast.refreshPriority()');
    expect(map).toContain('@click="broadcast.toggle()"');
  });
});
