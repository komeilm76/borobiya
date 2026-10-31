<template>
  <v-dialog
    v-model="open"
    class="map-sidebar__dialog"
    :width="336"
    transition="slide-x-transition"
    aria-labelledby="map-sidebar-title"
  >
    <template #activator="{ props: activatorProps }">
      <div class="map-sidebar__launcher">
        <v-btn
          v-bind="activatorProps"
          class="map-sidebar__menu-button"
          icon="mdi-menu"
          color="surface"
          variant="flat"
          aria-label="باز کردن فهرست برنامه"
          title="فهرست برنامه"
        />
      </div>
    </template>

    <v-card class="map-sidebar__panel" rounded="xl" elevation="0">
      <v-card-title class="map-sidebar__header">
        <div class="map-sidebar__header-copy">
          <span class="map-sidebar__eyebrow">بوروبیا</span>
          <h2 id="map-sidebar-title">فهرست برنامه</h2>
        </div>
        <v-btn icon="mdi-close" variant="text" aria-label="بستن فهرست برنامه" @click="open = false" />
      </v-card-title>

      <v-card-text class="map-sidebar__scroll">
        <section class="map-sidebar__identity" aria-label="حساب کاربری">
          <v-avatar class="map-sidebar__avatar" size="48" aria-hidden="true">
            {{ user?.username.slice(0, 1).toLocaleUpperCase() ?? '؟' }}
          </v-avatar>
          <div class="map-sidebar__identity-copy">
            <span class="map-sidebar__eyebrow">حساب کاربری</span>
            <strong dir="auto">{{ user?.username ?? 'در حال دریافت حساب…' }}</strong>
            <span v-if="user">{{ user.role === 'admin' ? 'مدیر سامانه' : 'کاربر' }}</span>
          </div>
        </section>
        <div v-if="categories.length" class="map-sidebar__categories" aria-label="گروه‌های امدادگری">
          <span v-for="category in categories" :key="category.id">{{ category.name }}</span>
        </div>

        <nav aria-label="بخش‌های برنامه" class="map-sidebar__navigation">
          <p class="map-sidebar__section-label">پیمایش</p>
          <v-list class="map-sidebar__links" density="comfortable" nav>
            <v-list-item
              v-for="item in items"
              :key="item.to"
              :to="item.to"
              :active="route.path === item.to"
              :prepend-icon="item.icon"
              :title="item.label"
              rounded="lg"
              @click="open = false"
            />
            <v-divider class="map-sidebar__divider" />
            <v-list-item to="/_public/landing" prepend-icon="mdi-home-outline" title="خانه" rounded="lg" @click="open = false" />
          </v-list>
        </nav>

        <section class="map-sidebar__preferences" aria-label="تنظیمات ظاهر برنامه">
          <p class="map-sidebar__section-label">تنظیمات ظاهر</p>
          <p class="map-sidebar__hint">پوستهٔ برنامه · اکنون {{ isDark ? 'تیره' : 'روشن' }}</p>
          <div class="map-sidebar__themes" role="group" aria-label="انتخاب پوسته">
            <button
              v-for="option in themeOptions"
              :key="option.value"
              type="button"
              class="map-sidebar__theme"
              :class="{ 'map-sidebar__theme--selected': preference === option.value }"
              :aria-pressed="preference === option.value"
              @click="emit('change-theme', option.value)"
            >
              <v-icon :icon="option.icon" size="21" aria-hidden="true" />
              <span>{{ option.title }}</span>
            </button>
          </div>
        </section>

        <div class="map-sidebar__footer">
          <v-btn block variant="tonal" color="error" prepend-icon="mdi-logout" rounded="lg" @click="requestLogout">
            خروج از حساب
          </v-btn>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { AuthUser, UserCategorySummary } from "@shared/index";
import type { ThemePreference } from "@/theme/theme-preference";

const props = defineProps<{
  items: { to: string; label: string; icon: string }[];
  user: AuthUser | null;
  categories: UserCategorySummary[];
  preference: ThemePreference;
  isDark: boolean;
}>();
const emit = defineEmits<{
  "change-theme": [preference: ThemePreference];
  "request-logout": [];
}>();
const route = useRoute();
const open = ref(false);
const themeOptions: { value: ThemePreference; title: string; icon: string }[] = [
  { value: "system", title: "دستگاه", icon: "mdi-theme-light-dark" },
  { value: "light", title: "روشن", icon: "mdi-white-balance-sunny" },
  { value: "dark", title: "تیره", icon: "mdi-weather-night" }
];

// Clear account-specific content before another account can use an already-open drawer.
watch([() => props.user?.id, () => route.fullPath], () => { open.value = false; });

async function requestLogout(): Promise<void> {
  open.value = false;
  await nextTick(); // Let the sidebar release focus before opening the shared confirmation dialog.
  emit("request-logout");
}
</script>

<style scoped>
/* Physical left even in the RTL app. Only the launcher sits over the map; no toolbar. */
.map-sidebar__launcher {
  position: fixed;
  z-index: 900;
  top: calc(0.75rem + env(safe-area-inset-top, 0px));
  left: calc(0.75rem + env(safe-area-inset-left, 0px));
}
.map-sidebar__menu-button {
  width: 48px; height: 48px; min-width: 48px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 1rem;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-surface), 0.97) !important;
  box-shadow: var(--bb-shadow-overlay) !important;
  backdrop-filter: blur(12px);
}
.map-sidebar__menu-button:focus-visible, .map-sidebar__theme:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}
/* Vuetify normally centers dialogs and adds 24px margins. Pin this one to the
   physical left edge; the content itself clears a notch/cutout via safe padding. */
:global(.map-sidebar__dialog.v-dialog > .v-overlay__content) {
  position: fixed !important; top: 0 !important; bottom: 0 !important;
  left: 0 !important; right: auto !important;
  width: min(21rem, 100vw) !important; max-width: 100vw !important;
  height: 100dvh !important; max-height: 100dvh !important;
  margin: 0 !important;
}
.map-sidebar__panel {
  display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0;
  overflow: hidden; border-radius: 0 !important;
  color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface));
  box-shadow: var(--bb-shadow-overlay) !important;
}
/* Match Vuetify's dialog > content > card selectors: otherwise it reinstates
   an outer scrollbar and 24px card-text gutters over the sidebar layout. */
:global(.map-sidebar__dialog.v-dialog > .v-overlay__content > .map-sidebar__panel) {
  overflow: hidden !important;
  border-radius: 0 !important; /* Flush with the viewport; the shared card token applies elsewhere. */
}
:global(.map-sidebar__dialog.v-dialog > .v-overlay__content > .map-sidebar__panel > .map-sidebar__scroll) {
  flex: 1 1 auto; min-height: 0;
  padding: 0 env(safe-area-inset-right, 0px) calc(1rem + env(safe-area-inset-bottom, 0px))
    env(safe-area-inset-left, 0px) !important;
  overflow-y: auto; overscroll-behavior: contain;
}
.map-sidebar__header {
  display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto;
  min-height: calc(4.75rem + env(safe-area-inset-top, 0px));
  padding: calc(0.85rem + env(safe-area-inset-top, 0px)) 1rem 0.85rem
    calc(1rem + env(safe-area-inset-left, 0px));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.1);
}
.map-sidebar__header-copy { min-width: 0; }
.map-sidebar__header h2 { margin: 0; font-size: 1.1rem; font-weight: 800; line-height: 1.4; }
.map-sidebar__header :deep(.v-btn) { flex: 0 0 auto; min-width: 44px; min-height: 44px; }
.map-sidebar__eyebrow, .map-sidebar__section-label {
  color: rgb(var(--v-theme-primary)); font-size: 0.76rem; font-weight: 800;
}
.map-sidebar__eyebrow { display: block; margin-bottom: 0.15rem; }
.map-sidebar__scroll { scrollbar-gutter: stable; }
.map-sidebar__identity {
  display: flex; align-items: center; gap: 0.8rem; min-width: 0;
  margin: 1rem 1rem 0.25rem; padding: 0.9rem; border-radius: 1rem;
  background: rgba(var(--v-theme-primary), 0.09);
}
.map-sidebar__avatar {
  flex: 0 0 auto; color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary)); font-size: 1.1rem; font-weight: 800;
}
.map-sidebar__identity-copy { display: grid; min-width: 0; gap: 0.1rem; }
.map-sidebar__identity-copy strong { overflow-wrap: anywhere; line-height: 1.4; }
.map-sidebar__identity-copy > span:last-child { font-size: 0.8rem; opacity: 0.8; }
.map-sidebar__categories { display: flex; flex-wrap: wrap; gap: 0.3rem; margin: 0.6rem 1.2rem 0; }
.map-sidebar__categories span {
  padding: 0.2rem 0.5rem; border-radius: 0.6rem;
  background: rgba(var(--v-theme-primary), 0.1); font-size: 0.73rem; overflow-wrap: anywhere;
}
.map-sidebar__navigation, .map-sidebar__preferences { margin-top: 1.1rem; }
.map-sidebar__section-label { margin: 0 1.3rem 0.4rem; }
.map-sidebar__links { padding: 0 0.55rem; background: transparent; }
.map-sidebar__links :deep(.v-list-item) { min-height: 46px; margin-bottom: 0.2rem; }
.map-sidebar__links :deep(.v-list-item--active) { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.12); }
.map-sidebar__links :deep(.v-list-item:focus-visible), .map-sidebar__header :deep(.v-btn:focus-visible) {
  outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px;
}
.map-sidebar__divider { margin: 0.5rem 0.6rem; }
.map-sidebar__preferences { padding: 0.85rem 0 0; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1); }
.map-sidebar__hint { margin: 0 1.3rem 0.65rem; font-size: 0.8rem; opacity: 0.8; }
.map-sidebar__themes { display: flex; gap: 0.4rem; margin: 0 1rem; }
.map-sidebar__theme {
  display: flex; flex: 1 1 0; flex-direction: column; align-items: center; justify-content: center;
  gap: 0.25rem; min-width: 0; min-height: 58px; padding: 0.4rem 0.2rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16); border-radius: 0.85rem;
  color: inherit; background: transparent; cursor: pointer; font: inherit; font-size: 0.78rem;
}
.map-sidebar__theme--selected { border-color: rgb(var(--v-theme-primary)); color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.1); font-weight: 800; }
.map-sidebar__footer { margin: 1.25rem 1rem 0; padding-top: 1rem; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1); }
.map-sidebar__footer :deep(.v-btn) { min-height: 46px; height: auto; }
@media (forced-colors: active) {
  .map-sidebar__menu-button, .map-sidebar__theme, .map-sidebar__theme--selected { border: 1px solid CanvasText; }
}
@media (prefers-reduced-motion: reduce) {
  .map-sidebar__menu-button { backdrop-filter: none; }
}
</style>
