<template>
  <v-dialog :model-value="modelValue" max-width="46rem" scrollable :fullscreen="isPhone"
    aria-labelledby="admin-user-profile-title" @after-leave="emit('closed')"
    @update:model-value="(open: boolean) => { if (!open) emit('update:modelValue', false); }">
    <v-card class="admin-profile" rounded="xl" dir="rtl">
      <header class="admin-profile__header">
        <div class="admin-profile__heading">
          <span class="admin-profile__eyebrow">پنل مدیریت / جزئیات حساب</span>
          <h2 id="admin-user-profile-title">{{ title }}</h2>
        </div>
        <v-btn icon="mdi-close" variant="text" aria-label="بستن پروفایل" @click="emit('update:modelValue', false)" />
      </header>

      <v-card-text class="admin-profile__body">
        <div v-if="loading" class="admin-profile__state" role="status" aria-live="polite">
          <v-progress-circular indeterminate color="primary" size="28" />
          <span>در حال دریافت پروفایل…</span>
        </div>
        <div v-else-if="error" class="admin-profile__state">
          <v-alert type="error" variant="tonal" rounded="lg" role="alert">{{ error }}</v-alert>
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" @click="retry">تلاش دوباره</v-btn>
        </div>
        <template v-else-if="profile">
          <section class="admin-profile__hero" aria-label="هویت کاربر">
            <span class="admin-profile__avatar" aria-hidden="true">{{ profile.username.slice(0, 1).toUpperCase() }}</span>
            <div class="admin-profile__hero-copy">
              <span class="admin-profile__eyebrow">حساب کاربری</span>
              <strong dir="ltr">{{ profile.username }}</strong>
              <div class="admin-profile__badges">
                <span class="admin-profile__badge" :class="profile.isActive ? 'admin-profile__badge--active' : 'admin-profile__badge--inactive'">
                  <span class="admin-profile__status-dot" aria-hidden="true" />
                  {{ profile.isActive ? 'حساب فعال' : 'حساب غیرفعال' }}
                </span>
                <span class="admin-profile__badge admin-profile__badge--role">
                  <v-icon :icon="profile.role === 'admin' ? 'mdi-shield-account-outline' : 'mdi-account-outline'" size="16" aria-hidden="true" />
                  {{ profile.role === 'admin' ? 'مدیر' : 'کاربر' }}
                </span>
              </div>
            </div>
          </section>

          <div class="admin-profile__content">
            <section class="admin-profile__panel" aria-labelledby="admin-profile-account-title">
              <div class="admin-profile__section-heading">
                <span class="admin-profile__section-icon" aria-hidden="true"><v-icon icon="mdi-card-account-details-outline" size="21" /></span>
                <div>
                  <h3 id="admin-profile-account-title">اطلاعات حساب</h3>
                  <p>وضعیت راه‌اندازی و فعالیت این حساب</p>
                </div>
              </div>
              <dl class="admin-profile__facts">
                <div><dt>تاریخ عضویت</dt><dd>{{ formatDate(profile.createdAt) }}</dd></div>
                <div><dt>راه‌اندازی حساب</dt><dd>
                  {{ profile.mustCompleteSecurityQuestions ? 'نیازمند تکمیل پرسش‌های امنیتی' : 'تکمیل‌شده' }}
                </dd></div>
                <div><dt>میانگین امتیاز</dt><dd>
                  <template v-if="profile.avgRating !== null">
                    <v-icon icon="mdi-star" size="18" color="warning" aria-hidden="true" />
                    {{ profile.avgRating.toLocaleString('fa-IR') }} از ۵
                  </template>
                  <span v-else class="admin-profile__muted">هنوز امتیازی ثبت نشده</span>
                </dd></div>
              </dl>
            </section>

            <section class="admin-profile__panel" aria-labelledby="admin-profile-groups-title">
              <div class="admin-profile__section-heading">
                <span class="admin-profile__section-icon" aria-hidden="true"><v-icon icon="mdi-account-group-outline" size="21" /></span>
                <div>
                  <h3 id="admin-profile-groups-title">گروه‌های امدادگر</h3>
                  <p>گروه‌های اختصاص‌یافته به این حساب</p>
                </div>
              </div>
              <div v-if="profile.categories.length" class="admin-profile__categories">
                <v-chip v-for="category in profile.categories" :key="category.id" size="small" color="primary" variant="tonal">{{ category.name }}</v-chip>
              </div>
              <p v-else class="admin-profile__empty-groups">گروهی به این حساب اختصاص داده نشده است.</p>
            </section>
          </div>

          <section class="admin-profile__reference" aria-labelledby="admin-profile-id-title">
            <div>
              <h3 id="admin-profile-id-title">شناسهٔ حساب</h3>
              <p>برای ارجاع دقیق به این کاربر، شناسهٔ کامل را کپی کنید.</p>
            </div>
            <div class="admin-profile__id-row">
              <bdi dir="ltr" :title="profile.id">{{ shortId(profile.id) }}</bdi>
              <v-btn variant="tonal" color="primary" prepend-icon="mdi-content-copy" size="small"
                aria-label="کپی شناسهٔ کامل حساب" @click="copyProfileId">کپی شناسه</v-btn>
            </div>
            <span v-if="copyStatus === 'copied'" class="admin-profile__copy-feedback" role="status">شناسهٔ کامل کپی شد.</span>
            <label v-else-if="copyStatus === 'failed'" class="admin-profile__copy-fallback">
              کپی خودکار ممکن نشد؛ شناسهٔ کامل را از این کادر کپی کنید.
              <input :value="profile.id" readonly dir="ltr" aria-label="شناسهٔ کامل حساب برای کپی دستی"
                @focus="($event.target as HTMLInputElement).select()" />
            </label>
          </section>
        </template>
      </v-card-text>
      <v-card-actions class="admin-profile__actions">
        <span>اطلاعات این نمایه فقط برای مشاهده است.</span>
        <v-btn variant="tonal" color="primary" @click="emit('update:modelValue', false)">بستن پروفایل</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { getAdminUser, type AdminUserDetail } from "@/api/admin-users";
import { friendlyErrorMessage } from "@/api/error-message";
import { accountSessionKey } from "@/composables/device-identity";
import { useAuthStore } from "@/stores/auth";

const props = withDefaults(defineProps<{ userId: string | null; modelValue: boolean; title?: string }>(),
  { title: "پروفایل کاربر" });
const emit = defineEmits<{ 'update:modelValue': [value: boolean]; closed: [] }>();
const auth = useAuthStore();
const isPhone = useMediaQuery("(max-width: 600px)");
const session = computed(() => auth.user?.role === "admin" ? accountSessionKey(auth.user.id, auth.accessToken) : null);
const profile = ref<AdminUserDetail | null>(null);
const loading = ref(false);
const error = ref("");
const attempt = ref(0);
const retry = () => { attempt.value += 1; };
const copyStatus = ref<"copied" | "failed" | null>(null);
let copyGeneration = 0;
function shortId(id: string): string {
  return id.length > 16 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}
async function copyProfileId(): Promise<void> {
  const id = profile.value?.id;
  const currentSession = session.value;
  if (!props.modelValue || !id || !currentSession) return;
  const generation = ++copyGeneration;
  copyStatus.value = null;
  try {
    await navigator.clipboard.writeText(id);
    if (generation === copyGeneration && props.modelValue && session.value === currentSession && profile.value?.id === id)
      copyStatus.value = "copied";
  } catch {
    if (generation === copyGeneration && props.modelValue && session.value === currentSession && profile.value?.id === id)
      copyStatus.value = "failed";
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("fa-IR", { dateStyle: "medium" });
}

// Never reuse one person's data for another request or a different admin session.
watch(() => [props.modelValue, props.userId, session.value, attempt.value] as const,
  ([open, userId, sessionKey], _previous, onCleanup) => {
    let active = true;
    const controller = new AbortController();
    onCleanup(() => { active = false; controller.abort(); });
    profile.value = null;
    copyGeneration++;
    copyStatus.value = null;
    error.value = "";
    loading.value = Boolean(open && userId && sessionKey);
    if (!open || !userId) return;
    if (!sessionKey) { error.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید."; return; }
    void (async () => {
      try {
        await auth.ensureSession();
        if (!active || session.value !== sessionKey || !auth.accessToken) return;
        const result = await getAdminUser(userId, auth.accessToken, controller.signal);
        if (active && session.value === sessionKey && props.userId === userId && props.modelValue) profile.value = result;
      } catch (cause) {
        if (active) error.value = friendlyErrorMessage(cause, "دریافت پروفایل انجام نشد. دوباره تلاش کنید.");
      } finally {
        if (active) loading.value = false;
      }
    })();
  }, { immediate: true, flush: "sync" });
</script>

<style scoped>
.admin-profile { color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface)); font-family: var(--bb-font-family); }
.admin-profile__header {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  flex: none; padding: 1.05rem 1.5rem; border-bottom: 1px solid var(--bb-color-outline);
}
.admin-profile__heading { min-width: 0; }
.admin-profile__eyebrow { color: var(--bb-color-primary); font-size: .82rem; font-weight: 750; }
.admin-profile__heading h2 { margin: .15rem 0 0; font-size: 1.13rem; font-weight: 800; line-height: 1.5; }
.admin-profile__header :deep(.v-btn) { flex: none; width: 44px; height: 44px; }
.admin-profile__body { padding: 1.35rem 1.5rem 1.5rem; }
.admin-profile__state { display: grid; justify-items: start; align-content: center; gap: .75rem; min-height: 13rem; }
.admin-profile__state :deep(.v-alert) { width: 100%; }
.admin-profile__hero {
  position: relative; isolation: isolate; overflow: hidden;
  display: flex; align-items: center; gap: 1.25rem; min-width: 0;
  padding: 1.5rem; border: 1px solid rgba(var(--v-theme-primary), .18);
  border-radius: var(--bb-radius-nested, 16px);
  background: linear-gradient(115deg, rgba(var(--v-theme-primary), .13), rgba(var(--v-theme-primary), .035) 75%);
}
.admin-profile__hero::after {
  position: absolute; z-index: -1; inset-inline-end: -2.5rem; top: -3.5rem;
  width: 13rem; height: 13rem; border: 1px solid rgba(var(--v-theme-primary), .12);
  border-radius: 50%; box-shadow: 0 0 0 2.5rem rgba(var(--v-theme-primary), .035); content: "";
}
.admin-profile__avatar {
  display: grid; flex: none; place-items: center; width: 76px; height: 76px;
  border-radius: 1.35rem; color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary));
  box-shadow: 0 9px 22px rgba(var(--v-theme-primary), .2);
  font-size: 2rem; font-weight: 800; text-transform: uppercase;
}
.admin-profile__hero-copy { display: grid; justify-items: start; gap: .35rem; min-width: 0; }
.admin-profile__hero-copy strong { max-width: 100%; color: var(--bb-color-text); font-size: clamp(1.25rem, 3vw, 1.75rem); line-height: 1.35; overflow-wrap: anywhere; }
.admin-profile__badges { display: flex; flex-wrap: wrap; gap: .45rem; margin-top: .25rem; }
.admin-profile__badge { display: inline-flex; align-items: center; gap: .4rem; padding: .35rem .7rem; border: 1px solid currentColor;
  border-radius: 999px; font-size: .8rem; font-weight: 750; line-height: 1.3; }
.admin-profile__badge--active { color: var(--bb-color-success); background: rgba(var(--v-theme-success), .09); }
.admin-profile__badge--inactive { color: var(--bb-color-error); background: rgba(var(--v-theme-error), .09); }
.admin-profile__badge--role { color: var(--bb-color-text); background: rgba(var(--v-theme-surface), .7); border-color: var(--bb-color-outline); }
.admin-profile__status-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.admin-profile__content { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr); align-items: stretch; gap: .85rem; margin-top: .85rem; }
.admin-profile__panel { min-width: 0; padding: 1.15rem; border: 1px solid var(--bb-color-outline);
  border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); }
.admin-profile__section-heading { display: flex; align-items: center; gap: .7rem; min-width: 0; margin-bottom: .9rem; }
.admin-profile__section-icon { display: grid; flex: none; place-items: center; width: 38px; height: 38px;
  border-radius: .8rem; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .1); }
.admin-profile__section-heading h3, .admin-profile__reference h3 { margin: 0; color: var(--bb-color-text); font-size: .95rem; font-weight: 800; }
.admin-profile__section-heading p, .admin-profile__reference p { margin: .1rem 0 0; color: var(--bb-color-muted); font-size: .8rem; line-height: 1.6; }
.admin-profile__facts { margin: 0; }
.admin-profile__facts > div { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap;
  gap: .3rem .7rem; padding: .7rem 0; border-top: 1px solid var(--bb-color-outline); }
.admin-profile__facts dt { color: var(--bb-color-muted); font-size: .82rem; }
.admin-profile__facts dd { display: inline-flex; align-items: center; gap: .25rem; margin: 0; color: var(--bb-color-text);
  font-size: .83rem; font-weight: 750; overflow-wrap: anywhere; }
.admin-profile__muted { color: var(--bb-color-muted); font-weight: 500; }
.admin-profile__categories { display: flex; flex-wrap: wrap; gap: .45rem; }
.admin-profile__empty-groups { margin: 0; padding: .9rem; border: 1px dashed var(--bb-color-outline);
  border-radius: .75rem; background: var(--bb-color-inset); color: var(--bb-color-muted); font-size: .84rem; line-height: 1.7; }
.admin-profile__reference { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: .75rem 1rem; margin-top: .85rem; padding: 1rem 1.15rem;
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px);
  background: var(--bb-color-inset); }
.admin-profile__id-row { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem .7rem; }
.admin-profile__id-row bdi { color: var(--bb-color-text); font-size: .82rem; font-weight: 700; white-space: nowrap; }
.admin-profile__id-row :deep(.v-btn) { min-height: 44px; }
.admin-profile__copy-feedback, .admin-profile__copy-fallback { width: 100%; font-size: .8rem; }
.admin-profile__copy-feedback { color: var(--bb-color-success); }
.admin-profile__copy-fallback { display: grid; gap: .3rem; color: var(--bb-color-muted); }
.admin-profile__copy-fallback input { width: 100%; padding: .5rem; border: 1px solid var(--bb-color-outline);
  border-radius: .5rem; background: rgb(var(--v-theme-surface)); color: var(--bb-color-text); }
.admin-profile__copy-fallback input:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: 2px; }
.admin-profile__actions { display: flex; justify-content: space-between; gap: .75rem; flex: none;
  padding: .8rem 1.5rem; border-top: 1px solid var(--bb-color-outline); }
.admin-profile__actions span { color: var(--bb-color-muted); font-size: .8rem; }
.admin-profile__actions :deep(.v-btn) { min-height: 44px; margin: 0; }
@media (max-width: 600px) {
  .admin-profile { height: 100dvh; max-height: 100dvh; border-radius: 0 !important; }
  .admin-profile__header { padding: calc(.65rem + env(safe-area-inset-top, 0px)) 1rem .65rem; }
  .admin-profile__body { padding: 1rem; }
  .admin-profile__content { grid-template-columns: minmax(0, 1fr); }
  .admin-profile__hero { padding: 1.1rem; gap: .85rem; }
  .admin-profile__avatar { width: 58px; height: 58px; font-size: 1.5rem; border-radius: 1rem; }
  .admin-profile__actions { padding: .6rem 1rem calc(.6rem + env(safe-area-inset-bottom, 0px)); }
}
@media (max-width: 380px) { .admin-profile__actions span { display: none; } }
@media (forced-colors: active) {
  .admin-profile__hero, .admin-profile__panel, .admin-profile__reference { border-color: CanvasText; background: Canvas; }
  .admin-profile__avatar { border: 1px solid CanvasText; color: CanvasText; background: Canvas; }
  .admin-profile__badge, .admin-profile__empty-groups { border-color: CanvasText; background: Canvas; color: CanvasText; }
}
</style>
