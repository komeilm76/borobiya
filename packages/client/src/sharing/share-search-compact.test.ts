import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// This repository does not mount Vue SFCs in unit tests; pin the compact result contract instead.
const dialog = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");

describe("compact recipient search", () => {
  it("keeps verified public facts and a reachable add/remove action in one compact row", () => {
    expect(dialog).toContain('class="share-dialog__result"');
    expect(dialog).toContain('class="share-dialog__result-main"');
    expect(dialog).toContain('class="share-dialog__result-meta"');
    expect(dialog).toContain('candidate.category');
    expect(dialog).toContain('candidate.avgRating');
    expect(dialog).toContain('candidate.isOnline');
    expect(dialog).toContain('candidate.distance');
    expect(dialog).toContain('avatarInitial(candidate.username)');
    expect(dialog).toContain(':disabled="isSelf(candidate) || (recipientsFull && !isSelected(candidate))"');
    expect(dialog).toContain(':aria-pressed="isSelected(candidate)"');
    expect(dialog).toContain('min-width: 44px; min-height: 44px;');
    expect(dialog).toContain('max-width: 45rem;'); // Keep fullscreen desktop content readable.
    expect(dialog).not.toContain('<PublicProfileFacts :profile="candidate"');
    expect(dialog).not.toContain('class="share-dialog__result-distance"');
  });
});
