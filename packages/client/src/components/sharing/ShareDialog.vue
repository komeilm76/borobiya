<template>
  <v-dialog
    :model-value="modelValue"
    max-width="660"
    scrollable
    :persistent="submitting"
    :fullscreen="fullscreen ?? $vuetify.display.xs"
    :close-on-back="!fullscreen"
    aria-labelledby="share-dialog-title"
    @update:model-value="onVisibility"
  >
    <v-card rounded="xl" class="share-dialog" dir="rtl">
      <header class="share-dialog__header">
        <span class="share-dialog__header-icon" aria-hidden="true">
          <v-icon :icon="shareKind === 'history' ? 'mdi-map-marker-path' : 'mdi-map-marker-account-outline'" size="25" />
        </span>
        <div class="share-dialog__header-copy">
          <span class="share-dialog__eyebrow">حریم خصوصی / اشتراک جدید</span>
          <h2 id="share-dialog-title" class="share-dialog__title">اشتراک موقعیت</h2>
          <p class="share-dialog__lead">
            <template v-if="mode === 'history'">
              هر همراهی که انتخاب کنید فقط نقاط ثبت‌شدهٔ شما در بازهٔ انتخابی را روی نقشه می‌بیند و هر
              زمان بخواهید می‌توانید دسترسی این بازه را حذف کنید.
            </template>
            <template v-else-if="mode === 'permanent'">
              هر همراهی که انتخاب کنید موقعیت زندهٔ شما را تا وقتی اشتراک را خاموش کنید می‌بیند.
            </template>
            <template v-else>
              هر همراهی که انتخاب کنید موقعیت زندهٔ شما را تا پایان مدت انتخابی می‌بیند. می‌توانید هر
              زمان که خواستید اشتراک را لغو کنید.
            </template>
          </p>
        </div>
        <v-btn class="share-dialog__close" icon="mdi-close" variant="text" aria-label="بستن فرم اشتراک موقعیت"
          :disabled="submitting" @click="close" />
      </header>

      <v-card-text class="share-dialog__body">
        <form id="share-location-fields" class="share-dialog__form" @submit.prevent="submit">
          <v-alert v-if="formError && !deviceChooserOpen" class="share-dialog__alert" type="error" variant="tonal" density="compact" role="alert">
            {{ formError }}
          </v-alert>

          <section class="share-dialog__section" aria-labelledby="share-kind-title">
            <div class="share-dialog__section-head">
              <span class="share-dialog__step" aria-hidden="true">۱</span>
              <div>
                <h3 id="share-kind-title">انتخاب نوع اشتراک</h3>
                <p>موقعیت لحظه‌ای یا فقط مسیر گذشته؛ تصمیم با شماست.</p>
              </div>
            </div>
            <div class="share-dialog__field">
              <v-btn-toggle v-model="shareKind" class="share-dialog__kind-switch" mandatory aria-labelledby="share-kind-title" :disabled="submitting">
                <v-btn value="live" variant="text" class="share-dialog__kind-option" type="button">
                  <v-icon icon="mdi-crosshairs-gps" size="22" aria-hidden="true" />
                  <span><strong>موقعیت زنده</strong><small>نمایش جای فعلی روی نقشه</small></span>
                </v-btn>
                <v-btn value="history" variant="text" class="share-dialog__kind-option" type="button">
                  <v-icon icon="mdi-map-clock-outline" size="22" aria-hidden="true" />
                  <span><strong>تاریخچهٔ مسیر</strong><small>فقط نقاط بازهٔ انتخابی</small></span>
                </v-btn>
              </v-btn-toggle>
            </div>
          </section>

          <section class="share-dialog__section" aria-labelledby="share-recipients-title">
            <div class="share-dialog__section-head">
              <span class="share-dialog__step" aria-hidden="true">۲</span>
              <div>
                <h3 id="share-recipients-title">انتخاب همراهان</h3>
                <p>فقط افراد انتخاب‌شده به موقعیت شما دسترسی خواهند داشت.</p>
              </div>
              <span class="share-dialog__count" aria-live="polite">{{ recipients.length.toLocaleString('fa-IR') }} / {{ maxTargets.toLocaleString('fa-IR') }}</span>
            </div>
            <div class="share-dialog__field">
              <v-text-field
                v-model="searchTerm"
                density="comfortable"
                variant="outlined"
                single-line
                clearable
                hide-details="auto"
                label="جست‌وجوی نام کاربری"
                placeholder="حداقل دو نویسه"
                aria-describedby="share-recipient-hint"
                :loading="searching"
                :disabled="submitting"
                rounded="lg"
                @keydown.enter.prevent="searchNow"
              >
                <template #prepend-inner>
                  <v-icon icon="mdi-magnify" size="20" />
                </template>
              </v-text-field>

              <div class="share-dialog__online-filter">
                <span id="share-online-label" class="share-dialog__label">نمایش همراهان</span>
                <v-btn-toggle v-model="onlineFilter" density="compact" divided mandatory aria-labelledby="share-online-label" :disabled="submitting">
                  <v-btn value="all" size="small" type="button">همه</v-btn>
                  <v-btn value="online" size="small" type="button">
                    <v-icon class="me-1" icon="mdi-wifi" size="16" />
                    آنلاین
                  </v-btn>
                </v-btn-toggle>
              </div>

              <p id="share-recipient-hint" class="share-dialog__hint" role="status">
                <template v-if="searching">در حال جستجو…</template>
                <template v-else-if="searchFailed">
                  جستجو انجام نشد.
                  <v-btn variant="text" size="x-small" color="primary" type="button" :disabled="submitting" @click="searchNow">دوباره</v-btn>
                </template>
                <template v-else-if="resultTotal > resultCount">
                  {{ resultTotal }} نتیجه؛ برای دیدن بقیه جستجو را دقیق‌تر کنید.
                </template>
              </p>

              <v-expand-transition>
                <div v-if="recipients.length > 0" class="share-dialog__selected">
                  <p class="share-dialog__label">
                    {{ recipients.length }} نفر انتخاب شدند
                    <span v-if="recipientsFull" class="share-dialog__warn">(سقف {{ maxTargets }})</span>
                  </p>
                  <div class="share-dialog__chips">
                    <v-chip
                      v-for="recipient in recipients"
                      :key="recipient.id"
                      closable
                      variant="tonal"
                      color="primary"
                      :disabled="submitting"
                      @click:close="remove(recipient.id)"
                    >
                      <span dir="ltr">{{ recipient.username }}</span>
                    </v-chip>
                  </div>
                </div>
              </v-expand-transition>

              <p v-if="recipients.length === 0" class="share-dialog__empty-selection" role="status">
                <v-icon icon="mdi-account-plus-outline" size="19" aria-hidden="true" />
                برای ادامه، دست‌کم یک همراه را از نتایج جست‌وجو اضافه کنید.
              </p>
              <ul v-if="hasResults" class="share-dialog__results" role="list" aria-label="نتایج جستجوی همراهان">
                <li v-for="candidate in results" :key="candidate.id" class="share-dialog__result"
                  :class="{ 'share-dialog__result--selected': isSelected(candidate) }">
                  <v-avatar color="primary" size="36" aria-hidden="true" class="share-dialog__result-avatar">
                    {{ avatarInitial(candidate.username) }}
                  </v-avatar>
                  <div class="share-dialog__result-main">
                    <strong class="share-dialog__result-name" dir="auto">{{ candidate.username }}</strong>
                    <div class="share-dialog__result-meta">
                      <span v-if="candidate.category">{{ candidate.category }}</span>
                      <span v-if="candidate.avgRating !== null" class="share-dialog__result-rating">
                        <v-icon icon="mdi-star" size="14" aria-hidden="true" />{{ candidate.avgRating.toLocaleString('fa-IR') }}
                      </span>
                      <span class="share-dialog__result-presence" :class="{ 'share-dialog__result-presence--online': candidate.isOnline }">
                        <span class="share-dialog__result-dot" aria-hidden="true" />{{ candidate.isOnline ? 'آنلاین' : 'آفلاین' }}
                      </span>
                      <span v-if="candidate.distance !== null">{{ candidate.distance.toLocaleString('fa-IR') }} کیلومتر</span>
                    </div>
                  </div>
                  <v-btn
                    class="share-dialog__result-action"
                    icon
                    type="button"
                    size="small"
                    variant="tonal"
                    :color="isSelected(candidate) ? 'success' : 'primary'"
                    :disabled="submitting || isSelf(candidate) || (recipientsFull && !isSelected(candidate))"
                    :aria-pressed="isSelected(candidate)"
                    :title="isSelf(candidate) ? 'حساب شما' : isSelected(candidate) ? 'حذف همراه' : 'افزودن همراه'"
                    :aria-label="
                      isSelf(candidate)
                        ? 'نمی‌توانید موقعیت خود را با خودتان به اشتراک بگذارید'
                        : isSelected(candidate)
                          ? `حذف ${candidate.username} از فهرست`
                          : `افزودن ${candidate.username} به فهرست`
                    "
                    @click="toggle(candidate)"
                  >
                    <v-icon :icon="isSelected(candidate) ? 'mdi-check' : 'mdi-plus'" size="21" />
                  </v-btn>
                </li>
              </ul>

              <v-alert
                v-else-if="
                  (hasTerm || onlineFilter === 'online') &&
                  !searchFailed && !searching && (termTooShort || searchVerified)
                "
                class="mt-2"
                type="info"
                variant="text"
                density="compact"
              >
                <template v-if="!hasTerm || termTooShort">برای شروع جستجو حداقل دو نویسه بنویسید.</template>
                <template v-else>هیچ حسابی با این نام پیدا نشد.</template>
              </v-alert>
            </div>
          </section>

          <section class="share-dialog__section" aria-labelledby="share-access-title">
            <div class="share-dialog__section-head">
              <span class="share-dialog__step" aria-hidden="true">۳</span>
              <div>
                <h3 id="share-access-title">تنظیمات اشتراک</h3>
                <p>{{ shareKind === 'history' ? 'بازهٔ مسیر گذشته را مشخص کنید.' : 'مدت دسترسی به موقعیت زنده را تعیین کنید.' }}</p>
              </div>
            </div>
            <div class="share-dialog__field">
              <div v-if="shareKind === 'live'" class="share-dialog__duration">
                <p class="share-dialog__label">مدت اشتراک زنده</p>
                <div class="share-dialog__presets" role="group" aria-label="مدت دسترسی به موقعیت زنده">
                  <button
                    v-for="minutes in presets"
                    :key="minutes"
                    type="button"
                    class="share-dialog__chip"
                    :class="{ 'share-dialog__chip--on': mode === 'timed' && durationMinutes === minutes }"
                    :aria-pressed="mode === 'timed' && durationMinutes === minutes"
                    :disabled="submitting"
                    @click="chooseLiveDuration(minutes)"
                  >
                    {{ durationWords(minutes) }}
                  </button>
                  <button
                    type="button"
                    class="share-dialog__chip"
                    :class="{ 'share-dialog__chip--on': mode === 'permanent' }"
                    :aria-pressed="mode === 'permanent'"
                    :disabled="submitting"
                    @click="chooseLiveDuration(null)"
                  >
                    تا وقتی خاموش کنم
                  </button>
                </div>
                <p class="share-dialog__duration-value" role="status">
                  {{ mode === 'permanent' ? 'تا وقتی خاموش کنم' : durationWords(durationMinutes) }}
                </p>
                <v-slider
                  :model-value="sliderStepForMinutes(durationMinutes)"
                  :min="0"
                  :max="DURATION_SLIDER_MAX"
                  :step="1"
                  color="primary"
                  hide-details
                  :aria-valuetext="durationWords(durationMinutes)"
                  :disabled="submitting || mode === 'permanent'"
                  aria-label="تنظیم مدت اشتراک تا ۳۰ روز"
                  @update:model-value="chooseLiveDuration(minutesForSliderStep($event))"
                />
                <div class="share-dialog__slider-limits" aria-hidden="true">
                  <span>{{ durationWords(15) }}</span><span>{{ durationWords(maxMinutes) }}</span>
                </div>
              </div>

              <div v-else-if="mode === 'history'" class="share-dialog__duration">
                <div class="share-dialog__presets" role="group" aria-label="میان‌برهای بازهٔ تاریخچه">
                  <button
                    v-for="hours in historyPresets"
                    :key="hours"
                    type="button"
                    class="share-dialog__chip"
                    :class="{ 'share-dialog__chip--on': activeHistoryPresetHours === hours }"
                    :aria-pressed="activeHistoryPresetHours === hours"
                    :disabled="submitting"
                    @click="applyHistoryPreset(hours)"
                  >
                    {{ durationWords(hours * 60) }} اخیر
                  </button>
                </div>

                <div class="share-dialog__history-fields">
                  <HistoryDateTimeField
                    v-model="historyFromInput"
                    label="از زمان"
                    :disabled="submitting"
                    :max="historyToInput"
                    @update:model-value="activeHistoryPresetHours = null"
                  />
                  <HistoryDateTimeField
                    v-model="historyToInput"
                    label="تا زمان"
                    :disabled="submitting"
                    :min="historyFromInput"
                    @update:model-value="activeHistoryPresetHours = null"
                  />
                </div>

                <p v-if="historyRangeError" class="share-dialog__validation" role="alert">{{ historyRangeError }}</p>
                <v-text-field
                  v-model="historyMaxPointsInput"
                  class="share-dialog__points"
                  type="number"
                  min="1"
                  :max="maxHistoryPoints"
                  density="comfortable"
                  variant="outlined"
                  rounded="lg"
                  clearable
                  hint="خالی بگذارید تا تعداد نقاط به‌صورت پیش‌فرض تعیین شود."
                  persistent-hint
                  label="حداکثر تعداد نقاط (اختیاری)"
                  :error-messages="historyPointsError ?? ''"
                  :disabled="submitting"
                  :placeholder="`مثلاً ۱۰۰۰ (سقف ${maxHistoryPoints})`"
                />
              </div>
            </div>

            <div v-if="mode !== 'history'" class="share-dialog__field">
              <v-textarea
                v-model="note"
                label="یادداشت برای همراهان (اختیاری)"
                density="comfortable"
                variant="outlined"
                rows="2"
                auto-grow
                :maxlength="maxNote"
                counter
                rounded="lg"
                :disabled="submitting"
                hide-details="auto"
              />
            </div>
            <p class="share-dialog__privacy" role="note">
              <v-icon icon="mdi-shield-lock-outline" size="19" aria-hidden="true" />
              {{ mode === 'history'
                ? 'تنها نقاط بازهٔ انتخابی در اختیار همراهان قرار می‌گیرد؛ این دسترسی را بعداً می‌توانید حذف کنید.'
                : mode === 'permanent'
                  ? 'اشتراک زنده تا زمانی که خودتان آن را خاموش کنید ادامه دارد.'
                  : 'اشتراک زنده پس از پایان مدت انتخابی متوقف می‌شود و هر زمان هم می‌توانید آن را لغو کنید.' }}
            </p>
          </section>
        </form>
      </v-card-text>

      <v-card-actions class="share-dialog__actions">
        <span class="share-dialog__status" role="status">{{ statusText }}</span>
        <v-spacer />
        <v-btn variant="text" rounded="lg" :disabled="submitting" @click="close">انصراف</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          rounded="lg"
          type="submit"
          form="share-location-fields"
          :loading="submitting"
          :disabled="!canSubmit"
        >
          <v-icon class="me-2" icon="mdi-share-variant-outline" />
          {{ shareKind === 'history' ? 'اشتراک تاریخچه' : 'اشتراک موقعیت زنده' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="deviceChooserOpen" max-width="480" scrollable persistent aria-labelledby="share-device-title">
    <v-card rounded="xl" class="share-device-chooser" dir="rtl">
      <header class="share-dialog__header">
        <span class="share-dialog__header-icon" aria-hidden="true"><v-icon icon="mdi-cellphone-marker" size="25" /></span>
        <div class="share-dialog__header-copy">
          <span class="share-dialog__eyebrow">اشتراک موقعیت / دستگاه</span>
          <h2 id="share-device-title" class="share-dialog__title">دستگاه پخش‌کننده</h2>
          <p class="share-dialog__lead">فقط یک دستگاه می‌تواند موقعیت این اشتراک را بفرستد.</p>
        </div>
      </header>
      <v-card-text class="share-device-chooser__body">
        <p class="share-device-chooser__explanation">
          حساب شما روی چند دستگاه هم‌زمان فعال است. دستگاهی را انتخاب کنید که موقعیت شما را برای همراهان ارسال کند.
        </p>
        <v-alert v-if="formError" class="mb-4" type="error" variant="tonal" density="compact" role="alert">
          {{ formError }}
        </v-alert>
        <v-radio-group v-model="chosenDeviceId" density="compact" hide-details>
          <v-radio
            v-for="(deviceId, index) in deviceIds"
            :key="deviceId"
            :value="deviceId"
            :label="deviceLabel(deviceId, index)"
          />
        </v-radio-group>
      </v-card-text>
      <v-card-actions class="share-device-chooser__actions">
        <v-spacer />
        <v-btn variant="text" :disabled="submitting" @click="deviceChooserOpen = false">انصراف</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :disabled="!chosenDeviceId"
          :loading="submitting"
          @click="submit"
        >
          ادامه
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  MAX_LOCATION_HISTORY_SHARE_POINTS,
  MAX_LOCATION_SHARE_MINUTES,
  MAX_LOCATION_SHARE_NOTE_LENGTH,
  MAX_LOCATION_SHARE_TARGETS,
  type UserDevice,
  type UserSearchResult
} from "@shared/index";
import { fetchUserDevices } from "@/api/devices";
import { friendlyErrorMessage } from "@/api/error-message";
import { ApiError } from "@/api/http";
import { createLocationHistoryShare, createLocationShare } from "@/api/location";
import { historyWindowFromInputs, isoToLocalInput } from "@/history/playback";
import { avatarInitial } from "@/live/avatar-initial";
import { DURATION_SLIDER_MAX, minutesForSliderStep, sliderStepForMinutes } from "@/sharing/duration-slider";
import HistoryDateTimeField from "@/components/sharing/HistoryDateTimeField.vue";
import { useTargetSearch } from "@/composables/use-target-search";
import { useAuthStore } from "@/stores/auth";
import { createShareSubmissionFence, shareSessionKey } from "@/sharing/share-submission-fence";
import {
  addRecipient,
  buildHistorySharePayload,
  buildLiveSharePayload,
  canSubmitShareDraft,
  choiceDeviceOptionLabel,
  DURATION_PRESET_MINUTES,
  formatDuration,
  HISTORY_PRESET_HOURS,
  historyPresetWindow,
  isHistoryRangeTooLarge,
  nameShareRejections,
  rejectionText,
  needsPriorityDevice,
  priorityDeviceIds,
  recipientLabels,
  removeRecipient,
  shareDraftIssues,
  shareRejections,
  shouldSearch,
  type ShareCreatedResult,
  type ShareDraft,
  type ShareMode
} from "@/sharing/share-form";

/**
 * The share dialog (spec §7.2). Deliberately thin: validation, payload building, the 409 device
 * choice and the debounced search all live in `@/sharing/share-form` and
 * `@/composables/use-target-search`, where they are tested without a browser.
 */
// An explicit map breakpoint wins; the standalone form defaults to phone-only fullscreen.
const props = defineProps<{ modelValue: boolean; fullscreen?: boolean }>();
const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "shared", result: ShareCreatedResult): void;
}>();

const auth = useAuthStore();
const accessToken = computed(() => auth.accessToken);

const onlineFilter = ref<"all" | "online">("all");
const {
  term: searchTerm,
  results,
  total: resultTotal,
  loading: searching,
  failed: searchFailed,
  verified: searchVerified,
  hasResults,
  searchNow,
  cancelPending
} = useTargetSearch({
  accessToken,
  ensureSession: () => auth.refreshSession(),
  online: computed(() => (onlineFilter.value === "online" ? true : undefined))
});

const mode = ref<ShareMode>("timed");
const lastLiveMode = ref<"timed" | "permanent">("timed");
const shareKind = computed<"live" | "history">({
  get: () => mode.value === "history" ? "history" : "live",
  set: (kind) => {
    if (kind === "history") {
      if (mode.value !== "history") lastLiveMode.value = mode.value;
      mode.value = "history";
    } else if (mode.value === "history") {
      mode.value = lastLiveMode.value;
    }
  }
});
const durationMinutes = ref(60);

function chooseLiveDuration(minutes: number | null): void {
  mode.value = minutes === null ? "permanent" : "timed";
  if (minutes !== null) durationMinutes.value = minutes;
  lastLiveMode.value = mode.value;
}
const note = ref("");
const recipients = ref<UserSearchResult[]>([]);

const initialHistoryWindow = historyPresetWindow(24);
const activeHistoryPresetHours = ref<number | null>(24);
const historyPresetSelection = ref(initialHistoryWindow);
const historyFromInput = ref(isoToLocalInput(initialHistoryWindow.from));
const historyToInput = ref(isoToLocalInput(initialHistoryWindow.to));
const historyMaxPointsInput = ref<string>("");

const submitting = ref(false);
const formError = ref<string | null>(null);
const createdCount = ref(0);
const reusedCount = ref(0);
const deviceChooserOpen = ref(false);
const deviceIds = ref<string[]>([]);
const knownDevices = ref<UserDevice[]>([]);
const chosenDeviceId = ref<string | null>(null);
const submissionFence = createShareSubmissionFence({
  ownerId: () => auth.user?.id ?? null,
  accessToken: () => auth.accessToken,
  isOpen: () => props.modelValue
});

function invalidateSubmission(): void {
  submissionFence.invalidate();
  submitting.value = false;
  formError.value = null;
  createdCount.value = 0;
  reusedCount.value = 0;
  deviceChooserOpen.value = false;
  deviceIds.value = [];
  knownDevices.value = [];
  chosenDeviceId.value = null;
}

const maxMinutes = MAX_LOCATION_SHARE_MINUTES;
const maxHistoryPoints = MAX_LOCATION_HISTORY_SHARE_POINTS;
const maxNote = MAX_LOCATION_SHARE_NOTE_LENGTH;
const maxTargets = MAX_LOCATION_SHARE_TARGETS;
const presets = DURATION_PRESET_MINUTES;
const historyPresets = HISTORY_PRESET_HOURS;
const parsedHistoryMaxPoints = computed<number | null>(() => {
  const raw = String(historyMaxPointsInput.value ?? "").trim();
  if (!raw) return null;
  return Number(raw);
});

const draft = computed<ShareDraft>(() => {
  const historyWindow = historyWindowFromInputs(historyFromInput.value, historyToInput.value,
    activeHistoryPresetHours.value === null ? null : historyPresetSelection.value);
  return {
    mode: mode.value,
    recipients: recipients.value,
    durationMinutes: durationMinutes.value,
    note: note.value,
    historyFrom: historyWindow?.from,
    historyTo: historyWindow?.to,
    historyMaxPoints: parsedHistoryMaxPoints.value
  };
});

function applyHistoryPreset(hours: number): void {
  activeHistoryPresetHours.value = hours;
  const window = historyPresetWindow(hours);
  historyPresetSelection.value = window;
  historyFromInput.value = isoToLocalInput(window.from);
  historyToInput.value = isoToLocalInput(window.to);
}

const hasTerm = computed(() => searchTerm.value.trim().length > 0);
const termTooShort = computed(() => !shouldSearch(searchTerm.value));
const resultCount = computed(() => results.value.length);
const recipientsFull = computed(() => recipients.value.length >= maxTargets);
const issues = computed(() => shareDraftIssues(draft.value));
const historyRangeError = computed(() => {
  const issue = issues.value.find(({ code }) => code === "history_window_required" || code === "history_end_not_after_start");
  return issue ? issueText(issue.code) : null;
});
const historyPointsError = computed(() => {
  const issue = issues.value.find(({ code }) => code === "history_points_out_of_range");
  return issue ? issueText(issue.code) : null;
});
const canSubmit = computed(() => !submitting.value && canSubmitShareDraft(draft.value));
const statusText = computed(() => {
  if (submitting.value) return "در حال ثبت اشتراک…";
  const parts: string[] = [];
  if (createdCount.value > 0) parts.push(`${createdCount.value} اشتراک تازه ساخته شد`);
  if (reusedCount.value > 0) parts.push(`${reusedCount.value} مورد تمدید شد`);
  return parts.join("؛ ");
});

/** Chips, the live label, and the ceiling hint share one formatter, so they can never disagree. */
function durationWords(minutes: number): string {
  return formatDuration(minutes);
}

function isSelf(candidate: UserSearchResult): boolean {
  return candidate.id === auth.user?.id;
}

function isSelected(candidate: UserSearchResult): boolean {
  return recipients.value.some((recipient) => recipient.id === candidate.id);
}

function deviceLabel(deviceId: string, index: number): string {
  return choiceDeviceOptionLabel(deviceId, knownDevices.value, index);
}

function toggle(candidate: UserSearchResult): void {
  if (isSelf(candidate) || (recipientsFull.value && !isSelected(candidate))) return;
  recipients.value = isSelected(candidate)
    ? removeRecipient(recipients.value, candidate.id)
    : addRecipient(recipients.value, candidate);
}

function remove(id: string): void {
  recipients.value = removeRecipient(recipients.value, id);
}

/** One submit path for both the first attempt and the retry after a device was chosen. */
async function submit(): Promise<void> {
  if (submitting.value) return;
  const submission = submissionFence.begin();
  if (!submission) return;
  const current = draft.value;
  formError.value = null;
  const found = shareDraftIssues(current);
  if (found.length > 0) {
    formError.value = issueText(found[0]!.code);
    return;
  }

  try {
    await auth.ensureSession();
    if (!submissionFence.isActive(submission)) return;
    const token = accessToken.value;
    if (!token) {
      formError.value = "برای ثبت اشتراک دوباره وارد شوید.";
      return;
    }
    if (!submissionFence.isCurrent(submission)) return;
    submitting.value = true;
    if (current.mode === "history") {
      const historyBody = buildHistorySharePayload(current, {
        from: current.historyFrom!,
        to: current.historyTo!,
        maxPoints: current.historyMaxPoints
      });
      const created = await createLocationHistoryShare(historyBody, token);
      if (!submissionFence.isCurrent(submission)) return;
      createdCount.value = created.createdShareIds.length;
      reusedCount.value = created.reusedShareIds.length;
      emit("shared", { mode: current.mode, created: createdCount.value, reused: reusedCount.value });
      return;
    }

    const payload = buildLiveSharePayload(current);
    // Only send the chosen device while the chooser is up: once the account is down to one live
    // device, a stale `priorityDeviceId` would be refused as unavailable.
    const body = deviceChooserOpen.value && chosenDeviceId.value
      ? { ...payload, priorityDeviceId: chosenDeviceId.value }
      : payload;

    const created = await createLocationShare(body, token);
    if (!submissionFence.isCurrent(submission)) return;
    createdCount.value = created.createdShareIds.length;
    reusedCount.value = created.reusedShareIds.length;
    deviceChooserOpen.value = false;
    emit("shared", { mode: current.mode, created: createdCount.value, reused: reusedCount.value });
  } catch (error) {
    if (!submissionFence.isCurrent(submission)) return;
    createdCount.value = 0;
    reusedCount.value = 0;
    if (needsPriorityDevice(error)) {
      const ids = priorityDeviceIds(error);
      if (ids.length > 0) {
        const devices = await fetchUserDevices(accessToken.value!).catch(() => []);
        if (!submissionFence.isCurrent(submission)) return;
        deviceIds.value = ids;
        knownDevices.value = devices;
        const currentDevice = knownDevices.value.find(
          (device) => device.isCurrentDevice && ids.includes(device.deviceId)
        );
        chosenDeviceId.value = currentDevice?.deviceId ?? (ids.length === 1 ? ids[0]! : null);
        deviceChooserOpen.value = true;
        return;
      }
    }
    if (isHistoryRangeTooLarge(error)) {
      formError.value = "بازهٔ زمانی انتخاب‌شده از سقف مجاز سرور بلندتر است؛ بازهٔ کوتاه‌تری انتخاب کنید.";
      return;
    }
    // Server refusals first: they name the recipient at fault, which the recomputed draft issues never
    // can (a draft that failed client-side validation would not have been submitted at all).
    const [rejection] = nameShareRejections(shareRejections(error), recipientLabels(current.recipients));
    formError.value =
      rejectionText(rejection) ??
      (error instanceof ApiError && error.code === "VALIDATION_ERROR" && issues.value[0]
        ? issueText(issues.value[0].code)
        : friendlyErrorMessage(error, "اشتراک ثبت نشد. دوباره تلاش کنید."));
  } finally {
    if (submissionFence.isCurrent(submission)) submitting.value = false;
  }
}

function issueText(code: string | undefined): string {
  switch (code) {
    case "no_recipients":
      return "حداقل یک همراه را انتخاب کنید.";
    case "too_many_recipients":
      return `نمی‌توانید بیشتر از ${maxTargets} نفر را هم‌زمان انتخاب کنید.`;
    case "duration_required":
      return "برای اشتراک مدت‌دار باید مدت را مشخص کنید.";
    case "duration_out_of_range":
      // The ceiling is phrased in the same units as the chips and the slider, because "43200 دقیقه"
      // is not a length anybody can judge at a glance.
      return `مدت باید عددی صحیح بین ۱ دقیقه تا ${durationWords(maxMinutes)} باشد.`;
    case "history_window_required":
      return "شروع و پایان بازهٔ تاریخچه را مشخص کنید.";
    case "history_end_not_after_start":
      return "زمان پایان بازه باید بعد از زمان شروع آن باشد.";
    case "history_points_out_of_range":
      return `حداکثر تعداد نقاط باید عددی صحیح بین ۱ تا ${maxHistoryPoints} باشد.`;
    case "note_too_long":
      return `یادداشت نمی‌تواند بیشتر از ${maxNote} نویسه باشد.`;
    default:
      return "اطلاعات واردشده را بررسی کنید.";
  }
}

function onVisibility(value: boolean): void {
  if (!value) invalidateSubmission();
  emit("update:modelValue", value);
}

function close(): void {
  invalidateSubmission();
  emit("update:modelValue", false);
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      formError.value = null;
      createdCount.value = 0;
      reusedCount.value = 0;
      // A "recent" history preset must be relative to this opening, not component mount time.
      if (activeHistoryPresetHours.value !== null) applyHistoryPreset(activeHistoryPresetHours.value);
      return;
    }
    invalidateSubmission();
    cancelPending();
    searchTerm.value = "";
  },
  { flush: "sync" }
);

watch(
  () => [auth.user?.id, auth.accessToken] as const,
  ([owner, token], [previousOwner, previousToken]) => {
    const next = shareSessionKey(owner ?? null, token);
    const previous = shareSessionKey(previousOwner ?? null, previousToken);
    if (next === previous && owner === previousOwner) return;
    // A cold token restore for this same profile may complete an in-progress submit;
    // logout already cleared its old recipients when the bearer became null.
    if (!previousToken && next && owner === previousOwner) return;
    invalidateSubmission();
    recipients.value = [];
    searchTerm.value = "";
    cancelPending();
  },
  { flush: "sync" }
);
onBeforeUnmount(() => { invalidateSubmission(); cancelPending(); });
</script>

<style scoped>
.share-dialog { color: var(--bb-color-text); background: rgb(var(--v-theme-surface)); font-family: var(--bb-font-family); }
.share-dialog__header {
  display: flex; align-items: flex-start; gap: var(--bb-rhythm-r085); flex: none;
  padding: var(--bb-rhythm-r100) var(--bb-content-layout-sharingDialogInset);
  border-bottom: 1px solid var(--bb-color-outline);
  background: linear-gradient(110deg, rgba(var(--v-theme-primary), .1), rgba(var(--v-theme-primary), .025) 75%);
}
.share-dialog__header-icon {
  display: grid; place-items: center; flex: none; width: 46px; height: 46px;
  border-radius: var(--bb-radius-nested); background: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-on-primary));
}
.share-dialog__header-copy { flex: 1; min-width: 0; }
.share-dialog__eyebrow { color: var(--bb-color-primary); font-size: var(--bb-sharing-font-caption); font-weight: var(--bb-weight-heavy); }
.share-dialog__title {
  margin: 0; color: var(--bb-color-text); font-size: 1.25rem;
  line-height: 1.45; font-weight: var(--bb-weight-heavy);
}
.share-dialog__close { flex: none; }
.share-dialog__close.v-btn { width: 44px; height: 44px; }
.share-dialog__body {
  width: 100%; max-width: var(--bb-content-width-sharingDialog);
  margin-inline: auto; padding: var(--bb-rhythm-r100) var(--bb-content-layout-sharingDialogInset);
}
.share-dialog__form { display: grid; gap: var(--bb-rhythm-r100); }
.share-dialog__section { min-width: 0; }
.share-dialog__section + .share-dialog__section {
  padding-block-start: var(--bb-rhythm-r100);
  border-top: 1px solid color-mix(in srgb, var(--bb-color-outline) 35%, transparent);
}
.share-dialog__section-head { display: flex; align-items: center; gap: var(--bb-rhythm-r065); margin-bottom: var(--bb-rhythm-r075); }
.share-dialog__section-head > div { flex: 1; min-width: 0; }
.share-dialog__section-head h3 { margin: 0; font-size: 1rem; font-weight: var(--bb-weight-heavy); }
.share-dialog__section-head p { margin: var(--bb-rhythm-r010) 0 0; color: var(--bb-color-muted); font-size: var(--bb-sharing-font-caption); line-height: 1.6; }
.share-dialog__step {
  display: grid; place-items: center; flex: none; width: 34px; height: 34px;
  border-radius: 10px; background: rgba(var(--v-theme-primary), .1);
  color: var(--bb-color-primary); font-weight: var(--bb-weight-heavy);
}
.share-dialog__count { flex: none; color: var(--bb-color-primary); font-size: var(--bb-sharing-font-caption); font-weight: var(--bb-weight-heavy); }
.share-dialog__lead {
  margin: var(--bb-rhythm-r025) 0 0; color: var(--bb-color-text);
  font-size: var(--bb-sharing-font-lead); line-height: var(--bb-content-leading-supporting);
}
.share-dialog__alert { margin-bottom: 0; }
.share-dialog__field + .share-dialog__field { margin-top: var(--bb-rhythm-r100); }

.share-dialog__label {
  margin: 0 0 var(--bb-rhythm-r040);
  color: var(--bb-color-muted);
  font-size: var(--bb-sharing-font-caption);
  font-weight: var(--bb-weight-heavy);
}

.share-dialog__online-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bb-rhythm-r050) var(--bb-rhythm-r075);
  margin-top: var(--bb-rhythm-r075);
}

.share-dialog__online-filter .share-dialog__label { margin: 0; }

.share-dialog__hint {
  margin: var(--bb-rhythm-r050) 0 0;
  color: var(--bb-color-muted);
  font-size: var(--bb-sharing-font-caption);
  line-height: var(--bb-content-leading-caption);
}

.share-dialog__kind-switch {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%; height: auto; padding: var(--bb-rhythm-r040); gap: var(--bb-rhythm-r040);
  border-radius: var(--bb-radius-nested); background: var(--bb-color-inset);
}
.share-dialog__kind-switch :deep(.v-btn.share-dialog__kind-option) {
  min-width: 0; height: auto; min-height: 72px; padding: var(--bb-rhythm-r050) var(--bb-rhythm-r065);
  border-radius: 12px; letter-spacing: normal; text-align: start; justify-content: flex-start;
}
.share-dialog__kind-option :deep(.v-btn__content) {
  display: flex; align-items: center; gap: var(--bb-rhythm-r060); width: 100%; white-space: normal;
}
.share-dialog__kind-option :deep(.v-icon) { flex: none; color: var(--bb-color-primary); }
.share-dialog__kind-option strong, .share-dialog__kind-option small { display: block; line-height: 1.5; }
.share-dialog__kind-option strong { color: var(--bb-color-text); font-size: var(--bb-sharing-font-label); }
.share-dialog__kind-option small { color: var(--bb-color-muted); font-size: var(--bb-sharing-font-caption); }
.share-dialog__kind-switch :deep(.v-btn--active) { background: rgb(var(--v-theme-surface)); box-shadow: 0 2px 9px rgba(var(--v-theme-primary), .12); }
.share-dialog__kind-switch :deep(.v-btn--active .v-btn__overlay) { opacity: 0; }
.share-dialog__empty-selection, .share-dialog__privacy {
  display: flex; align-items: flex-start; gap: var(--bb-rhythm-r050);
  margin: var(--bb-rhythm-r075) 0 0; color: var(--bb-color-muted);
  font-size: var(--bb-sharing-font-caption); line-height: 1.7;
}
.share-dialog__empty-selection :deep(.v-icon), .share-dialog__privacy :deep(.v-icon) {
  flex: none; margin-top: var(--bb-rhythm-r010); color: var(--bb-color-primary);
}
.share-dialog__privacy {
  padding: var(--bb-rhythm-r065) var(--bb-rhythm-r075);
  border-radius: var(--bb-radius-nested); background: rgba(var(--v-theme-primary), .08);
  color: var(--bb-color-text);
}
.share-dialog__validation { margin: var(--bb-rhythm-r050) 0 0; color: var(--bb-color-error-text); font-size: var(--bb-sharing-font-caption); }
.share-dialog__points { margin-top: var(--bb-rhythm-r075); }
.share-dialog__warn {
  color: var(--bb-audience-shareWarning);
  font-weight: var(--bb-weight-bold);
}

:global(:root.dark .share-dialog__warn) {
  color: var(--bb-color-secondary);
}

.share-dialog__results {
  list-style: none;
  padding: 0;
  margin: var(--bb-rhythm-r060) 0 0;
  border: 1px solid var(--bb-finish-shareResultsEdge);
  border-radius: var(--bb-radius-nested, 16px);
  /* The scrollable dialog body is the only vertical scroller. A second 17rem
     search-results viewport trapped swipes and hid selected companions. */
  background: var(--bb-finish-shareResultsFill);
}

.share-dialog__result {
  display: flex;
  align-items: center;
  gap: var(--bb-rhythm-r065);
  min-width: 0;
  min-height: 66px;
  padding: var(--bb-content-layout-sharingResultInset);
}
.share-dialog__result + .share-dialog__result { border-top: 1px solid var(--bb-finish-shareResultDivider); }
.share-dialog__result--selected { background: var(--bb-finish-shareResultSelected); }
.share-dialog__result-avatar { flex: 0 0 auto; font-size: var(--bb-sharing-font-avatar); font-weight: var(--bb-weight-heavy); }
.share-dialog__result-main { flex: 1 1 auto; min-width: 0; }
.share-dialog__result-name {
  display: block; color: var(--bb-color-text); font-size: var(--bb-sharing-font-label);
  line-height: var(--bb-content-leading-row); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.share-dialog__result-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--bb-rhythm-r010) var(--bb-rhythm-r060);
  color: var(--bb-color-muted); font-size: var(--bb-sharing-font-caption); line-height: var(--bb-content-leading-meta);
}
.share-dialog__result-rating { display: inline-flex; align-items: center; gap: var(--bb-rhythm-r010); }
.share-dialog__result-rating :deep(.v-icon) { color: var(--bb-audience-shareRating); }
.share-dialog__result-presence { display: inline-flex; align-items: center; gap: var(--bb-rhythm-r025); }
.share-dialog__result-dot { width: var(--bb-content-icon-presenceDot); height: var(--bb-content-icon-presenceDot); border-radius: 50%; background: var(--bb-audience-shareDotIdle); }
.share-dialog__result-presence--online .share-dialog__result-dot { background: var(--bb-audience-shareDotOnline); }
.share-dialog__result-action { flex: 0 0 auto; min-width: 44px; min-height: 44px; }
.share-dialog__result-action:focus-visible { outline: 2px solid var(--bb-color-primary); outline-offset: 2px; }

.share-dialog__selected {
  margin-top: var(--bb-rhythm-r100);
}

.share-dialog__chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bb-rhythm-r040);
}

.share-dialog__duration { min-width: 0; }

.share-dialog__history-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: var(--bb-rhythm-r065);
  margin-top: var(--bb-rhythm-r075);
}

.share-dialog__duration-value { margin: var(--bb-rhythm-r070) 0 0; color: var(--bb-color-text); font-weight: var(--bb-weight-bold); font-size: var(--bb-sharing-font-label); }
.share-dialog__slider-limits { display: flex; justify-content: space-between; gap: var(--bb-rhythm-r050); font-size: var(--bb-sharing-font-caption); color: var(--bb-color-muted); }

.share-dialog__presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bb-rhythm-r030);
  margin-top: var(--bb-rhythm-r040);
}

.share-dialog__chip {
  min-height: 2.5rem;
  padding: var(--bb-rhythm-r025) var(--bb-rhythm-r060);
  border: 1px solid var(--bb-finish-shareChipEdge);
  border-radius: var(--bb-shell-radius-pill);
  background: var(--bb-finish-shareChipFill);
  color: var(--bb-color-text);
  cursor: pointer;
  font: inherit;
  font-size: var(--bb-sharing-font-caption);
  font-weight: var(--bb-weight-bold);
  transition: border-color var(--bb-content-motion-hover) ease, background-color var(--bb-content-motion-hover) ease, color var(--bb-content-motion-hover) ease;
}

.share-dialog__chip:hover {
  border-color: var(--bb-finish-shareChipHoverEdge);
}

.share-dialog__chip:focus-visible {
  outline: 2px solid var(--bb-color-text);
  outline-offset: 2px;
}

.share-dialog__chip--on {
  background-color: var(--bb-audience-shareChipOn);
  border-color: var(--bb-audience-shareChipOn);
  color: var(--bb-audience-shareChipInk);
}

.share-dialog__actions {
  width: 100%; max-width: var(--bb-content-width-sharingDialog);
  margin-inline: auto; gap: var(--bb-rhythm-r040);
  padding: var(--bb-rhythm-r075) var(--bb-content-layout-sharingDialogInset) var(--bb-rhythm-r100);
  border-top: 1px solid var(--bb-color-outline);
}
.share-dialog__actions :deep(.v-btn) { min-height: 44px; margin: 0; }
@media (forced-colors: active) {
  .share-dialog__header, .share-dialog__kind-switch, .share-dialog__privacy { background: Canvas; color: CanvasText; }
  .share-dialog__section + .share-dialog__section { border-color: CanvasText; }
  .share-dialog__kind-switch :deep(.v-btn--active) { outline: 2px solid Highlight; }
}

/* Only the device choices scroll; the confirmation controls remain reachable. */
.share-device-chooser { color: var(--bb-color-text); background: rgb(var(--v-theme-surface)); }
.share-device-chooser__body { min-height: 0; overflow-y: auto; }
.share-device-chooser__body { padding: var(--bb-rhythm-r100) var(--bb-content-layout-sharingDialogInset); }
.share-device-chooser__explanation { margin: 0 0 var(--bb-rhythm-r075); color: var(--bb-color-muted); line-height: 1.7; }
.share-device-chooser__actions { padding: var(--bb-rhythm-r075) var(--bb-content-layout-sharingDialogInset); border-top: 1px solid var(--bb-color-outline); }
.share-device-chooser__actions :deep(.v-btn) { min-height: 44px; }
.share-device-chooser__body :deep(.v-label) { white-space: normal; overflow-wrap: anywhere; }

.share-dialog__status {
  color: var(--bb-color-success);
  font-size: var(--bb-sharing-font-caption);
  font-weight: var(--bb-weight-bold);
}

@media (max-width: 599px) {
  .share-dialog { height: 100dvh; max-height: 100dvh; border-radius: 0 !important; }
  .share-dialog__header {
    padding: calc(var(--bb-rhythm-r060) + env(safe-area-inset-top, 0px)) var(--bb-rhythm-r085) var(--bb-rhythm-r060);
  }
  .share-dialog__header-icon { width: 40px; height: 40px; }
  .share-dialog__title { font-size: 1.1rem; }
  .share-dialog__lead { line-height: 1.45; }
  .share-dialog__body { padding: var(--bb-rhythm-r075) var(--bb-rhythm-r085); }
  .share-dialog__section-head { margin-bottom: var(--bb-rhythm-r060); }
  .share-dialog__actions { padding-bottom: calc(var(--bb-rhythm-r075) + env(safe-area-inset-bottom, 0px)); }
  /* Fullscreen phones need room for a changing status message as well as both
   * non-shrinking Vuetify buttons; keep the separately scrollable form above. */
  .share-dialog__actions { flex-wrap: wrap; }
  .share-dialog__status { flex: 1 1 100%; min-width: 0; overflow-wrap: anywhere; }
  .share-dialog__actions :deep(.v-spacer) { display: none; }
  .share-dialog__actions :deep(.v-btn) { flex: 1 1 100%; min-width: 0; min-height: 44px; height: auto; }
  .share-dialog__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
  .share-device-chooser__actions { flex-wrap: wrap; }
  .share-device-chooser__actions :deep(.v-spacer) { display: none; }
  .share-device-chooser__actions :deep(.v-btn) { flex: 1 1 100%; min-width: 0; min-height: 44px; height: auto; }
  .share-device-chooser__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }
}

@media (max-width: 420px) {
  .share-dialog__kind-switch { grid-template-columns: minmax(0, 1fr); }
  .share-dialog__kind-switch :deep(.v-btn.share-dialog__kind-option) { min-height: 56px; }
}
:global(:root.dark .share-dialog__results) { border-color: var(--bb-finish-shareResultsEdge); }
:global(:root.dark .share-dialog__result + .share-dialog__result) { border-top-color: var(--bb-finish-shareResultDivider); }
:global(:root.dark .share-dialog__result--selected) {
  background: var(--bb-finish-shareResultSelected);
  border-inline-start: 3px solid var(--bb-finish-shareSelectedEdge);
}
:global(:root.dark .share-dialog__chip:not(.share-dialog__chip--on)) {
  background: var(--bb-finish-shareChipFill);
  border-color: var(--bb-finish-shareChipEdge);
}
:global(:root.dark .share-dialog__result-rating .v-icon) { color: var(--bb-color-secondary); }
</style>
