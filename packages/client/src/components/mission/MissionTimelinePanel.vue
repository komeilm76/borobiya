<template>
  <section class="timeline" dir="rtl" aria-label="خط زمانی مأموریت">
    <header class="timeline__header">
      <div>
        <span class="timeline__eyebrow"><v-icon icon="mdi-timeline-clock-outline" size="18" /> سابقهٔ قابل پیگیری</span>
        <h3>مراحل ثبت‌شدهٔ مأموریت</h3>
        <p>زمان‌ها از سوابق قطعی سرور خوانده می‌شوند، نه از موقعیت لحظه‌ای نقشه.</p>
      </div>
      <v-btn color="primary" variant="tonal" rounded="lg" size="small" prepend-icon="mdi-refresh"
        :loading="timeline.loading.value" @click="timeline.load()">به‌روزرسانی</v-btn>
    </header>
    <v-alert v-if="timeline.error.value" type="warning" variant="tonal" rounded="lg" role="alert" class="mb-3">
      {{ timeline.error.value }}
      <p v-if="timeline.error.value && timeline.entries.value.length">
        مراحل زیر از آخرین خواندن موفق هستند و ممکن است وضعیت فعلی را نشان ندهند.
        <v-btn size="small" variant="text" :loading="timeline.loading.value" @click="timeline.load()">تلاش دوباره</v-btn>
      </p>
    </v-alert>
    <v-alert v-if="timeline.liveError.value" type="warning" variant="tonal" rounded="lg" role="alert" class="mb-3">
      {{ timeline.liveError.value }}
      <v-btn size="small" variant="text" :loading="timeline.loading.value" @click="timeline.load()">بررسی وضعیت فعلی</v-btn>
    </v-alert>
    <v-progress-linear v-if="timeline.loading.value && !timeline.entries.value.length" indeterminate
      color="primary" aria-label="دریافت مراحل مأموریت" />
    <ol v-if="timeline.entries.value.length" class="timeline__list" role="list" aria-live="polite">
      <li v-for="step in timeline.entries.value" :key="step.id" class="timeline__step">
        <span class="timeline__dot" :class="{ 'timeline__dot--terminal': isTerminal(step.toStatus) }" aria-hidden="true" />
        <div class="timeline__content">
          <strong>{{ statusLabel(step.toStatus) }}</strong>
          <span class="timeline__actor">{{ actorLabel(step.changedBy, mission) }}</span>
          <time :datetime="step.createdAt" :title="step.createdAt">
            {{ new Date(step.createdAt).toLocaleString('fa-IR') }}
          </time>
        </div>
      </li>
    </ol>
    <p v-else-if="!timeline.loading.value && !timeline.error.value" class="timeline__empty" role="status">
      هنوز مرحله‌ای برای این مأموریت ثبت نشده است.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { Mission } from "@shared/index";
import { useAuthStore } from "@/stores/auth";
import { useMissionTimeline } from "@/composables/use-mission-timeline";
import { actorLabel, isTerminal, statusLabel } from "@/mission/timeline-presentation";

const props = defineProps<{ mission: Mission; audience: "user" | "admin" }>();
const auth = useAuthStore();
const timeline = useMissionTimeline(computed(() => props.mission.id), props.audience,
  computed(() => auth.accessToken), computed(() => auth.user?.id ?? null), () => auth.ensureSession());
</script>

<style scoped>
.timeline { margin-block: 20px; padding: clamp(18px,3vw,28px); background: rgb(var(--v-theme-surface)); border: 1px solid rgba(28,112,95,.22); border-radius: var(--bb-radius-card, 24px); box-shadow: var(--bb-shadow-surface); }
.timeline__header { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 12px; align-items: start; }
.timeline__eyebrow { color: rgb(var(--v-theme-primary)); font-size: 0.82rem; font-weight: 750; }
.timeline h3 { font-size: 1.15rem; margin: 8px 0 4px; }.timeline__header p { font-size: .8rem; opacity: .72; line-height: 1.7; }
.timeline__list { list-style: none; padding: 4px 8px 0 0; margin: 12px 0 0; }
.timeline__step { display: flex; gap: 15px; position: relative; min-height: 78px; }
.timeline__step:not(:last-child)::after { content: ''; position: absolute; right: 6px; top: 18px; bottom: -2px; width: 2px; background: rgba(28,112,95,.23); }
.timeline__dot { flex: none; width: 14px; height: 14px; border: 3px solid #1b9479; background: rgb(var(--v-theme-surface)); border-radius: 50%; margin-top: 5px; z-index: 1; }
.timeline__dot--terminal { border-color: #b35342; }
.timeline__content { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px 16px; padding-bottom: 20px; min-width: 0; }
.timeline__content strong { font-size: .9rem; }.timeline__actor { font-size: 0.82rem; opacity: .7; }
.timeline time { font-size: 0.82rem; color: rgb(var(--v-theme-primary)); direction: ltr; unicode-bidi: isolate; }
.timeline__empty { font-size: .85rem; opacity: .7; margin: 12px 0 0; }
</style>
