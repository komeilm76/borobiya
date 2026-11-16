<template>
  <details class="mission-brief" @toggle="onToggle">
    <summary>اطلاعات مأموریت</summary>
    <div class="mission-brief__body">
      <p class="mission-brief__id">شناسهٔ پیگیری: <bdi dir="ltr">{{ missionId }}</bdi></p>
      <p v-if="loading" role="status">در حال دریافت اطلاعات حادثه…</p>
      <p v-else-if="error" role="alert">{{ error }}
        <v-btn size="small" variant="text" color="primary" @click.prevent="load">تلاش دوباره</v-btn>
      </p>
      <template v-else-if="brief">
        <p><strong>درخواست‌کننده:</strong> <span dir="auto">{{ brief.requesterName }}</span></p>
        <p><strong>نوع حادثه:</strong> {{ brief.incidentTypeName }}</p>
        <p class="mission-brief__description"><strong>شرح نیاز:</strong> {{ brief.description }}</p>
        <p><strong>محل حادثه (مختصات ثبت‌شده):</strong>
          <bdi dir="ltr">{{ brief.incident.lat.toFixed(5) }}, {{ brief.incident.lon.toFixed(5) }}</bdi>
        </p>
        <div v-if="brief.hasPhoto" class="mission-brief__photo">
          <span>تصویر حادثه</span>
          <img v-if="photoSrc" :src="photoSrc" alt="تصویر ثبت‌شدهٔ حادثه" referrerpolicy="no-referrer"
            @error="photoSrc = null; photoError = 'دسترسی به تصویر پایان یافت؛ دوباره دریافت کنید.'" />
          <v-btn v-else size="small" variant="tonal" color="primary" :loading="photoLoading" @click="loadPhoto">نمایش تصویر ایمن</v-btn>
          <p v-if="photoError" role="alert">{{ photoError }}</p>
        </div>
        <p v-else>تصویری ثبت نشده است.</p>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { MissionBrief } from "@shared/index";
import { getMissionBrief } from "@/api/mission";
import { getSosPhotoSrc } from "@/api/admin-sos";
import { useAuthStore } from "@/stores/auth";

const props = defineProps<{ missionId: string }>();
const auth = useAuthStore();
const brief = ref<MissionBrief | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const photoSrc = ref<string | null>(null);
const photoLoading = ref(false);
const photoError = ref<string | null>(null);
const detailOpen = ref(false);
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
  if (!id || !token || !owner || loading.value) return;
  const current = ++generation;
  controller?.abort(); controller = new AbortController();
  loading.value = true; error.value = null;
  try {
    const result = await getMissionBrief(token, id, controller.signal);
    if (current === generation && auth.user?.id === owner && auth.accessToken === token && props.missionId === id)
      brief.value = result;
  } catch {
    if (current === generation) error.value = "اطلاعات حادثه در دسترس نیست؛ دوباره تلاش کنید.";
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function loadPhoto() {
  const id = brief.value?.sosRequestId, token = auth.accessToken, owner = auth.user?.id;
  if (!id || !token || !owner || photoLoading.value) return;
  const current = generation;
  photoLoading.value = true; photoError.value = null;
  try {
    const src = await getSosPhotoSrc(id, token);
    if (current === generation && auth.user?.id === owner && auth.accessToken === token && brief.value?.sosRequestId === id)
      photoSrc.value = src;
  } catch {
    if (current === generation) photoError.value = "دریافت تصویر ممکن نشد.";
  } finally {
    if (current === generation) photoLoading.value = false;
  }
}
function onToggle(event: Event) {
  detailOpen.value = (event.currentTarget as HTMLDetailsElement).open;
  if (!detailOpen.value) { clear(); return; }
  void load();
}
watch(() => [props.missionId, auth.user?.id, auth.accessToken] as const, () => {
  clear();
  if (detailOpen.value) void load();
}, { flush: "sync" });
onBeforeUnmount(clear);
</script>

<style scoped>
.mission-brief { margin: 12px 0; border-top: 1px solid var(--bb-color-outline); padding-top: 8px; }
.mission-brief summary { width: fit-content; min-height: 44px; display: flex; align-items: center; cursor: pointer;
  color: rgb(var(--v-theme-primary)); font-size: .85rem; font-weight: 800; }
.mission-brief summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.mission-brief__body { display: grid; gap: 7px; min-width: 0; padding: 8px 10px;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }
.mission-brief__body p { margin: 0; font-size: .82rem; line-height: 1.6; overflow-wrap: anywhere; }
.mission-brief__body strong { font-weight: 800; }
.mission-brief__id bdi { display: inline-block; max-width: 100%; overflow-wrap: anywhere; }
.mission-brief__description { white-space: pre-wrap; }
.mission-brief__photo { display: grid; justify-items: start; gap: 5px; font-size: .82rem; }
.mission-brief__photo img { display: block; max-width: 100%; max-height: 9rem; object-fit: contain; border-radius: 8px; }
</style>
