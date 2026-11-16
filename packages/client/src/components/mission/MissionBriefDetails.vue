<template>
  <div class="mission-brief" aria-label="جزئیات درخواست و محل حادثه">
    <div class="mission-brief__body">
      <div class="mission-brief__id">
        <span>شناسهٔ مأموریت</span>
        <div class="mission-brief__id-actions">
          <bdi dir="ltr" :aria-label="`شناسهٔ کامل مأموریت: ${missionId}`">{{ shortMissionId }}</bdi>
          <v-btn icon="mdi-content-copy" size="small" variant="tonal" color="primary"
            aria-label="کپی شناسهٔ کامل مأموریت" :disabled="!missionId" @click="copyMissionId" />
        </div>
        <small v-if="copyStatus === 'copied'" role="status">شناسهٔ کامل کپی شد.</small>
        <label v-else-if="copyStatus === 'failed'" class="mission-brief__copy-fallback">
          کپی خودکار ممکن نشد؛ شناسهٔ کامل را از این کادر کپی کنید.
          <input :value="missionId" readonly dir="ltr" aria-label="شناسهٔ کامل مأموریت برای کپی دستی" @focus="($event.target as HTMLInputElement).select()" />
        </label>
      </div>
      <p v-if="loading || (!brief && !error)" role="status">در حال دریافت اطلاعات حادثه…</p>
      <p v-else-if="error" role="alert">{{ error }}
        <v-btn size="small" variant="text" color="primary" @click="load">تلاش دوباره</v-btn>
      </p>
      <template v-else-if="brief">
        <p><span>درخواست‌کننده</span> <strong dir="auto">{{ brief.requesterName }}</strong></p>
        <p><span>نوع حادثه</span> <strong>{{ brief.incidentTypeName }}</strong></p>
        <p class="mission-brief__description"><span>شرح نیاز</span> <strong>{{ brief.description }}</strong></p>
        <div class="mission-brief__address">
          <span>نشانی تقریبی محل حادثه · از مختصات ثبت‌شده</span>
          <p v-if="addressLoading" role="status">در حال یافتن نشانی…</p>
          <strong v-else-if="address" dir="auto">{{ address }}</strong>
          <p v-else role="status">نشانی در دسترس نیست؛ برای راهبری از مختصات ثبت‌شدهٔ حادثه استفاده کنید.
            <v-btn v-if="addressFailed" size="small" variant="text" color="primary" @click="loadAddress(brief)">تلاش دوباره</v-btn>
          </p>
        </div>
        <p><span>مختصات ثبت‌شدهٔ حادثه</span>
          <bdi dir="ltr">{{ brief.incident.lat.toFixed(5) }}, {{ brief.incident.lon.toFixed(5) }}</bdi>
        </p>
        <div v-if="brief.hasPhoto" class="mission-brief__photo">
          <span>تصویر حادثه</span>
          <img v-if="photoSrc" :src="photoSrc" alt="تصویر ثبت‌شدهٔ حادثه" referrerpolicy="no-referrer"
            @error="photoSrc = null; photoError = 'دسترسی به تصویر پایان یافت؛ دوباره دریافت کنید.'" />
          <p v-else-if="photoLoading" role="status">در حال دریافت تصویر…</p>
          <p v-if="photoError" role="alert">{{ photoError }}
            <v-btn size="small" variant="text" color="primary" @click="loadPhoto">تلاش دوباره</v-btn>
          </p>
        </div>
        <p v-else><span>تصویر حادثه</span> ثبت نشده است</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
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
let generation = 0;
let controller: AbortController | null = null;
function clear() {
  generation++;
  controller?.abort(); controller = null;
  brief.value = null; loading.value = false; error.value = null;
  address.value = null; addressLoading.value = false; addressFailed.value = false;
  photoSrc.value = null; photoLoading.value = false; photoError.value = null;
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
    if (current === generation && props.visible && auth.user?.id === owner && auth.accessToken === token && brief.value?.sosRequestId === id)
      photoSrc.value = src;
  } catch {
    if (current === generation) photoError.value = "دریافت تصویر ممکن نشد.";
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
.mission-brief { min-width: 0; }
.mission-brief__body { display: grid; gap: 0; min-width: 0; }
.mission-brief__body > p, .mission-brief__id, .mission-brief__address, .mission-brief__photo {
  display: grid; gap: 2px; min-width: 0; margin: 0; padding: .4rem .15rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1);
  font-size: .85rem; line-height: 1.6; overflow-wrap: anywhere; }
.mission-brief__body > :last-child { border-bottom: 0; }
.mission-brief__body span { color: var(--bb-color-muted); font-size: .8rem; font-weight: 700; }
.mission-brief__body strong { font-weight: 750; }
.mission-brief__body > p bdi { display: inline-block; max-width: 100%; overflow-wrap: anywhere; }
.mission-brief__id-actions { display: flex; align-items: center; gap: .5rem; min-width: 0; }
.mission-brief__id-actions bdi { font: 700 .9rem/1.5 monospace; direction: ltr; }
.mission-brief__id-actions :deep(.v-btn) { min-width: 44px; min-height: 44px; }
.mission-brief__copy-fallback { display: grid; gap: .25rem; min-width: 0; }
.mission-brief__copy-fallback input { width: 100%; min-height: 44px; padding: .4rem;
  border: 1px solid var(--bb-color-outline); border-radius: 8px; background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface)); }
.mission-brief__address p, .mission-brief__photo p { margin: 0; }
.mission-brief__description strong { white-space: pre-wrap; }
.mission-brief__photo { justify-items: start; }
.mission-brief__photo img { display: block; max-width: 100%; max-height: 11rem; object-fit: contain; border-radius: 8px; }
.mission-brief__address :deep(.v-btn), .mission-brief__photo :deep(.v-btn) { min-height: 44px; }
</style>
