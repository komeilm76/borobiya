<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VTextarea } from 'vuetify/components';
import { useSosStore } from '@/stores/sos.ts';
import { useMapStore } from '@/stores/map.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useToast } from '@/composables/useToast.ts';
import { errorMessage } from '@/api/client.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { toPersianDigits } from '@shared/geo.ts';
import { compressImageFile, ImageProcessingError, SERVER_DATA_URL_LIMIT, type ImageErrorCode } from '@/utils/image.ts';

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

const photoState = ref<'idle' | 'processing' | 'error'>('idle');
const photoError = ref<string | null>(null);

/** Maps the compressor's stable error codes onto actionable Persian messages. */
function photoErrorMessage(code: ImageErrorCode | undefined): string {
  switch (code) {
    case 'unsupported-type': return 'این قالب تصویر پشتیبانی نمی‌شود؛ عکس JPEG، PNG یا WebP انتخاب کنید.';
    case 'empty-file': return 'فایل انتخابی خالی است؛ عکس دیگری انتخاب کنید.';
    case 'source-too-large': return 'حجم عکس انتخابی بیش از حد مجاز است.';
    case 'decode-failed': return 'خواندن تصویر ممکن نشد؛ ممکن است فایل آسیب دیده باشد.';
    case 'canvas-unavailable': return 'این مرورگر امکان فشرده‌سازی تصویر ندارد.';
    default: return 'فشرده‌سازی تصویر به نتیجه نرسید؛ عکس دیگری انتخاب کنید.';
  }
}

/**
 * Reads the picked file through the compression pipeline and attaches the result.
 *
 * A raw phone frame is far larger than the 160,000-character data URL the server accepts, so the
 * browser decodes, downscales and re-encodes it as JPEG first; nothing reaches the draft until the
 * compressed payload passes the same limit the server enforces.
 */
async function onPhoto(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Allow picking the same file again after a failure or a removal.
  input.value = '';
  if (!file) return;
  photoState.value = 'processing';
  photoError.value = null;
  try {
    const result = await compressImageFile(file);
    sos.draft.photoDataUrl = result.dataUrl;
    photoState.value = 'idle';
  } catch (caught) {
    sos.draft.photoDataUrl = null;
    photoState.value = 'error';
    photoError.value = caught instanceof ImageProcessingError ? photoErrorMessage(caught.code) : photoErrorMessage(undefined);
  }
}

function removePhoto(): void {
  sos.draft.photoDataUrl = null;
  photoState.value = 'idle';
  photoError.value = null;
}

/**
 * The server requires a description of 10–500 characters and rejects anything shorter with a bare
 * "Invalid request." — the same message it uses for a malformed id. Saying so on the review step
 * is the difference between fixing one field and abandoning the request.
 */
const DESCRIPTION_MIN = 10;

async function submit(): Promise<void> {
  if (sos.draft.photoDataUrl && sos.draft.photoDataUrl.length > SERVER_DATA_URL_LIMIT) {
    // Defence in depth: the pipeline already caps this, so reaching here means something bypassed it.
    sos.error = 'حجم عکس پیوست‌شده از حد مجاز بیشتر است؛ عکس را حذف کنید و دوباره انتخاب کنید.';
    return;
  }
  const description = sos.draft.description.trim();
  if (description.length < DESCRIPTION_MIN) {
    // Persian digits, like every other message in the app.
    sos.error = `شرح وضعیت باید دست‌کم ${toPersianDigits(DESCRIPTION_MIN)} نویسه باشد.`;
    return;
  }
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
        <label class="photo-drop" :class="{ 'is-processing': photoState === 'processing' }" for="sos-photo">
          <img v-if="draft.photoDataUrl" :src="draft.photoDataUrl" alt="پیش‌نمایش عکس">
          <template v-else-if="photoState === 'processing'">
            <span class="mdi mdi-loading is-spinning" aria-hidden="true" />
            <strong>در حال فشرده‌سازی عکس…</strong>
            <span>چند لحظه صبر کنید.</span>
          </template>
          <template v-else-if="photoState === 'error'">
            <span class="mdi mdi-alert-circle-outline" aria-hidden="true" />
            <strong>عکس پیوست نشد</strong>
            <span>{{ photoError }}</span>
            <small>برای تلاش دوباره روی همین‌جا بزنید.</small>
          </template>
          <template v-else>
            <span class="mdi mdi-camera-outline" aria-hidden="true" />
            <strong>افزودن عکس از صحنه</strong>
            <span>عکس پیش از ارسال فشرده می‌شود.</span>
          </template>
        </label>
        <input id="sos-photo" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden :disabled="photoState === 'processing'" @change="onPhoto">
        <button v-if="draft.photoDataUrl" type="button" class="text-link" @click="removePhoto">حذف عکس</button>
        <p v-if="photoState !== 'error' && photoError" class="sheet__status">{{ photoError }}</p>
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
