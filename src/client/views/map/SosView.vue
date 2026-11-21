<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VTextarea } from 'vuetify/components';
import { useSosStore } from '@/stores/sos.ts';
import { useMapStore } from '@/stores/map.ts';
import { useOfflineStore } from '@/stores/offline.ts';
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
const offline = useOfflineStore();
const format = useFormatters();
const toast = useToast();

const steps = ['شرح حادثه', 'موقعیت', 'عکس', 'بازبینی'];
const severities = [
  { id: 'low', label: 'کم', detail: 'کمک ضروری نیست', color: 'var(--success)' },
  { id: 'medium', label: 'متوسط', detail: 'رسیدگی لازم است', color: 'var(--warning)' },
  { id: 'high', label: 'شدید', detail: 'خطر جانی', color: 'var(--danger)' }
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
  sos.draft.isManual = false;
}

/** Arms (or cancels) tap-to-place for a manual incident pin. Disarms itself once placed. */
function togglePlacement(): void {
  if (sos.placementArmed) sos.disarmPlacement();
  else sos.armPlacement();
}

// Leaving step 2 must never leave the canvas armed: a stale arm turns an innocent tap
// on the map into a moved incident report.
watch(() => draft.value.step, (step) => { if (step !== 2) sos.disarmPlacement(); });
onUnmounted(() => sos.disarmPlacement());

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
    <div v-if="offline.offline" class="sos-offline" role="status" data-testid="sos-offline">
      <span class="mdi mdi-wifi-off sos-offline__icon" aria-hidden="true" />
      <div class="sos-offline__body">
        <strong>درخواست امداد فعلاً به مرکز نمی‌رسد</strong>
        <p>تا بازگشت اتصال اینترنت، ارسال درخواست از این دستگاه ممکن نیست و هیچ امدادی مطلع نمی‌شود. این برنامه درخواست را در صف آفلاین نگه نمی‌دارد؛ تا پیدا کردن اتصال اینترنت، ارسال ممکن نخواهد شد.</p>
        <p v-if="sos.lastSyncedAt" class="sos-offline__sync">آخرین همگام‌سازی فهرست‌ها: {{ format.dateTime(sos.lastSyncedAt) }}</p>
      </div>
    </div>
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
        <div class="location-preview" :class="{ 'is-manual': draft.isManual }">
          <span class="mdi mdi-map-marker-radius-outline" aria-hidden="true" />
          <strong>{{ format.number(draft.latitude.toFixed(4)) }} ، {{ format.number(draft.longitude.toFixed(4)) }}</strong>
          <span v-if="draft.isManual">موقعیت دستی روی نقشه ثبت شده است</span>
          <span v-else>دقت {{ format.distance(draft.accuracy) }}</span>
        </div>
        <VBtn v-if="draft.isManual" variant="tonal" block class="mt-2" @click="seedLocation">بازگردانی به موقعیت کنونی</VBtn>
        <VBtn v-else variant="tonal" block class="mt-2" @click="seedLocation">استفاده از موقعیت کنونی</VBtn>
        <VBtn variant="outlined" block class="mt-2" :class="{ 'placement-armed': sos.placementArmed }" data-testid="manual-placement" @click="togglePlacement">
          {{ sos.placementArmed ? 'انصراف از تعیین دستی' : 'تعیین دستی موقعیت روی نقشه' }}
        </VBtn>
        <p v-if="sos.placementArmed" class="sheet__status" role="status">روی نقشه ضربه بزنید تا موقعیت حادثه ثبت شود.</p>
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
          <div><span>موقعیت</span><strong>{{ format.number(draft.latitude.toFixed(4)) }} و {{ format.number(draft.longitude.toFixed(4)) }}{{ draft.isManual ? ' (دستی)' : '' }}</strong></div>
        </div>
      </div>
    </template>

    <VAlert v-if="sos.error" type="error" variant="tonal" density="compact" class="mt-2">{{ sos.error }}</VAlert>
  </div>
  <div v-if="sos.submitting" class="sos-sending" role="dialog" aria-modal="true" aria-labelledby="sos-sending-title" data-testid="sos-sending">
    <div class="sos-sending__panel">
      <span class="sos-sending__ring" aria-hidden="true" />
      <strong id="sos-sending-title" class="sos-sending__title">در حال ارسال به مرکز امداد</strong>
      <p class="sos-sending__sub">این پنجره را نبندید؛ چند ثانیه بیشتر طول نمی‌کشد.</p>
      <ul class="sos-sending__steps">
        <li class="is-active"><span class="mdi mdi-loading is-spinning" aria-hidden="true" /><span>ثبت درخواست در مرکز امداد</span></li>
        <li v-if="draft.photoDataUrl" class="is-active"><span class="mdi mdi-loading is-spinning" aria-hidden="true" /><span>تصویر صحنه همراه درخواست ارسال می‌شود</span></li>
        <li><span class="mdi mdi-circle-outline" aria-hidden="true" /><span>پس از تأیید ثبت، به امدادگران نزدیک اعلام می‌شود</span></li>
      </ul>
      <p class="sos-sending__note"><span class="mdi mdi-information-outline" aria-hidden="true" /><span>تا پایان ارسال، درخواست «در حال ثبت» است.</span></p>
    </div>
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
    <button v-else type="button" class="primary-button primary-button--danger" :disabled="sos.submitting || offline.offline" data-testid="sos-submit" @click="submit">
      <span>{{ offline.offline ? 'در انتظار اتصال…' : 'ارسال درخواست امداد' }}</span><span class="mdi mdi-send" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.sos-sending { position: absolute; inset: 0; z-index: 60; display: grid; place-items: center; padding: 20px; background: rgba(6, 14, 15, .55); border-radius: inherit; }
.sos-sending__panel { display: grid; gap: 10px; justify-items: center; inline-size: min(340px, 100%); padding: 22px 18px 16px; border-radius: var(--r20); background: var(--surface); box-shadow: var(--shadow-lg); text-align: center; }
.sos-sending__ring { inline-size: 52px; block-size: 52px; border-radius: 50%; border: 4px solid color-mix(in srgb, var(--danger) 22%, transparent); border-top-color: var(--danger); animation: sos-ring 900ms linear infinite; }
.sos-sending__title { font-size: 17px; font-weight: 800; }
.sos-sending__sub { margin: 0; font-size: 12px; color: var(--muted); }
.sos-sending__steps { display: grid; gap: 6px; list-style: none; margin: 2px 0 0; padding: 0; inline-size: 100%; text-align: right; }
.sos-sending__steps li { display: flex; align-items: center; gap: 8px; font-size: 12.5px; color: var(--muted); padding: 6px 10px; border-radius: var(--r10); }
.sos-sending__steps li.is-active { color: var(--text); font-weight: 700; }
.sos-sending__steps .mdi { color: var(--danger); }
.sos-sending__steps li:last-child .mdi { color: var(--muted); }
.sos-sending__note { display: flex; align-items: center; gap: 6px; margin: 0; padding: 8px 12px; border-radius: var(--r12); background: var(--surface-2); font-size: 11px; color: var(--muted); }
.sos-sending__note .mdi { flex-shrink: 0; }
.sos-offline { display: flex; gap: 12px; padding: 12px 14px; border-radius: var(--r16); background: #3c3226; color: #f0e4c8; font-size: 12px; line-height: 1.9; margin-block-end: 12px; }
.sos-offline__icon { font-size: 22px; flex-shrink: 0; margin-top: 2px; }
.sos-offline__body { display: grid; gap: 4px; }
.sos-offline__sync { margin: 0; font-size: 11px; opacity: .85; }
@keyframes sos-ring { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .sos-sending__ring { animation: none; } }
</style>
