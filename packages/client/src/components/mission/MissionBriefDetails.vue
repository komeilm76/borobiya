<template>
  <div class="mission-brief" aria-label="خلاصهٔ حادثه و جزئیات مأموریت">
    <div class="mission-brief__body">
      <p v-if="loading || (!brief && !error)" role="status" class="mission-brief__notice">در حال دریافت اطلاعات حادثه…</p>
      <p v-else-if="error" role="alert" class="mission-brief__notice">{{ error }}
        <v-btn size="small" variant="text" color="primary" @click="load">تلاش دوباره</v-btn>
      </p>
      <template v-else-if="brief">
        <div class="mission-brief__overview">
          <div class="mission-brief__identity">
            <span class="mission-brief__incident-icon" aria-hidden="true"><v-icon icon="mdi-alert-circle-outline" size="21" /></span>
            <div><strong dir="auto">{{ brief.incidentTypeName }}</strong>
              <span>درخواست‌کننده · <bdi dir="auto">{{ brief.requesterName }}</bdi></span></div>
          </div>
          <div class="mission-brief__address">
            <v-icon icon="mdi-map-marker-outline" size="20" aria-hidden="true" />
            <div><span>محل حادثه · نشانی تقریبی</span>
              <p v-if="addressLoading" role="status">در حال یافتن نشانی…</p>
              <strong v-else-if="address" dir="auto" class="mission-brief__address-preview">{{ address }}</strong>
              <p v-else role="status">نشانی در دسترس نیست؛ نقطهٔ حادثه روی نقشه ثبت شده است.
                <v-btn v-if="addressFailed" size="small" variant="text" color="primary" @click="loadAddress(brief)">تلاش دوباره</v-btn>
              </p>
            </div>
          </div>
          <div class="mission-brief__snapshot">
            <div class="mission-brief__need">
              <span>شرح حادثه</span>
              <p dir="auto" class="mission-brief__need-preview">{{ brief.description || 'شرحی ثبت نشده است.' }}</p>
            </div>
            <button v-if="brief.hasPhoto && photoSrc" ref="photoButton" class="mission-brief__photo" type="button"
              aria-label="نمایش تصویر حادثه در اندازهٔ بزرگ" :disabled="photoOpening" @click="openPhoto">
              <img :src="photoSrc" alt="تصویر کوچک حادثه" referrerpolicy="no-referrer" @error="expirePhoto" />
            </button>
            <span v-else-if="brief.hasPhoto && photoLoading" class="mission-brief__photo-placeholder" aria-hidden="true"><v-icon icon="mdi-image-outline" size="23" /></span>
          </div>
          <small v-if="photoLoading" role="status">در حال دریافت تصویر…</small>
          <small v-if="photoError" role="alert">{{ photoError }}
            <v-btn size="small" variant="text" color="primary" @click="loadPhoto">تلاش دوباره</v-btn>
          </small>
        </div>
        <details class="mission-brief__details">
          <summary>شناسه و مختصات حادثه
            <v-icon icon="mdi-chevron-down" size="18" aria-hidden="true" />
          </summary>
          <div class="mission-brief__details-body">
            <div class="mission-brief__id">
              <span>شناسهٔ مأموریت</span>
              <div class="mission-brief__id-actions">
                <bdi dir="ltr" :aria-label="`شناسهٔ کامل مأموریت: ${missionId}`">{{ shortMissionId }}</bdi>
                <v-btn icon="mdi-content-copy" size="small" variant="tonal" color="primary"
                  aria-label="کپی شناسهٔ کامل مأموریت" :disabled="!missionId" @click="copyMissionId" />
              </div>
            </div>
            <small v-if="copyStatus === 'copied'" role="status">شناسهٔ کامل کپی شد.</small>
            <label v-else-if="copyStatus === 'failed'" class="mission-brief__copy-fallback">
              کپی خودکار ممکن نشد؛ شناسهٔ کامل را از این کادر کپی کنید.
              <input :value="missionId" readonly dir="ltr" aria-label="شناسهٔ کامل مأموریت برای کپی دستی" @focus="($event.target as HTMLInputElement).select()" />
            </label>
            <div><span>مختصات ثبت‌شدهٔ حادثه</span><bdi dir="ltr">{{ brief.incident.lat.toFixed(5) }}, {{ brief.incident.lon.toFixed(5) }}</bdi></div>
          </div>
        </details>
      </template>
    </div>
    <v-dialog :model-value="photoOpen && !!photoSrc" max-width="960"
      aria-labelledby="mission-photo-title" @update:model-value="(open: boolean) => { if (!open) closePhoto(); }">
      <v-card class="mission-brief__viewer" dir="rtl" rounded="xl">
        <header class="mission-brief__viewer-header">
          <h2 id="mission-photo-title">تصویر حادثه</h2>
          <v-btn icon="mdi-close" variant="text" aria-label="بستن تصویر حادثه" @click="closePhoto" />
        </header>
        <div class="mission-brief__viewer-content">
          <img v-if="photoSrc" :src="photoSrc" alt="تصویر کامل ثبت‌شدهٔ حادثه" referrerpolicy="no-referrer" @error="expirePhoto" />
        </div>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import type { MissionBrief } from "@shared/index";
import { getMissionBrief } from "@/api/mission";
import { getSosPhotoSrc } from "@/api/admin-sos";
import { reversePlace } from "@/api/geocoding";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{ missionId: string; visible: boolean }>();
const auth = useAuthStore();
const brief = ref<MissionBrief | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const shortMissionId = computed(() => props.missionId.length > 16
  ? `${props.missionId.slice(0, 8)}…${props.missionId.slice(-4)}` : props.missionId);
const copyStatus = ref<"copied" | "failed" | null>(null);
const address = ref<string | null>(null);
const addressLoading = ref(false);
const addressFailed = ref(false);
const photoSrc = ref<string | null>(null);
const photoLoading = ref(false);
const photoError = ref<string | null>(null);
const photoOpen = ref(false);
const photoOpening = ref(false);
const photoLoadedAt = ref(0);
const photoButton = ref<HTMLButtonElement | null>(null);
async function openPhoto() {
  if (!photoSrc.value || photoOpening.value) return;
  const current = generation, missionId = props.missionId;
  photoOpening.value = true;
  try {
    // SOS photo links expire after 60 seconds; refresh before opening a
    // potentially stale thumbnail instead of showing a broken full-size image.
    if (Date.now() - photoLoadedAt.value > 45_000) await loadPhoto();
    if (current === generation && missionId === props.missionId && props.visible &&
      photoSrc.value && !photoError.value && Date.now() - photoLoadedAt.value <= 45_000) photoOpen.value = true;
  } finally { if (current === generation) photoOpening.value = false; }
}
function closePhoto() {
  photoOpen.value = false;
  void nextTick(() => photoButton.value?.focus({ preventScroll: true }));
}
function expirePhoto() {
  photoOpen.value = false;
  photoSrc.value = null; photoLoadedAt.value = 0;
  photoError.value = 'دسترسی به تصویر پایان یافت؛ دوباره دریافت کنید.';
}
let generation = 0;
let controller: AbortController | null = null;
function clear() {
  generation++;
  controller?.abort(); controller = null;
  brief.value = null; loading.value = false; error.value = null;
  address.value = null; addressLoading.value = false; addressFailed.value = false;
  photoSrc.value = null; photoLoading.value = false; photoError.value = null;
  photoOpen.value = false; photoOpening.value = false; photoLoadedAt.value = 0;
  copyStatus.value = null;
}
async function copyMissionId() {
  const id = props.missionId, current = generation;
  if (!id) return;
  copyStatus.value = null;
  try {
    await navigator.clipboard.writeText(id);
    if (current === generation && props.missionId === id) copyStatus.value = "copied";
  } catch {
    if (current === generation && props.missionId === id) copyStatus.value = "failed";
  }
}
async function loadAddress(mission: MissionBrief) {
  const current = generation, owner = auth.user?.id;
  if (!props.visible || brief.value?.missionId !== mission.missionId || addressLoading.value) return;
  addressLoading.value = true; addressFailed.value = false;
  try {
    // Reverse geocoding is local and approximate; never claim the returned POI
    // is the requester's verified street address or replace the incident point.
    const result = await reversePlace(mission.incident, controller?.signal);
    if (current === generation && props.visible && auth.user?.id === owner) {
      address.value = result?.formattedAddress ?? null;
      addressFailed.value = !address.value;
    }
  } catch {
    if (current === generation && props.visible && auth.user?.id === owner) addressFailed.value = true;
  } finally {
    if (current === generation) addressLoading.value = false;
  }
}
async function load() {
  const id = props.missionId, token = auth.accessToken, owner = auth.user?.id;
  if (!props.visible || !id || !token || !owner || loading.value) return;
  const current = ++generation;
  controller?.abort(); controller = new AbortController();
  loading.value = true; error.value = null;
  try {
    const result = await getMissionBrief(token, id, controller.signal);
    if (current === generation && props.visible && auth.user?.id === owner && auth.accessToken === token && props.missionId === id) {
      brief.value = result;
      void loadAddress(result);
      if (result.hasPhoto) void loadPhoto();
    }
  } catch {
    if (current === generation) error.value = "اطلاعات حادثه در دسترس نیست؛ دوباره تلاش کنید.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function loadPhoto() {
  const id = brief.value?.sosRequestId, token = auth.accessToken, owner = auth.user?.id;
  if (!props.visible || !id || !token || !owner || photoLoading.value) return;
  const current = generation;
  photoLoading.value = true; photoError.value = null;
  try {
    const src = await getSosPhotoSrc(id, token);
    if (current === generation && props.visible && auth.user?.id === owner && auth.accessToken === token && brief.value?.sosRequestId === id) {
      photoSrc.value = src;
      photoLoadedAt.value = Date.now();
    }
  } catch {
    if (current === generation) {
      photoSrc.value = null; photoLoadedAt.value = 0;
      photoError.value = "دریافت تصویر ممکن نشد.";
    }
  } finally {
    if (current === generation) photoLoading.value = false;
  }
}
watch(() => [props.visible, props.missionId, auth.user?.id, auth.accessToken] as const, () => {
  clear();
  if (props.visible) void load();
}, { immediate: true, flush: "sync" });
onBeforeUnmount(clear);
</script>

<style scoped>
.mission-brief { flex: 0 1 auto; min-height: 0; min-width: 0; overflow-y: auto; overscroll-behavior: contain; }
.mission-brief__body { display: grid; gap: .3rem; min-width: 0; font-size: .875rem; line-height: 1.5; overflow-wrap: anywhere; }
.mission-brief__body span { color: var(--bb-color-muted); font-size: var(--bb-rescue-font-caption); font-weight: var(--bb-rescue-weight-medium); }
.mission-brief__body strong { font-weight: var(--bb-rescue-weight-emphasized); }
.mission-brief__notice { margin: .35rem 0; }
.mission-brief__overview { display: grid; gap: .45rem; }
.mission-brief__identity { display: flex; align-items: center; gap: .6rem; min-width: 0; }
.mission-brief__identity > div { display: grid; gap: 1px; min-width: 0; }
.mission-brief__identity strong { font-size: var(--bb-rescue-font-regular); overflow-wrap: anywhere; }
.mission-brief__incident-icon { display: grid; place-items: center; flex: none; width: 36px; height: 36px;
  border-radius: 12px; background: rgba(var(--v-theme-error), .12); color: rgb(var(--v-theme-error)) !important; }
/* Like Travel's A-to-B rail, the incident address is part of the surface,
   not another little card inside it. Full text is available in Details. */
.mission-brief__address { display: flex; align-items: start; gap: .6rem; min-width: 0; padding: .5rem .1rem;
  border-top: 1px solid var(--bb-color-outline); }
.mission-brief__address > :deep(.v-icon) { flex: none; margin-top: .15rem; color: rgb(var(--v-theme-primary)); }
.mission-brief__address > div { display: grid; gap: 1px; min-width: 0; }
.mission-brief__address p, .mission-brief__details p { margin: 0; }
.mission-brief__address-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.mission-brief__address :deep(.v-btn), .mission-brief__overview :deep(.v-btn) { min-height: 44px; }
.mission-brief__snapshot { display: flex; align-items: center; gap: .6rem; min-width: 0; }
.mission-brief__need { display: grid; gap: 1px; flex: 1 1 0; min-width: 0; }
.mission-brief__need-preview { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
  white-space: pre-line; overflow: hidden; overflow-wrap: anywhere; }
.mission-brief__need-preview { margin: 0; font-weight: 650; }
.mission-brief__photo, .mission-brief__photo-placeholder { display: grid; place-items: center; flex: 0 0 3.75rem;
  width: 3.75rem; height: 3.75rem; overflow: hidden; border: 1px solid var(--bb-color-outline);
  border-radius: 12px; background: var(--bb-color-inset); }
.mission-brief__photo { padding: 0; cursor: zoom-in; }
.mission-brief__photo:hover { border-color: rgb(var(--v-theme-primary)); }
.mission-brief__photo:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-brief__photo img { display: block; width: 100%; height: 100%; object-fit: cover; }
/* Details reveal the original text in place. Never repeat description/address
   below the disclosure or consume map space with a second inline photo. */
.mission-brief:has(.mission-brief__details[open]) .mission-brief__address-preview,
.mission-brief:has(.mission-brief__details[open]) .mission-brief__need-preview {
  display: block; -webkit-line-clamp: unset; white-space: pre-wrap; overflow: visible;
}
.mission-brief__details-body > .mission-brief__id { display: flex; align-items: center; justify-content: space-between; gap: .5rem; min-width: 0; }
.mission-brief__id-actions { display: flex; align-items: center; gap: .3rem; min-width: 0; }
.mission-brief__id-actions bdi { font: 700 .82rem/1.5 monospace; direction: ltr; }
.mission-brief__id-actions :deep(.v-btn) { min-width: 44px; min-height: 44px; }
.mission-brief__copy-fallback { display: grid; gap: .25rem; min-width: 0; }
.mission-brief__copy-fallback input { width: 100%; min-height: 44px; padding: .4rem;
  border: 1px solid var(--bb-color-outline); border-radius: 8px; background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface)); }
.mission-brief__details { min-width: 0; border-top: 1px solid var(--bb-color-outline); }
.mission-brief__details summary { display: flex; align-items: center; gap: .3rem; cursor: pointer; min-height: 44px;
  color: rgb(var(--v-theme-primary)); font-weight: var(--bb-rescue-weight-strong); }
.mission-brief__details summary :deep(.v-icon) { margin-inline-start: auto; transition: transform .2s; }
.mission-brief__details[open] summary :deep(.v-icon) { transform: rotate(180deg); }
.mission-brief__details summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.mission-brief__details-body { display: grid; gap: .55rem; padding: .45rem .15rem .65rem; }
.mission-brief__details-body > div { display: grid; gap: .15rem; min-width: 0; }
.mission-brief__details-body p, .mission-brief__details-body bdi { overflow-wrap: anywhere; }
.mission-brief__viewer { max-height: calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; overflow: hidden; color: rgb(var(--v-theme-on-surface)); }
.mission-brief__viewer-header { display: flex; align-items: center; justify-content: space-between; flex: none;
  min-height: 52px; padding: .25rem .75rem; border-bottom: 1px solid var(--bb-color-outline); }
.mission-brief__viewer-header h2 { margin: 0; font-size: var(--bb-rescue-font-regular); }
.mission-brief__viewer-header :deep(.v-btn) { width: 44px; min-width: 44px; height: 44px; }
.mission-brief__viewer-content { display: grid; place-items: center; min-height: 0; overflow: auto;
  padding: .65rem; background: var(--bb-color-inset); }
.mission-brief__viewer-content img { display: block; max-width: 100%; max-height: calc(100dvh - 6rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
  width: auto; height: auto; object-fit: contain; }
</style>
