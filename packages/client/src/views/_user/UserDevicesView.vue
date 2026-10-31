<template>
  <section class="user-devices" aria-labelledby="user-devices-title">
    <header class="user-devices__header">
      <v-btn
        class="user-devices__back"
        to="/_user/map"
        variant="text"
        icon
        aria-label="بازگشت به نقشه"
        title="بازگشت به نقشه"
      >
        <v-icon icon="mdi-arrow-right" />
      </v-btn>
      <div class="user-devices__title-block">
        <p>تنظیمات حساب</p>
        <h1 id="user-devices-title">دستگاه‌های واردشده</h1>
      </div>
      <v-chip v-if="auth.isAuthenticated && settings.loaded.value && !settings.failed.value && !settings.loading.value"
        class="user-devices__count" size="small" variant="tonal" color="primary">
        {{ deviceCount }}
      </v-chip>
    </header>

    <p class="user-devices__intro">
      نشست‌های فعلی حساب را از دستگاه‌های مختلف ببینید و دسترسی دستگاه‌های دیگر را در صورت نیاز قطع کنید.
      IP نشان‌دهندهٔ محل دقیق ورود نیست. انتخاب دستگاه پخش‌کنندهٔ هر همراه در صفحهٔ اشتراک موقعیت انجام می‌شود.
    </p>

    <v-btn class="user-devices__shares-link" to="/_user/location-shares" variant="tonal" color="primary" prepend-icon="mdi-account-multiple-outline">
      مدیریت اشتراک‌های موقعیت و دستگاه پخش‌کننده
    </v-btn>
    <DevicePriorityPanel :api="settings" />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import DevicePriorityPanel from "@/components/settings/DevicePriorityPanel.vue";
import { useDeviceSettings } from "@/composables/use-device-settings";
import { useAuthStore } from "@/stores/auth";

/**
 * The session screen reads only active sessions. Per-person broadcast pins belong on the share screen;
 * session termination is confirmed in the device panel and verified by the server.
 */
const auth = useAuthStore();
const settings = useDeviceSettings({
  accessToken: computed(() => auth.accessToken),
  accountId: computed(() => auth.user?.id ?? null),
  ensureSession: () => auth.ensureSession(),
  includeShares: false
});

const deviceCount = computed(() => `${settings.devices.value.length.toLocaleString("fa-IR")} نشست`);

onMounted(() => {
  void settings.refresh();
});
</script>

<style scoped>
.user-devices {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1.25rem clamp(0.85rem, 3vw, 2rem) 2.5rem;
}

.user-devices__shares-link { align-self: flex-start; min-height: 44px; }
@media (max-width: 599px) { .user-devices__shares-link { align-self: stretch; } }

.user-devices__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-devices__back {
  flex: 0 0 auto;
}

.user-devices__title-block {
  min-width: 0;
  flex: 1 1 auto;
}

.user-devices__title-block p {
  margin: 0;
  color: #536d6c;
  font-size: 0.72rem;
  font-weight: 700;
}

.user-devices__title-block h1 {
  margin: 0.15rem 0 0;
  color: #193536;
  font-size: 1.28rem;
  font-weight: 800;
  line-height: 1.45;
}

.user-devices__count {
  flex: 0 0 auto;
}

.user-devices__intro {
  margin: 0;
  max-width: 58rem;
  color: #536d6c;
  font-size: 0.84rem;
  line-height: 1.85;
}

:global(:root.dark .user-devices__title-block p),
:global(:root.dark .user-devices__intro) {
  color: #a0b6b2;
}

:global(:root.dark .user-devices__title-block h1) {
  color: #edf5f2;
}
</style>
