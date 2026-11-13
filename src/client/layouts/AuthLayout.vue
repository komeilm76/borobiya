<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Motion } from 'motion-v';
import { useSettingsStore } from '@/stores/settings.ts';
import { useMotionPreferences } from '@/composables/useMotionPreferences.ts';

/**
 * Authentication shell per the auth references: a floating top bar (brand mark and home pill)
 * over a sage stage, then a split card — brand panel on the trailing edge, form panel on the
 * leading edge. The brand copy is authored per screen in the route meta.
 */
const route = useRoute();
const motion = useMotionPreferences();
const settings = useSettingsStore();
const brand = computed(() => route.meta.brand ?? {
  badge: 'ورود امن به بورو بیا',
  headlineA: 'یا هم،',
  headlineB: 'آماده‌تر هستیم.',
  sub: 'وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید و در زمان نیاز، سریع‌تر به کمک برسید.'
});
/** Public-dir asset; bound dynamically so the bundler does not try to resolve it as a module. */
const LOGO = '/assets/logo.svg';
const dark = computed(() => settings.resolvedTheme === 'dark');
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
    <header class="auth-topbar">
      <RouterLink class="auth-topbar__brand" to="/" aria-label="بورو بیا — صفحه اصلی">
        <img class="auth-topbar__logo" :src="LOGO" alt="" width="36" height="36" />
        <span class="auth-topbar__word">بورو بیا</span>
      </RouterLink>
      <div class="auth-topbar__tools">
        <button
          type="button"
          class="auth-icon-button"
          :aria-label="dark ? 'حالت روشن' : 'حالت تیره'"
          @click="settings.cycle()"
        >
          <span :class="['mdi', dark ? 'mdi-weather-sunny' : 'mdi-weather-night']" aria-hidden="true" />
        </button>
        <RouterLink class="auth-home-pill" to="/">
          <span>صفحه اصلی</span>
          <span class="mdi mdi-arrow-left" aria-hidden="true" />
        </RouterLink>
      </div>
    </header>

    <section class="auth-stage">
      <div class="auth-cardwrap">
        <aside class="auth-brand" aria-hidden="true">
          <span class="auth-brand__badge"><i />{{ brand.badge }}</span>
          <h1 class="auth-brand__headline">
            <span>{{ brand.headlineA }}</span>
            <span class="auth-brand__accent">{{ brand.headlineB }}</span>
          </h1>
          <p class="auth-brand__sub">{{ brand.sub }}</p>
          <svg class="auth-brand__radar" viewBox="0 0 200 200" width="236" height="236" role="presentation" focusable="false">
            <circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="1.5" />
            <circle cx="100" cy="100" r="62" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="1.5" />
            <circle cx="100" cy="100" r="34" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.13)" stroke-width="1.5" />
            <path d="M100 78v44M78 100h44" stroke="#71C7BE" stroke-width="3" stroke-linecap="round" />
            <circle cx="12" cy="88" r="5" fill="#D9B45D" />
            <circle cx="188" cy="118" r="5" fill="#71C7BE" />
          </svg>
          <div class="auth-brand__secure">
            <span class="mdi mdi-shield-check-outline" aria-hidden="true" />
            <span class="auth-brand__secure-text">
              <strong>حساب شما امن می‌ماند</strong>
              <small>اطلاعات ورود شما محرمانه می‌ماند.</small>
            </span>
          </div>
        </aside>

        <section class="auth-panel">
          <Motion
            :key="String(route.name)"
            v-bind="pageMotion"
            class="auth-panel__inner"
          >
            <RouterView v-slot="{ Component }">
              <Transition name="bb-view" mode="out-in" :duration="motion.fast.value">
                <component :is="Component" />
              </Transition>
            </RouterView>
          </Motion>
        </section>
      </div>
    </section>
  </main>
</template>

<style scoped>
.auth-shell {
  min-block-size: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(1100px 700px at -5% -10%, rgba(214, 203, 165, .38), transparent 55%),
    radial-gradient(1000px 800px at 105% 105%, rgba(14, 102, 102, .08), transparent 60%),
    radial-gradient(800px 500px at 80% -20%, rgba(14, 102, 102, .05), transparent 55%),
    var(--surface-2);
}

/* ---- floating top bar ---- */
.auth-topbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 18px clamp(16px, 3vw, 44px);
}
.auth-topbar__brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--text);
}
.auth-topbar__logo { border-radius: 11px; box-shadow: var(--shadow-sm); }
.auth-topbar__word { font-size: 19px; font-weight: 800; }
.auth-topbar__tools { display: flex; align-items: center; gap: 10px; }
.auth-icon-button {
  inline-size: 42px;
  block-size: 42px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 19px;
  cursor: pointer;
  box-shadow: var(--shadow-sm);
}
.auth-home-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  block-size: 42px;
  padding: 0 18px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
}
.auth-home-pill .mdi { font-size: 17px; }
.auth-icon-button:focus-visible,
.auth-home-pill:focus-visible,
.auth-topbar__brand:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

/* ---- stage and card ---- */
.auth-stage {
  flex: 1 1 auto;
  display: grid;
  place-items: center;
  padding: 0 clamp(16px, 3vw, 44px) clamp(16px, 2.5vh, 32px);
  min-block-size: 0;
}
.auth-cardwrap {
  inline-size: min(1180px, 100%);
  min-block-size: min(620px, calc(100vh - 118px));
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 6fr);
  border-radius: var(--r26);
  overflow: hidden;
  box-shadow: var(--shadow-lg);
}

/* ---- brand panel (trailing edge in RTL) ---- */
.auth-brand {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: clamp(24px, 3vw, 44px);
  background: linear-gradient(165deg, #0E6666 0%, #0A4B4B 78%);
  color: #E9F4F2;
  position: relative;
  overflow: hidden;
}
.auth-brand__badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  color: #BFE8E2;
  background: rgba(255, 255, 255, .1);
  border: 1px solid rgba(255, 255, 255, .16);
}
.auth-brand__badge i {
  inline-size: 7px;
  block-size: 7px;
  border-radius: 50%;
  background: #D9B45D;
}
.auth-brand__headline {
  margin: 0;
  font-size: clamp(30px, 3vw, 42px);
  font-weight: 800;
  line-height: 1.5;
}
.auth-brand__headline span { display: block; }
.auth-brand__accent { color: #D9B45D; }
.auth-brand__sub {
  margin: 0;
  max-inline-size: 44ch;
  font-size: 13.5px;
  line-height: 2.1;
  color: #A9D4CD;
}
.auth-brand__radar { align-self: center; margin-block: auto; opacity: .96; }
.auth-brand__secure {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px;
  border-radius: var(--r16);
  background: rgba(255, 255, 255, .09);
  border: 1px solid rgba(255, 255, 255, .15);
}
.auth-brand__secure .mdi { font-size: 26px; color: #8FE3D6; }
.auth-brand__secure-text { display: grid; gap: 2px; }
.auth-brand__secure-text strong { font-size: 13px; color: #FFFFFF; }
.auth-brand__secure-text small { font-size: 11.5px; color: #A9D4CD; }

/* ---- form panel (leading edge in RTL) ---- */
.auth-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(20px, 2.5vh, 36px) clamp(20px, 3vw, 52px);
  background: var(--surface);
}
.auth-panel__inner { inline-size: min(460px, 100%); display: grid; gap: 16px; }

.bb-view-enter-active,
.bb-view-leave-active { transition: opacity var(--bb-route-duration, 180ms) var(--ease); }
.bb-view-enter-from,
.bb-view-leave-to { opacity: 0; }

@media (max-width: 1080px) {
  .auth-cardwrap { grid-template-columns: minmax(0, 4fr) minmax(0, 6fr); }
}
@media (max-width: 900px) {
  .auth-cardwrap {
    grid-template-columns: minmax(0, 1fr);
    min-block-size: 0;
    border-radius: var(--r20);
  }
  .auth-brand { display: none; }
  .auth-panel { padding: 28px 18px calc(28px + env(safe-area-inset-bottom, 0px)); }
  .auth-stage { padding: 0 12px 24px; }
}
@media (prefers-reduced-motion: reduce) {
  .bb-view-enter-active,
  .bb-view-leave-active { transition: none; }
}
</style>
