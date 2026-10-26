import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { shareSectionPresentation } from "./share-list-presentation";

const source = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");

describe("privacy-sensitive share list feedback", () => {
  it("never describes an unread or failed empty list as proof nobody has access", () => {
    expect(shareSectionPresentation(true, false, 0)).toBe("loading");
    expect(shareSectionPresentation(false, false, 0)).toBe("unavailable");
    expect(shareSectionPresentation(false, true, 0)).toBe("empty");
    expect(shareSectionPresentation(true, true, 0)).toBe("loading");
  });

  it("keeps known rows on screen even when a subsequent refresh fails", () => {
    expect(shareSectionPresentation(true, false, 2)).toBe("rows");
    expect(shareSectionPresentation(false, false, 2)).toBe("rows");
  });

  it("removes a confirmed revocation locally before a potentially failed re-read", () => {
    // Never remove before server acknowledgment: a failed privacy write must not look successful.
    expect(source).toMatch(/await revokeLocationShare\(row\.id, token\);\s*owned\.value = owned\.value\.filter/);
    expect(source).toMatch(/await revokeLocationHistoryShare\(row\.id, token\);\s*ownedHistory\.value = ownedHistory\.value\.filter/);
    expect(source).toContain("liveFresh.value = false;");
    expect(source).toContain("historyFresh.value = false;");
    expect(source).toContain("await refresh();");
  });

  it("shows an initial skeleton, then gates each empty message on its own source's last read", () => {
    expect(source).toContain("const loading = ref(true)");
    expect(source).toContain('role="status" aria-live="polite"');
    expect(source).toContain('v-skeleton-loader type="list-item@3"');
    expect(source).toContain("shareSectionPresentation(loading.value, liveFresh.value, ownedRows.value.length)");
    expect(source).toContain("shareSectionPresentation(loading.value, liveFresh.value && historyFresh.value,");
    expect(source).toContain("ownState === 'empty'");
    expect(source).toContain("ownState === 'unavailable'");
    expect(source).toContain('v-chip v-if="liveFresh && !loading"');
    expect(source).toContain('v-chip v-if="liveFresh && historyFresh && !loading"');
    expect(source).toContain('v-chip v-if="historyFresh && !loading"');
    expect(source).toContain("receivedState === 'empty'");
    expect(source).toContain("receivedState === 'unavailable'");
    expect(source).toContain("history.status === \"rejected\"");
    expect(source).toContain("live.status === \"rejected\"");
    expect(source).toContain("if (version !== readVersion) return;");
    expect(source).toContain("if (version === readVersion)");
    const noSession = source.match(/if \(!token\) \{([\s\S]*?)return;\s*\}/)?.[1];
    for (const rows of ["owned", "received", "ownedHistory", "receivedHistory"]) {
      expect(noSession).toContain(`${rows}.value = [];`);
    }
  });
});
