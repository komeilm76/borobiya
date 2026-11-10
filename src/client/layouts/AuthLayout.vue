<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Motion } from 'motion-v';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';

/**
 * Authentication shell: brand column on desktop, single column on mobile, with a
 * route transition between login, registration, recovery and onboarding screens.
 */
const route = useRoute();
const motion = useMotionPreferences();
const heading = computed(() => String(route.meta.label ?? 'بورو بیا'));
/**
 * Motion props for the auth panel. Presets are authored as plain data and handed to
 * `motion-v` through `v-bind`, which keeps the animation table in one place.
 */
const pageMotion = computed<Record<string, unknown>>(() => ({
  initial: motion.presets.value.page.initial,
  animate: motion.presets.value.page.enter,
  exit: motion.presets.value.page.leave
}));
</script>

<template>
  <main id="app" class="auth-shell" tabindex="-1">
    <section class="auth-brand" aria-hidden="true">
      <div class="auth-brand__mark">
        <span class="mdi mdi-compass-outline" aria-hidden="true" />
      </div>
      <h1>بورو بیا</h1>
      <p>نقشه، موقعیت زنده، همراهان و درخواست امداد — همه در یک برنامه.</p>
      <ul>
        <li><span class="mdi mdi-map-marker-radius-outline" aria-hidden="true" /> نقشه آفلاین</li>
        <li><span class="mdi mdi-account-group-outline" aria-hidden="true" /> همراهان و اشتراک موقعیت</li>
        <li><span class="mdi mdi-alarm-light-outline" aria-hidden="true" /> درخواست امداد فوری</li>
      </ul>
    </section>
    <section class="auth-panel">
      <Motion
        :key="String(route.name)"
        v-bind="pageMotion"
        class="auth-panel__inner"
      >
        <h2 class="auth-panel__heading">{{ heading }}</h2>
        <RouterView v-slot="{ Component }">
          <Transition name="bb-view" mode="out-in" :duration="motion.fast.value">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </Motion>
    </section>
  </main>
</template>

<style scoped>
.auth-shell {
  display: grid;
  grid-template-columns: minmax(0, 460px) minmax(0, 1fr);
  min-block-size: 100vh;
  background: var(--surface-2);
}
.auth-brand {
  display: flex;
  flex-direction: column;
  gap: 18px;
  justify-content: center;
  padding: 48px;
  background: linear-gradient(160deg, var(--primary) 0%, var(--primary-deep) 100%);
  color: #e9f4f2;
}
.auth-brand__mark {
  display: grid;
  place-items: center;
  inline-size: 64px;
  block-size: 64px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.14);
  font-size: 30px;
}
.auth-brand h1 { font-size: 30px; font-weight: 700; }
.auth-brand ul { display: grid; gap: 12px; padding: 0; list-style: none; }
.auth-brand li { display: flex; align-items: center; gap: 10px; font-size: 15px; }
.auth-panel { display: grid; place-items: center; padding: 32px 20px calc(32px + env(safe-area-inset-bottom, 0px)); }
.auth-panel__inner { inline-size: min(440px, 100%); display: grid; gap: 16px; }
.auth-panel__heading { font-size: 20px; font-weight: 600; }
.bb-view-enter-active,
.bb-view-leave-active { transition: opacity var(--bb-route-duration, 180ms) var(--ease); }
.bb-view-enter-from,
.bb-view-leave-to { opacity: 0; }
@media (max-width: 900px) {
  .auth-shell { grid-template-columns: minmax(0, 1fr); }
  .auth-brand { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .bb-view-enter-active,
  .bb-view-leave-active { transition: none; }
}
</style>
