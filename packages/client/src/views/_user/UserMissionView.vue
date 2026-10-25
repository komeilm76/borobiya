<template>
  <main class="mission-desk" dir="rtl">
    <div class="mission-desk__shell">
      <header class="mission-hero">
        <span class="mission-hero__eyebrow"><v-icon icon="mdi-lifebuoy" size="18" /> میز مأموریت امدادگر</span>
        <h1>کمک در جریان است.</h1>
        <p>پیشرفت مأموریت را دنبال کنید. اگر واقعاً قادر به ادامه نیستید، مرکز امداد را از همین‌جا باخبر کنید.</p>
        <div class="mission-hero__glow" aria-hidden="true" />
      </header>

      <v-alert v-if="desk.cancelledMissionId.value" type="info" variant="tonal" rounded="xl" class="mt-6" role="status">
        مأموریت لغو شد. مرکز امداد برای جایگزینی امدادگر مطلع شده است.
      </v-alert>
      <v-alert v-if="desk.error.value" type="error" variant="tonal" rounded="xl" class="mt-6" role="alert">
        {{ desk.error.value }}
        <v-btn class="ms-2" size="small" variant="text" @click="desk.load()">تلاش دوباره</v-btn>
      </v-alert>
      <div class="mission-desk__toolbar">
        <div>
          <h2>مأموریت فعال</h2>
          <p>اطلاعات از سرور خوانده می‌شود؛ بعد از تغییر وضعیت، فهرست را تازه کنید.</p>
        </div>
        <v-btn variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-refresh" :loading="desk.loading.value"
          @click="desk.load()">تازه‌سازی</v-btn>
      </div>

      <v-skeleton-loader v-if="desk.loading.value && !desk.missions.value.length" type="article, actions" class="mission-desk__card" />
      <section v-else-if="desk.activeMission.value" class="mission-desk__card" aria-label="مأموریت فعال">
        <div class="mission-desk__card-header">
          <div>
            <span class="mission-desk__kicker"><span class="mission-desk__pulse" /> اکنون در جریان</span>
            <h3>مأموریت امدادی شما</h3>
            <p>شناسهٔ پیگیری: <bdi dir="ltr">{{ desk.activeMission.value.id }}</bdi></p>
          </div>
          <v-chip color="primary" variant="tonal" size="large" prepend-icon="mdi-timeline-clock-outline">
            {{ currentStatusLabel }}
          </v-chip>
        </div>
        <div class="mission-steps" role="list" aria-label="مراحل مأموریت">
          <div v-for="(step, index) in steps" :key="step.status" class="mission-steps__item"
            :class="{ 'mission-steps__item--reached': index <= activeStep }" role="listitem">
            <span class="mission-steps__number" aria-hidden="true">{{ (index + 1).toLocaleString('fa-IR') }}</span>
            <span>{{ step.label }}</span>
            <v-icon v-if="index < activeStep" icon="mdi-check" size="16" aria-label="انجام شده" />
          </div>
        </div>
        <div class="mission-desk__foot">
          <v-btn color="primary" variant="flat" rounded="lg" prepend-icon="mdi-map-marker-path"
            @click="routing.open()">رفتن به محل حادثه</v-btn>
          <p><v-icon icon="mdi-shield-check-outline" size="20" /> لغو، آخرین راه‌حل است؛ برای ناتوانی در ادامه، دلیل واقعی ثبت کنید.</p>
          <v-menu location="bottom end">
            <template #activator="{ props }">
              <v-btn v-bind="props" variant="text" color="error" rounded="lg" prepend-icon="mdi-dots-horizontal"
                aria-label="گزینه‌های بیشتر مأموریت">بیشتر</v-btn>
            </template>
            <v-list density="comfortable" rounded="lg">
              <v-list-item prepend-icon="mdi-alert-outline" title="قادر به ادامه نیستم" subtitle="ثبت دلیل و آگاه‌سازی مرکز امداد"
                @click="desk.showCancellation()" />
            </v-list>
          </v-menu>
        </div>
      </section>
      <section v-else-if="!desk.error.value" class="mission-desk__empty">
        <div class="mission-desk__empty-icon"><v-icon icon="mdi-check-decagram-outline" size="36" /></div>
        <h3>در حال حاضر مأموریت فعالی ندارید</h3>
        <p>برای پذیرفتن مأموریت تازه، پیشنهادهای دریافتی را بررسی کنید.</p>
        <v-btn color="primary" variant="flat" rounded="lg" to="/_user/proposals">مشاهدهٔ پیشنهادها</v-btn>
      </section>
      <MissionLivePanel v-if="desk.activeMission.value" :mission="desk.activeMission.value" />
      <section v-if="routing.visible.value && desk.activeMission.value" class="mission-route" aria-label="مسیرهای پیشنهادی مأموریت">
        <header class="mission-route__header">
          <div>
            <h2>مسیر تا محل حادثه</h2>
            <p>مسیریابی با سرور نقشهٔ محلی انجام می‌شود؛ مسیرها پیشنهادند و زمان رسیدن قطعی نیست.</p>
          </div>
          <v-btn variant="text" aria-label="بستن مسیرها" @click="closeRoutes">بستن</v-btn>
        </header>
        <v-progress-linear v-if="routing.targetLoading.value" indeterminate color="primary" aria-label="دریافت محل حادثه" />
        <v-alert v-if="routing.error.value" class="my-3" type="warning" variant="tonal" role="alert">
          {{ routing.error.value }}
          <v-btn v-if="!routing.target.value" size="small" variant="text" @click="routing.open()">تلاش دوباره</v-btn>
        </v-alert>
        <template v-if="routing.target.value">
          <div class="mission-route__controls">
            <div>
              <p class="text-body-2 font-weight-bold mb-2">وسیلهٔ حرکت</p>
              <v-btn-toggle :model-value="routing.profile.value" :disabled="navigation.active.value" mandatory rounded="lg" color="primary"
                @update:model-value="onProfileChange">
                <v-btn value="car" prepend-icon="mdi-car">خودرو</v-btn>
                <v-btn value="bicycle" prepend-icon="mdi-bicycle">دوچرخه</v-btn>
                <v-btn value="foot" prepend-icon="mdi-walk">پیاده</v-btn>
              </v-btn-toggle>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-btn color="primary" variant="flat" rounded="lg" :loading="routing.loading.value" :disabled="navigation.active.value"
                @click="routing.findRoutes()">{{ routing.from.value ? 'دریافت مسیرها' : 'اجازهٔ موقعیت و دریافت مسیرها' }}</v-btn>
              <v-btn v-if="routing.from.value" color="primary" variant="tonal" rounded="lg"
                :disabled="routing.loading.value || navigation.active.value" @click="routing.findRoutes(true)">به‌روزرسانی موقعیت</v-btn>
            </div>
          </div>
          <div class="mission-route__map">
            <MapCanvas :center="[routing.target.value.incident.lon, routing.target.value.incident.lat]" :zoom="14"
              :constrain-bounds="false" :style-url="mapStyleUrl" aria-label="نقشهٔ مسیر تا محل حادثه"
              @ready="onRouteMapReady" />
          </div>
          <p class="text-caption mt-2">قرمز: محل حادثه؛ سبز: موقعیت شما. مختصات حادثه:
            <bdi dir="ltr">{{ routing.target.value.incident.lat.toFixed(5) }}, {{ routing.target.value.incident.lon.toFixed(5) }}</bdi>
          </p>
          <div v-if="routing.routes.value.length" class="mission-route__choices" role="group" aria-label="انتخاب مسیر پیشنهادی">
            <button v-for="(choice, index) in routing.routes.value" :key="index" type="button"
              class="mission-route__choice" :class="{ 'mission-route__choice--selected': routing.selectedIndex.value === index }"
              :aria-pressed="routing.selectedIndex.value === index" :disabled="navigation.active.value" @click="routing.selectRoute(index)">
              <strong>مسیر {{ (index + 1).toLocaleString('fa-IR') }}</strong>
              <span>{{ formatRouteDistance(choice.distance_m) }} · {{ formatRouteDuration(choice.duration_s) }}</span>
              <small v-if="choice.elevation">صعود تخمینی: {{ Math.round(choice.elevation.gain_m).toLocaleString('fa-IR') }} متر · نزول تخمینی: {{ Math.round(choice.elevation.loss_m).toLocaleString('fa-IR') }} متر</small>
              <small v-else>ارتفاع: دادهٔ آفلاین برای تمام این مسیر موجود نیست.</small>
            </button>
          </div>
          <p v-if="routing.routes.value.some(choice => choice.elevation)" class="text-caption mt-2">
            ارتفاع تقریبی از داده‌های محلی Mapzen/Tilezen محاسبه شده است؛ برای تصمیم ایمنی در مسیر به تنهایی کافی نیست.
            <a href="/terrain-attribution.html" target="_blank" rel="noopener noreferrer">منابع و حق انتساب داده‌های ارتفاع (آفلاین)</a>
          </p>
          <div v-if="routing.selectedRoute.value" class="mission-route__navigation">
            <v-btn v-if="!navigation.active.value" color="primary" variant="flat" rounded="lg"
              prepend-icon="mdi-navigation" :disabled="!mapReady" @click="navigation.start()">شروع راهبری</v-btn>
            <v-btn v-else color="error" variant="tonal" rounded="lg" prepend-icon="mdi-stop-circle-outline"
              @click="navigation.stop()">توقف راهبری</v-btn>
            <p v-if="navigation.active.value" role="status" class="text-caption mb-0">
              {{ navigation.fix.value ? 'دوربین نقشه موقعیت شما را دنبال می‌کند؛ مسیر را با محیط واقعی تطبیق دهید.' : 'در انتظار موقعیت تازهٔ GPS…' }}
            </p>
          </div>
          <v-alert v-if="navigation.error.value" type="warning" variant="tonal" role="alert" class="mt-3">
            {{ navigation.error.value }}
          </v-alert>
          <p v-if="routing.routes.value.length === 1" class="text-caption mt-2" role="status">
            برای این وسیله فقط یک مسیر در شبکهٔ راه‌های محلی پیدا شد؛ وجود چند مسیر تضمین نمی‌شود.
          </p>
        </template>
      </section>
    </div>

    <v-dialog :model-value="desk.cancellationOpen.value" max-width="510" :persistent="desk.cancelling.value"
      @update:model-value="(visible: boolean) => { if (!visible) desk.dismissCancellation(); }">
      <v-card rounded="xl" class="pa-2" dir="rtl">
        <v-card-title class="text-wrap">واقعاً قادر به ادامهٔ مأموریت نیستید؟</v-card-title>
        <v-card-text>
          <v-alert type="warning" variant="tonal" rounded="lg" class="mb-5">
            این اقدام را فقط در شرایط ضروری انجام دهید. پس از ثبت، مأموریت به مرکز امداد ارجاع می‌شود تا امدادگر جایگزین پیدا شود.
          </v-alert>
          <v-progress-linear v-if="desk.reasonLoading.value" indeterminate color="primary" aria-label="دریافت دلایل لغو" class="mb-4" />
          <v-alert v-if="desk.cancellationError.value" type="error" variant="tonal" role="alert" class="mb-4">
            {{ desk.cancellationError.value }}
          </v-alert>
          <v-btn v-if="desk.cancellationError.value && !desk.reasons.value.length" variant="tonal" color="primary"
            :disabled="desk.reasonLoading.value" @click="desk.showCancellation()">دریافت دوبارهٔ دلایل</v-btn>
          <v-radio-group v-if="desk.reasons.value.length" v-model="desk.reasonId.value" label="دلیل ناتوانی در ادامه"
            :disabled="desk.cancelling.value" hide-details>
            <v-radio v-for="reason in desk.reasons.value" :key="reason.id" :label="reason.labelFa || reason.label" :value="reason.id" />
          </v-radio-group>
          <v-textarea v-if="desk.selectedReason.value?.requiresCustomText" v-model="desk.customReason.value"
            label="توضیح (۱۰ تا ۲۰۰ نویسه)" hint="دلیل «سایر» برای بررسی مدیر علامت‌گذاری می‌شود."
            persistent-hint counter="200" maxlength="200" variant="outlined" rows="2" :disabled="desk.cancelling.value" />
          <p class="mission-desk__limit">حداکثر ۳ لغو در هر ساعت؛ از استفادهٔ غیرضروری خودداری کنید.</p>
        </v-card-text>
        <v-card-actions class="flex-wrap">
          <v-spacer />
          <v-btn variant="text" :disabled="desk.cancelling.value" @click="desk.dismissCancellation()">ادامهٔ مأموریت</v-btn>
          <v-btn color="error" variant="flat" rounded="lg" :loading="desk.cancelling.value"
            :disabled="!desk.canCancel.value" @click="desk.confirmCancellation()">ثبت ناتوانی و آگاه‌سازی مرکز</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRouteNavigation } from "@/composables/use-route-navigation";
import { Marker, type GeoJSONSource, type Map as MapLibreMap } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import MissionLivePanel from "@/components/mission/MissionLivePanel.vue";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { useThemeStore } from "@/stores/theme";
import { useMissionRoutes } from "@/composables/use-mission-routes";
import { missionMapCamera } from "@/sos/mission-map";
import { decodeRoutePolyline, formatRouteDistance, formatRouteDuration } from "@/sos/route-preview";
import { needsOverlayRestore } from "@/map/overlay-restore";
import type { TransportProfile } from "@/api/mission-routing";
import { useMissionDesk } from "@/composables/use-mission-desk";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const desk = useMissionDesk(computed(() => auth.accessToken), computed(() => auth.user?.id ?? null),
  () => auth.ensureSession());
const theme = useThemeStore();
const mapStyleUrl = computed(() => theme.isDark ? DEFAULT_DARK_MAP_STYLE : DEFAULT_MAP_STYLE);
const routing = useMissionRoutes(computed(() => auth.accessToken), computed(() => auth.user?.id ?? null),
  computed(() => desk.activeMission.value?.id ?? null), () => auth.ensureSession());
const mapReady = ref(false);
const navigation = useRouteNavigation(computed(() => auth.user?.id ?? null),
  computed(() => desk.activeMission.value?.id ?? null), routing.selectedRoute, routing.profile,
  (camera) => routeMap?.easeTo(camera), undefined,
  () => routeMap?.easeTo({ pitch: 0, bearing: 0, duration: 450 }));
function onProfileChange(value: unknown): void {
  if (value === "car" || value === "bicycle" || value === "foot") routing.selectProfile(value as TransportProfile);
}
const ROUTE_SOURCE = "rescuer-route-preview";
const ROUTE_LAYER = "rescuer-route-preview-line";
let routeMap: MapLibreMap | null = null;
let incidentMarker: Marker | null = null;
let rescuerMarker: Marker | null = null;
let detachRouteMap: (() => void) | null = null;
type RouteLineData = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: Record<string, never>;
    geometry: { type: "LineString"; coordinates: [number, number][] };
  }>;
};
function routeGeometry(): RouteLineData {
  const line = routing.selectedRoute.value;
  return { type: "FeatureCollection", features: line ? [{ type: "Feature", properties: {},
    geometry: { type: "LineString", coordinates: decodeRoutePolyline(line.polyline) } }] : [] };
}
function syncRouteMap(): void {
  const map = routeMap;
  const incident = routing.target.value?.incident;
  if (!map || !incident) return;
  incidentMarker?.remove();
  rescuerMarker?.remove();
  incidentMarker = new Marker({ color: "#dc2626" }).setLngLat([incident.lon, incident.lat]).addTo(map);
  incidentMarker.getElement().setAttribute("aria-label", "محل حادثه");
  rescuerMarker = routing.from.value ? new Marker({ color: "#16826c" })
    .setLngLat([routing.from.value.lon, routing.from.value.lat]).addTo(map) : null;
  rescuerMarker?.getElement().setAttribute("aria-label", "موقعیت من");
  const line = routing.selectedRoute.value;
  if (line) {
    const points = decodeRoutePolyline(line.polyline);
    const lon = points.map(([x]) => x);
    const lat = points.map(([, y]) => y);
    map.fitBounds([[Math.min(...lon), Math.min(...lat)], [Math.max(...lon), Math.max(...lat)]],
      { padding: 60, maxZoom: 15, duration: 450 });
  } else {
    const camera = missionMapCamera(incident, routing.from.value);
    if (camera.kind === "both") map.fitBounds(camera.bounds, { padding: camera.padding, maxZoom: camera.maxZoom, duration: 450 });
    else map.easeTo({ center: camera.center, zoom: camera.zoom, duration: 450 });
  }
  applyRouteLayer();
}
function applyRouteLayer(): void {
  const map = routeMap;
  if (!map || !map.isStyleLoaded()) return;
  try {
    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    if (source) source.setData(routeGeometry());
    else map.addSource(ROUTE_SOURCE, { type: "geojson", data: routeGeometry() });
    if (!map.getLayer(ROUTE_LAYER)) map.addLayer({ id: ROUTE_LAYER, type: "line", source: ROUTE_SOURCE,
      paint: { "line-color": "#176e62", "line-width": 6, "line-opacity": 0.9 } });
  } catch { /* Style swaps re-apply at idle. */ }
}
function restoreRouteLayer(): void {
  const map = routeMap;
  if (!map || !needsOverlayRestore({
    styleLoaded: Boolean(map.isStyleLoaded()),
    hasSource: (id) => Boolean(map.getSource(id)),
    hasLayer: (id) => Boolean(map.getLayer(id))
  }, [ROUTE_SOURCE], [ROUTE_LAYER])) return;
  applyRouteLayer();
}
function onRouteMapReady(map: MapLibreMap): void {
  detachRouteMap?.();
  routeMap = map;
  mapReady.value = true;
  const onStyleReady = () => restoreRouteLayer();
  map.on("idle", onStyleReady);
  detachRouteMap = () => map.off("idle", onStyleReady);
  syncRouteMap();
}
function closeRoutes(): void {
  navigation.stop();
  routing.reset();
  mapReady.value = false;
  detachRouteMap?.();
  detachRouteMap = null;
  incidentMarker?.remove();
  rescuerMarker?.remove();
  incidentMarker = null;
  rescuerMarker = null;
  routeMap = null;
}
watch(() => [routing.target.value, routing.from.value, routing.selectedRoute.value] as const, () => syncRouteMap());
watch(() => desk.activeMission.value?.id, (next, previous) => {
  if (previous && next !== previous) {
    closeRoutes();
  }
});
const steps = [
  { status: "pending", label: "پذیرفته شده" },
  { status: "on_the_way", label: "در راه" },
  { status: "arrived", label: "رسیده به محل" },
  { status: "in_progress", label: "در حال امدادرسانی" },
  { status: "completed", label: "پایان یافته" }
];
const activeStep = computed(() => steps.findIndex((step) => step.status === desk.activeMission.value?.status));
const currentStatusLabel = computed(() => steps[activeStep.value]?.label ?? "در حال بررسی");
onMounted(() => { void desk.load(); });
watch(() => auth.user?.id, () => { closeRoutes(); desk.reset(); if (auth.user?.id) void desk.load(); });
onBeforeUnmount(() => { closeRoutes(); desk.reset(); });
</script>

<style scoped>
.mission-desk { min-height: calc(100vh - 130px); padding: clamp(18px, 4vw, 52px) 18px 100px; color: rgb(var(--v-theme-on-background)); background: radial-gradient(ellipse at 86% 4%, rgba(33,130,113,.10), transparent 52%), rgb(var(--v-theme-background)); }
.mission-route { margin-top: 24px; padding: clamp(18px, 4vw, 34px); border: 1px solid rgba(35,135,108,.25); border-radius: 24px; background: rgb(var(--v-theme-surface)); box-shadow: 0 12px 40px rgba(20,62,58,.07); }
.mission-route__header, .mission-route__controls { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
.mission-route__header h2 { font-size: 1.3rem; font-weight: 800; }
.mission-route__header p { font-size: .86rem; opacity: .78; }
.mission-route__map { height: min(50vh, 430px); min-height: 310px; border-radius: 18px; overflow: hidden; }
.mission-route__map :deep(.map-canvas), .mission-route__map :deep(.map-canvas__viewport) { min-height: 0; }
.mission-route__choices { margin-top: 18px; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: 12px; }
.mission-route__choice { display: grid; text-align: start; gap: 7px; color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface)); border: 1px solid rgba(98,146,137,.35); border-radius: 15px; padding: 16px; cursor: pointer; font: inherit; }
.mission-route__choice--selected { border: 2px solid rgb(var(--v-theme-primary)); background: rgba(22,130,108,.09); }
.mission-route__choice:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-route__choice:disabled { opacity: .7; cursor: not-allowed; }
.mission-route__navigation { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-top: 18px; }
.mission-route__choice small { opacity: .75; }
.mission-desk__shell { max-width: 1120px; margin-inline: auto; }
.mission-hero { position: relative; overflow: hidden; border-radius: 28px; background: linear-gradient(115deg, #103b40, #206b67); color: white; padding: clamp(27px, 5vw, 56px); box-shadow: 0 22px 60px rgba(11,67,65,.18); }
.mission-hero__eyebrow { display: inline-flex; align-items: center; gap: 9px; color: #a4e7d5; font-weight: 700; font-size: .84rem; }
.mission-hero h1 { position: relative; z-index: 1; font-size: clamp(1.9rem, 4vw, 3rem); font-weight: 850; line-height: 1.25; margin: 18px 0 10px; }
.mission-hero p { position: relative; z-index: 1; max-width: 590px; color: #daf2e9; line-height: 1.9; margin: 0; }
.mission-hero__glow { position: absolute; width: 330px; height: 330px; inset-inline-end: -60px; top: -145px; border-radius: 50%; border: 55px solid rgba(170,255,214,.07); pointer-events: none; }
.mission-desk__toolbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 34px 0 18px; }
.mission-desk__toolbar h2 { font-size: 1.27rem; font-weight: 800; margin: 0; }
.mission-desk__toolbar p { font-size: .85rem; opacity: .72; margin: 4px 0 0; }
.mission-desk__card, .mission-desk__empty { border-radius: 26px; background: rgb(var(--v-theme-surface)); border: 1px solid rgba(98,146,137,.25); box-shadow: 0 16px 48px rgba(15,74,65,.07); }
.mission-desk__card { padding: clamp(22px, 4vw, 38px); }
.mission-desk__card-header { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 18px; }
.mission-desk__kicker { display: inline-flex; align-items: center; gap: 8px; color: #147d66; font-weight: 800; font-size: .84rem; }
.mission-desk__pulse { width: 9px; height: 9px; border-radius: 50%; background: #16b58f; box-shadow: 0 0 0 5px rgba(22,181,143,.16); }
.mission-desk__card h3 { font-size: clamp(1.35rem, 3vw, 1.85rem); margin: 9px 0 5px; }
.mission-desk__card-header p { opacity: .65; font-size: .79rem; overflow-wrap: anywhere; }
.mission-steps { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin: 34px 0; }
.mission-steps__item { display: flex; align-items: center; gap: 9px; min-height: 60px; padding: 11px; border-radius: 13px; background: rgba(111,138,130,.09); color: rgb(var(--v-theme-on-surface)); opacity: .6; font-size: .81rem; font-weight: 700; }
.mission-steps__item--reached { background: rgba(34,145,116,.13); color: #0b6f59; opacity: 1; }
.mission-steps__number { display: inline-grid; flex-shrink: 0; place-items: center; width: 28px; height: 28px; border-radius: 50%; border: 1px solid currentColor; font-size: .8rem; }
.mission-desk__foot { display: flex; align-items: center; justify-content: space-between; gap: 14px; border-top: 1px solid rgba(98,146,137,.2); padding-top: 18px; }
.mission-desk__foot p { display: flex; align-items: center; gap: 8px; margin: 0; font-size: .82rem; opacity: .76; }
.mission-desk__empty { text-align: center; padding: 58px 24px; }
.mission-desk__empty-icon { width: 70px; height: 70px; border-radius: 20px; background: rgba(34,145,116,.13); color: #198a73; display: grid; place-items: center; margin: 0 auto 16px; }
.mission-desk__empty h3 { font-size: 1.28rem; margin: 0 0 8px; }.mission-desk__empty p { opacity: .7; margin-bottom: 22px; }
.mission-desk__limit { font-size: .8rem; opacity: .68; margin: 20px 0 0; }
@media(max-width: 780px) { .mission-steps { grid-template-columns: repeat(2, 1fr); }.mission-desk__toolbar { align-items: flex-start; }.mission-desk__toolbar p { max-width: 230px; } }
@media(max-width: 480px) { .mission-steps { grid-template-columns: 1fr; margin: 22px 0; }.mission-steps__item { min-height: 44px; }.mission-desk__foot { align-items: flex-start; flex-direction: column; }.mission-hero__glow { opacity: .4; } }
</style>
