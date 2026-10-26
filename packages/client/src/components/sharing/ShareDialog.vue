<template>
  <v-dialog
    :model-value="modelValue"
    max-width="660"
    scrollable
    :fullscreen="$vuetify.display.smAndDown"
    @update:model-value="onVisibility"
  >
    <v-card rounded="xl" class="share-dialog">
      <v-card-title class="share-dialog__title">
        <v-icon class="me-2" icon="mdi-map-marker-account-outline" />
        اشتراک موقعیت
      </v-card-title>

      <v-card-text class="share-dialog__body">
        <p class="share-dialog__lead">
          <template v-if="mode === 'history'">
            هر همراهی که انتخاب کنید فقط نقاط ثبت‌شدهٔ شما در بازهٔ انتخابی را روی نقشه می‌بیند و هر
            زمان بخواهید می‌توانید دسترسی این بازه را حذف کنید.
          </template>
          <template v-else>
            هر همراهی که انتخاب کنید موقعیت زندهٔ شما را تا پایان بازهٔ انتخابی می‌بیند. می‌توانید هر
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

          <div class="share-dialog__filters">
            <v-select
              v-model="incidentTypeChoice"
              :items="incidentTypeOptions"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              class="share-dialog__rating"
              label="نوع رویداد"
            />
            <v-select
              v-model="minRatingChoice"
              :items="ratingOptions"
              item-title="title"
              item-value="value"
              density="compact"
              variant="outlined"
              hide-details
              class="share-dialog__rating"
              label="حداقل امتیاز"
            />
            <v-btn-toggle v-model="onlineFilter" density="compact" divided mandatory>
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

          <v-list v-if="hasResults" density="compact" class="share-dialog__results" lines="two">
            <v-list-item
              v-for="candidate in results"
              :key="candidate.id"
              :title="candidate.username"
              :subtitle="subtitleFor(candidate)"
            >
              <template #append>
                <v-btn
                  size="small"
                  :variant="isSelected(candidate) ? 'flat' : 'tonal'"
                  :color="isSelected(candidate) ? 'success' : 'primary'"
                  :disabled="isSelf(candidate)"
                  :aria-label="
                    isSelf(candidate)
                      ? 'نمی‌توانید موقعیت خود را با خودتان به اشتراک بگذارید'
                      : isSelected(candidate)
                        ? `حذف ${candidate.username} از فهرست`
                        : `افزودن ${candidate.username} به فهرست`
                  "
                  @click="toggle(candidate)"
                >
                  <v-icon :icon="isSelected(candidate) ? 'mdi-check' : 'mdi-plus'" size="18" />
                </v-btn>
              </template>
            </v-list-item>
          </v-list>

          <v-alert
            v-else-if="
              (hasTerm || incidentTypeChoice !== null || minRatingChoice !== null || onlineFilter === 'online') &&
              !searching
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
          <p class="share-dialog__label">نوع اشتراک</p>
          <v-btn-toggle v-model="mode" density="comfortable" divided mandatory>
            <v-btn value="timed">
              <v-icon class="me-1" icon="mdi-timer-outline" size="18" />
              مدت‌دار
            </v-btn>
            <v-btn value="permanent">
              <v-icon class="me-1" icon="mdi-infinity" size="18" />
              تا لغو دستی
            </v-btn>
            <v-btn value="history">
              <v-icon class="me-1" icon="mdi-map-marker-path" size="18" />
              تاریخچه مسیر
            </v-btn>
          </v-btn-toggle>

          <div v-if="mode === 'timed'" class="share-dialog__duration">
            <p class="share-dialog__duration-label">
              {{ durationWords(durationMinutes) }}
              <span class="share-dialog__duration-units">{{ durationMinutes }} دقیقه</span>
            </p>
            <v-slider
              v-model="durationMinutes"
              :min="1"
              :max="maxMinutes"
              :step="1"
              color="primary"
              hide-details
              aria-label="مدت اشتراک بر حسب دقیقه"
            />
            <div class="share-dialog__presets" role="group" aria-label="میان‌برهای مدت">
              <button
                v-for="minutes in presets"
                :key="minutes"
                type="button"
                class="share-dialog__chip"
                :class="{ 'share-dialog__chip--on': durationMinutes === minutes }"
                :aria-pressed="durationMinutes === minutes"
                @click="durationMinutes = minutes"
              >
                {{ durationWords(minutes) }}
              </button>
            </div>
            <p class="share-dialog__hint">
              سقف {{ durationWords(maxMinutes) }} ({{ maxMinutes }} دقیقه) است؛ برای دید کامل‌تر «تا لغو
              دستی» را انتخاب کنید.
            </p>
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
              <label class="share-dialog__history-field">
                <span>از زمان</span>
                <input
                  v-model="historyFromInput"
                  type="datetime-local"
                  :max="historyToInput || undefined"
                  @input="activeHistoryPresetHours = null"
                />
              </label>
              <label class="share-dialog__history-field">
                <span>تا زمان</span>
                <input
                  v-model="historyToInput"
                  type="datetime-local"
                  :min="historyFromInput || undefined"
                  @input="activeHistoryPresetHours = null"
                />
              </label>
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

  <v-dialog v-model="deviceChooserOpen" max-width="480" persistent>
    <v-card rounded="xl">
      <v-card-title class="share-dialog__title">کدام دستگاه موقعیت بفرستد؟</v-card-title>
      <v-card-text>
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
      <v-card-actions>
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
import { computed, ref, watch } from "vue";
import {
  MAX_LOCATION_HISTORY_SHARE_POINTS,
  MAX_LOCATION_SHARE_MINUTES,
  MAX_LOCATION_SHARE_NOTE_LENGTH,
  MAX_LOCATION_SHARE_TARGETS,
  type IncidentType,
  type UserDevice,
  type UserSearchResult
} from "@shared/index";
import { listPublicIncidentTypes } from "@/api/admin-catalog";
import { fetchUserDevices } from "@/api/devices";
import { friendlyErrorMessage } from "@/api/error-message";
import { ApiError } from "@/api/http";
import { createLocationHistoryShare, createLocationShare } from "@/api/location";
import { isoToLocalInput, localInputToIso } from "@/history/playback";
import { useTargetSearch } from "@/composables/use-target-search";
import { useAuthStore } from "@/stores/auth";
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
const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "shared"): void;
}>();

const auth = useAuthStore();
const accessToken = computed(() => auth.accessToken);

const incidentTypes = ref<IncidentType[]>([]);
const incidentTypeChoice = ref<string | null>(null);
const minRatingChoice = ref<number | null>(null);
const onlineFilter = ref<"all" | "online">("all");
const incidentTypeOptions = computed(() => [
  { title: "همهٔ تخصص‌ها", value: null as string | null },
  ...incidentTypes.value.map((item) => ({ title: item.name, value: item.id }))
]);
const {
  term: searchTerm,
  results,
  total: resultTotal,
  loading: searching,
  failed: searchFailed,
  hasResults,
  searchNow,
  cancelPending
} = useTargetSearch({
  accessToken,
  ensureSession: () => auth.refreshSession(),
  incidentType: computed(() => incidentTypeChoice.value ?? undefined),
  minRating: computed(() => minRatingChoice.value ?? undefined),
  online: computed(() => (onlineFilter.value === "online" ? true : undefined))
});

const mode = ref<ShareMode>("timed");
const durationMinutes = ref(24 * 60);
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

const maxMinutes = MAX_LOCATION_SHARE_MINUTES;
const maxHistoryPoints = MAX_LOCATION_HISTORY_SHARE_POINTS;
const maxNote = MAX_LOCATION_SHARE_NOTE_LENGTH;
const maxTargets = MAX_LOCATION_SHARE_TARGETS;
const presets = DURATION_PRESET_MINUTES;
const historyPresets = HISTORY_PRESET_HOURS;
const ratingOptions = [
  { title: "بدون فیلتر امتیاز", value: null },
  { title: "۳ و بالاتر", value: 3 },
  { title: "۴ و بالاتر", value: 4 },
  { title: "۴٫۵ و بالاتر", value: 4.5 }
];

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

function subtitleFor(candidate: UserSearchResult): string {
  const parts: string[] = [];
  if (candidate.category) parts.push(candidate.category);
  if (candidate.distance !== null) parts.push(`${candidate.distance} کیلومتر فاصله`);
  if (candidate.avgRating !== null) parts.push(`امتیاز ${candidate.avgRating}`);
  parts.push(candidate.isOnline ? "آنلاین" : "آفلاین");
  return parts.join(" • ");
}

function deviceLabel(deviceId: string, index: number): string {
  return choiceDeviceOptionLabel(deviceId, knownDevices.value, index);
}

function toggle(candidate: UserSearchResult): void {
  if (isSelf(candidate)) return;
  recipients.value = isSelected(candidate)
    ? removeRecipient(recipients.value, candidate.id)
    : addRecipient(recipients.value, candidate);
}

function remove(id: string): void {
  recipients.value = removeRecipient(recipients.value, id);
}

/** One submit path for both the first attempt and the retry after a device was chosen. */
async function submit(): Promise<void> {
  const current = draft.value;
  formError.value = null;
  const found = shareDraftIssues(current);
  if (found.length > 0) {
    formError.value = issueText(found[0]!.code);
    return;
  }

  await auth.ensureSession();
  const token = accessToken.value;
  if (!token) {
    formError.value = "برای ثبت اشتراک دوباره وارد شوید.";
    return;
  }

  submitting.value = true;
  try {
    if (current.mode === "history") {
      const historyBody = buildHistorySharePayload(current, {
        from: current.historyFrom!,
        to: current.historyTo!,
        maxPoints: current.historyMaxPoints
      });
      const created = await createLocationHistoryShare(historyBody, token);
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
    createdCount.value = created.createdShareIds.length;
    reusedCount.value = created.reusedShareIds.length;
    deviceChooserOpen.value = false;
    emit("shared");
  } catch (error) {
    createdCount.value = 0;
    reusedCount.value = 0;
    if (needsPriorityDevice(error)) {
      const ids = priorityDeviceIds(error);
      if (ids.length > 0) {
        deviceIds.value = ids;
        knownDevices.value = await fetchUserDevices(token).catch(() => []);
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
    submitting.value = false;
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
  emit("update:modelValue", value);
}

function close(): void {
  emit("update:modelValue", false);
}

async function loadIncidentTypes(): Promise<void> {
  if (incidentTypes.value.length > 0) return;
  try {
    incidentTypes.value = await listPublicIncidentTypes();
  } catch {
    // Keep search operational even if the public specialty catalog is temporarily unreachable.
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      formError.value = null;
      createdCount.value = 0;
      reusedCount.value = 0;
      void loadIncidentTypes();
      return;
    }
    cancelPending();
    searchTerm.value = "";
    incidentTypeChoice.value = null;
    deviceChooserOpen.value = false;
    deviceIds.value = [];
    chosenDeviceId.value = null;
  }
);
</script>

<style scoped>
.share-dialog__title {
  display: flex;
  align-items: center;
  color: #173b3c;
  font-weight: 800;
}

.share-dialog__body {
  padding-inline: clamp(1rem, 3vw, 1.75rem);
}

.share-dialog__lead {
  margin: 0 0 1rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.92rem;
  line-height: 1.7;
}

.share-dialog__field + .share-dialog__field {
  margin-top: 1.25rem;
}

.share-dialog__label {
  margin: 0 0 0.4rem;
  color: #537879;
  font-size: 0.82rem;
  font-weight: 800;
}

.share-dialog__filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.share-dialog__rating {
  min-width: 11rem;
  max-width: 14rem;
}

.share-dialog__hint {
  margin: 0.5rem 0 0;
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.78rem;
  line-height: 1.6;
}

.share-dialog__warn {
  color: #a8560e;
  font-weight: 700;
}

.share-dialog__results {
  margin-top: 0.5rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 14px;
  max-height: 15rem;
  overflow-y: auto;
}

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

.share-dialog__history-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  color: #537879;
  font-size: 0.78rem;
  font-weight: 700;
}

.share-dialog__history-field input {
  min-height: 2.35rem;
  padding: 0.35rem 0.6rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.24);
  border-radius: 10px;
  color: rgba(var(--v-theme-on-surface), 0.88);
  background: transparent;
  font: inherit;
}

.share-dialog__duration-label {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin: 0 0 0.25rem;
  color: #173b3c;
  font-size: 0.95rem;
  font-weight: 700;
}

.share-dialog__duration-units {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.78rem;
  font-weight: 500;
}

.share-dialog__presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

.share-dialog__chip {
  min-height: 2.1rem;
  padding: 0.25rem 0.7rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  color: #23504f;
  cursor: pointer;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  transition: border-color 0.16s ease, background-color 0.16s ease, color 0.16s ease;
}

.share-dialog__chip:hover {
  border-color: rgba(var(--v-theme-on-surface), 0.34);
}

.share-dialog__chip:focus-visible {
  outline: 2px solid #173b3c;
  outline-offset: 2px;
}

.share-dialog__chip--on {
  background-color: #2f6b46;
  border-color: #2f6b46;
  color: #ffffff;
}

.share-dialog__actions {
  padding: 0.75rem clamp(1rem, 3vw, 1.75rem) 1rem;
}

.share-dialog__status {
  color: #2f6b46;
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
}
</style>
