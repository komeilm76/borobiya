import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Source and compiled-CSS contracts only; repo convention forbids mounting .vue in unit tests.
const sidebar = readFileSync(new URL("./MapProposalSidebar.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const map = readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8");

function styles(): string {
  const { descriptor } = parse(sidebar, { filename: "MapProposalSidebar.vue" });
  const compiled = compileStyle({
    source: descriptor.styles[0]!.content,
    filename: "MapProposalSidebar.vue",
    id: "data-v-map-proposals",
    scoped: true
  });
  expect(compiled.errors).toEqual([]);
  return compiled.code;
}

describe("map-only proposal notifications", () => {
  it("keeps the original bell on non-map pages and offers a dedicated right sidebar only to eligible users", () => {
    expect(app).toContain('<v-app-bar v-if="!isMapRoute && !isAuthRoute"');
    expect(app).toContain('<MapProposalSidebar');
    expect(app).toContain('v-if="isMapRoute && auth.isAuthenticated && auth.user?.role === \'user\' && !auth.mustCompleteSecurityQuestions"');
    expect(app).toContain(':inbox="proposalInbox"');
    expect(app).toContain('aria-label="پیشنهادهای مأموریت"'); // Original app-bar inbox stays intact.
  });

  it("shows honest loading, error, empty, stale-list and paginated proposal states", () => {
    expect(sidebar).toContain('aria-labelledby="map-proposal-title"');
    expect(sidebar).toContain('class="map-proposal__launcher"');
    expect(sidebar).toContain('class="map-proposal__bell"');
    expect(sidebar).toContain('inbox.failed');
    expect(sidebar).toContain('inbox.loading');
    expect(sidebar).toContain('inbox.proposals.length');
    expect(sidebar).toContain('inbox.totalPages > 1');
    expect(sidebar).toContain('inbox.setPage(');
    expect(sidebar).toContain('inbox.refresh()');
    expect(sidebar).toContain('role="alert"');
    expect(sidebar).toContain('aria-live="polite"');
    expect(sidebar).toContain('در حال دریافت');
    expect(sidebar).toContain('پیشنهاد جدیدی ندارید');
  });

  it("opens each suggestion in a fullscreen map dialog; never accepts or rejects from the preview", () => {
    expect(sidebar).toContain('openOffer(offer.id)');
    expect(sidebar).toContain('<ProposalInboxContent v-if="detailsOpen"');
    expect(sidebar).toContain('fullscreen');
    expect(sidebar).toContain(':persistent="Boolean(inbox.decidingId)"');
    expect(sidebar).toContain('@after-leave="restoreBellFocus"');
    expect(sidebar).toContain("proposalSeverity[offer.details?.sosRequest.severity ?? 'medium']");
    expect(sidebar).toContain('proposalTime(offer.createdAt)');
    expect(sidebar).toContain('offer.details.requesterName');
    expect(sidebar).not.toContain('inbox.decide(');
  });

  it("has a safe-area-aware 48px right launcher, one scroll region and clear map controls", () => {
    const css = styles();
    expect(css).toContain('right: calc(0.75rem + env(safe-area-inset-right, 0px))');
    expect(css).toContain('width: 48px');
    expect(css).toContain('.map-proposal__dialog.v-dialog > .v-overlay__content');
    expect(css).toContain('right: 0 !important');
    expect(css).toContain('height: 100dvh !important');
    expect(css).toContain('overflow: hidden !important');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('safe-area-inset-bottom');
    expect(css).toContain('forced-colors: active');
    expect(map).toContain('inset-block-start: calc(5rem + env(safe-area-inset-top, 0px))'); // Left search.
    expect(map).toMatch(/\.user-map-view__playback\s*\{[^}]*inset-block-start: calc\(5rem/); // Right history.
    const phone = map.split("@media (max-width: 599px) {")[1]!;
    // The compass is now below the bell in the right-hand action rail, not a top zoom strip.
    expect(phone).toMatch(/\.maplibregl-ctrl-top-right\)\s*\{[^}]*inset-inline-start: calc\(0\.75rem[^}]*inset-block-end: calc\(16rem/);
    expect(phone).toContain('.user-map-view__dock-frame');
    expect(phone).toContain('.maplibregl-ctrl-bottom-right');
  });
});
