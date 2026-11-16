<template>
  <div class="mission-brief" aria-label="جزئیات درخواست و محل حادثه">
    <div class="mission-brief__body">
      <p class="mission-brief__id"><span>شناسهٔ مأموریت</span> <bdi dir="ltr">{{ missionId }}</bdi></p>
      <p v-if="loading || (!brief && !error)" role="status">در حال دریافت اطلاعات حادثه…</p>
      <p v-else-if="error" role="alert">{{ error }}
        <v-btn size="small" variant="text" color="primary" @click="load">تلاش دوباره</v-btn>
      </p>
      <template v-else-if="brief">
        <p><span>درخواست‌کننده</span> <strong dir="auto">{{ brief.requesterName }}</strong></p>
        <p><span>نوع حادثه</span> <strong>{{ brief.incidentTypeName }}</strong></p>
        <p class="mission-brief__description"><span>شرح نیاز</span> <strong>{{ brief.description }}</strong></p>
        <p><span>مختصات ثبت‌شدهٔ حادثه</span>
          <bdi dir="ltr">{{ brief.incident.lat.toFixed(5) }}, {{ brief.incident.lon.toFixed(5) }}</bdi>
        </p>
        <div v-if="brief.hasPhoto" class="mission-brief__photo">
          <span>تصویر حادثه</span>
          <img v-if="photoSrc" :src="photoSrc" alt="تصویر ثبت‌شدهٔ حادثه" referrerpolicy="no-referrer"
            @error="photoSrc = null; photoError = 'دسترسی به تصویر پایان یافت؛ دوباره دریافت کنید.'" />
          <v-btn v-else size="small" variant="tonal" color="primary" :loading="photoLoading" @click="loadPhoto">نمایش تصویر ایمن</v-btn>
          <p v-if="photoError" role="alert">{{ photoError }}</p>
        </div>
        <p v-else><span>تصویر حادثه</span> ثبت نشده است</p>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { MissionBrief } from "@shared/index";
import { getMissionBrief } from "@/api/mission";
import { getSosPhotoSrc } from "@/api/admin-sos";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{ missionId: string; visible: boolean }>();
const auth = useAuthStore();
const brief = ref<MissionBrief | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const photoSrc = ref<string | null>(null);
const photoLoading = ref(false);
const photoError = ref<string | null>(null);
let generation = 0;
let controller: AbortController | null = null;
function clear() {
  generation++;
  controller?.abort(); controller = null;
  brief.value = null; loading.value = false; error.value = null;
  photoSrc.value = null; photoLoading.value = false; photoError.value = null;
}
async function load() {
  const id = props.missionId, token = auth.accessToken, owner = auth.user?.id;
  if (!props.visible || !id || !token || !owner || loading.value) return;
  const current = ++generation;
  controller?.abort(); controller = new AbortController();
  loading.value = true; error.value = null;
  try {
    const result = await getMissionBrief(token, id, controller.signal);
    if (current === generation && props.visible && auth.user?.id === owner && auth.accessToken === token && props.missionId === id)
      brief.value = result;
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
.mission-brief__body > p, .mission-brief__photo { display: grid; gap: 2px; min-width: 0;
  margin: 0; padding: .4rem .15rem; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .1);
  font-size: .85rem; line-height: 1.6; overflow-wrap: anywhere; }
.mission-brief__body > :last-child { border-bottom: 0; }
.mission-brief__body span { color: var(--bb-color-muted); font-size: .8rem; font-weight: 700; }
.mission-brief__body strong { font-weight: 750; }
.mission-brief__id bdi, .mission-brief__body > p bdi { display: inline-block; max-width: 100%; overflow-wrap: anywhere; }
.mission-brief__description strong { white-space: pre-wrap; }
.mission-brief__photo { justify-items: start; }
.mission-brief__photo img { display: block; max-width: 100%; max-height: 11rem; object-fit: contain; border-radius: 8px; }
.mission-brief__photo :deep(.v-btn) { min-height: 44px; }
</style>
