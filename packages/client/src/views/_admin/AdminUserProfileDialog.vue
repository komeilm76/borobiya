<template>
  <v-dialog :model-value="modelValue" max-width="34rem" scrollable aria-labelledby="admin-user-profile-title"
    @update:model-value="(open: boolean) => { if (!open) emit('update:modelValue', false); }">
    <v-card class="admin-profile" rounded="xl" dir="rtl">
      <div class="admin-profile__header">
        <div class="admin-profile__heading">
          <span class="admin-profile__icon" aria-hidden="true"><v-icon icon="mdi-account-details-outline" size="23" /></span>
          <div>
            <small>پنل مدیریت · نمایهٔ حساب</small>
            <h2 id="admin-user-profile-title">{{ title }}</h2>
          </div>
        </div>
        <v-btn icon="mdi-close" variant="text" aria-label="بستن پروفایل" @click="emit('update:modelValue', false)" />
      </div>
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
          <div class="admin-profile__identity">
            <span class="admin-profile__avatar" aria-hidden="true">{{ profile.username.slice(0, 1).toUpperCase() }}</span>
            <div class="admin-profile__name">
              <strong dir="ltr">{{ profile.username }}</strong>
              <span class="admin-profile__id">شناسهٔ حساب:
                <bdi dir="ltr" :title="profile.id">{{ shortId(profile.id) }}</bdi>
                <v-btn icon="mdi-content-copy" size="small" variant="text" aria-label="کپی شناسهٔ کامل حساب"
                  @click="copyProfileId" />
              </span>
              <small v-if="copyStatus === 'copied'" role="status">شناسهٔ کامل کپی شد.</small>
              <label v-else-if="copyStatus === 'failed'" class="admin-profile__copy-fallback">
                کپی خودکار ممکن نشد؛ شناسهٔ کامل را از این کادر کپی کنید.
                <input :value="profile.id" readonly dir="ltr" aria-label="شناسهٔ کامل حساب برای کپی دستی"
                  @focus="($event.target as HTMLInputElement).select()" />
              </label>
            </div>
          </div>
          <dl class="admin-profile__facts">
            <div><dt>نقش</dt><dd>{{ profile.role === 'admin' ? 'مدیر' : 'کاربر' }}</dd></div>
            <div><dt>وضعیت حساب</dt><dd :class="profile.isActive ? 'admin-profile__active' : 'admin-profile__inactive'">
              {{ profile.isActive ? 'فعال' : 'غیرفعال' }}</dd></div>
            <div><dt>تاریخ عضویت</dt><dd>{{ formatDate(profile.createdAt) }}</dd></div>
            <div><dt>راه‌اندازی حساب</dt><dd>{{ profile.mustCompleteSecurityQuestions ? 'نیازمند تکمیل' : 'تکمیل‌شده' }}</dd></div>
            <div><dt>امتیاز میانگین</dt><dd>{{ profile.avgRating === null ? 'هنوز امتیازی ثبت نشده' : `${profile.avgRating.toLocaleString('fa-IR')} از ۵` }}</dd></div>
            <div class="admin-profile__categories"><dt>گروه‌های امدادگر</dt><dd>
              <template v-if="profile.categories.length">
                <v-chip v-for="category in profile.categories" :key="category.id" size="small" color="primary" variant="tonal">{{ category.name }}</v-chip>
              </template>
              <span v-else>بدون گروه</span>
            </dd></div>
          </dl>
        </template>
      </v-card-text>
      <v-card-actions class="admin-profile__actions">
        <v-btn variant="tonal" color="primary" @click="emit('update:modelValue', false)">بستن</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { getAdminUser, type AdminUserDetail } from "@/api/admin-users";
import { friendlyErrorMessage } from "@/api/error-message";
import { accountSessionKey } from "@/composables/device-identity";
import { useAuthStore } from "@/stores/auth";

const props = withDefaults(defineProps<{ userId: string | null; modelValue: boolean; title?: string }>(),
  { title: "پروفایل کاربر" });
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const auth = useAuthStore();
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
.admin-profile__header { display: flex; align-items: center; justify-content: space-between; gap: .5rem;
  padding: .7rem 1rem; border-bottom: 1px solid var(--bb-color-outline); }
.admin-profile__heading { display: flex; align-items: center; min-width: 0; gap: .7rem; }
.admin-profile__heading small { color: var(--bb-color-muted); font-size: .8rem; }
.admin-profile__heading h2 { margin: 0; font-size: 1.06rem; line-height: 1.5; }
.admin-profile__icon, .admin-profile__avatar { display: grid; flex: none; place-items: center;
  color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .12); border-radius: var(--bb-radius-nested, 16px); }
.admin-profile__icon { width: 42px; height: 42px; }
.admin-profile__avatar { width: 48px; height: 48px; font-size: 1.2rem; font-weight: 800; }
.admin-profile__body { padding: 1rem; }
.admin-profile__state { display: grid; justify-items: start; gap: .75rem; min-height: 5rem; }
.admin-profile__state :deep(.v-alert) { width: 100%; }
.admin-profile__identity { display: flex; align-items: center; gap: .75rem; min-width: 0; margin-bottom: 1rem; }
.admin-profile__name { display: grid; min-width: 0; gap: .2rem; }
.admin-profile__name strong { justify-self: start; font-size: 1.08rem; overflow-wrap: anywhere; }
.admin-profile__name span { color: var(--bb-color-muted); font-size: .8rem; overflow-wrap: anywhere; }
.admin-profile__id { display: flex; flex-wrap: wrap; align-items: center; gap: .15rem .4rem; }
.admin-profile__id bdi { color: rgb(var(--v-theme-on-surface)); white-space: nowrap; }
.admin-profile__id :deep(.v-btn) { width: 44px; height: 44px; min-width: 44px; min-height: 44px; }
.admin-profile__copy-fallback { display: grid; gap: .25rem; color: var(--bb-color-muted); font-size: .8rem; }
.admin-profile__copy-fallback input { width: 100%; padding: .35rem; border: 1px solid var(--bb-color-outline);
  border-radius: .4rem; background: var(--bb-color-inset); color: rgb(var(--v-theme-on-surface)); }
.admin-profile__facts { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; margin: 0; }
.admin-profile__facts > div { min-width: 0; padding: .65rem .75rem; background: var(--bb-color-inset);
  border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); }
.admin-profile__facts dt { color: var(--bb-color-muted); font-size: .8rem; }
.admin-profile__facts dd { margin: .2rem 0 0; font-weight: 700; overflow-wrap: anywhere; }
.admin-profile__categories { grid-column: 1 / -1; }
.admin-profile__categories dd { display: flex; flex-wrap: wrap; gap: .35rem; }
.admin-profile__active { color: rgb(var(--v-theme-success)); }
.admin-profile__inactive { color: rgb(var(--v-theme-error)); }
.admin-profile__actions { padding: .5rem 1rem .85rem; border-top: 1px solid var(--bb-color-outline); }
.admin-profile__actions :deep(.v-btn) { min-height: 44px; }
@media (max-width: 480px) { .admin-profile__facts { grid-template-columns: minmax(0, 1fr); } }
</style>
