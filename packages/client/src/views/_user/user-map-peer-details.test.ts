import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source/compiled contracts only; never mount .vue files in tests (docs/TASKS.md).
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const sheet = readFileSync(new URL("../../components/map/CompanionDetailSheet.vue", import.meta.url), "utf8");
const live = readFileSync(new URL("../../live/companion-locations.ts", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");

function body(name: string): string {
  const start = view.indexOf(`function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const end = view.indexOf("\nfunction ", start + 1);
  return view.slice(start, end < 0 ? view.length : end);
}

describe("companion map avatar and detail sheet", () => {
  it("renders one keyboard-accessible DOM avatar per authorized positioned peer, not a second dot", () => {
    expect(view).toContain('const peerMarkers = new Map<string, Marker>()');
    expect(body("syncPeerAvatars")).toContain('live.peers.value');
    expect(body("syncPeerAvatars")).toContain('showCompanions.value');
    expect(body("syncPeerAvatars")).toContain('new markerConstructor({ element: button, anchor: "center" })');
    expect(body("syncPeerAvatars")).toContain('peerMarkers.get(peer.userId)');
    expect(body("syncPeerAvatars")).toContain('button.addEventListener("click"');
    expect(body("syncPeerAvatars")).toContain('event.stopPropagation()');
    expect(body("syncPeerAvatars")).toContain('selectCompanion(peer.userId, false)');
    expect(body("syncPeerAvatars")).toContain('avatarInitial(peer.name)');
    expect(body("syncPeerAvatars")).toContain('marker.setLngLat(peer.position)');
    expect(body("syncPeerAvatars")).toContain('marker.getLngLat()');
    expect(body("syncPeerAvatars")).toContain('marker.remove()');
    expect(view).toContain('watch(() => live.peers.value, () => { syncSelectedCompanion(); syncPeerAvatars(); }, { flush: "sync" })');
    expect(view).toContain('watch(showCompanions,');
    expect(view).toContain('for (const marker of peerMarkers.values()) marker.remove()');
    expect(live).not.toContain('LIVE_DOT_LAYER_ID');
    expect(panel).toContain('avatarInitial(member.name)');
  });

  it("opens a scrollable bottom sheet on marker or list selection and preserves the selected grant boundary", () => {
    expect(view).toContain('<CompanionDetailSheet');
    expect(view).not.toContain('selectedCompanionPopup');
    expect(view).not.toContain('maplibregl-popup');
    expect(body("selectCompanion")).toContain('live.registry.value[userId]');
    expect(body("selectCompanion")).toContain('live.peers.value.find(');
    expect(body("selectCompanion")).toContain('selectedCompanionId.value = userId');
    expect(body("selectCompanion")).toContain('if (centerMap &&');
    expect(body("selectCompanion")).toContain('instance.flyTo(');
    expect(body("syncSelectedCompanion")).toContain('removeSelectedCompanion()');
    expect(view).toContain('watch(() => live.registry.value, syncSelectedCompanion, { flush: "sync" })');
    expect(view).toContain('watch(() => auth.user?.id,');
    expect(sheet).toContain('<v-bottom-sheet');
    expect(sheet).toContain('class="companion-detail__close"');
    expect(sheet).toContain('aria-label="بستن اطلاعات همراه"');
    expect(sheet).toContain('max-height: calc(100dvh');
    expect(sheet).toContain('overflow-y: auto');
  });

  it("shows only verified public profile fields and offline reverse-place details with cancellation", () => {
    expect(view).toContain('searchUsers({ q: peer.name, sort: "username", limit: 20 }');
    expect(view).toContain('result.items.find((item) => item.id === userId)');
    expect(view).toContain('reversePlace({ lat: peer.position[1], lon: peer.position[0] }');
    expect(view).toContain('profileController?.abort()');
    expect(view).toContain('placeController?.abort()');
    expect(sheet).toContain('profile.category');
    expect(sheet).toContain('profile.avgRating');
    expect(sheet).toContain('profile.isOnline');
    expect(sheet).toContain('place.formattedAddress');
    expect(sheet).toContain('place.city');
    expect(sheet).toContain('place.country');
    expect(sheet).toContain('peer.accuracy');
    expect(sheet).toContain('observedAtMs');
    expect(sheet).toContain('peer.position');
    expect(sheet).not.toContain('phoneNumber');
    expect(sheet).not.toContain('email');
  });
});
