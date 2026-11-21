<template>
  <details class="mission-trace" dir="rtl" @toggle="onToggle">
    <summary>مسیرهای ثبت‌شده و مقایسه با مسیر پیشنهادی</summary>
    <div class="mission-trace__body">
      <p>فقط نمونه‌های GPS دریافت‌شده در مأموریت ذخیره شده‌اند؛ خاموش بودن دستگاه، قطع اتصال یا دقت پایین ممکن است در مسیر فاصله بیندازد.</p>
      <v-alert v-if="error" type="warning" variant="tonal" role="alert">{{ error }}
        <v-btn variant="text" size="small" @click="load">تلاش دوباره</v-btn>
      </v-alert>
      <v-progress-linear v-if="loading" indeterminate color="primary" aria-label="دریافت مسیرهای مأموریت" />
      <template v-if="trace && !loading">
        <v-alert v-if="trace.incomplete" type="warning" variant="tonal" role="status">
          سابقهٔ GPS طولانی است؛ فقط بخشی از نمونه‌ها بارگذاری شده‌اند و مقایسهٔ طول مسیر کامل نیست.
        </v-alert>
        <p v-if="!trace.points.length" role="status">برای این مأموریت نمونهٔ GPS ثبت نشده است.</p>
        <p v-if="!routeLine" role="status">مسیر پیشنهادی برای شما در دسترس نیست؛ ممکن است ذخیره نشده باشد یا دسترسی آن محدود باشد.</p>
        <p v-else>آخرین مسیر پیشنهادی ذخیره‌شده ({{ profileLabel }}، خط بنفشِ چین‌دار): {{ formatRouteDistance(trace.suggestedRoute!.distanceM) }}؛ مسیرهای رنگی، بخش‌های پیوستهٔ نمونه‌های GPS ثبت‌شده در کل مأموریت هستند.</p>
        <div v-if="routeLine || trace.points.length" class="mission-trace__map">
          <MapCanvas :center="mapCenter" :zoom="11" :constrain-bounds="false" :show-zoom="true"
            :show-navigation="showNavigation"
            :style-url="mapStyleUrl" aria-label="نقشهٔ مقایسهٔ مسیر پیشنهادی و GPS ثبت‌شدهٔ اعضای مجاز"
            @ready="onMapReady" />
        </div>
        <ul v-if="roles.length" class="mission-trace__legend" aria-label="راهنمای مسیرهای واقعی">
          <li v-for="role in roles" :key="role.role">
            <span class="mission-trace__dot" :class="role.role" aria-hidden="true" />
            <strong>{{ TRACE_LABEL[role.role] }}</strong> · {{ role.count.toLocaleString('fa-IR') }} نمونه
            <span v-if="role.gaps">· {{ role.gaps.toLocaleString('fa-IR') }} گسست / نمونهٔ کم‌دقت</span>
            <span v-if="role.segments.length">· طول بخش‌های پیوستهٔ مشاهده‌شده: {{ formatRouteDistance(role.measuredMetres) }}</span>
          </li>
        </ul>
        <p v-if="routeLine && rescuerTrace && rescuerTrace.segments.length && !trace.incomplete" class="mission-trace__comparison">
          طول مسیر پیشنهادی {{ formatRouteDistance(trace.suggestedRoute!.distanceM) }}؛ طول بخش‌های پیوستهٔ GPS امدادگر پس از ثبت مسیر پیشنهادی
          {{ formatRouteDistance(rescuerTrace.measuredMetres) }}.
          {{ rescuerTrace.gaps ? 'به‌دلیل گسست یا دقت پایین، اختلاف طول را نمی‌توان برای کل سفر محاسبه کرد.' : 'این اختلاف بین نمونه‌های GPS و نقشهٔ پیشنهادی است، نه اندازه‌گیری قطعی تمام حرکت.' }}
        </p>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { getMissionLocationTrace, type MissionTrace } from "@/api/mission";
import { accountSessionKey } from "@/composables/device-identity";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";
import { formatRouteDistance } from "@/sos/route-preview";
import { buildMissionTraces, rescuerComparisonTrace, suggestedLine, TRACE_LABEL } from "@/mission/trace-geometry";

const props = withDefaults(defineProps<{ missionId: string; showNavigation?: boolean }>(), {
  showNavigation: true
});
const auth = useAuthStore();
const theme = useThemeStore();
const mapStyleUrl = computed(() => theme.isDark ? DEFAULT_DARK_MAP_STYLE : DEFAULT_MAP_STYLE);
const trace = ref<MissionTrace | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const opened = ref(false);
const map = shallowRef<MapLibreMap | null>(null);
const roles = computed(() => buildMissionTraces(trace.value?.points ?? []));
const rescuerTrace = computed(() => trace.value ? rescuerComparisonTrace(trace.value) : null);
const routeLine = computed(() => suggestedLine(trace.value?.suggestedRoute ?? null));
const profileLabel = computed(() => ({ car: "خودرو", bicycle: "دوچرخه", foot: "پیاده" })[trace.value?.suggestedRoute?.profile ?? "foot"]);
const allPoints = computed(() => [
  ...(routeLine.value ?? []), ...(trace.value?.points.map((point) => [point.lon, point.lat] as [number, number]) ?? [])
]);
const mapCenter = computed<[number, number]>(() => allPoints.value[0] ?? [51.4, 35.7]);
let controller: AbortController | null = null;
let generation = 0;
function onToggle(event: Event): void {
  opened.value = (event.target as HTMLDetailsElement).open;
  if (opened.value && !trace.value && !loading.value) void load();
}
async function load(): Promise<void> {
  controller?.abort();
  const abort = new AbortController();
  controller = abort;
  const gen = ++generation;
  const id = props.missionId;
  const owner = accountSessionKey(auth.user?.id ?? null, auth.accessToken);
  trace.value = null;
  error.value = null;
  loading.value = true;
  try {
    await auth.ensureSession();
    const token = auth.accessToken;
    if (!token || !owner || owner !== accountSessionKey(auth.user?.id ?? null, token)) return;
    const result = await getMissionLocationTrace(token, id, abort.signal);
    if (gen === generation && !abort.signal.aborted && props.missionId === id &&
      owner === accountSessionKey(auth.user?.id ?? null, auth.accessToken)) trace.value = result;
  } catch {
    if (gen === generation && !abort.signal.aborted) error.value = "مسیرهای مأموریت دریافت نشدند؛ دوباره تلاش کنید.";
  } finally {
    if (gen === generation) loading.value = false;
  }
}
watch(() => [props.missionId, accountSessionKey(auth.user?.id ?? null, auth.accessToken)] as const, () => {
  ++generation;
  controller?.abort();
  controller = null;
  trace.value = null;
  // Clear map sources synchronously on account/mission switch, before Vue unmounts the canvas.
  for (const name of ["mission-suggested-history", "mission-actual-history", "mission-fixes-history"]) {
    (map.value?.getSource(name) as GeoJSONSource | undefined)?.setData({ type: "FeatureCollection", features: [] });
  }
  error.value = null;
  loading.value = false;
  if (opened.value) void load();
}, { flush: "sync" });
onBeforeUnmount(() => { ++generation; controller?.abort(); map.value?.off("style.load", draw); map.value = null; });

function draw(): void {
  const instance = map.value;
  if (!instance || !instance.isStyleLoaded() || !trace.value) return;
  const features = roles.value.flatMap((role) => role.segments.map((segment) => ({
    type: "Feature" as const, properties: { role: role.role },
    geometry: { type: "LineString" as const, coordinates: segment }
  })));
  const points = trace.value.points.map((point) => ({
    type: "Feature" as const, properties: { role: point.role, uncertain: point.accuracy != null && point.accuracy > 100 },
    geometry: { type: "Point" as const, coordinates: [point.lon, point.lat] }
  }));
  const actual = { type: "FeatureCollection" as const, features };
  const fixes = { type: "FeatureCollection" as const, features: points };
  const suggested = { type: "FeatureCollection" as const, features: routeLine.value ? [{
    type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: routeLine.value }
  }] : [] };
  const source = (id: string, data: unknown) => {
    const existing = instance.getSource(id) as GeoJSONSource | undefined;
    if (existing) existing.setData(data as never);
    else instance.addSource(id, { type: "geojson", data: data as never });
  };
  source("mission-suggested-history", suggested);
  source("mission-actual-history", actual);
  source("mission-fixes-history", fixes);
  if (!instance.getLayer("mission-suggested-line")) instance.addLayer({ id: "mission-suggested-line", type: "line",
    source: "mission-suggested-history", paint: { "line-color": "#7d3faa", "line-width": 4,
      "line-dasharray": [2, 2] } });
  const color: ExpressionSpecification = ["match", ["get", "role"], "rescuer", "#16826c", "requester", "#dc593b", "admin", "#5555ae", "#888888"];
  if (!instance.getLayer("mission-actual-line")) instance.addLayer({ id: "mission-actual-line", type: "line",
    source: "mission-actual-history", paint: { "line-color": color, "line-width": 4 } });
  if (!instance.getLayer("mission-fix-points")) instance.addLayer({ id: "mission-fix-points", type: "circle",
    source: "mission-fixes-history", paint: { "circle-color": color, "circle-radius": 3,
      "circle-opacity": ["case", ["get", "uncertain"], .35, .8] } });
  if (allPoints.value.length > 1) {
    const lon = allPoints.value.map((point) => point[0]);
    const lat = allPoints.value.map((point) => point[1]);
    instance.fitBounds([[Math.min(...lon), Math.min(...lat)], [Math.max(...lon), Math.max(...lat)]],
      { padding: 35, maxZoom: 15, duration: 0 });
  } else if (allPoints.value[0]) instance.jumpTo({ center: allPoints.value[0], zoom: 14 });
}
function onMapReady(instance: MapLibreMap): void {
  map.value?.off("style.load", draw);
  map.value = instance;
  instance.on("style.load", draw);
  draw();
}
watch(trace, () => draw());
</script>

<style scoped>
.mission-trace { margin: 1rem 0; padding: 1rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-card, 24px); background: rgb(var(--v-theme-surface)); }
.mission-trace summary { min-height: 44px; cursor: pointer; font-weight: 700; color: rgb(var(--v-theme-primary)); }
.mission-trace summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-trace__body { display: grid; gap: .8rem; }
.mission-trace__body p { margin: 0; line-height: 1.7; font-size: .85rem; }
.mission-trace__map { width: 100%; height: min(52dvh, 380px); min-height: 250px; overflow: hidden; border-radius: var(--bb-radius-nested, 16px); }
.mission-trace__map :deep(.map-canvas) { height: 100%; min-height: 0; }
.mission-trace__legend { list-style: none; margin: 0; padding: 0; display: grid; gap: .5rem; font-size: .85rem; }
.mission-trace__legend li { display: flex; align-items: center; flex-wrap: wrap; gap: .3rem; }
.mission-trace__dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.mission-trace__dot.requester { background: #dc593b; }.mission-trace__dot.rescuer { background: #16826c; }.mission-trace__dot.admin { background: #5555ae; }
.mission-trace__comparison { padding: .7rem; background: var(--bb-color-inset); border-radius: var(--bb-radius-nested, 16px); }
</style>
