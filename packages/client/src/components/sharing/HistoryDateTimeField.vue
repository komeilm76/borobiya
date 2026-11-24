<template>
  <div class="history-date-time">
    <span class="history-date-time__label">{{ label }}</span>
    <div class="history-date-time__controls">
      <v-dialog v-model="calendarOpen" :fullscreen="$vuetify.display.smAndDown" max-width="360" scrollable :aria-label="`${label}، تاریخ میلادی`">
        <template #activator="{ props: activator }">
          <v-text-field
            :model-value="dateLabel"
            label="تاریخ"
            :aria-label="`${label}، تاریخ میلادی`"
            prepend-inner-icon="mdi-calendar-month-outline"
            readonly
            :disabled="disabled"
            density="comfortable"
            variant="outlined"
            rounded="lg"
            hide-details
            v-bind="activator"
          />
        </template>
        <v-card class="history-date-time__picker" rounded="xl">
          <v-card-title>{{ label }}، تاریخ میلادی</v-card-title>
          <v-card-text>
            <v-date-picker
              :model-value="dateForPicker(modelValue)"
              :min="dateForPicker(min ?? '')"
              :max="dateForPicker(max ?? '')"
              hide-header
              width="100%"
              @update:model-value="chooseDate"
            />
          </v-card-text>
          <v-card-actions><v-spacer /><v-btn variant="text" @click="calendarOpen = false">بستن</v-btn></v-card-actions>
        </v-card>
      </v-dialog>
      <v-dialog v-model="clockOpen" max-width="360" scrollable :aria-label="`${label}، ساعت`">
        <template #activator="{ props: activator }">
          <v-text-field
            :model-value="modelValue.slice(11)"
            label="ساعت"
            :aria-label="`${label}، ساعت`"
            prepend-inner-icon="mdi-clock-outline"
            readonly
            :disabled="disabled"
            density="comfortable"
            variant="outlined"
            rounded="lg"
            hide-details
            v-bind="activator"
          />
        </template>
        <v-card class="history-date-time__picker" rounded="xl">
          <v-card-title>{{ label }}، ساعت</v-card-title>
          <v-card-text>
            <v-time-picker
              :model-value="modelValue.slice(11)"
              format="24hr"
              variant="input"
              :min="clockMin"
              :max="clockMax"
              width="100%"
              @update:model-value="chooseTime"
            />
          </v-card-text>
          <v-card-actions><v-spacer /><v-btn variant="text" @click="clockOpen = false">تأیید</v-btn></v-card-actions>
        </v-card>
      </v-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { dateForPicker, withPickerDate, withPickerTime } from "@/sharing/history-date-time";

const props = defineProps<{ label: string; modelValue: string; min?: string; max?: string; disabled?: boolean }>();
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const calendarOpen = ref(false);
const clockOpen = ref(false);
const dateLabel = computed(() => {
  const date = dateForPicker(props.modelValue);
  return date ? new Intl.DateTimeFormat("fa-IR-u-ca-gregory", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date) : "";
});
const clockMin = computed(() => props.min?.slice(0, 10) === props.modelValue.slice(0, 10) ? props.min.slice(11) : undefined);
const clockMax = computed(() => props.max?.slice(0, 10) === props.modelValue.slice(0, 10) ? props.max.slice(11) : undefined);

function chooseDate(date: unknown): void {
  if (props.disabled) return;
  const value = withPickerDate(props.modelValue, date);
  if (value === null) return;
  if (value !== props.modelValue) emit("update:modelValue", value);
  calendarOpen.value = false;
}
function chooseTime(time: unknown): void {
  if (props.disabled) return;
  const value = withPickerTime(props.modelValue, time);
  if (value !== null && value !== props.modelValue) emit("update:modelValue", value);
}
</script>

<style scoped>
.history-date-time { min-width: 0; }
.history-date-time__label { display: block; color: var(--bb-color-muted); font-size: var(--bb-sharing-font-caption); font-weight: var(--bb-weight-bold); margin-bottom: var(--bb-rhythm-r035); }
.history-date-time__controls { display: grid; grid-template-columns: minmax(0, 1fr) minmax(6.5rem, .6fr); gap: var(--bb-rhythm-r050); }
.history-date-time__controls :deep(.v-field__input) { min-width: 0; }
.history-date-time__picker { min-height: 0; }
.history-date-time__picker :deep(.v-card-text) { min-height: 0; overflow-y: auto; padding: var(--bb-rhythm-r050); }
.history-date-time__picker :deep(.v-date-picker),
.history-date-time__picker :deep(.v-time-picker) { max-width: 100%; box-shadow: none; }
.history-date-time__picker :deep(.v-card-actions .v-btn) { min-height: 44px; }
@media (max-width: 400px) { .history-date-time__controls { grid-template-columns: 1fr; } }
</style>
