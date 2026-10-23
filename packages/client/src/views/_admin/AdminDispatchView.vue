<template>
  <v-container class="admin-dispatch py-6" fluid>
    <div class="d-flex flex-wrap align-center justify-space-between ga-3 mb-4">
      <div>
        <div class="d-flex align-center ga-2">
          <v-icon color="error" icon="mdi-radar" size="28" />
          <h1 class="text-h5 font-weight-bold mb-0">مرکز پایش و هشدار اضطراری (SOS)</h1>
          <v-chip
            :color="adminSos.connected ? 'success' : 'warning'"
            size="small"
            variant="tonal"
          >
            {{ adminSos.connected ? "متصل به اتاق زندهٔ ادمین" : "در حال اتصال زنده…" }}
          </v-chip>
        </div>
        <p class="text-body-2 text-medium-emphasis mt-1 mb-0">
          درخواست‌های SOS به‌صورت بلادرنگ با نشانگر تپنده، رنگ‌بندی شدت و هشدار صوتی دریافت می‌شوند.
        </p>
      </div>

      <div class="d-flex flex-wrap align-center ga-2">
        <v-btn-toggle
          :model-value="adminSos.filterStatus"
          density="compact"
          mandatory
          rounded="lg"
          variant="outlined"
          @update:model-value="onFilterChange"
        >
          <v-btn value="pending">
            در انتظار رسیدگی ({{ adminSos.pendingCount }})
          </v-btn>
          <v-btn value="all">
            همه ({{ adminSos.requests.length }})
          </v-btn>
        </v-btn-toggle>

        <v-btn
          :aria-label="adminSos.soundMuted ? 'فعال‌سازی صدای هشدار' : 'بی‌صدا کردن هشدار'"
          :color="adminSos.soundMuted ? 'warning' : 'primary'"
          :prepend-icon="adminSos.soundMuted ? 'mdi-volume-off' : 'mdi-volume-high'"
          rounded="lg"
          variant="tonal"
          @click="adminSos.toggleSoundMuted()"
        >
          {{ adminSos.soundMuted ? "بی‌صدا" : "صدای فعال" }}
        </v-btn>

        <v-btn
          prepend-icon="mdi-bell-ring-outline"
          rounded="lg"
          variant="outlined"
          @click="adminSos.testAlertSound()"
        >
          تست صدا
        </v-btn>

        <v-btn
          :loading="adminSos.loading"
          aria-label="بازخوانی فهرست درخواست‌های اضطراری"
          icon="mdi-refresh"
          variant="text"
          @click="adminSos.refreshRequests()"
        />
      </div>
    </div>

    <v-alert
      v-if="adminSos.errorMessage"
      class="mb-4"
      closable
      type="error"
      variant="tonal"
      @click:close="adminSos.errorMessage = null"
    >
      {{ adminSos.errorMessage }}
    </v-alert>

    <v-row>
      <v-col cols="12" lg="7">
        <v-card class="overflow-hidden" rounded="xl" variant="outlined">
          <div class="dispatch-map-wrapper">
            <MapCanvas
              aria-label="نقشهٔ زندهٔ درخواست‌های اضطراری SOS"
              :style-url="mapStyleUrl"
              :zoom="12"
              @ready="onMapReady"
            />
            <div class="severity-legend" role="note" aria-label="راهنمای رنگ شدت حادثه">
              <span class="legend-item">
                <span class="legend-dot legend-dot--high" /> بحرانی
              </span>
              <span class="legend-item">
                <span class="legend-dot legend-dot--medium" /> متوسط
              </span>
              <span class="legend-item">
                <span class="legend-dot legend-dot--low" /> کم‌خطر
              </span>
            </div>
          </div>
        </v-card>
      </v-col>

      <v-col cols="12" lg="5">
        <v-card class="mb-4" rounded="xl" variant="outlined">
          <v-card-title class="d-flex align-center justify-space-between text-subtitle-1 font-weight-bold">
            <span>صف درخواست‌های اضطراری</span>
            <v-chip color="error" size="small" variant="flat">
              {{ adminSos.visibleRequests.length }} مورد
            </v-chip>
          </v-card-title>
          <v-divider />

          <v-card-text v-if="adminSos.visibleRequests.length === 0" class="py-8 text-center text-medium-emphasis">
            در حال حاضر درخواست اضطراری فعالی در این نما ثبت نشده است. به محض ارسال SOS جدید، نشانگر تپنده و هشدار صوتی فعال می‌شود.
          </v-card-text>

          <v-list v-else class="dispatch-request-list py-0" lines="two">
            <template v-for="(item, index) in adminSos.visibleRequests" :key="item.id">
              <v-divider v-if="index > 0" />
              <v-list-item
                :active="item.id === adminSos.selectedId"
                class="py-3"
                @click="focusRequest(item)"
              >
                <template #prepend>
                  <span
                    class="pulse-indicator me-3"
                    :style="{ '--alert-color': severityMeta(item.severity).color }"
                    aria-hidden="true"
                  />
                </template>

                <v-list-item-title class="d-flex align-center justify-space-between ga-2 font-weight-bold">
                  <span>{{ incidentLabel(item.incidentTypeId) }}</span>
                  <v-chip
                    :color="severityMeta(item.severity).badgeColor"
                    size="x-small"
                    variant="flat"
                  >
                    {{ severityMeta(item.severity).label }}
                  </v-chip>
                </v-list-item-title>

                <v-list-item-subtitle class="mt-1">
                  {{ item.description }}
                </v-list-item-subtitle>

                <div class="d-flex flex-wrap align-center ga-2 mt-2 text-caption text-medium-emphasis">
                  <span>{{ formatTimestamp(item.createdAt) }}</span>
                  <span>•</span>
                  <span dir="ltr">
                    {{ item.location.lat.toFixed(5) }}, {{ item.location.lon.toFixed(5) }}
                  </span>
                  <v-chip v-if="item.photoUrl" color="secondary" size="x-small" variant="tonal">
                    دارای تصویر پیوست
                  </v-chip>
                </div>
              </v-list-item>
            </template>
          </v-list>
        </v-card>

        <v-card v-if="adminSos.selectedRequest" rounded="xl" variant="outlined">
          <v-card-title class="d-flex align-center justify-space-between text-subtitle-1 font-weight-bold">
            <span>جزئیات درخواست انتخاب‌شده</span>
            <v-chip
              :color="severityMeta(adminSos.selectedRequest.severity).badgeColor"
              size="small"
              variant="flat"
            >
              {{ severityMeta(adminSos.selectedRequest.severity).label }}
            </v-chip>
          </v-card-title>
          <v-divider />
          <v-card-text class="d-flex flex-column ga-2 text-body-2">
            <div>
              <strong>نوع حادثه:</strong>
              {{ incidentLabel(adminSos.selectedRequest.incidentTypeId) }}
            </div>
            <div>
              <strong>وضعیت فعلی:</strong>
              {{ adminSos.selectedRequest.status }}
            </div>
            <div>
              <strong>موقعیت جغرافیایی:</strong>
              <span dir="ltr" class="ms-1">
                {{ adminSos.selectedRequest.location.lat.toFixed(6) }},
                {{ adminSos.selectedRequest.location.lon.toFixed(6) }}
              </span>
              <span class="ms-2 text-caption text-medium-emphasis">
                ({{ adminSos.selectedRequest.location.isManual ? "انتخاب دستی روی نقشه" : "GPS دستگاه" }})
              </span>
            </div>
            <div v-if="adminSos.selectedRequest.location.accuracy !== undefined">
              <strong>دقت گزارش‌شده:</strong>
              ±{{ Math.round(adminSos.selectedRequest.location.accuracy) }} متر
            </div>
            <div>
              <strong>زمان ثبت:</strong>
              {{ formatTimestamp(adminSos.selectedRequest.createdAt) }}
            </div>
            <div>
              <strong>توضیحات امدادخواه:</strong>
              <p class="mt-1 mb-0">{{ adminSos.selectedRequest.description }}</p>
            </div>
            <div v-if="adminSos.selectedRequest.photoUrl" class="text-caption text-medium-emphasis">
              <strong>شناسهٔ پیوست تصویری ثبت‌شده:</strong>
              <code dir="ltr" class="ms-1">{{ adminSos.selectedRequest.photoUrl }}</code>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import type { IncidentType, Severity, SosRequestRecord } from "@shared/index";
import { listSosIncidentTypes } from "@/api/sos";
import {
  buildSosAlertsGeoJson,
  SOS_SEVERITY_PRESENTATION
} from "@/admin/sos-alerts";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { DEFAULT_DARK_MAP_STYLE, DEFAULT_MAP_STYLE } from "@/components/map/map-canvas-options";
import { pinia } from "@/stores";
import { useAdminSosStore } from "@/stores/admin-sos";
import { useThemeStore } from "@/stores/theme";

const SOS_SOURCE_ID = "admin-sos-requests";
const SOS_PULSE_LAYER_ID = "admin-sos-pulse";
const SOS_CORE_LAYER_ID = "admin-sos-core";

const route = useRoute();
const adminSos = useAdminSosStore(pinia);
const themeStore = useThemeStore(pinia);

const incidentTypes = ref<IncidentType[]>([]);
const mapStyleUrl = computed(() =>
  themeStore.isDark ? DEFAULT_DARK_MAP_STYLE : DEFAULT_MAP_STYLE
);
const incidentNameById = computed(
  () => new Map(incidentTypes.value.map((item) => [item.id, item.name]))
);

let mapInstance: MapLibreMap | null = null;
let pulseAnimationFrame: number | null = null;
let detachMapEvents: (() => void) | null = null;

function severityMeta(severity: Severity) {
  return SOS_SEVERITY_PRESENTATION[severity];
}

function incidentLabel(incidentTypeId: string): string {
  return incidentNameById.value.get(incidentTypeId) ?? "حادثهٔ اضطراری";
}

function formatTimestamp(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? iso : parsed.toLocaleString("fa-IR");
}

function onFilterChange(value: unknown): void {
  if (value === "pending" || value === "all") {
    adminSos.setFilterStatus(value);
  }
}

type GeoJsonSourceData = Parameters<GeoJSONSource["setData"]>[0];

function ensureSosMapLayers(map: MapLibreMap): void {
  const data = buildSosAlertsGeoJson(adminSos.visibleRequests, adminSos.selectedId);
  const existingSource = map.getSource(SOS_SOURCE_ID) as GeoJSONSource | undefined;
  if (!existingSource) {
    map.addSource(SOS_SOURCE_ID, {
      type: "geojson",
      data: data as unknown as GeoJsonSourceData
    });
  } else {
    existingSource.setData(data as unknown as GeoJsonSourceData);
  }

  if (!map.getLayer(SOS_PULSE_LAYER_ID)) {
    map.addLayer({
      id: SOS_PULSE_LAYER_ID,
      type: "circle",
      source: SOS_SOURCE_ID,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": 18,
        "circle-opacity": 0.35
      }
    });
  }

  if (!map.getLayer(SOS_CORE_LAYER_ID)) {
    map.addLayer({
      id: SOS_CORE_LAYER_ID,
      type: "circle",
      source: SOS_SOURCE_ID,
      paint: {
        "circle-color": ["get", "color"],
        "circle-radius": ["case", ["boolean", ["get", "isSelected"], false], 10, 8],
        "circle-stroke-width": ["case", ["boolean", ["get", "isSelected"], false], 3.5, 2],
        "circle-stroke-color": "#ffffff"
      }
    });
  }
}

function syncMapData(): void {
  const map = mapInstance;
  if (!map || !map.isStyleLoaded()) return;
  ensureSosMapLayers(map);
}

function startPulseLoop(): void {
  if (pulseAnimationFrame !== null || typeof requestAnimationFrame !== "function") return;
  const step = (timestamp: number) => {
    const map = mapInstance;
    if (map && map.isStyleLoaded() && map.getLayer(SOS_PULSE_LAYER_ID)) {
      const phase = (timestamp % 1600) / 1600;
      const radius = 11 + phase * 18;
      const opacity = Math.max(0.06, (1 - phase) * 0.45);
      map.setPaintProperty(SOS_PULSE_LAYER_ID, "circle-radius", radius);
      map.setPaintProperty(SOS_PULSE_LAYER_ID, "circle-opacity", opacity);
    }
    pulseAnimationFrame = requestAnimationFrame(step);
  };
  pulseAnimationFrame = requestAnimationFrame(step);
}

function stopPulseLoop(): void {
  if (pulseAnimationFrame !== null && typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(pulseAnimationFrame);
  }
  pulseAnimationFrame = null;
}

function focusRequest(item: SosRequestRecord): void {
  adminSos.selectRequest(item.id);
  mapInstance?.flyTo({
    center: [item.location.lon, item.location.lat],
    zoom: Math.max(mapInstance.getZoom(), 14)
  });
}

function onMapReady(map: MapLibreMap): void {
  detachMapEvents?.();
  mapInstance = map;
  ensureSosMapLayers(map);
  startPulseLoop();

  if (adminSos.selectedRequest) {
    map.jumpTo({
      center: [
        adminSos.selectedRequest.location.lon,
        adminSos.selectedRequest.location.lat
      ],
      zoom: 13
    });
  }

  const onStyleData = () => {
    if (map.isStyleLoaded()) ensureSosMapLayers(map);
  };
  const onMarkerClick = (event: MapMouseEvent) => {
    const features = map.queryRenderedFeatures(event.point, {
      layers: [SOS_CORE_LAYER_ID, SOS_PULSE_LAYER_ID]
    });
    const clickedId = features[0]?.properties?.id;
    if (typeof clickedId === "string") {
      adminSos.selectRequest(clickedId);
    }
  };

  map.on("styledata", onStyleData);
  map.on("click", onMarkerClick);
  detachMapEvents = () => {
    map.off("styledata", onStyleData);
    map.off("click", onMarkerClick);
  };
}

watch(
  () => [adminSos.visibleRequests, adminSos.selectedId] as const,
  () => {
    syncMapData();
  }
);

watch(
  () => route.query.request,
  (requestQuery) => {
    if (typeof requestQuery === "string" && requestQuery.length > 0) {
      const target = adminSos.requests.find((r) => r.id === requestQuery);
      if (target) {
        focusRequest(target);
      } else {
        adminSos.selectRequest(requestQuery);
      }
    }
  },
  { immediate: true }
);

onMounted(async () => {
  adminSos.startMonitoring();
  try {
    incidentTypes.value = await listSosIncidentTypes();
  } catch {
    // Request list remains usable with default fallback labels if catalog read transiently fails.
  }
});

onBeforeUnmount(() => {
  stopPulseLoop();
  detachMapEvents?.();
  detachMapEvents = null;
  mapInstance = null;
});
</script>

<style scoped>
.dispatch-map-wrapper {
  position: relative;
  height: min(68vh, 560px);
  min-height: 360px;
}

.dispatch-request-list {
  max-height: 360px;
  overflow-y: auto;
}

.severity-legend {
  position: absolute;
  bottom: 12px;
  inset-inline-start: 12px;
  z-index: 2;
  display: flex;
  gap: 12px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.82);
  color: #f8fafc;
  font-size: 0.78rem;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.legend-dot--high {
  background: #dc2626;
}

.legend-dot--medium {
  background: #d97706;
}

.legend-dot--low {
  background: #0284c7;
}

.pulse-indicator {
  position: relative;
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--alert-color, #dc2626);
  box-shadow: 0 0 0 0 var(--alert-color, #dc2626);
  animation: sos-pulse 1.6s infinite ease-out;
}

@keyframes sos-pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--alert-color, #dc2626) 65%, transparent);
  }
  75% {
    box-shadow: 0 0 0 10px transparent;
  }
  100% {
    box-shadow: 0 0 0 0 transparent;
  }
}
</style>
