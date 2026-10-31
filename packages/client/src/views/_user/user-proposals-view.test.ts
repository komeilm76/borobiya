import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeRecords } from "../../router";

const view = readFileSync(new URL("../../components/shell/ProposalInboxContent.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");

describe("rescuer inbox content in the map dialog", () => {
  it("retires the separate route and links the other-page bell to the map", () => {
    expect(routeRecords.find((item) => item.path === "/_user/proposals")?.component).toBeUndefined();
    expect(app).toContain('to="/_user/map?inbox=1"');
    expect(app).toContain("path: '/_user/map', query: { offer: proposal.id }");
  });

  it("provides a focused incident map, consent-based distance and signed photo access", () => {
    expect(view).toContain("<MapCanvas");
    expect(view).toContain("@click=\"locateMe\"");
    expect(view).toContain("getSosPhotoSrc");
    expect(view).toContain('referrerpolicy="no-referrer"');
    expect(view).not.toContain(':src="selected.details.sosRequest.photoUrl"');
  });

  it("defers MapLibre until a proposal or accepted-mission map is ready", () => {
    // MapCanvas sends the already-loaded constructor to both ready handlers. The route
    // must not import its large runtime chunk before an incident map even mounts.
    expect(view).toContain('import type { Map as MapLibreMap, Marker } from "maplibre-gl"');
    expect(view).not.toMatch(/import\s*\{\s*Marker\b/);
    expect(view).toContain('function markIncident(map: MapLibreMap, MarkerClass: typeof Marker)');
    expect(view).toContain('marker = new MarkerClass(');
    expect(view).toContain('function onAcceptedMapReady(map: MapLibreMap, MarkerClass: typeof Marker)');
    expect(view).toContain('markerConstructor = MarkerClass;');
    expect(view).toContain('const MarkerClass = markerConstructor;');
    expect(view).toContain('acceptedIncidentMarker = new MarkerClass(');
    expect(view).toContain('acceptedRescuerMarker = new MarkerClass(');
  });

  it("shows the accepted incident map, explicit location consent, and a two-point fitBounds camera", () => {
    expect(view).toContain('v-if="inbox.acceptedOffer?.details"');
    expect(view).toContain('aria-label="نمای مأموریت پذیرفته‌شده"');
    expect(view).toContain("missionMapCamera(incident, myPosition.value)");
    expect(view).toContain("map.fitBounds(camera.bounds");
    expect(view).toContain('v-if="!myPosition"');
    expect(view).toContain("موقعیت شما فقط با اجازهٔ دستگاه");
  });

  it("keeps proposal confirmation reachable on short and narrow phones", () => {
    const dialog = view.split('    <v-dialog :model-value="confirmAction !== null"')[1]?.split("    </v-dialog>")[0];
    expect(dialog).toBeDefined();
    expect(dialog).toContain('max-width="460" scrollable persistent');
    expect(dialog).toContain('<v-card-text>');
    expect(dialog).toContain('<v-textarea v-model="declineReason" label="دلیل رد (اختیاری)" :counter="500" maxlength="500" rows="3" variant="outlined" />');
    expect(dialog).toContain('<v-card-actions class="offer-confirm-actions">');
    expect(dialog).toContain(':disabled="Boolean(inbox.decidingId)" @click="confirmAction = null"');
    expect(dialog).toContain(':loading="Boolean(inbox.decidingId)"');
    expect(dialog).toContain('@click="submitDecision"');
    const phone = view.split("@media (max-width: 580px) {")[1]?.split("\n}\n")[0] ?? "";
    expect(phone).toContain('.offer-confirm-actions { flex-direction: column; align-items: stretch; gap: 8px; }');
    expect(phone).toContain('.offer-confirm-actions :deep(.v-spacer) { display: none; }');
    expect(phone).toContain('.offer-confirm-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }');
    expect(phone).toContain('.offer-confirm-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }');
  });

  it("requires confirmation and discloses other offers will close when one is accepted", () => {
    expect(view).toContain('confirmAction = \'accept\'');
    expect(view).toContain("پیشنهادهای دیگر شما خودکار بسته می‌شوند");
    expect(view).toContain("inbox.decide(id, action");
    expect(view).toContain('if (action === "decline") selectedId.value = null;');
    expect(view).toContain("v-textarea");
  });
});
