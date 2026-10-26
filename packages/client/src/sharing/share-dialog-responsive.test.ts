import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");

describe("location-share mobile dialog (source-pinned; no Vue mount)", () => {
  it("keeps the form body scrollable while the live status and actions fit a narrow fullscreen footer", () => {
    expect(source).toContain(':fullscreen="$vuetify.display.smAndDown"');
    expect(source).toContain("    scrollable\n");
    expect(source).toContain('<v-card-text class="share-dialog__body">');
    expect(source).toContain('<v-card-actions class="share-dialog__actions">');
    expect(source).toContain('<span class="share-dialog__status" role="status">{{ statusText }}</span>');
    expect(source).toContain('@click="submit"');
    const start = source.indexOf("@media (max-width: 599px) {");
    expect(start).toBeGreaterThan(-1);
    const phone = source.slice(start);
    expect(phone).toContain('.share-dialog__actions { flex-wrap: wrap; }');
    expect(phone).toContain('.share-dialog__status { flex: 1 1 100%; min-width: 0; overflow-wrap: anywhere; }');
    expect(phone).toContain('.share-dialog__actions :deep(.v-spacer) { display: none; }');
    expect(phone).toContain('.share-dialog__actions :deep(.v-btn) { flex: 1 1 100%; min-width: 0; min-height: 44px; height: auto; }');
    expect(phone).toContain('.share-dialog__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }');
  });
});
