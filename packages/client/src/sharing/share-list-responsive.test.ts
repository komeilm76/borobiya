import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The repo intentionally tests SFC markup rather than mounting Vue components in unit tests.
const source = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");

describe("share revocation confirmation on short and narrow viewports (T4.4.1 partial)", () => {
  it("keeps a long recipient name scrollable and both privacy actions reachable", () => {
    const dialog = source.split('<v-dialog v-model="confirmOpen"')[1]?.split("</v-dialog>")[0];
    expect(dialog).toBeDefined();
    expect(source).toContain('<v-dialog v-model="confirmOpen" max-width="420" scrollable aria-labelledby="share-revoke-title">');
    expect(dialog).toContain('<v-card-text class="share-lists__confirm-body">');
    expect(dialog).toContain('<v-card-actions class="share-lists__confirm-actions">');
    expect(dialog).toContain(':disabled="revoking" @click="confirmOpen = false"');
    expect(dialog).toContain(':loading="revoking" @click="confirmRevoke"');
    expect(source).toContain('.share-lists__confirm-body { min-height: 0; overflow-y: auto; }');
    expect(source).toMatch(/\.share-lists__confirm \{[^}]*overflow-wrap: anywhere;/);
    const phone = source.split('@media (max-width: 599px) {')[1];
    expect(phone).toBeDefined();
    expect(phone).toContain('.share-lists__confirm-actions { flex-direction: column; align-items: stretch; gap: 0.5rem; }');
    expect(phone).toContain('.share-lists__confirm-actions :deep(.v-spacer) { display: none; }');
    expect(phone).toContain('.share-lists__confirm-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }');
    expect(phone).toContain('.share-lists__confirm-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }');
  });
});
