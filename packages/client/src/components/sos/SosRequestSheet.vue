<template>
  <v-bottom-sheet
    :model-value="modelValue"
    inset
    scrollable
    max-width="740"
    :persistent="sos.submitting.value"
    @update:model-value="onVisibility"
  >
    <v-card rounded="t-xl" class="sos-sheet">
      <v-card-title class="sos-sheet__header">
        <div class="sos-sheet__title-group">
          <span class="sos-sheet__badge" aria-hidden="true">
            <v-icon icon="mdi-alarm-light" size="22" />
          </span>
          <div>
            <h2 class="sos-sheet__title">درخواست امداد فوری (SOS)</h2>
            <p class="sos-sheet__subtitle">موقعیت و شرح حادثه مستقیماً برای مرکز هماهنگی ارسال می‌شود.</p>
          </div>
        </div>
        <v-btn
          icon
          variant="text"
          size="small"
          aria-label="بستن فرم امداد"
          :disabled="sos.submitting.value"
          @click="close"
        >
          <v-icon icon="mdi-close" />
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="sos-sheet__body">
        <div v-if="sos.isCompleted.value" class="sos-sheet__result" role="status" aria-live="polite">
          <v-alert type="success" variant="tonal" rounded="lg" class="mb-4">
            <strong>درخواست امداد شما با موفقیت ثبت شد.</strong>
            <div class="mt-1 text-sm">
              شناسهٔ پیگیری:
              <code dir="ltr">{{ sos.createdRequestId.value }}</code>
              — وضعیت: <strong>در انتظار بررسی و اعزام امدادگر</strong>
            </div>
            <div v-if="sos.photoUploadedUrl.value" class="mt-1 text-xs opacity-80">
              تصویر مستندات حادثه نیز ضمیمه شد.
            </div>
          </v-alert>
          <div class="flex flex-wrap justify-end gap-2">
            <v-btn variant="tonal" color="primary" rounded="lg" @click="startFresh">
              ثبت درخواست جدید
            </v-btn>
            <v-btn color="primary" variant="flat" rounded="lg" @click="close">بستن</v-btn>
          </div>
        </div>

        <div v-else-if="sos.awaitingPhotoRetry.value" class="sos-sheet__result" role="alert">
          <v-alert type="warning" variant="tonal" rounded="lg" class="mb-4">
            <strong>درخواست امداد شما ثبت شد</strong>
            (<code dir="ltr">{{ sos.createdRequestId.value }}</code>)، اما ارسال تصویر کامل نشد.
            <div v-if="sos.submitError.value" class="mt-1 text-sm">{{ sos.submitError.value }}</div>
          </v-alert>
          <div class="flex flex-wrap justify-end gap-2">
            <v-btn variant="text" rounded="lg" :disabled="sos.submitting.value" @click="sos.clearPhoto()">
              ادامه بدون تصویر
            </v-btn>
            <v-btn
              color="error"
              variant="flat"
              rounded="lg"
              :loading="sos.submitting.value"
              @click="sos.retryPhotoUpload()"
            >
              تلاش دوباره برای ارسال تصویر
            </v-btn>
          </div>
        </div>

        <form v-else class="sos-sheet__form" @submit.prevent="sos.submit()">
          <v-alert
            v-if="sos.submitError.value"
            type="error"
            variant="tonal"
            rounded="lg"
            role="alert"
            class="mb-4"
          >
            {{ sos.submitError.value }}
          </v-alert>

          <div class="sos-sheet__section">
            <label class="sos-sheet__label">شدت حادثه</label>
            <div class="sos-sheet__severities" role="radiogroup" aria-label="شدت حادثه">
              <button
                v-for="option in severityOptions"
                :key="option.value"
                type="button"
                role="radio"
                class="sos-severity-card"
                :class="{ 'is-selected': sos.severity.value === option.value }"
                :aria-checked="sos.severity.value === option.value"
                :style="sos.severity.value === option.value ? { borderColor: option.hex } : undefined"
                @click="sos.severity.value = option.value"
              >
                <span class="sos-severity-dot" :style="{ backgroundColor: option.hex }" aria-hidden="true" />
                <span class="sos-severity-title">{{ option.label }}</span>
                <small class="sos-severity-hint">{{ option.hint }}</small>
              </button>
            </div>
          </div>

          <div class="sos-sheet__section">
            <div class="flex items-center justify-between gap-2">
              <label class="sos-sheet__label">نوع حادثه</label>
              <v-btn
                v-if="sos.catalogError.value"
                variant="text"
                size="x-small"
                color="primary"
                :loading="sos.loadingCatalog.value"
                @click="sos.loadCatalog()"
              >
                بارگذاری دوباره
              </v-btn>
            </div>

            <v-alert
              v-if="sos.catalogError.value"
              type="warning"
              variant="tonal"
              density="compact"
              rounded="lg"
              class="mb-2"
            >
              {{ sos.catalogError.value }}
            </v-alert>
            <v-alert
              v-else-if="!sos.loadingCatalog.value && sos.incidentTypes.value.length === 0"
              type="info"
              variant="tonal"
              density="compact"
              rounded="lg"
              class="mb-2"
            >
              هنوز نوع حادثه‌ای توسط مدیر سامانه ثبت نشده است.
            </v-alert>

            <v-select
              v-model="sos.incidentTypeId.value"
              :items="sos.incidentTypes.value"
              item-title="name"
              item-value="id"
              label="انتخاب نوع حادثه"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              hide-details="auto"
              :loading="sos.loadingCatalog.value"
              :disabled="sos.submitting.value || sos.incidentTypes.value.length === 0"
              data-test="sos-incident-type"
            />
          </div>

          <div class="sos-sheet__section">
            <v-textarea
              v-model="sos.description.value"
              label="شرح وضعیت و نیاز امدادی (۱۰ تا ۵۰۰ نویسه)"
              placeholder="نوع آسیب، تعداد افراد، نشانه‌های محیطی یا وضعیت دسترسی را بنویسید…"
              variant="outlined"
              density="comfortable"
              rounded="lg"
              rows="3"
              auto-grow
              counter="500"
              :maxlength="maxDescriptionLength"
              :disabled="sos.submitting.value"
              data-test="sos-description"
            />
          </div>

          <div class="sos-sheet__section">
            <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span class="sos-sheet__label mb-0">موقعیت حادثه (GPS یا انتخاب روی نقشه)</span>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                rounded="lg"
                prepend-icon="mdi-crosshairs-gps"
                :loading="sos.locating.value"
                :disabled="sos.submitting.value"
                data-test="sos-gps-btn"
                @click="sos.requestGpsLocation()"
              >
                دریافت موقعیت فعلی (GPS)
              </v-btn>
            </div>

            <p v-if="sos.locationHint.value" class="mb-2 text-xs text-warning" role="status">
              {{ sos.locationHint.value }}
            </p>
            <p v-else-if="sos.location.value" class="mb-2 text-xs opacity-80" role="status">
              <template v-if="sos.location.value.isManual">
                موقعیت دستی انتخاب شد:
                <bdi dir="ltr">{{ sos.location.value.lat }}, {{ sos.location.value.lon }}</bdi>
              </template>
              <template v-else>
                موقعیت خودکار GPS ثبت شد:
                <bdi dir="ltr">{{ sos.location.value.lat }}, {{ sos.location.value.lon }}</bdi>
                <span v-if="sos.location.value.accuracy !== undefined">
                  (دقت تقریبی ±{{ sos.location.value.accuracy }} متر)
                </span>
              </template>
            </p>

            <div class="sos-sheet__map-wrap">
              <MapCanvas
                :style-url="mapStyleUrl"
                aria-label="نقشهٔ انتخاب محل حادثه؛ برای تعیین دستی نقطه روی نقشه ضربه بزنید"
                @ready="onPickerMapReady"
              />
            </div>
            <p class="mt-1 text-xs opacity-70">
              در صورت خطای GPS، مستقیماً روی نقشه ضربه بزنید یا مختصات را در کادرهای زیر وارد کنید.
            </p>

            <div class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <v-text-field
                :model-value="sos.latInput.value"
                label="عرض جغرافیایی (lat)"
                dir="ltr"
                density="compact"
                variant="outlined"
                rounded="lg"
                hide-details
                :disabled="sos.submitting.value"
                @update:model-value="onLatTyped"
              />
              <v-text-field
                :model-value="sos.lonInput.value"
                label="طول جغرافیایی (lon)"
                dir="ltr"
                density="compact"
                variant="outlined"
                rounded="lg"
                hide-details
                :disabled="sos.submitting.value"
                @update:model-value="onLonTyped"
              />
            </div>
          </div>

          <div class="sos-sheet__section">
            <label class="sos-sheet__label">تصویر صحنهٔ حادثه (اختیاری — حداکثر ۵ مگابایت)</label>
            <input
              ref="cameraInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              class="hidden"
              @change="onFilePicked"
            />
            <input
              ref="galleryInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="hidden"
              @change="onFilePicked"
            />
            <div class="flex flex-wrap items-center gap-2">
              <v-btn
                size="small"
                variant="tonal"
                rounded="lg"
                prepend-icon="mdi-camera-outline"
                :disabled="sos.submitting.value"
                @click="cameraInput?.click()"
              >
                ثبت با دوربین
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                rounded="lg"
                prepend-icon="mdi-image-outline"
                :disabled="sos.submitting.value"
                @click="galleryInput?.click()"
              >
                انتخاب از گالری
              </v-btn>
              <v-chip
                v-if="sos.photoFile.value"
                closable
                size="small"
                color="primary"
                variant="tonal"
                @click:close="sos.clearPhoto()"
              >
                {{ sos.photoFile.value.name || "تصویر ضمیمه‌شده" }}
              </v-chip>
            </div>
            <p v-if="sos.photoError.value" class="mt-1 text-xs text-error" role="alert">
              {{ sos.photoError.value }}
            </p>
          </div>
        </form>
      </v-card-text>

      <v-divider v-if="!sos.isCompleted.value && !sos.awaitingPhotoRetry.value" />

      <v-card-actions
        v-if="!sos.isCompleted.value && !sos.awaitingPhotoRetry.value"
        class="sos-sheet__actions"
      >
        <v-btn variant="text" rounded="lg" :disabled="sos.submitting.value" @click="close">
          انصراف
        </v-btn>
        <v-spacer />
        <v-btn
          color="error"
          variant="flat"
          size="large"
          rounded="lg"
          prepend-icon="mdi-send-circle-outline"
          :loading="sos.submitting.value"
          :disabled="!sos.canSubmit.value"
          data-test="sos-submit"
          @click="sos.submit()"
        >
          ارسال درخواست امداد فوری
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from "vue";
import type { Map as MapLibreMap, MapMouseEvent, Marker } from "maplibre-gl";
import MapCanvas from "@/components/map/MapCanvas.vue";
import { mapStyleForTheme } from "@/components/map/map-canvas-options";
import { useSosRequest } from "@/composables/use-sos-request";
import { SOS_DESCRIPTION_MAX_LENGTH, SOS_SEVERITY_OPTIONS } from "@/sos/sos-form";
import { useAuthStore } from "@/stores/auth";
import { useThemeStore } from "@/stores/theme";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
}>();

const auth = useAuthStore();
const theme = useThemeStore();

const sos = useSosRequest({
  accessToken: computed(() => auth.accessToken),
  ensureSession: () => auth.ensureSession()
});

const severityOptions = SOS_SEVERITY_OPTIONS;
const maxDescriptionLength = SOS_DESCRIPTION_MAX_LENGTH;
const mapStyleUrl = computed(() => mapStyleForTheme(theme.isDark));

const cameraInput = ref<HTMLInputElement | null>(null);
const galleryInput = ref<HTMLInputElement | null>(null);

const mapInstance = shallowRef<MapLibreMap | null>(null);
const pinMarker = shallowRef<Marker | null>(null);

async function syncPinMarker(): Promise<void> {
  const map = mapInstance.value;
  const current = sos.location.value;
  if (!map || !current) {
    pinMarker.value?.remove();
    pinMarker.value = null;
    return;
  }

  if (!pinMarker.value) {
    const { Marker: MapLibreMarker } = await import("maplibre-gl");
    const latest = sos.location.value;
    if (mapInstance.value !== map || !latest) return;
    const existing = pinMarker.value as Marker | null;
    if (!existing) {
      const marker = new MapLibreMarker({ color: "#dc2626", draggable: true })
        .setLngLat([latest.lon, latest.lat])
        .addTo(map);
      marker.on("dragend", () => {
        const point = marker.getLngLat();
        sos.setManualLocation(point.lat, point.lng);
      });
      pinMarker.value = marker;
    } else {
      existing.setLngLat([latest.lon, latest.lat]);
    }
    map.easeTo({
      center: [latest.lon, latest.lat],
      zoom: Math.max(map.getZoom(), 14),
      duration: 250
    });
    return;
  }

  pinMarker.value.setLngLat([current.lon, current.lat]);
  map.easeTo({
    center: [current.lon, current.lat],
    zoom: Math.max(map.getZoom(), 14),
    duration: 250
  });
}

function onPickerMapReady(map: MapLibreMap): void {
  mapInstance.value = map;
  map.on("click", (event: MapMouseEvent) => {
    sos.setManualLocation(event.lngLat.lat, event.lngLat.lng);
  });
  void syncPinMarker();
}

function onLatTyped(value: unknown): void {
  sos.setCoordinateInputs(typeof value === "string" ? value : "", sos.lonInput.value);
}

function onLonTyped(value: unknown): void {
  sos.setCoordinateInputs(sos.latInput.value, typeof value === "string" ? value : "");
}

function onFilePicked(event: Event): void {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0] ?? null;
  sos.selectPhoto(file);
  if (input) input.value = "";
}

function startFresh(): void {
  sos.reset();
  sos.prepareForOpen();
}

function onVisibility(next: boolean): void {
  emit("update:modelValue", next);
}

function close(): void {
  emit("update:modelValue", false);
}

watch(
  () => sos.location.value,
  () => {
    void syncPinMarker();
  }
);

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      sos.prepareForOpen();
      return;
    }
    pinMarker.value?.remove();
    pinMarker.value = null;
    mapInstance.value = null;
    if (sos.isCompleted.value) {
      sos.reset();
    }
  },
  { immediate: true }
);

onBeforeUnmount(() => {
  pinMarker.value?.remove();
  pinMarker.value = null;
  mapInstance.value = null;
});
</script>

<style scoped>
.sos-sheet__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.25rem;
}

.sos-sheet__title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.sos-sheet__badge {
  display: grid;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 0.9rem;
  background: rgba(220, 38, 38, 0.14);
  color: #dc2626;
  flex-shrink: 0;
}

.sos-sheet__title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
}

.sos-sheet__subtitle {
  margin: 0.1rem 0 0;
  font-size: 0.8rem;
  opacity: 0.74;
}

.sos-sheet__body {
  max-height: min(74vh, 42rem);
  padding: 1.25rem;
}

.sos-sheet__section + .sos-sheet__section {
  margin-top: 1.15rem;
}

.sos-sheet__label {
  display: block;
  margin-bottom: 0.45rem;
  font-size: 0.84rem;
  font-weight: 800;
}

.sos-sheet__severities {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
}

.sos-severity-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.7rem 0.8rem;
  border: 1.5px solid rgba(120, 140, 140, 0.28);
  border-radius: 0.85rem;
  background: transparent;
  text-align: start;
  cursor: pointer;
}

.sos-severity-card.is-selected {
  background: rgba(220, 38, 38, 0.06);
}

.sos-severity-dot {
  width: 0.65rem;
  height: 0.65rem;
  border-radius: 999px;
}

.sos-severity-title {
  font-size: 0.9rem;
  font-weight: 800;
}

.sos-severity-hint {
  font-size: 0.72rem;
  opacity: 0.75;
  line-height: 1.35;
}

.sos-sheet__map-wrap {
  height: 14.5rem;
  border-radius: 0.9rem;
  overflow: hidden;
  border: 1px solid rgba(120, 140, 140, 0.25);
}

.sos-sheet__actions {
  padding: 0.85rem 1.25rem;
}

@media (max-width: 600px) {
  .sos-sheet__severities {
    grid-template-columns: 1fr;
  }
}
</style>
