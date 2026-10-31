<template>
  <v-dialog
    :model-value="modelValue"
    max-width="660"
    scrollable
    :fullscreen="fullscreen ?? $vuetify.display.xs"
    :close-on-back="!fullscreen"
    aria-labelledby="share-dialog-title"
    @update:model-value="onVisibility"
  >
    <v-card rounded="xl" class="share-dialog">
      <v-card-title class="share-dialog__title">
        <v-icon class="me-2" icon="mdi-map-marker-account-outline" />
        <span id="share-dialog-title">اشتراک موقعیت</span>
      </v-card-title>

      <v-card-text class="share-dialog__body">
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

        <v-alert v-if="formError" class="mb-4" type="error" variant="tonal" density="compact" role="alert">
          {{ formError }}
        </v-alert>

        <div class="share-dialog__field">
          <p class="share-dialog__label" id="share-recipient-label">همراهان</p>
          <v-text-field
            v-model="searchTerm"
            density="comfortable"
            variant="outlined"
            single-line
            clearable
            hide-details="auto"
            label="جستجوی نام کاربری"
            placeholder="حداقل دو نویسه"
            aria-labelledby="share-recipient-label"
            aria-describedby="share-recipient-hint"
            :loading="searching"
            @keydown.enter.prevent="searchNow"
          >
            <template #prepend-inner>
              <v-icon icon="mdi-magnify" size="20" />
            </template>
          </v-text-field>

          <div class="share-dialog__online-filter">
            <span id="share-online-label" class="share-dialog__label">نمایش همراهان</span>
            <v-btn-toggle v-model="onlineFilter" density="compact" divided mandatory aria-labelledby="share-online-label">
              <v-btn value="all" size="small">همه</v-btn>
              <v-btn value="online" size="small">
                <v-icon class="me-1" icon="mdi-wifi" size="16" />
                آنلاین
              </v-btn>
            </v-btn-toggle>
          </div>

          <p id="share-recipient-hint" class="share-dialog__hint" role="status">
            <template v-if="searching">در حال جستجو…</template>
            <template v-else-if="searchFailed">
              جستجو انجام نشد.
              <v-btn variant="text" size="x-small" color="primary" @click="searchNow">دوباره</v-btn>
            </template>
            <template v-else-if="resultTotal > resultCount">
              {{ resultTotal }} نتیجه؛ برای دیدن بقیه جستجو را دقیق‌تر کنید.
            </template>
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
                size="small"
                variant="tonal"
                :color="isSelected(candidate) ? 'success' : 'primary'"
                :disabled="isSelf(candidate) || (recipientsFull && !isSelected(candidate))"
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
                @click:close="remove(recipient.id)"
              >
                <span dir="ltr">{{ recipient.username }}</span>
              </v-chip>
            </div>
          </div>
        </v-expand-transition>

        <v-divider class="my-5" />

        <div class="share-dialog__field">
          <p id="share-kind-label" class="share-dialog__label">نوع اشتراک</p>
          <v-btn-toggle v-model="shareKind" density="comfortable" divided mandatory aria-labelledby="share-kind-label">
            <v-btn value="live">
              <v-icon class="me-1" icon="mdi-map-marker-account-outline" size="18" />
              موقعیت زنده
            </v-btn>
            <v-btn value="history">
              <v-icon class="me-1" icon="mdi-map-marker-path" size="18" />
              تاریخچه مسیر
            </v-btn>
          </v-btn-toggle>

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
                @click="chooseLiveDuration(minutes)"
              >
                {{ durationWords(minutes) }}
              </button>
              <button
                type="button"
                class="share-dialog__chip"
                :class="{ 'share-dialog__chip--on': mode === 'permanent' }"
                :aria-pressed="mode === 'permanent'"
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
                @click="applyHistoryPreset(hours)"
              >
                {{ durationWords(hours * 60) }} اخیر
              </button>
            </div>

            <div class="share-dialog__history-fields">
              <HistoryDateTimeField
                v-model="historyFromInput"
                label="از زمان"
                :max="historyToInput"
                @update:model-value="activeHistoryPresetHours = null"
              />
              <HistoryDateTimeField
                v-model="historyToInput"
                label="تا زمان"
                :min="historyFromInput"
                @update:model-value="activeHistoryPresetHours = null"
              />
            </div>

            <v-text-field
              v-model="historyMaxPointsInput"
              class="mt-3"
              type="number"
              density="compact"
              variant="outlined"
              clearable
              hide-details="auto"
              label="حداکثر تعداد نقاط (اختیاری)"
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
            hide-details="auto"
          />
        </div>
      </v-card-text>

      <v-card-actions class="share-dialog__actions">
        <span class="share-dialog__status" role="status">{{ statusText }}</span>
        <v-spacer />
        <v-btn variant="text" :disabled="submitting" @click="close">بستن</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          rounded="lg"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        >
          <v-icon class="me-2" icon="mdi-share-variant-outline" />
          اشتراک‌گذاری
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="deviceChooserOpen" max-width="480" scrollable persistent>
    <v-card rounded="xl">
      <v-card-title class="share-dialog__title">کدام دستگاه موقعیت بفرستد؟</v-card-title>
      <v-card-text class="share-device-chooser__body">
        <p class="mb-3 share-dialog__lead">
          حساب شما روی چند دستگاه هم‌زمان فعال است. برای این اشتراک باید یک دستگاه را مشخص کنید؛
          تا وقتی این اشتراک باز است، فقط همان دستگاه موقعیت می‌فرستد.
        </p>
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
import { isoToLocalInput, localInputToIso } from "@/history/playback";
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
  (event: "shared"): void;
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

const draft = computed<ShareDraft>(() => ({
  mode: mode.value,
  recipients: recipients.value,
  durationMinutes: durationMinutes.value,
  note: note.value,
  historyFrom: localInputToIso(historyFromInput.value) ?? undefined,
  historyTo: localInputToIso(historyToInput.value) ?? undefined,
  historyMaxPoints: parsedHistoryMaxPoints.value
}));

function applyHistoryPreset(hours: number): void {
  activeHistoryPresetHours.value = hours;
  const window = historyPresetWindow(hours);
  historyFromInput.value = isoToLocalInput(window.from);
  historyToInput.value = isoToLocalInput(window.to);
}

const hasTerm = computed(() => searchTerm.value.trim().length > 0);
const termTooShort = computed(() => !shouldSearch(searchTerm.value));
const resultCount = computed(() => results.value.length);
const recipientsFull = computed(() => recipients.value.length >= maxTargets);
const issues = computed(() => shareDraftIssues(draft.value));
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
      emit("shared");
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
    emit("shared");
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
.share-dialog__title {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 45rem;
  margin-inline: auto;
  color: var(--bb-color-text);
  font-weight: 800;
}

.share-dialog__body {
  width: 100%;
  max-width: 45rem;
  margin-inline: auto;
  padding-inline: clamp(1rem, 3vw, 1.75rem);
}

.share-dialog__lead {
  margin: 0 0 1rem;
  color: var(--bb-color-text);
  font-size: 0.92rem;
  line-height: 1.7;
}

.share-dialog__field + .share-dialog__field {
  margin-top: 1.25rem;
}

.share-dialog__label {
  margin: 0 0 0.4rem;
  color: var(--bb-color-muted);
  font-size: 0.82rem;
  font-weight: 800;
}

.share-dialog__online-filter {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-top: 0.75rem;
}

.share-dialog__online-filter .share-dialog__label { margin: 0; }

.share-dialog__hint {
  margin: 0.5rem 0 0;
  color: var(--bb-color-muted);
  font-size: 0.78rem;
  line-height: 1.6;
}

.share-dialog__warn {
  color: #a8560e;
  font-weight: 700;
}

:global(:root.dark .share-dialog__warn) {
  color: var(--bb-color-secondary);
}

.share-dialog__results {
  list-style: none;
  padding: 0;
  margin: 0.6rem 0 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: var(--bb-radius-nested, 16px);
  max-height: 17rem;
  overflow-y: auto;
  background: rgb(var(--v-theme-surface));
}

.share-dialog__result {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  min-width: 0;
  min-height: 66px;
  padding: 0.55rem 0.7rem;
}
.share-dialog__result + .share-dialog__result { border-top: 1px solid rgba(var(--v-theme-on-surface), 0.08); }
.share-dialog__result--selected { background: rgba(var(--v-theme-success), 0.07); }
.share-dialog__result-avatar { flex: 0 0 auto; font-size: 0.85rem; font-weight: 800; }
.share-dialog__result-main { flex: 1 1 auto; min-width: 0; }
.share-dialog__result-name {
  display: block; color: var(--bb-color-text); font-size: 0.88rem;
  line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.share-dialog__result-meta {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.1rem 0.6rem;
  color: var(--bb-color-muted); font-size: 0.76rem; line-height: 1.5;
}
.share-dialog__result-rating { display: inline-flex; align-items: center; gap: 0.1rem; }
.share-dialog__result-rating :deep(.v-icon) { color: #986000; }
.share-dialog__result-presence { display: inline-flex; align-items: center; gap: 0.25rem; }
.share-dialog__result-dot { width: 0.42rem; height: 0.42rem; border-radius: 50%; background: #758989; }
.share-dialog__result-presence--online .share-dialog__result-dot { background: #268251; }
.share-dialog__result-action { flex: 0 0 auto; min-width: 44px; min-height: 44px; }
.share-dialog__result-action:focus-visible { outline: 2px solid var(--bb-color-primary); outline-offset: 2px; }

.share-dialog__selected {
  margin-top: 1rem;
}

.share-dialog__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.share-dialog__duration {
  margin-top: 0.85rem;
}

.share-dialog__history-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  gap: 0.65rem;
  margin-top: 0.75rem;
}

.share-dialog__duration-value { margin: 0.7rem 0 0; color: var(--bb-color-text); font-weight: 700; font-size: 0.88rem; }
.share-dialog__slider-limits { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.76rem; color: var(--bb-color-muted); }

.share-dialog__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.4rem;
}

.share-dialog__chip {
  min-height: 2.5rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  color: var(--bb-color-text);
  cursor: pointer;
  font: inherit;
  font-size: 0.76rem;
  font-weight: 700;
  transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;
}

.share-dialog__chip:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.34);
}

.share-dialog__chip:focus-visible {
  outline: 2px solid var(--bb-color-text);
  outline-offset: 2px;
}

.share-dialog__chip--on {
  background-color: #2f6b46;
  border-color: #2f6b46;
  color: #ffffff;
}

.share-dialog__actions {
  width: 100%;
  max-width: 45rem;
  margin-inline: auto;
  padding: 0.75rem clamp(1rem, 3vw, 1.75rem) 1rem;
}

/* Only the device choices scroll; the confirmation controls remain reachable. */
.share-device-chooser__body { min-height: 0; overflow-y: auto; }
.share-device-chooser__body :deep(.v-label) { white-space: normal; overflow-wrap: anywhere; }

.share-dialog__status {
  color: var(--bb-color-success);
  font-size: 0.82rem;
  font-weight: 700;
}

@media (max-width: 599px) {
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
</style>
