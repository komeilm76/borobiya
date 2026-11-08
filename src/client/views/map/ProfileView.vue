<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth.ts';
import { useSettingsStore } from '@/stores/settings.ts';
import { useOfflineStore } from '@/stores/offline.ts';
import { useFormatters } from '@/composables/useFormatters.ts';

/** Profile screen: identity, active devices, theme choice and offline dataset version. */
const auth = useAuthStore();
const settings = useSettingsStore();
const offline = useOfflineStore();
const format = useFormatters();
const devices = computed(() => auth.devices);

onMounted(() => void auth.loadDevices());
</script>

<template>
  <div class="sheet__head">
    <div>
      <strong>{{ auth.user?.username ?? 'کاربر' }}</strong>
      <span>{{ auth.user?.role }} · امتیاز {{ format.number(auth.user?.averageRating ?? 0) }}</span>
    </div>
    <button type="button" class="sheet__expand" aria-label="تغییر پوسته" @click="settings.cycle()">
      <span class="mdi mdi-theme-light-dark" aria-hidden="true" />
    </button>
  </div>
  <div class="sheet__body">
    <h3 class="sheet__subtitle">دستگاه‌های فعال</h3>
    <ul class="device-list">
      <li v-for="device in devices" :key="device.id">
        <span class="mdi mdi-cellphone-link" aria-hidden="true" />
        <div>
          <strong>{{ device.deviceName }}</strong>
          <small>{{ device.ip }} · {{ format.dateTime(device.lastSeenAt) }}</small>
        </div>
        <button type="button" class="text-link" :disabled="device.current" @click="auth.revokeDevice(device.id)">پایان</button>
      </li>
    </ul>
    <p v-if="!devices.length" class="sheet__status">دستگاه دیگری فعال نیست.</p>
    <div class="info-card">
      <span class="mdi mdi-cloud-check-outline" aria-hidden="true" />
      <div>
        <strong>نسخه داده آفلاین</strong>
        <span>{{ offline.cachedVersion ?? 'در حال خواندن…' }}</span>
      </div>
    </div>
    <div class="info-card">
      <span class="mdi mdi-shield-check-outline" aria-hidden="true" />
      <div>
        <strong>پرسش‌های امنیتی</strong>
        <span>{{ auth.user?.securityReady ? 'تنظیم شده' : 'نیازمند تکمیل' }}</span>
      </div>
    </div>
  </div>
</template>
