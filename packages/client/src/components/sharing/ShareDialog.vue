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
          هر همراهی که انتخاب کنید موقعیت زندهٔ شما را تا پایان بازهٔ انتخابی می‌بیند. می‌توانید هر
          زمان که خواستید اشتراک را لغو کنید.
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
            <template v-else>
              فیلترهای «دستهٔ امدادگر» و «نوع امداد» هنوز در سرور پیاده نشده‌اند، پس اینجا نبودند.
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

          <v-alert v-else-if="hasTerm && !searching" class="mt-2" type="info" variant="text" density="compact">
            <template v-if="termTooShort">برای شروع جستجو حداقل دو نویسه بنویسید.</template>
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
          <p class="share-dialog__label">چه مدتی؟</p>
          <v-btn-toggle v-model="mode" density="comfortable" divided mandatory>
            <v-btn value="timed">
              <v-icon class="me-1" icon="mdi-timer-outline" size="18" />
              مدت‌دار
            </v-btn>
            <v-btn value="permanent">
              <v-icon class="me-1" icon="mdi-infinity" size="18" />
              تا لغو دستی
            </v-btn>
          </v-btn-toggle>

          <div v-if="mode === 'timed'" class="share-dialog__duration">
            <p class="share-dialog__duration-label">
              {{ durationLabel }}
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
            <div class="share-dialog__presets">
              <v-btn
                v-for="preset in presets"
                :key="preset.minutes"
                size="x-small"
                variant="tonal"
                :color="durationMinutes === preset.minutes ? 'primary' : 'default'"
                @click="durationMinutes = preset.minutes"
              >
                {{ preset.minutes }} دقیقه
              </v-btn>
            </div>
            <p class="share-dialog__hint">
              سقف {{ maxMinutes }} دقیقه است؛ برای دید کامل‌تر «تا لغو دستی» را انتخاب کنید.
            </p>
          </div>
        </div>

        <div class="share-dialog__field">
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
  MAX_LOCATION_SHARE_MINUTES,
  MAX_LOCATION_SHARE_NOTE_LENGTH,
  MAX_LOCATION_SHARE_TARGETS,
  type UserSearchResult
} from "@shared/index";
import { friendlyErrorMessage } from "@/api/error-message";
import { ApiError } from "@/api/http";
import { createLocationShare } from "@/api/location";
import { useTargetSearch } from "@/composables/use-target-search";
import { useAuthStore } from "@/stores/auth";
import {
  addRecipient,
  buildLiveSharePayload,
  canSubmitShareDraft,
  DURATION_PRESETS,
  needsPriorityDevice,
  priorityDeviceIds,
  removeRecipient,
  shareDraftIssues,
  shouldSearch,
  splitDuration,
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

const minRatingChoice = ref<number | null>(null);
const onlineFilter = ref<"all" | "online">("all");
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
  minRating: computed(() => minRatingChoice.value ?? undefined),
  online: computed(() => (onlineFilter.value === "online" ? true : undefined))
});

const mode = ref<ShareMode>("timed");
const durationMinutes = ref(24 * 60);
const note = ref("");
const recipients = ref<UserSearchResult[]>([]);

const submitting = ref(false);
const formError = ref<string | null>(null);
const createdCount = ref(0);
const reusedCount = ref(0);
const deviceChooserOpen = ref(false);
const deviceIds = ref<string[]>([]);
const chosenDeviceId = ref<string | null>(null);

const maxMinutes = MAX_LOCATION_SHARE_MINUTES;
const maxNote = MAX_LOCATION_SHARE_NOTE_LENGTH;
const maxTargets = MAX_LOCATION_SHARE_TARGETS;
const presets = DURATION_PRESETS;
const ratingOptions = [
  { title: "بدون فیلتر امتیاز", value: null },
  { title: "۳ و بالاتر", value: 3 },
  { title: "۴ و بالاتر", value: 4 },
  { title: "۴٫۵ و بالاتر", value: 4.5 }
];

const draft = computed<ShareDraft>(() => ({
  mode: mode.value,
  recipients: recipients.value,
  durationMinutes: durationMinutes.value,
  note: note.value
}));

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

const durationLabel = computed(() => {
  const { days, hours, minutes } = splitDuration(durationMinutes.value);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} روز`);
  if (hours > 0) parts.push(`${hours} ساعت`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} دقیقه`);
  return parts.join(" و ");
});

function isSelf(candidate: UserSearchResult): boolean {
  return candidate.id === auth.user?.id;
}

function isSelected(candidate: UserSearchResult): boolean {
  return recipients.value.some((recipient) => recipient.id === candidate.id);
}

function subtitleFor(candidate: UserSearchResult): string {
  const parts: string[] = [];
  if (candidate.distance !== null) parts.push(`${candidate.distance} کیلومتر فاصله`);
  if (candidate.avgRating !== null) parts.push(`امتیاز ${candidate.avgRating}`);
  parts.push(candidate.isOnline ? "آنلاین" : "آفلاین");
  return parts.join(" • ");
}

function deviceLabel(deviceId: string, index: number): string {
  return `دستگاه ${index + 1} (${deviceId.slice(0, 8)}…)`;
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

  const token = accessToken.value;
  if (!token) {
    formError.value = "برای ثبت اشتراک دوباره وارد شوید.";
    return;
  }

  const payload = buildLiveSharePayload(current);
  // Only send the chosen device while the chooser is up: once the account is down to one live
  // device, a stale `priorityDeviceId` would be refused as unavailable.
  const body = deviceChooserOpen.value && chosenDeviceId.value
    ? { ...payload, priorityDeviceId: chosenDeviceId.value }
    : payload;

  submitting.value = true;
  try {
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
        chosenDeviceId.value = ids.length === 1 ? ids[0]! : null;
        deviceChooserOpen.value = true;
        return;
      }
    }
    formError.value =
      error instanceof ApiError && error.code === "VALIDATION_ERROR"
        ? issueText(issues.value[0]?.code)
        : friendlyErrorMessage(error, "اشتراک ثبت نشد. دوباره تلاش کنید.");
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
      return `مدت باید عددی صحیح بین ۱ تا ${maxMinutes} دقیقه باشد.`;
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

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      formError.value = null;
      createdCount.value = 0;
      reusedCount.value = 0;
      return;
    }
    cancelPending();
    searchTerm.value = "";
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

.share-dialog__actions {
  padding: 0.75rem clamp(1rem, 3vw, 1.75rem) 1rem;
}

.share-dialog__status {
  color: #2f6b46;
  font-size: 0.82rem;
  font-weight: 700;
}
</style>
