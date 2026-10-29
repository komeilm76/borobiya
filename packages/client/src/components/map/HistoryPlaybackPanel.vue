<template>
  <v-card
    class="history-playback bb-floating-card"
    :class="{ 'history-playback--open': isOpen }"
    elevation="3"
    rounded="xl"
  >
    <header class="history-playback__header">
      <div class="history-playback__title-block">
        <h2>تاریخچهٔ مسیر</h2>
        <p v-if="isOpen">پخش حرکت</p>
        <p v-else class="history-playback__preview" role="status">{{ statusLine }}</p>
      </div>
      <v-chip
        v-if="api.hasTrack.value && !isOpen"
        class="history-playback__points-chip"
        size="small"
        variant="tonal"
        color="primary"
      >
        {{ pointCount }}
      </v-chip>
      <v-btn v-if="!isOpen && api.canPlay.value" class="history-playback__quick-play"
        variant="tonal" color="primary" icon size="small"
        :aria-label="api.playing.value ? 'توقف پخش مسیر' : 'پخش مسیر'"
        @click="api.toggle()">
        <v-icon :icon="api.playing.value ? 'mdi-pause' : 'mdi-play'" />
      </v-btn>
      <v-btn
        class="history-playback__toggle"
        variant="tonal"
        color="primary"
        size="small"
        :prepend-icon="isOpen ? 'mdi-chevron-up' : 'mdi-tune-variant'"
        :aria-label="isOpen ? 'بستن پنل تاریخچه' : 'باز کردن پنل تاریخچه'"
        :aria-expanded="isOpen"
        aria-controls="history-playback-controls"
        :title="isOpen ? 'بستن پنل تاریخچه' : 'باز کردن پنل تاریخچه'"
        @click="isOpen = !isOpen"
      >
        {{ isOpen ? 'بستن' : 'جزئیات' }}
      </v-btn>
    </header>

    <div id="history-playback-controls" v-show="isOpen" class="history-playback__body">
      <div class="history-playback__source" role="group" aria-label="منبع مسیر">
        <v-btn-toggle
          :model-value="api.sourceKind.value"
          density="compact"
          color="primary"
          mandatory
          divided
          @update:model-value="chooseSource"
        >
          <v-btn value="own">مسیر خودم</v-btn>
          <v-btn value="grant">مسیر همراهم</v-btn>
        </v-btn-toggle>
      </div>

      <div v-if="api.sourceKind.value === 'grant'" class="history-playback__grants">
        <div class="history-playback__grants-bar">
          <span class="history-playback__hint">اشتراک‌های دریافتی</span>
          <v-btn
            size="x-small"
            variant="text"
            color="primary"
            :loading="api.grantsLoading.value"
            aria-label="تازه‌سازی فهرست اشتراک‌های تاریخچه"
            @click="api.loadShares()"
          >
            تازه‌سازی
          </v-btn>
        </div>
        <p v-if="api.grantsLoading.value && !api.grants.value.length" class="history-playback__hint" role="status">
          در حال خواندن اشتراک‌ها…
        </p>
        <template v-else-if="api.grants.value.length">
          <v-select
            :model-value="api.grantId.value"
            :items="grantOptions"
            item-title="label"
            item-value="id"
            label="کدام اشتراک"
            density="compact"
            variant="outlined"
            hide-details="auto"
            @update:model-value="chooseGrant"
          />
          <p v-if="api.grantsFailed.value" class="history-playback__hint">
            آخرین تازه‌سازی فهرست ناموفق بود؛ فهرست قبلی نمایش داده می‌شود.
          </p>
          <p v-else class="history-playback__hint">
            بازه و چگالی را صاحب اشتراک تعیین کرده است؛ برای همین انتخاب بازه برای این بخش غیرفعال است.
          </p>
        </template>
        <p v-else-if="api.grantsFailed.value" class="history-playback__hint" role="status">
          خواندن فهرست اشتراک‌ها ناموفق بود؛ روی «تازه‌سازی» بزنید تا دوباره بررسی شود.
        </p>
        <p v-else class="history-playback__hint">
          هنوز کسی مسیر گذشته‌اش را با شما به اشتراک نگذاشته است.
        </p>
      </div>

      <div v-else class="history-playback__range">
        <div class="history-playback__chips" role="group" aria-label="بازه‌های آماده">
          <v-chip
            v-for="preset in presets"
            :key="preset.id"
            :variant="preset.days === api.presetDays.value ? 'flat' : 'outlined'"
            :color="preset.days === api.presetDays.value ? 'primary' : undefined"
            :aria-pressed="preset.days === api.presetDays.value"
            size="small"
            class="history-playback__chip"
            @click="api.selectPreset(preset.days)"
          >
            {{ presetLabel(preset.days) }}
          </v-chip>
        </div>

        <div class="history-playback__fields">
          <label class="history-playback__field">
            <span>از</span>
            <input v-model="fromField" type="datetime-local" :max="toField || undefined" />
          </label>
          <label class="history-playback__field">
            <span>تا</span>
            <input v-model="toField" type="datetime-local" :min="fromField || undefined" />
          </label>
          <v-btn
            class="history-playback__apply"
            size="small"
            variant="tonal"
            color="primary"
            :loading="api.loading.value"
            @click="applyManualRange"
          >
            نمایش
          </v-btn>
        </div>
      </div>

      <div class="history-playback__transport" role="group" aria-label="کنترل پخش">
        <v-btn
          icon
          variant="text"
          size="small"
          :disabled="!api.canPlay.value"
          aria-label="بازگشت به موقعیت ثبت‌شدهٔ قبل"
          title="بازگشت به موقعیت ثبت‌شدهٔ قبل"
          @click="api.stepPrevious()"
        >
          <v-icon icon="mdi-skip-previous-outline" />
        </v-btn>
        <v-btn
          class="history-playback__play"
          icon
          variant="flat"
          color="primary"
          :disabled="!api.canPlay.value"
          :aria-label="api.playing.value ? 'توقف پخش' : 'پخش مسیر'"
          :title="api.playing.value ? 'توقف پخش' : 'پخش مسیر'"
          @click="api.toggle()"
        >
          <v-icon :icon="api.playing.value ? 'mdi-pause' : 'mdi-play'" />
        </v-btn>
        <v-btn
          icon
          variant="text"
          size="small"
          :disabled="!api.canPlay.value"
          aria-label="رفتن به موقعیت ثبت‌شدهٔ بعد"
          title="رفتن به موقعیت ثبت‌شدهٔ بعد"
          @click="api.stepNext()"
        >
          <v-icon icon="mdi-skip-next-outline" />
        </v-btn>
        <span class="history-playback__clock" :aria-label="`لحظهٔ پخش‌شده: ${currentTime}`">
          {{ currentTime }}
        </span>
        <v-select
          :model-value="api.speed.value"
          class="history-playback__speed"
          :items="speedOptions"
          item-title="label"
          item-value="value"
          density="compact"
          variant="outlined"
          hide-details
          aria-label="سرعت پخش"
          :disabled="!api.canPlay.value"
          @update:model-value="chooseSpeed"
        />
      </div>

      <v-slider
        class="history-playback__scrub"
        :model-value="scrubValue"
        :min="0"
        :max="1"
        :step="0.001"
        thumb-size="14"
        color="primary"
        hide-details
        :disabled="!api.hasTrack.value"
        aria-label="جابه‌جایی در مسیر"
        @update:model-value="scrub"
      />

      <p class="history-playback__status" role="status" aria-live="polite">{{ statusLine }}</p>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { formatDuration } from "@/sharing/share-form";
import { historyPanelInitiallyOpen } from "@/history/playback-panel";
import {
  formatLocalTime,
  playbackIssueText,
  PLAYBACK_SPEEDS,
  rangePresets,
  type PlaybackIssue
} from "@/history/playback";
import type { HistoryPlayback } from "@/composables/use-history-playback";

/**
 * The transport and range controls for history playback.
 *
 * Deliberately free of logic: every number on screen comes from `useHistoryPlayback` and every click is
 * a call into it, because this repository has no component-mounting test environment and a rule buried
 * in a template could not be pinned. The one judgement here is which *copy* a state produces — and each
 * copy names what the user can do about it (whose share, which field), not just that something failed.
 */
const props = defineProps<{ api: HistoryPlayback }>();
const route = useRoute();

const isNarrow = typeof window !== "undefined" && typeof window.matchMedia === "function"
  && window.matchMedia("(max-width: 1023px)").matches;
const isOpen = ref(historyPanelInitiallyOpen(isNarrow, route.query.historyShare));
const fromField = ref("");
const toField = ref("");

watch(
  () => route.query.historyShare,
  (shareQuery) => {
    const shareId = Array.isArray(shareQuery) ? shareQuery[0] : shareQuery;
    if (typeof shareId === "string" && shareId.trim().length > 0) {
      isOpen.value = true;
      props.api.selectSource("grant");
      props.api.selectGrant(shareId.trim());
    }
  },
  { immediate: true }
);

const presets = rangePresets();
const speedOptions = PLAYBACK_SPEEDS.map((value) => ({ value, label: `${value}×` }));

// The composable owns the committed range; these fields are the *draft* the user edits, and "نمایش"
// hands it back. One direction only, so a preset press refills the inputs while typing never fires a
// request per keystroke.
watch(
  () => [props.api.fromInput.value, props.api.toInput.value],
  ([from, to]) => {
    fromField.value = from;
    toField.value = to;
  },
  { immediate: true }
);

function issueText(code: PlaybackIssue | null | undefined): string | null {
  return code ? playbackIssueText(code) : null;
}

const grantOptions = computed(() =>
  props.api.grants.value.map((grant) => ({
    id: grant.id,
    // The grant's own window, not the picker's: this is the range the owner permitted, and the label is
    // the only place a receiver can see it.
    label: `${grant.owner.username} · ${formatLocalTime(Date.parse(grant.from), { withDate: true })} تا ${formatLocalTime(
      Date.parse(grant.to),
      { withDate: true }
    )} · ${grant.maxPoints ? `${grant.maxPoints.toLocaleString("fa-IR")} نقطه` : "همهٔ نقاط"}`
  }))
);

const pointCount = computed(() => `${props.api.points.value.length.toLocaleString("fa-IR")} نقطه`);

const currentTime = computed(() =>
  props.api.bounds.value ? formatLocalTime(props.api.cursorMs.value) : "—"
);

const scrubValue = computed(() => props.api.progress.value);

const statusLine = computed(() => {
  const api = props.api;
  if (api.loading.value) return "در حال خواندن تاریخچه…";
  const problem = issueText(api.windowIssue.value ?? api.loadIssue.value);
  if (problem) return problem;
  if (!api.hasTrack.value) {
    return api.sourceKind.value === "grant"
      ? "در این اشتراک نقطه‌ای یافت نشد؛ شاید مسیر در این بازه ثبت نشده باشد."
      : "در این بازه چیزی ثبت نشده است.";
  }
  const span = api.bounds.value ? Math.round((api.bounds.value.endMs - api.bounds.value.startMs) / 60_000) : 0;
  const parts = [`${pointCount.value} · ${formatDuration(span)}`];
  if (api.sampling.value.sampled) {
    parts.push(
      `نمونه‌برداری‌شده: ${api.points.value.length.toLocaleString("fa-IR")} از ${api.totalPoints.value.toLocaleString(
        "fa-IR"
      )} نقطهٔ ثبت‌شده`
    );
  }
  const selected = api.grants.value.find((grant) => grant.id === api.grantId.value);
  if (api.sourceKind.value === "grant" && selected) parts.push(`اشتراک ${selected.owner.username}`);
  return parts.join(" · ");
});

/** Same human units as the share dialog, so «۷ روز» here and there mean the same span. */
function presetLabel(days: number): string {
  return formatDuration(days * 1440);
}

function chooseSource(value: unknown): void {
  const kind = value === "grant" ? "grant" : "own";
  if (kind === "own") {
    fromField.value = props.api.fromInput.value;
    toField.value = props.api.toInput.value;
  }
  props.api.selectSource(kind);
}

function chooseGrant(value: unknown): void {
  if (typeof value === "string" && value) props.api.selectGrant(value);
}

function applyManualRange(): void {
  void props.api.setManualRange(fromField.value, toField.value);
}

function chooseSpeed(value: unknown): void {
  if (typeof value === "number") props.api.setSpeed(value);
}

function scrub(value: number | readonly number[]): void {
  const ratio = Array.isArray(value) ? value[0] : value;
  if (typeof ratio === "number" && Number.isFinite(ratio)) props.api.seekProgress(ratio);
}
</script>

<style scoped>
.history-playback {
  display: flex;
  width: min(24rem, 100%);
  max-height: calc(100% - 2rem);
  flex-direction: column;
  padding: 0.6rem 0.75rem;
  color: #193536;
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(12px);
  pointer-events: auto;
  overflow: hidden auto;
}

.history-playback__header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.history-playback__title-block {
  min-width: 0;
  flex: 1 1 auto;
}

.history-playback__title-block p {
  margin: 0;
  color: #536d6c;
  font-size: 0.68rem;
  font-weight: 700;
}

.history-playback__title-block h2 {
  margin: 0.1rem 0 0;
  font-size: 0.95rem;
  font-weight: 800;
  line-height: 1.4;
}

.history-playback__points-chip,
.history-playback__toggle,
.history-playback__quick-play {
  flex: 0 0 auto;
}

.history-playback__preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-playback__body {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-top: 0.6rem;
}

.history-playback__source :deep(.v-btn-toggle) {
  width: 100%;
}

.history-playback__source :deep(.v-btn) {
  flex: 1 1 0;
  min-width: 0;
}

.history-playback__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.history-playback__chip {
  cursor: pointer;
}

.history-playback__fields {
  display: flex;
  align-items: flex-end;
  gap: 0.4rem;
}

.history-playback__field {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 0.15rem;
  color: #536d6c;
  font-size: 0.66rem;
  font-weight: 700;
}

.history-playback__field input {
  width: 100%;
  min-width: 0;
  padding: 0.3rem 0.4rem;
  border: 1px solid var(--bb-color-muted);
  border-radius: 0.5rem;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.72rem;
}

.history-playback__field input:focus-visible {
  outline: 2px solid var(--bb-color-primary);
  outline-offset: 2px;
}

.history-playback__apply {
  flex: 0 0 auto;
}

.history-playback__transport {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.history-playback__clock {
  flex: 1 1 auto;
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.history-playback__speed {
  width: 5.5rem;
  flex: 0 0 auto;
}

.history-playback__status,
.history-playback__grants-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.history-playback__hint {
  margin: 0;
  color: #536d6c;
  font-size: 0.68rem;
  line-height: 1.6;
}

.history-playback__status {
  font-variant-numeric: tabular-nums;
}

:global(:root.dark) .history-playback {
  background: rgba(27, 41, 42, 0.94);
  color: #edf5f2;
}

:global(:root.dark) .history-playback__title-block p,
:global(:root.dark) .history-playback__status,
:global(:root.dark) .history-playback__hint,
:global(:root.dark) .history-playback__field {
  color: #a0b6b2;
}

:global(:root.dark) .history-playback__field input {
  border-color: var(--bb-color-muted);
}

@media (max-width: 1023px) {
  .history-playback {
    width: 100%;
    max-height: min(56dvh, 26rem);
    padding: 0.5rem 0.75rem;
    overscroll-behavior: contain;
  }

  .history-playback:not(.history-playback--open) {
    max-height: none;
    overflow: hidden;
  }

  .history-playback__header {
    position: sticky;
    top: 0;
    z-index: 1;
    min-height: 2.75rem;
    background: rgb(var(--v-theme-surface));
  }

  .history-playback__title-block p { margin-top: 0.15rem; }
  .history-playback__points-chip { display: none; }
  .history-playback__fields { flex-wrap: wrap; }
}
</style>
