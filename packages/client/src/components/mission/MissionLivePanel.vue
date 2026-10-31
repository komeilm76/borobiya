<template>
  <section class="live-panel" dir="rtl" aria-label="موقعیت زندهٔ اعضای مأموریت">
    <div class="live-panel__heading">
      <div>
        <span class="live-panel__eyebrow"><v-icon icon="mdi-map-marker-radius" size="17" /> اتاق خصوصی مأموریت</span>
        <h3>موقعیت اعضای مأموریت</h3>
        <p>فقط موقعیت‌های تازه‌ای که هر عضو آگاهانه به اشتراک می‌گذارد نمایش داده می‌شود.</p>
      </div>
      <div class="d-flex flex-wrap align-center ga-2">
        <v-chip :color="live.connected.value && !live.recoveryPending.value ? 'success' : 'warning'" variant="tonal" size="small">
          {{ !live.connected.value ? 'در حال اتصال / آفلاین' : live.recoveryPending.value ? 'وضعیت مأموریت تأیید نشده' : 'اتصال زنده' }}
        </v-chip>
        <v-btn v-if="hasMarkers" variant="tonal" size="small" color="primary" rounded="lg"
          prepend-icon="mdi-fit-to-screen" @click="focusMembers">نمایش همهٔ اعضا</v-btn>
      </div>
    </div>
    <v-alert v-if="live.error.value" type="warning" variant="tonal" role="alert" class="mb-3">
      {{ live.error.value }} <v-btn size="small" variant="text" @click="live.start()">تلاش دوباره</v-btn>
    </v-alert>
    <div class="d-flex flex-wrap ga-2 mb-3" role="status" aria-live="polite">
      <v-chip size="small" variant="tonal" :color="presence.requester.value === 'online' ? 'success' : 'warning'">
        اتصال درخواست‌کننده: {{ missionPresenceLabel[presence.requester.value] }}
      </v-chip>
      <v-chip size="small" variant="tonal" :color="presence.rescuer.value === 'online' ? 'success' : 'warning'">
        اتصال امدادگر: {{ missionPresenceLabel[presence.rescuer.value] }}
      </v-chip>
      <small>وضعیت اتصال، مستقل از اشتراک داوطلبانهٔ موقعیت است. پس از ۵ دقیقه فقط بررسی دستی لازم است؛ مأموریت خودکار لغو نمی‌شود.</small>
    </div>
    <div class="live-panel__grid">
      <div class="live-panel__map">
        <MapCanvas :center="center" :zoom="13" :constrain-bounds="false"
          :style-url="mapStyleUrl" aria-label="نقشهٔ موقعیت زندهٔ درخواست‌کننده، امدادگر و مدیر" @ready="onMapReady" />
      </div>
      <div class="live-panel__members" aria-live="polite">
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
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

const props = withDefaults(defineProps<{ mission: LiveMissionIdentity; center?: [number, number] }>(), {
  center: () => [51.4, 35.7]
});
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
  focusMembers();
}
watch(presentRoles, (next, previous) => { if (next !== previous) focusMembers(); });
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
.live-panel__grid { display: grid; grid-template-columns: minmax(0,1.1fr) minmax(230px,.9fr); gap: 18px; }
.live-panel__map { min-height: 20rem; border-radius: var(--bb-radius-nested, 16px); overflow: hidden; }
.live-panel__map :deep(.map-canvas) { height: 100%; min-height: 20rem; }
.live-panel__members { display: grid; gap: 12px; align-content: start; }
.live-panel__member { display: flex; align-items: center; gap: 9px; padding: 12px; border-radius: var(--bb-radius-nested, 16px); background: rgba(31,121,102,.06); }
.live-panel__member > div { display: grid; gap: 2px; min-width: 0; flex: 1; }
.live-panel__member strong { font-size: .85rem; }.live-panel__member small { font-size: 0.82rem; opacity: .78; }
.live-panel__dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }.live-panel__dot.requester { background: #dc593b; }.live-panel__dot.rescuer { background: #16826c; }.live-panel__dot.admin { background: #5555ae; }
@container (max-width: 720px) { .live-panel__grid { grid-template-columns: minmax(0,1fr); } }
@container (max-width: 599px) {
  .live-panel__member { flex-wrap: wrap; }
  .live-panel__member > .v-chip { max-width: 100%; }
  .live-panel__members :deep(.v-btn) { height: auto; min-height: 44px; white-space: normal; }
  .live-panel__members :deep(.v-btn__content) { white-space: normal; text-align: center; }
}
</style>
