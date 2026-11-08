<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VTextarea } from 'vuetify/components';
import { useSosStore } from '@/stores/sos.ts';
import { useMapStore } from '@/stores/map.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useToast } from '@/composables/useToast.ts';
import { errorMessage } from '@/api/client.ts';
import { ROUTE_NAMES } from '@/router/index.ts';

/**
 * Four-step SOS composer: severity and incident type, location confirmation, optional photo,
 * then a review step that submits to the API. Nothing is sent until the final step.
 */
const router = useRouter();
const sos = useSosStore();
const map = useMapStore();
const format = useFormatters();
const toast = useToast();

const steps = ['شرح حادثه', 'موقعیت', 'عکس', 'بازبینی'];
const severities = [
  { id: 'low', label: 'کم', detail: 'کمک ضروری نیست', color: '#2C7A57' },
  { id: 'medium', label: 'متوسط', detail: 'رسیدگی لازم است', color: '#B57A12' },
  { id: 'high', label: 'شدید', detail: 'خطر جانی', color: '#AF3438' }
] as const;

const draft = computed(() => sos.draft);
const incident = computed(() => sos.incidentTypes.find((item) => item.id === draft.value.incidentTypeId));
const severity = computed(() => severities.find((item) => item.id === draft.value.severity));

function seedLocation(): void {
  const fix = map.ownFix;
  if (!fix) return;
  sos.draft.latitude = fix.latitude;
  sos.draft.longitude = fix.longitude;
  sos.draft.accuracy = fix.accuracy;
}

async function onPhoto(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    sos.draft.photoDataUrl = String(reader.result ?? '') || null;
  };
  reader.readAsDataURL(file);
}

async function submit(): Promise<void> {
  try {
    await sos.submit();
    toast.push('درخواست امداد ثبت شد.', 'success', 3200);
    await router.push({ name: ROUTE_NAMES.mission });
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 4200);
  }
}
</script>

<template>
  <div class="sheet__head sheet__head--sos">
    <button type="button" class="sheet__close" aria-label="بستن" @click="router.push({ name: ROUTE_NAMES.map })">
      <span class="mdi mdi-close" aria-hidden="true" />
    </button>
    <div>
      <strong>درخواست امداد فوری</strong>
      <span>پیش‌نویس · هنوز ارسال نشده</span>
    </div>
    <span class="siren-badge"><span class="mdi mdi-alarm-light" aria-hidden="true" /></span>
  </div>
  <div class="sheet__body sheet__body--sos">
    <div class="sos-progress">
      <span v-for="(label, index) in steps" :key="label" :class="{ 'is-done': index < draft.step }" />
    </div>
    <p class="sos-step-title">گام {{ format.number(draft.step) }} از {{ format.number(4) }} · {{ steps[draft.step - 1] }}</p>

    <template v-if="draft.step === 1">
      <div class="sos-section">
        <div class="sos-label">شدت حادثه</div>
        <div class="severity-grid">
          <button
            v-for="item in severities"
            :key="item.id"
            type="button"
            class="severity-card"
            :class="{ 'is-selected': draft.severity === item.id }"
            @click="draft.severity = item.id"
          >
            <i :style="{ background: item.color }" />
            <strong>{{ item.label }}</strong>
            <span>{{ item.detail }}</span>
          </button>
        </div>
      </div>
      <div class="sos-section">
        <div class="sos-label">نوع حادثه</div>
        <div class="incident-grid">
          <button
            v-for="item in sos.incidentTypes"
            :key="item.id"
            type="button"
            class="incident-card"
            :class="{ 'is-selected': draft.incidentTypeId === item.id }"
            @click="draft.incidentTypeId = item.id"
          >
            <span :class="['mdi', `mdi-${item.icon || 'alert-circle-outline'}`]" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </button>
        </div>
      </div>
      <div class="sos-section">
        <div class="sos-label">شرح وضعیت <span class="char-count">{{ format.number(draft.description.length) }} / {{ format.number(500) }}</span></div>
        <VTextarea v-model="draft.description" rows="3" maxlength="500" placeholder="چه اتفاقی افتاده است؟" />
      </div>
    </template>

    <template v-else-if="draft.step === 2">
      <div class="sos-section">
        <div class="sos-label">موقعیت دقیق حادثه</div>
        <div class="location-preview">
          <span class="mdi mdi-map-marker-radius-outline" aria-hidden="true" />
          <strong>{{ format.number(draft.latitude.toFixed(4)) }} ، {{ format.number(draft.longitude.toFixed(4)) }}</strong>
          <span>دقت {{ format.distance(draft.accuracy) }}</span>
        </div>
        <VBtn variant="tonal" block class="mt-2" @click="seedLocation">استفاده از موقعیت کنونی</VBtn>
      </div>
    </template>

    <template v-else-if="draft.step === 3">
      <div class="sos-section">
        <div class="sos-label">عکس اختیاری</div>
        <label class="photo-drop" for="sos-photo">
          <img v-if="draft.photoDataUrl" :src="draft.photoDataUrl" alt="پیش‌نمایش عکس">
          <template v-else>
            <span class="mdi mdi-camera-outline" aria-hidden="true" />
            <strong>افزودن عکس از صحنه</strong>
            <span>عکس به درخواست امداد پیوست می‌شود.</span>
          </template>
        </label>
        <input id="sos-photo" type="file" accept="image/*" capture="environment" hidden @change="onPhoto">
      </div>
    </template>

    <template v-else>
      <div class="sos-section">
        <div class="sos-label">بازبینی و ارسال</div>
        <div class="review-card">
          <div><span>نوع حادثه</span><strong>{{ incident?.label ?? 'سایر' }}</strong></div>
          <div><span>شدت</span><strong>{{ severity?.label ?? 'متوسط' }}</strong></div>
          <div><span>شرح</span><strong>{{ draft.description || '—' }}</strong></div>
          <div><span>موقعیت</span><strong>{{ format.number(draft.latitude.toFixed(4)) }} و {{ format.number(draft.longitude.toFixed(4)) }}</strong></div>
        </div>
      </div>
    </template>

    <VAlert v-if="sos.error" type="error" variant="tonal" density="compact" class="mt-2">{{ sos.error }}</VAlert>
  </div>
  <div class="sheet__footer sheet__footer--sos">
    <button v-if="draft.step > 1" type="button" class="ghost-button" @click="sos.previousStep()">بازگشت</button>
    <button
      v-if="draft.step < 4"
      type="button"
      class="primary-button"
      @click="sos.nextStep()"
    >
      <span>ادامه</span><span class="mdi mdi-arrow-left" aria-hidden="true" />
    </button>
    <button v-else type="button" class="primary-button" :disabled="sos.submitting" @click="submit">
      <span>ارسال درخواست امداد</span><span class="mdi mdi-send" aria-hidden="true" />
    </button>
  </div>
</template>
