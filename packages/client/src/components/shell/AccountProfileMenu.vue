<template>
  <v-menu
    v-model="open"
    location="bottom end"
    :offset="8"
    :close-on-content-click="false"
    :content-props="{ role: 'dialog', 'aria-label': 'حساب کاربری و تنظیمات پوسته' }"
  >
    <template #activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        class="account-profile__trigger"
        variant="tonal"
        color="primary"
        rounded="pill"
        aria-haspopup="dialog"
        :aria-label="authenticated ? `نمایش حساب ${user?.username ?? 'کاربر'}` : 'ورود و تنظیمات پوسته'"
      >
        <v-avatar class="account-profile__avatar" size="32" aria-hidden="true">
          <span v-if="user">{{ initial }}</span>
          <v-icon v-else icon="mdi-account-outline" size="20" />
        </v-avatar>
        <span class="account-profile__trigger-name" dir="auto">{{ user?.username ?? 'مهمان' }}</span>
        <v-icon class="account-profile__chevron" icon="mdi-chevron-down" size="18" aria-hidden="true" />
      </v-btn>
    </template>

    <v-card class="account-profile__card" rounded="xl" elevation="8">
      <div v-if="authenticated && user" class="account-profile__identity">
        <div class="account-profile__identity-head">
          <v-avatar class="account-profile__portrait" size="52" aria-hidden="true">{{ initial }}</v-avatar>
          <div class="account-profile__identity-copy">
            <span class="account-profile__eyebrow">حساب کاربری</span>
            <strong class="account-profile__name" dir="auto">{{ user.username }}</strong>
            <span class="account-profile__role">{{ roleLabel }}</span>
          </div>
        </div>
        <div v-if="categories.length" class="account-profile__categories">
          <span>گروه‌های امدادگری</span>
          <ul role="list">
            <li v-for="category in categories" :key="category.id">{{ category.name }}</li>
          </ul>
        </div>
      </div>
      <div v-else class="account-profile__identity account-profile__guest">
        <v-icon icon="mdi-account-circle-outline" size="34" color="primary" aria-hidden="true" />
        <div>
          <strong>{{ authenticated ? 'در حال دریافت حساب…' : 'خوش آمدید' }}</strong>
          <p>{{ authenticated ? 'تنظیمات پوسته در دسترس است.' : 'برای دسترسی به بخش‌های شخصی وارد شوید.' }}</p>
        </div>
      </div>

      <div class="account-profile__settings" role="group" aria-label="انتخاب پوسته">
        <span class="account-profile__section-label">ظاهر برنامه · اکنون {{ isDark ? 'تیره' : 'روشن' }}</span>
        <button
          v-for="option in themeOptions"
          :key="option.value"
          type="button"
          class="account-profile__theme"
          :class="{ 'account-profile__theme--selected': preference === option.value }"
          :aria-pressed="preference === option.value"
          @click="emit('change-theme', option.value)"
        >
          <v-icon :icon="option.icon" size="21" aria-hidden="true" />
          <span>{{ option.title }}</span>
          <v-icon v-if="preference === option.value" icon="mdi-check" size="20" aria-hidden="true" />
        </button>
      </div>

      <div class="account-profile__footer">
        <v-btn
          v-if="authenticated"
          block
          variant="tonal"
          color="error"
          prepend-icon="mdi-logout"
          rounded="lg"
          @click="requestLogout"
        >
          خروج از حساب
        </v-btn>
        <v-btn v-else block to="/_auth/login" color="primary" variant="flat" prepend-icon="mdi-login" rounded="lg"
          @click="open = false">
          ورود به حساب
        </v-btn>
      </div>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import type { AuthUser, UserCategorySummary } from "@shared/index";
import type { ThemePreference } from "@/theme/theme-preference";

const props = defineProps<{
  authenticated: boolean;
  user: AuthUser | null;
  categories: UserCategorySummary[];
  preference: ThemePreference;
  isDark: boolean;
}>();
const emit = defineEmits<{
  "change-theme": [preference: ThemePreference];
  "request-logout": [];
}>();
const themeOptions: { value: ThemePreference; title: string; icon: string }[] = [
  { value: "system", title: "پیروی از دستگاه", icon: "mdi-theme-light-dark" },
  { value: "light", title: "روشن", icon: "mdi-white-balance-sunny" },
  { value: "dark", title: "تیره", icon: "mdi-weather-night" }
];
const open = ref(false);
const route = useRoute();
const initial = computed(() => props.user?.username.slice(0, 1).toLocaleUpperCase() ?? "");
const roleLabel = computed(() => props.user?.role === "admin" ? "مدیر سامانه" : "کاربر");

// Never leave another account's name visible in an already-open menu after logout/account switch.
// Watch the two primitive sources, not a freshly allocated array on every parent render:
// live inbox/route updates must never dismiss a menu the user is using.
watch([() => props.authenticated, () => props.user?.id], () => { open.value = false; });
watch(() => route.fullPath, () => { open.value = false; });

function requestLogout(): void {
  open.value = false;
  emit('request-logout');
}
</script>

<style scoped>
.account-profile__trigger {
  min-width: 44px;
  min-height: 44px;
  height: 44px;
  padding-inline: 0.35rem 0.55rem;
  gap: 0.4rem;
  font-weight: 700;
  text-transform: none;
}
.account-profile__avatar, .account-profile__portrait {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
  font-weight: 800;
}
.account-profile__trigger-name { max-width: 12ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.account-profile__card {
  width: 21rem;
  max-width: calc(100vw - 16px);
  max-height: calc(100dvh - 5rem - env(safe-area-inset-bottom, 0px));
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  box-shadow: var(--bb-shadow-overlay) !important;
}
.account-profile__identity { padding: 1rem; background: rgba(var(--v-theme-primary), 0.06); }
.account-profile__identity-head { display: flex; align-items: center; gap: 0.8rem; min-width: 0; }
.account-profile__portrait { flex: 0 0 auto; font-size: 1.2rem; }
.account-profile__identity-copy { display: grid; gap: 0.1rem; min-width: 0; }
.account-profile__eyebrow, .account-profile__section-label, .account-profile__categories > span {
  color: rgb(var(--v-theme-primary)); font-size: 0.82rem; font-weight: 800;
}
.account-profile__name { font-size: 1.08rem; overflow-wrap: anywhere; line-height: 1.4; }
.account-profile__role { color: rgb(var(--v-theme-on-surface)); font-size: 0.8rem; }
.account-profile__categories { margin-top: 0.85rem; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12); padding-top: 0.6rem; }
.account-profile__categories ul { display: flex; flex-wrap: wrap; gap: 0.35rem; list-style: none; margin: 0.5rem 0 0; padding: 0; }
.account-profile__categories li { padding: 0.2rem 0.5rem; border-radius: 0.65rem; background: rgba(var(--v-theme-primary), 0.1); font-size: 0.82rem; overflow-wrap: anywhere; }
.account-profile__guest { display: flex; align-items: center; gap: 0.75rem; }
.account-profile__guest strong { display: block; font-size: 0.95rem; }
.account-profile__guest p { margin: 0.2rem 0 0; font-size: 0.82rem; line-height: 1.5; }
.account-profile__settings { display: grid; gap: 0.25rem; padding: 0.85rem 1rem; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.1); }
.account-profile__section-label { margin-bottom: 0.2rem; }
.account-profile__theme {
  display: flex; align-items: center; gap: 0.7rem; width: 100%; min-height: 44px;
  padding: 0.45rem 0.7rem; border-radius: 0.75rem; color: inherit; text-align: start;
  cursor: pointer; font: inherit; font-size: 0.85rem;
}
.account-profile__theme span { flex: 1 1 auto; }
.account-profile__theme:hover, .account-profile__theme--selected { background: rgba(var(--v-theme-primary), 0.13); }
.account-profile__theme:focus-visible, .account-profile__trigger:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px;
}
.account-profile__footer { padding: 0.85rem 1rem 1rem; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12); }
.account-profile__footer :deep(.v-btn) { min-height: 44px; height: auto; }
.account-profile__footer :deep(.v-btn__content) { white-space: normal; text-align: center; }
@media (max-width: 1023px) {
  .account-profile__trigger { width: 44px; padding: 0; }
  .account-profile__trigger-name, .account-profile__chevron { display: none; }
}
@media (forced-colors: active) {
  .account-profile__card, .account-profile__theme--selected { border: 1px solid CanvasText; }
}
</style>
