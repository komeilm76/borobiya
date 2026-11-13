<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { TransitionGroup } from 'vue';
import { useMapStore } from '@/stores/map.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { useToast } from '@/composables/useToast.ts';
import { errorMessage } from '@/api/client.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { haversineMeters } from '@shared/geo.ts';

/** Destination sheet: tap-selected destination with save-to-places, saved places and trip entry. */
const router = useRouter();
const map = useMapStore();
const format = useFormatters();
const motion = useMotionPreferences();
const toast = useToast();
const places = computed(() => map.places.slice(0, 4));

const PLACE_ICONS = [
  { id: 'map-marker-outline', label: 'پیش‌فرض' },
  { id: 'home-outline', label: 'خانه' },
  { id: 'star', label: 'مهم' },
  { id: 'map-marker-path', label: 'مسیر' }
] as const;

const destination = computed(() => map.destinationPin);
const destinationDistance = computed(() => {
  const fix = map.ownFix;
  if (!fix || !destination.value) return null;
  return haversineMeters(fix, destination.value);
});

const saveFormOpen = ref(false);
const placeName = ref('');
const placeLabel = ref('');
const placeAddress = ref('');
const placeIcon = ref<string>('map-marker-outline');
const saving = ref(false);
const placeNameValid = computed(() => placeName.value.trim().length >= 1);
const placeLabelValid = computed(() => placeLabel.value.trim().length >= 1);
const placeAddressValid = computed(() => placeAddress.value.trim().length >= 1);
const canSavePlace = computed(() => placeNameValid.value && placeLabelValid.value && placeAddressValid.value && !saving.value);

async function saveDestination(): Promise<void> {
  if (!canSavePlace.value) return;
  saving.value = true;
  try {
    await map.saveDestination({
      name: placeName.value.trim(),
      label: placeLabel.value.trim(),
      address: placeAddress.value.trim(),
      icon: placeIcon.value
    });
    toast.push('مقصد در مکان‌های شما ذخیره شد.', 'success', 2600);
    saveFormOpen.value = false;
    placeName.value = '';
    placeLabel.value = '';
    placeAddress.value = '';
    placeIcon.value = 'map-marker-outline';
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>{{ destination ? 'مقصد انتخاب‌شده' : 'مقصدتان را انتخاب کنید' }}</strong>
      <span>{{ destination ? 'حرکت از موقعیت کنونی' : 'روی نقشه بزنید یا یکی از مکان‌های شما' }}</span>
    </div>
    <button type="button" class="sheet__expand" aria-label="باز کردن شیت" @click="map.setDetent(map.detent === 'open' ? 'half' : 'open')">
      <span class="mdi mdi-chevron-up" aria-hidden="true" />
    </button>
  </div>
  <div class="sheet__body">
    <section v-if="destination" class="destination-card" data-testid="destination-panel" aria-label="مقصد انتخاب‌شده">
      <div class="destination-card__head">
        <span class="mdi mdi-map-marker-path destination-card__icon" aria-hidden="true" />
        <div>
          <strong>مقصد انتخاب‌شده</strong>
          <small>{{ format.number(destination.latitude.toFixed(4)) }} ، {{ format.number(destination.longitude.toFixed(4)) }}<template v-if="destinationDistance !== null"> · فاصله {{ format.distance(destinationDistance) }}</template></small>
        </div>
        <button type="button" class="ghost-button" data-testid="clear-destination" @click="map.clearDestination()">
          <span class="mdi mdi-close" aria-hidden="true" /><span>پاک‌کردن</span>
        </button>
      </div>
      <p class="sheet__status">برای انتخاب نقطه دیگر، دوباره روی نقشه ضربه بزنید.</p>
      <button v-if="!saveFormOpen" type="button" class="primary-button primary-button--wide" data-testid="open-save-place" @click="saveFormOpen = true">
        <span class="mdi mdi-map-marker-check" aria-hidden="true" /><span>ذخیره در مکان‌های من</span>
      </button>
      <form v-else class="save-place-form" @submit.prevent="saveDestination">
        <label><span>نام</span><input v-model="placeName" required maxlength="80" placeholder="مثلاً خانه مادر" /></label>
        <label><span>برچسب</span><input v-model="placeLabel" required maxlength="80" placeholder="مثلاً خانه" /></label>
        <label><span>نشانی</span><input v-model="placeAddress" required maxlength="200" placeholder="خیابان… پلاک …" /></label>
        <fieldset class="save-place-form__icons">
          <legend>نماد</legend>
          <label v-for="item in PLACE_ICONS" :key="item.id" class="save-place-form__icon">
            <input v-model="placeIcon" type="radio" :value="item.id" name="place-icon" />
            <span :class="['mdi', `mdi-${item.id}`]" aria-hidden="true" />
            <small>{{ item.label }}</small>
          </label>
        </fieldset>
        <div class="action-row">
          <button type="submit" class="primary-button" :disabled="!canSavePlace">{{ saving ? 'در حال ذخیره…' : 'ذخیره' }}</button>
          <button type="button" class="ghost-button" @click="saveFormOpen = false">انصراف</button>
        </div>
      </form>
    </section>
    <p v-if="map.loading" class="sheet__status">در حال خواندن نقشه…</p>
    <p v-else-if="map.error" class="sheet__status sheet__status--error">{{ map.error }}</p>
    <div class="quick-chips">
      <button
        v-for="place in places"
        :key="place.id"
        type="button"
        class="quick-chip"
        @click="map.center = { latitude: place.latitude, longitude: place.longitude }"
      >
        <span :class="['mdi', `mdi-${place.icon || 'map-marker-outline'}`]" aria-hidden="true" />
        <span>{{ place.label }}</span>
      </button>
    </div>
    <TransitionGroup tag="ul" name="bb-list" class="place-list" :duration="motion.fast.value">
      <li v-for="place in places" :key="place.id" class="place-row">
        <span :class="['mdi', `mdi-${place.icon || 'map-marker-outline'}`]" aria-hidden="true" />
        <span>
          <strong>{{ place.label }}</strong>
          <small>{{ place.address }}</small>
        </span>
        <button type="button" class="text-link" @click="router.push({ name: ROUTE_NAMES.sharing })">اشتراک</button>
      </li>
    </TransitionGroup>
    <div class="info-card">
      <span class="mdi mdi-crosshairs-gps" aria-hidden="true" />
      <div>
        <strong>موقعیت شما</strong>
        <span>{{ map.ownFix ? `${format.number(map.ownFix.latitude.toFixed(4))} ، ${format.number(map.ownFix.longitude.toFixed(4))}` : 'در انتظار اجازه موقعیت‌یابی' }}</span>
      </div>
    </div>
    <div class="info-card">
      <span class="mdi mdi-account-group-outline" aria-hidden="true" />
      <div>
        <strong>همراهان آنلاین</strong>
        <span>{{ format.number(map.peers.length) }} نفر در حال اشتراک موقعیت</span>
      </div>
    </div>
  </div>
  <div class="sheet__footer">
    <button type="button" class="primary-button primary-button--wide" @click="router.push({ name: ROUTE_NAMES.trips })">
      <span>سفر</span><span class="mdi mdi-arrow-left" aria-hidden="true" />
    </button>
  </div>
</template>
