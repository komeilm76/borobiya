<template>
  <section class="live-panel" dir="rtl" aria-label="موقعیت زندهٔ اعضای مأموریت">
    <div class="live-panel__heading">
      <div>
        <span class="live-panel__eyebrow"><v-icon icon="mdi-map-marker-radius" size="17" /> اتاق خصوصی مأموریت</span>
        <h3>موقعیت اعضای مأموریت</h3>
        <p>فقط موقعیت‌های تازه‌ای که هر عضو آگاهانه به اشتراک می‌گذارد نمایش داده می‌شود.</p>
      </div>
      <div class="d-flex flex-wrap align-center ga-2">
        <v-chip :color="live.connected.value ? 'success' : 'warning'" variant="tonal" size="small">
          {{ live.connected.value ? 'اتصال زنده' : 'در حال اتصال / آفلاین' }}
        </v-chip>
        <v-btn v-if="hasMarkers" variant="tonal" size="small" color="primary" rounded="lg"
          prepend-icon="mdi-fit-to-screen" @click="focusMembers">نمایش همهٔ اعضا</v-btn>
      </div>
    </div>
    <v-alert v-if="live.error.value" type="warning" variant="tonal" role="alert" class="mb-3">
      {{ live.error.value }} <v-btn size="small" variant="text" @click="live.start()">تلاش دوباره</v-btn>
    </v-alert>
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
          <v-chip :color="member.online ? 'success' : 'grey'" variant="tonal" size="small">
            {{ member.online ? 'آنلاین' : 'آفلاین' }}
          </v-chip>
        </div>
        <p class="live-panel__note">آفلاین یعنی در ۳۰ ثانیهٔ گذشته موقعیت تازه‌ای دریافت نشده؛ وضعیت حضور قطعی فرد نیست.</p>
        <template v-if="canPublish">
          <v-btn v-if="!live.sharing.value" color="primary" variant="flat" rounded="lg" block
            :disabled="!live.connected.value" prepend-icon="mdi-crosshairs-gps" @click="live.startSharing()">
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
import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { missionLiveCamera } from "@/mission/live-camera";
import { useMissionLiveLocations, type LiveMissionIdentity } from "@/composables/use-mission-live-locations";
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
const canPublish = computed(() => auth.user?.role === "admin" ||
  auth.user?.id === props.mission.requesterId || auth.user?.id === props.mission.rescuerId);
const map = shallowRef<MapLibreMap | null>(null);
const hasMarkers = computed(() => Object.values(live.locations.value).some(Boolean));
const presentRoles = computed(() => Object.keys(live.locations.value).sort().join(","));
const markers: Partial<Record<"requester" | "rescuer" | "admin", Marker>> = {};
function syncMarkers() {
  for (const member of live.participantStatus.value) {
    markers[member.role]?.remove();
    delete markers[member.role];
    if (!map.value || !member.entry) continue;
    const marker = new Marker({ color: member.role === "rescuer" ? "#16826c" : member.role === "admin" ? "#5555ae" : "#dc593b", scale: member.online ? 1 : 0.8 })
      .setLngLat([member.entry.lon, member.entry.lat]).addTo(map.value);
    marker.getElement().setAttribute("aria-label", `${member.role === "rescuer" ? "امدادگر" : member.role === "admin" ? "مدیر مرکز" : "درخواست‌کننده"}، ${member.online ? "آنلاین" : "آفلاین"}`);
    marker.getElement().style.opacity = member.online ? "1" : "0.55";
    markers[member.role] = marker;
  }
}
function focusMembers() {
  if (!map.value) return;
  const camera = missionLiveCamera(Object.values(live.locations.value).filter((entry) => entry != null));
  if (!camera) return;
  if (camera.kind === "single") map.value.easeTo({ center: camera.center, zoom: camera.zoom, duration: 350 });
  else map.value.fitBounds(camera.bounds, { padding: camera.padding, maxZoom: camera.maxZoom, duration: 350 });
}
function onMapReady(instance: MapLibreMap) { map.value = instance; syncMarkers(); focusMembers(); }
watch(presentRoles, (next, previous) => { if (next !== previous) focusMembers(); });
watch(() => [live.locations.value, ...live.participantStatus.value.map((member) => member.online)], syncMarkers);
onBeforeUnmount(() => { for (const marker of Object.values(markers)) marker?.remove(); map.value = null; });
</script>

<style scoped>
.live-panel { margin-block: 22px; border: 1px solid rgba(31,121,102,.25); border-radius: 22px; background: rgb(var(--v-theme-surface)); padding: clamp(16px,3vw,26px); box-shadow: 0 12px 28px rgba(13,70,63,.055); }
.live-panel__heading { display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: 10px; margin-bottom: 15px; }
.live-panel__heading h3 { font-size: 1.15rem; margin: 6px 0 2px; }
.live-panel__heading p,.live-panel__note { font-size: .8rem; opacity: .75; line-height: 1.7; }
.live-panel__eyebrow { font-size: .78rem; color: #16826c; font-weight: 750; }
.live-panel__grid { display: grid; grid-template-columns: minmax(0,1.1fr) minmax(230px,.9fr); gap: 18px; }
.live-panel__map { min-height: 20rem; border-radius: 14px; overflow: hidden; }
.live-panel__map :deep(.map-canvas) { height: 100%; min-height: 20rem; }
.live-panel__members { display: grid; gap: 12px; align-content: start; }
.live-panel__member { display: flex; align-items: center; gap: 9px; padding: 12px; border-radius: 12px; background: rgba(31,121,102,.06); }
.live-panel__member > div { display: grid; gap: 2px; min-width: 0; flex: 1; }
.live-panel__member strong { font-size: .85rem; }.live-panel__member small { font-size: .71rem; opacity: .78; }
.live-panel__dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }.live-panel__dot.requester { background: #dc593b; }.live-panel__dot.rescuer { background: #16826c; }.live-panel__dot.admin { background: #5555ae; }
@media(max-width:720px) { .live-panel__grid { grid-template-columns: 1fr; } }
</style>
