<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { TransitionGroup } from 'vue';
import { useMapStore } from '@/stores/map.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';
import { ROUTE_NAMES } from '@/router/index.ts';

/** Destination sheet: saved places, live companions and the trip entry point. */
const router = useRouter();
const map = useMapStore();
const format = useFormatters();
const motion = useMotionPreferences();
const places = computed(() => map.places.slice(0, 4));
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>مقصد انتخاب‌شده</strong>
      <span>حرکت از موقعیت کنونی</span>
    </div>
    <button type="button" class="sheet__expand" aria-label="باز کردن شیت" @click="map.setDetent(map.detent === 'open' ? 'half' : 'open')">
      <span class="mdi mdi-chevron-up" aria-hidden="true" />
    </button>
  </div>
  <div class="sheet__body">
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
        <button type="button" class="text-link" @click="router.push({ name: ROUTE_NAMES.companions })">اشتراک</button>
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
    <button type="button" class="primary-button primary-button--wide" @click="router.push({ name: ROUTE_NAMES.mission })">
      <span>سفر</span><span class="mdi mdi-arrow-left" aria-hidden="true" />
    </button>
  </div>
</template>
