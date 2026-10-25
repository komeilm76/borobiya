<template>
  <main class="history" dir="rtl">
    <div class="history__shell">
      <header class="history__hero">
        <span class="history__eyebrow"><v-icon icon="mdi-history" size="19" /> سوابق درخواست‌های من</span>
        <h1>از درخواست تا رسیدگی، همه‌چیز روشن.</h1>
        <p>وضعیت هر درخواست را ببینید. اگر دیگر به کمک نیاز ندارید، با ثبت دلیل، آن را به‌صورت ایمن لغو کنید.</p>
      </header>
      <v-alert v-if="history.error.value" type="error" variant="tonal" rounded="lg" role="alert" class="mt-5">
        {{ history.error.value }} <v-btn size="small" variant="text" @click="history.load()">تلاش دوباره</v-btn>
      </v-alert>
      <v-alert v-if="history.linkError.value" type="warning" variant="tonal" rounded="lg" role="status" class="mt-5">
        {{ history.linkError.value }}
      </v-alert>
      <div class="history__toolbar">
        <div><h2>درخواست‌های ثبت‌شده</h2><p>{{ history.total.value.toLocaleString('fa-IR') }} درخواست</p></div>
        <v-btn color="primary" variant="tonal" rounded="lg" prepend-icon="mdi-refresh"
          :loading="history.loading.value" @click="history.load()">تازه‌سازی</v-btn>
      </div>
      <v-skeleton-loader v-if="history.loading.value && !history.items.value.length" type="article, actions" class="history__panel" />
      <section v-else-if="!history.items.value.length && !history.error.value" class="history__empty">
        <v-icon icon="mdi-text-box-search-outline" size="42" color="primary" />
        <h3>هنوز درخواستی ثبت نکرده‌اید</h3>
        <p>در زمان نیاز، دکمهٔ شناور SOS در دسترس شماست.</p>
        <v-btn to="/_user/dashboard" color="primary" variant="tonal" rounded="lg">بازگشت به پیشخوان</v-btn>
      </section>
      <div v-else class="history__grid">
        <section class="history__list" aria-label="فهرست درخواست‌های امداد">
          <button v-for="item in history.items.value" :key="item.id" type="button" class="history__item"
            :class="{ 'history__item--selected': history.selected.value?.id === item.id }"
            :aria-pressed="history.selected.value?.id === item.id" :disabled="history.cancellation.submitting.value"
            @click="choose(item)">
            <span class="history__item-icon"><v-icon icon="mdi-lifebuoy" size="21" /></span>
            <span class="history__item-copy">
              <strong>{{ item.description }}</strong>
              <small>{{ new Date(item.createdAt).toLocaleString('fa-IR') }}</small>
            </span>
            <v-chip size="small" :color="statusInfo(item.status).color" variant="tonal">{{ statusInfo(item.status).label }}</v-chip>
          </button>
          <div v-if="history.totalPages.value > 1" class="history__pages">
            <v-btn variant="text" icon="mdi-chevron-right" aria-label="صفحهٔ قبل" :disabled="history.page.value <= 1 || history.loading.value"
              @click="history.load(history.page.value - 1)" />
            <span>صفحهٔ {{ history.page.value.toLocaleString('fa-IR') }} از {{ history.totalPages.value.toLocaleString('fa-IR') }}</span>
            <v-btn variant="text" icon="mdi-chevron-left" aria-label="صفحهٔ بعد"
              :disabled="history.page.value >= history.totalPages.value || history.loading.value"
              @click="history.load(history.page.value + 1)" />
          </div>
        </section>

        <section v-if="history.selected.value" class="history__panel" aria-label="جزئیات درخواست">
          <div class="history__panel-head">
            <span class="history__eyebrow">پروندهٔ امداد · {{ new Date(history.selected.value.createdAt).toLocaleString('fa-IR') }}</span>
            <h2>{{ history.selected.value.description }}</h2>
            <v-chip :color="statusInfo(history.selected.value.status).color" variant="tonal" size="large">
              {{ statusInfo(history.selected.value.status).label }}
            </v-chip>
          </div>
          <div class="history__panel-body">
            <div class="history__facts">
              <div><span>شناسهٔ پیگیری</span><bdi dir="ltr">{{ history.selected.value.id }}</bdi></div>
              <div><span>مختصات ثبت‌شده</span><bdi dir="ltr">{{ history.selected.value.location.lat.toFixed(5) }}, {{ history.selected.value.location.lon.toFixed(5) }}</bdi></div>
            </div>
            <div v-if="history.selected.value.photoUrl" class="history__evidence">
              <h3><v-icon icon="mdi-image-outline" size="19" /> تصویر مستندات</h3>
              <img v-if="photoSrc" :src="photoSrc" referrerpolicy="no-referrer" alt="تصویر مستندات حادثه"
                @error="photoSrc = null; photoError = 'دسترسی به تصویر پایان یافت؛ دوباره تلاش کنید.'" />
              <v-btn v-else color="primary" variant="tonal" rounded="lg" :loading="photoLoading" @click="loadPhoto">
                نمایش تصویر ایمن
              </v-btn>
              <p v-if="photoError" class="history__hint" role="alert">{{ photoError }} <v-btn size="small" variant="text" @click="loadPhoto">تلاش دوباره</v-btn></p>
            </div>
            <v-alert v-if="history.cancellation.cancelled.value" type="info" variant="tonal" role="status" rounded="lg" class="mt-5">
              درخواست شما لغو شد؛ هر مأموریت فعال این درخواست نیز پایان یافت.
            </v-alert>
            <v-alert v-else-if="history.selected.value.status === 'cancelled_by_rescuer'" type="warning" variant="tonal" rounded="lg" class="mt-5">
              امدادگر قادر به ادامه نبوده است؛ مرکز امداد باید جایگزین معرفی کند.
            </v-alert>
            <v-alert v-if="missionError" type="warning" variant="tonal" class="mt-5" role="alert">
              {{ missionError }} <v-btn size="small" variant="text" @click="loadSelectedMission()">تلاش دوباره</v-btn>
            </v-alert>
            <div v-if="selectedMissions.length" class="history__mission-selector">
              <label for="request-mission-timeline">سابقهٔ کدام مأموریت را ببینیم؟</label>
              <select id="request-mission-timeline" v-model="timelineMissionId">
                <option v-for="mission in selectedMissions" :key="mission.id" :value="mission.id">
                  {{ new Date(mission.createdAt).toLocaleString('fa-IR') }} · {{ statusLabel(mission.status) }}
                </option>
              </select>
            </div>
            <MissionTimelinePanel v-if="selectedTimelineMission" :key="selectedTimelineMission.id"
              :mission="selectedTimelineMission" audience="user" />
            <MissionRatingPanel v-if="selectedTimelineMission" :mission="selectedTimelineMission" />
            <MissionLivePanel v-if="selectedMission" :mission="selectedMission"
              :center="[history.selected.value.location.lon, history.selected.value.location.lat]" />
            <div class="history__actions">
              <p v-if="history.canCancelSelected.value">اگر هنوز به کمک نیاز دارید، درخواست را باز بگذارید.</p>
              <v-btn v-if="history.canCancelSelected.value" variant="outlined" color="error" rounded="lg"
                prepend-icon="mdi-close-circle-outline" :disabled="history.loading.value" @click="history.cancellation.show()">
                لغو این درخواست
              </v-btn>
              <p v-else-if="history.selected.value.status !== 'cancelled_by_rescuer'" class="history__hint">
                این درخواست دیگر قابل لغو نیست.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
    <SosCancellationDialog :cancellation="history.cancellation" />
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { Mission, SosRequest, SosRequestStatus } from "@shared/index";
import MissionLivePanel from "@/components/mission/MissionLivePanel.vue";
import MissionTimelinePanel from "@/components/mission/MissionTimelinePanel.vue";
import MissionRatingPanel from "@/components/mission/MissionRatingPanel.vue";
import { statusLabel } from "@/mission/timeline-presentation";
import { listRequesterMissions } from "@/api/mission";
import SosCancellationDialog from "@/components/sos/SosCancellationDialog.vue";
import { getSosPhotoSrc } from "@/api/admin-sos";
import { useSosHistory } from "@/composables/use-sos-history";
import { useAuthStore } from "@/stores/auth";

const auth = useAuthStore();
const route = useRoute();
const history = useSosHistory(computed(() => auth.accessToken), computed(() => auth.user?.id ?? null),
  () => auth.ensureSession());
const selectedMissions = ref<Mission[]>([]);
const timelineMissionId = ref<string | null>(null);
const selectedTimelineMission = computed(() => selectedMissions.value.find((mission) => mission.id === timelineMissionId.value) ?? null);
const selectedMission = computed(() => selectedMissions.value.find((mission) =>
  ["pending", "on_the_way", "arrived", "in_progress"].includes(mission.status)) ?? null);
const missionError = ref<string | null>(null);
let missionGeneration = 0;
async function loadSelectedMission() {
  const id = history.selected.value?.id;
  const token = auth.accessToken;
  const owner = auth.user?.id;
  const generation = ++missionGeneration;
  selectedMissions.value = [];
  timelineMissionId.value = null;
  missionError.value = null;
  if (!id || !token || !owner) return;
  try {
    const all: Mission[] = [];
    for (let page = 1; ; page++) {
      const result = await listRequesterMissions(token, page, id);
      if (generation !== missionGeneration || auth.user?.id !== owner || history.selected.value?.id !== id) return;
      all.push(...result.items);
      if (page >= result.totalPages) break;
    }
    selectedMissions.value = all;
    timelineMissionId.value = all[0]?.id ?? null;
  } catch {
    if (generation === missionGeneration) missionError.value = "سابقهٔ مأموریت‌ها بارگذاری نشد.";
  }
}
const photoSrc = ref<string | null>(null);
const photoLoading = ref(false);
const photoError = ref<string | null>(null);
let photoGeneration = 0;
const statuses: Record<SosRequestStatus, { label: string; color: string }> = {
  pending: { label: "در انتظار بررسی", color: "warning" },
  dispatched: { label: "در انتظار امدادگر", color: "info" },
  accepted: { label: "مأموریت پذیرفته شد", color: "primary" },
  completed: { label: "پایان یافته", color: "success" },
  cancelled_by_requester: { label: "لغو شده توسط شما", color: "grey" },
  cancelled_by_rescuer: { label: "در انتظار جایگزین", color: "error" },
  expired: { label: "منقضی شده", color: "grey" }
};
function statusInfo(status: SosRequestStatus) { return statuses[status]; }
function choose(item: SosRequest) { history.choose(item); clearPhoto(); }
function clearPhoto() { ++photoGeneration; photoSrc.value = null; photoLoading.value = false; photoError.value = null; }
async function loadPhoto() {
  const id = history.selected.value?.id;
  const token = auth.accessToken;
  if (!id || !token || photoLoading.value) return;
  const current = ++photoGeneration;
  photoLoading.value = true;
  photoError.value = null;
  try {
    const src = await getSosPhotoSrc(id, token);
    if (current === photoGeneration && auth.accessToken && history.selected.value?.id === id) photoSrc.value = src;
  } catch {
    if (current === photoGeneration) photoError.value = "دریافت تصویر ممکن نشد.";
  } finally {
    if (current === photoGeneration) photoLoading.value = false;
  }
}
onMounted(() => { void history.load(1, typeof route.query.request === "string" ? route.query.request : undefined); });
watch(() => auth.user?.id, () => { ++missionGeneration; selectedMissions.value = []; timelineMissionId.value = null; clearPhoto(); history.reset(); if (auth.user?.id) void history.load(); });
watch(() => history.selected.value?.id, () => { clearPhoto(); void loadSelectedMission(); });
watch(() => [history.selected.value?.status, auth.accessToken] as const, () => { void loadSelectedMission(); });
watch(() => history.cancellation.cancelled.value, (value) => { if (value) history.markCancelled(); });
onBeforeUnmount(() => { ++missionGeneration; clearPhoto(); history.reset(); });
</script>

<style scoped>
.history { min-height: calc(100vh - 130px); padding: clamp(18px,4vw,52px) 18px 100px; background: radial-gradient(ellipse at 80% 0%,rgba(44,132,113,.1),transparent 52%),rgb(var(--v-theme-background)); color: rgb(var(--v-theme-on-background)); }
.history__shell { max-width: 1210px; margin-inline: auto; }
.history__hero { border-radius: 28px; padding: clamp(24px,4vw,44px); background: linear-gradient(120deg,#143d42,#226e6a); color: white; box-shadow: 0 20px 50px rgba(14,70,66,.15); }
.history__eyebrow { display: inline-flex; align-items: center; gap: 7px; font-size: .83rem; font-weight: 750; color: #ace7d6; }
.history__hero h1 { font-size: clamp(1.7rem,3.5vw,2.8rem); font-weight: 850; line-height: 1.25; margin: 16px 0 10px; }
.history__hero p { max-width: 610px; color: #dcf3e9; line-height: 1.9; margin: 0; }
.history__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 15px; margin: 31px 0 17px; }
.history__toolbar h2 { margin: 0; font-size: 1.23rem; font-weight: 800; }.history__toolbar p { margin: 3px 0 0; opacity: .69; font-size: .82rem; }
.history__grid { display: grid; grid-template-columns: minmax(275px,400px) minmax(0,1fr); gap: 18px; align-items: start; }
.history__list { display: grid; gap: 10px; }
.history__item { width: 100%; display: flex; align-items: center; gap: 12px; text-align: start; font: inherit; color: inherit; cursor: pointer; background: rgb(var(--v-theme-surface)); border: 1px solid rgba(98,146,137,.25); border-radius: 17px; padding: 17px; box-shadow: 0 6px 18px rgba(14,70,66,.035); transition: transform .18s,border-color .18s,box-shadow .18s; }
.history__item:hover { transform: translateY(-2px); box-shadow: 0 14px 27px rgba(14,70,66,.1); }.history__item:focus-visible { outline: 3px solid #26977b; outline-offset: 2px; }.history__item:disabled { cursor: wait; }
.history__item--selected { border-color: #269b7c; box-shadow: 0 0 0 2px rgba(38,155,124,.14); }
.history__item-icon { flex: 0 0 37px; display: grid; place-items: center; height: 37px; border-radius: 11px; background: rgba(38,155,124,.12); color: rgb(var(--v-theme-primary)); }
.history__item-copy { display: grid; gap: 6px; min-width: 0; flex: 1; }.history__item-copy strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: .89rem; }.history__item-copy small { opacity: .65; font-size: .75rem; }
.history__pages { display: flex; justify-content: center; align-items: center; gap: 8px; font-size: .81rem; }
.history__panel,.history__empty { border-radius: 23px; background: rgb(var(--v-theme-surface)); border: 1px solid rgba(98,146,137,.23); box-shadow: 0 17px 45px rgba(14,70,66,.065); }
.history__panel { overflow: hidden; }.history__panel-head { padding: clamp(22px,3vw,34px); background: linear-gradient(108deg,rgba(40,147,117,.12),transparent); border-bottom: 1px solid rgba(98,146,137,.18); }.history__panel-head .history__eyebrow { color: rgb(var(--v-theme-primary)); }
.history__panel-head h2 { margin: 12px 0 14px; font-size: clamp(1.23rem,2.5vw,1.7rem); line-height: 1.6; overflow-wrap: anywhere; }
.history__panel-body { padding: clamp(22px,3vw,34px); }.history__facts { display: grid; gap: 10px; }.history__facts div { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; padding: 12px 0; border-bottom: 1px solid rgba(98,146,137,.18); font-size: .85rem; }.history__facts span { opacity: .7; }.history__facts bdi { overflow-wrap: anywhere; }
.history__evidence { padding-top: 20px; }.history__evidence h3 { display: flex; align-items: center; gap: 8px; font-size: 1rem; margin-bottom: 14px; }.history__evidence img { display: block; width: 100%; max-height: 370px; object-fit: contain; border-radius: 13px; background: rgba(98,146,137,.09); }
.history__mission-selector { display: grid; gap: 8px; margin-top: 22px; font-size: .82rem; font-weight: 700; }
.history__mission-selector select { width: 100%; padding: 11px; border: 1px solid rgba(98,146,137,.4); border-radius: 10px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); }
.history__actions { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; padding-top: 24px; }.history__actions p { margin: 0; font-size: .83rem; opacity: .74; }.history__hint { font-size: .8rem; opacity: .74; }
.history__empty { text-align: center; padding: 62px 24px; }.history__empty h3 { margin: 16px 0 5px; }.history__empty p { opacity: .72; }
@media(max-width:880px) { .history__grid { grid-template-columns: 1fr; }.history__list { grid-template-columns: repeat(2,minmax(0,1fr)); }.history__pages { grid-column: 1 / -1; } }
@media(max-width:530px) { .history__list { grid-template-columns: 1fr; }.history__item { flex-wrap: wrap; }.history__item .v-chip { margin-inline-start: 49px; } }
</style>
