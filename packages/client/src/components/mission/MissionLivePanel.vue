<template>
  <section class="live-panel" :class="{ 'live-panel--routing': routeActive, 'live-panel--fullscreen': fullscreen }" dir="rtl" aria-label="نقشه و موقعیت اعضای مأموریت">
    <div v-if="!fullscreen" class="live-panel__heading">
      <div>
        <span class="live-panel__eyebrow"><v-icon icon="mdi-map-marker-radius" size="17" /> اتاق خصوصی مأموریت</span>
        <h3>{{ routeActive ? 'نقشهٔ مأموریت' : 'موقعیت اعضای مأموریت' }}</h3>
        <p>{{ routeActive ? 'محل حادثه و مسیرهای قابل‌دسترسی در همین نقشه نمایش داده می‌شوند؛ نشانگر اعضا فقط با اشتراک آگاهانه نشان داده می‌شود.' : 'فقط موقعیت‌هایی که هر عضو آگاهانه به اشتراک می‌گذارد نمایش داده می‌شود.' }}</p>
      </div>
      <div class="d-flex flex-wrap align-center ga-2">
        <slot name="map-toolbar" />
        <v-chip :color="live.connected.value && !live.recoveryPending.value ? 'success' : 'warning'" variant="tonal" size="small">
          {{ !live.connected.value ? 'در حال اتصال / آفلاین' : live.recoveryPending.value ? 'وضعیت مأموریت تأیید نشده' : 'اتصال زنده' }}
        </v-chip>
        <v-btn v-if="hasMarkers" variant="tonal" size="small" color="primary" rounded="lg"
          prepend-icon="mdi-fit-to-screen" @click="focusMembers">نمایش همهٔ اعضا</v-btn>
      </div>
    </div>
    <v-alert v-if="!fullscreen && live.error.value" type="warning" variant="tonal" role="alert" class="mb-3">
      {{ live.error.value }} <v-btn size="small" variant="text" @click="live.start()">تلاش دوباره</v-btn>
    </v-alert>
    <div v-if="!fullscreen" class="d-flex flex-wrap ga-2 mb-3" role="status" aria-live="polite">
      <v-chip size="small" variant="tonal" :color="presence.requester.value === 'online' ? 'success' : 'warning'">
        اتصال درخواست‌کننده: {{ missionPresenceLabel[presence.requester.value] }}
      </v-chip>
      <v-chip size="small" variant="tonal" :color="presence.rescuer.value === 'online' ? 'success' : 'warning'">
        اتصال امدادگر: {{ missionPresenceLabel[presence.rescuer.value] }}
      </v-chip>
      <small>وضعیت اتصال، مستقل از اشتراک داوطلبانهٔ موقعیت است. پس از ۵ دقیقه فقط بررسی دستی لازم است؛ مأموریت خودکار لغو نمی‌شود.</small>
    </div>
    <span class="sr-only" role="status" aria-live="polite" aria-atomic="true">{{ locationAnnouncement }}</span>
    <div class="live-panel__grid">
      <div class="live-panel__map-area">
        <div class="live-panel__map">
          <MapCanvas :center="center" :zoom="13" :constrain-bounds="false"
            :style-url="mapStyleUrl"
            :aria-label="routeActive ? 'نقشهٔ مأموریت و موقعیت داوطلبانهٔ اعضا' : 'نقشهٔ موقعیت زندهٔ درخواست‌کننده، امدادگر و مدیر'"
            @ready="onMapReady" />
          <slot name="map-actions" />
        </div>
        <!-- The rescuer's route planner shares this canvas; other callers keep just the live map. -->
        <slot name="route-planner" />
      </div>
      <div :id="fullscreen ? 'mission-team-panel' : undefined" v-show="!fullscreen || roomOpen"
        class="live-panel__members" role="region" aria-label="اعضا و اشتراک موقعیت مأموریت"
        :tabindex="fullscreen ? -1 : undefined">
        <div v-if="fullscreen" class="live-panel__room-heading">
          <h2>اعضای مأموریت</h2>
          <v-chip :color="live.connected.value && !live.recoveryPending.value ? 'success' : 'warning'" variant="tonal" size="small">
            {{ !live.connected.value ? 'در حال اتصال / آفلاین' : live.recoveryPending.value ? 'وضعیت مأموریت تأیید نشده' : 'اتصال زنده' }}
          </v-chip>
          <p>موقعیت اعضا فقط با اشتراک آگاهانه نمایش داده می‌شود.</p>
          <v-btn v-if="hasMarkers" variant="tonal" size="small" color="primary" rounded="lg"
            prepend-icon="mdi-fit-to-screen" @click="focusMembers">نمایش همهٔ اعضا</v-btn>
        </div>
        <template v-if="fullscreen">
          <v-alert v-if="live.error.value" type="warning" variant="tonal" role="alert">
            {{ live.error.value }} <v-btn size="small" variant="text" @click="live.start()">تلاش دوباره</v-btn>
          </v-alert>
          <div class="d-flex flex-wrap ga-2" role="status" aria-live="polite">
            <v-chip size="small" variant="tonal" :color="presence.requester.value === 'online' ? 'success' : 'warning'">
              اتصال درخواست‌کننده: {{ missionPresenceLabel[presence.requester.value] }}
            </v-chip>
            <v-chip size="small" variant="tonal" :color="presence.rescuer.value === 'online' ? 'success' : 'warning'">
              اتصال امدادگر: {{ missionPresenceLabel[presence.rescuer.value] }}
            </v-chip>
            <small>وضعیت اتصال، مستقل از اشتراک داوطلبانهٔ موقعیت است. پس از ۵ دقیقه فقط بررسی دستی لازم است؛ مأموریت خودکار لغو نمی‌شود.</small>
          </div>
        </template>
        <div v-for="member in live.participantStatus.value" :key="member.role" class="live-panel__member">
          <span class="live-panel__dot" :class="member.role" />
          <div>
            <strong>{{ member.role === 'requester' ? 'درخواست‌کننده' : member.role === 'rescuer' ? 'امدادگر' : 'مدیر مرکز' }}</strong>
            <small v-if="member.entry">آخرین مشاهده: {{ new Date(member.entry.timestamp).toLocaleString('fa-IR') }}</small>
            <small v-else>هنوز موقعیتی به اشتراک گذاشته نشده است.</small>
          </div>
          <v-chip :color="member.fresh ? 'success' : 'grey'" variant="tonal" size="small">
            {{ !member.entry ? 'اشتراک آغاز نشده' : member.fresh ? 'موقعیت تازه' : 'موقعیت قدیمی' }}
          </v-chip>
        </div>
        <p class="live-panel__note">این نشانگر فقط تازگی موقعیت داوطلبانه را نمایش می‌دهد. وضعیت اتصال واقعی در بخش «اتصال درخواست‌کننده/امدادگر» نشان داده شده است.</p>
        <template v-if="canPublish">
          <p v-if="live.recoveryPending.value && !live.error.value" class="live-panel__note" role="status">
            پس از بازگشت اتصال، وضعیت مأموریت در حال بررسی است. تا تأیید سرور اشتراک موقعیت فعال نمی‌شود.
          </p>
          <v-btn v-if="!live.sharing.value" color="primary" variant="flat" rounded="lg" block
            :disabled="!live.connected.value || live.recoveryPending.value" prepend-icon="mdi-crosshairs-gps" @click="live.startSharing()">
            اشتراک موقعیت من با اعضا و مدیر
          </v-btn>
          <v-btn v-else color="error" variant="tonal" rounded="lg" block prepend-icon="mdi-stop-circle-outline"
            @click="live.stopSharing()">توقف اشتراک موقعیت من</v-btn>
          <p class="live-panel__note">اشتراک داوطلبانه است؛ شروع مسیریابی به‌تنهایی موقعیت شما را منتشر نمی‌کند. با خروج از این صفحه یا قطع اتصال متوقف می‌شود.</p>
        </template>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from "vue";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { missionLiveCamera } from "@/mission/live-camera";
import { planMissionMarkerSync, type MissionMarkerSnapshot } from "@/mission/live-marker-sync";
import { useMissionLiveLocations, type LiveMissionIdentity } from "@/composables/use-mission-live-locations";
import { useMissionPresence } from "@/composables/use-mission-presence";
import { missionPresenceLabel } from "@/mission/presence";
import { missionLocationAnnouncement } from "@/mission/location-phase";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

const props = withDefaults(defineProps<{
  mission: LiveMissionIdentity; center?: [number, number]; routeActive?: boolean;
  fullscreen?: boolean; roomOpen?: boolean;
}>(), {
  center: () => [51.4, 35.7], routeActive: false, fullscreen: false, roomOpen: false
});
const emit = defineEmits<{ ready: [map: MapLibreMap, marker: typeof Marker] }>();
const auth = useAuthStore();
const theme = useThemeStore();
const mapStyleUrl = computed(() => theme.isDark ? DEFAULT_DARK_MAP_STYLE : DEFAULT_MAP_STYLE);
const live = useMissionLiveLocations(computed(() => props.mission), computed(() => auth.accessToken),
  computed(() => auth.user?.id ?? null), () => auth.ensureSession());
const presence = useMissionPresence(computed(() => props.mission.id), computed(() => auth.accessToken),
  computed(() => auth.user?.id ?? null));
const canPublish = computed(() => auth.user?.role === "admin" ||
  auth.user?.id === props.mission.requesterId || auth.user?.id === props.mission.rescuerId);
const map = shallowRef<MapLibreMap | null>(null);
// MapCanvas supplies the constructor after its lazy MapLibre import finishes.
let markerConstructor: typeof Marker | null = null;
const hasMarkers = computed(() => Object.values(live.locations.value).some(Boolean));
// Announce only changes in whether each participant shares a fresh/old fix.
// The visible timestamps can still update on every GPS fix without interrupting speech.
const locationAnnouncement = computed(() => missionLocationAnnouncement(live.participantStatus.value));
const presentRoles = computed(() => Object.keys(live.locations.value).sort().join(","));
type Role = "requester" | "rescuer" | "admin";
const markers: Partial<Record<Role, Marker>> = {};
const paintedMarkers: Partial<Record<Role, MissionMarkerSnapshot>> = {};
function clearMarkers(): void {
  for (const role of ["requester", "rescuer", "admin"] as const) {
    markers[role]?.remove();
    delete markers[role];
    delete paintedMarkers[role];
  }
}
function syncMarkers(): void {
  const instance = map.value;
  const MarkerClass = markerConstructor;
  if (!instance || !MarkerClass) return;
  for (const op of planMissionMarkerSync(paintedMarkers, live.participantStatus.value)) {
    const { role } = op;
    if (op.kind === "move") {
      markers[role]?.setLngLat([op.next.lon, op.next.lat]);
      paintedMarkers[role] = op.next;
      continue;
    }
    markers[role]?.remove();
    delete markers[role];
    delete paintedMarkers[role];
    if (op.kind === "remove") continue;
    // A freshness transition changes both marker scale and accessible label.
    const marker = new MarkerClass({ color: role === "rescuer" ? "#16826c" : role === "admin" ? "#5555ae" : "#dc593b",
      scale: op.next.fresh ? 1 : 0.8 }).setLngLat([op.next.lon, op.next.lat]).addTo(instance);
    marker.getElement().setAttribute("aria-label", `${role === "rescuer" ? "امدادگر" : role === "admin" ? "مدیر مرکز" : "درخواست‌کننده"}، ${op.next.fresh ? "موقعیت تازه" : "موقعیت قدیمی"}`);
    marker.getElement().style.opacity = op.next.fresh ? "1" : "0.55";
    markers[role] = marker;
    paintedMarkers[role] = op.next;
  }
}
function focusMembers() {
  if (!map.value) return;
  const camera = missionLiveCamera(Object.values(live.locations.value).filter((entry) => entry != null));
  if (!camera) return;
  if (camera.kind === "single") map.value.easeTo({ center: camera.center, zoom: camera.zoom, duration: 350 });
  else map.value.fitBounds(camera.bounds, { padding: camera.padding, maxZoom: camera.maxZoom, duration: 350 });
}
function onMapReady(instance: MapLibreMap, MarkerClass: typeof Marker) {
  if (map.value !== instance) clearMarkers();
  markerConstructor = MarkerClass;
  map.value = instance;
  syncMarkers();
  emit("ready", instance, MarkerClass);
  if (!props.routeActive) focusMembers();
}
// Live room updates can change markers, but must not steal the camera from
// active route planning/guidance on the rescuer's shared mission map.
watch(presentRoles, (next, previous) => { if (next !== previous && !props.routeActive) focusMembers(); });
watch(() => props.routeActive, (active) => {
  if (active) return;
  // Closing the private route should not leave an unlabelled incident-centred map
  // when nobody has voluntarily shared a location.
  if (hasMarkers.value) focusMembers();
  else map.value?.easeTo({ center: props.center, zoom: 13, duration: 350 });
});
// The age clock ticks every second; a new array literal would rebuild three DOM-backed
// markers per tick even when no fix or stale state changed. Sync-flush clears private
// markers on the same call stack as a mission/account/logout boundary.
watch([() => live.locations.value, () => live.participantStatus.value.map((member) => member.fresh).join(",")],
  syncMarkers, { flush: "sync" });
onBeforeUnmount(() => {
  clearMarkers();
  map.value = null;
  markerConstructor = null;
});
</script>

<style scoped>
.live-panel { margin-block: 22px; container-type: inline-size; border: 1px solid rgba(31,121,102,.25); border-radius: var(--bb-radius-card, 24px); background: rgb(var(--v-theme-surface)); padding: clamp(16px,3vw,26px); box-shadow: var(--bb-shadow-surface); }
.live-panel__heading { display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; }
.live-panel__heading h3 { font-size: 1.15rem; margin: 6px 0 2px; }
.live-panel__heading p,.live-panel__note { font-size: .8rem; opacity: .75; line-height: 1.7; }
.live-panel__eyebrow { font-size: 0.82rem; color: rgb(var(--v-theme-primary)); font-weight: 750; }
.live-panel__grid { display: grid; grid-template-columns: minmax(0,1.4fr) minmax(230px,.6fr); gap: 18px; }
.live-panel__map-area { min-width: 0; }
.live-panel__map { position: relative; min-height: 20rem; border-radius: var(--bb-radius-nested, 16px); overflow: hidden; }
.live-panel__map :deep(.map-canvas) { height: 100%; min-height: 20rem; }
.live-panel--routing .live-panel__map { height: min(50dvh, 450px); min-height: 310px; }
.live-panel--routing .live-panel__map :deep(.map-canvas) { min-height: 0; }
.live-panel__members { display: grid; gap: 12px; align-content: start; }
.live-panel__member { display: flex; align-items: center; gap: 9px; padding: 12px; border-radius: var(--bb-radius-nested, 16px); background: rgba(31,121,102,.06); }
.live-panel__member > div { display: grid; gap: 2px; min-width: 0; flex: 1; }
.live-panel__member strong { font-size: .85rem; }.live-panel__member small { font-size: 0.82rem; opacity: .78; }
.live-panel__dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }.live-panel__dot.requester { background: #dc593b; }.live-panel__dot.rescuer { background: #16826c; }.live-panel__dot.admin { background: #5555ae; }
@container (min-width: 721px) { .live-panel--routing .live-panel__map { position: sticky; top: 16px; z-index: 1; } }
@container (max-width: 720px) { .live-panel__grid { grid-template-columns: minmax(0,1fr); } }
@container (max-width: 599px) {
  .live-panel--routing .live-panel__map { height: min(42dvh, 360px); min-height: 275px; }
  .live-panel__member { flex-wrap: wrap; }
  .live-panel__member > .v-chip { max-width: 100%; }
  .live-panel__members :deep(.v-btn) { height: auto; min-height: 44px; white-space: normal; }
  .live-panel__members :deep(.v-btn__content) { white-space: normal; text-align: center; }
}

/* Map-first mission mode. Other callers keep the normal in-flow room card. */
.live-panel--fullscreen {
  position: absolute; inset: 0; width: 100%; height: 100%; min-height: 0;
  margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none;
  overflow: hidden; isolation: isolate;
}
.live-panel--fullscreen .live-panel__grid,
.live-panel--fullscreen .live-panel__map-area,
.live-panel--fullscreen .live-panel__map {
  position: absolute; inset: 0; display: block; width: 100%; height: 100%; min-height: 0;
  border-radius: 0;
}
.live-panel--fullscreen .live-panel__map :deep(.map-canvas) {
  height: 100%; min-height: 0; border-radius: 0;
}
/* The network control is an App sibling at the top right. Keep map zoom reachable. */
.live-panel--fullscreen .live-panel__map :deep(.maplibregl-ctrl-top-right) {
  top: calc(4.5rem + env(safe-area-inset-top, 0px));
}
.live-panel--fullscreen .live-panel__members {
  position: absolute; z-index: 6; inset: auto 1rem calc(5.5rem + env(safe-area-inset-bottom, 0px)) auto;
  width: min(27rem, calc(100vw - 1.5rem)); max-height: min(56dvh, 33rem);
  padding: 1rem; overflow-y: auto; overscroll-behavior: contain;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-card, 24px);
  background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-overlay);
}
.live-panel__room-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.live-panel__room-heading h2 { flex: 1 1 auto; font-size: 1.05rem; }
.live-panel__room-heading p { width: 100%; font-size: .85rem; line-height: 1.6; }
@media (max-width: 599px) {
  .live-panel--fullscreen .live-panel__members {
    inset-inline: .75rem; width: auto;
    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));
    max-height: min(52dvh, 26rem);
  }
}

:global(:root.dark .live-panel__member) {
  background: var(--bb-color-inset);
  border: 1px solid var(--bb-color-outline);
}
</style>
