<template>
  <v-dialog :model-value="modelValue" max-width="720" scrollable persistent :fullscreen="isPhone"
    aria-labelledby="admin-create-user-title" @after-leave="emit('closed')"
    @update:model-value="(open: boolean) => { if (!open) close(); }">
    <v-card class="admin-create-user" rounded="xl" dir="rtl">
      <header class="admin-create-user__header">
        <span class="admin-create-user__header-icon" aria-hidden="true"><v-icon icon="mdi-account-plus-outline" size="25" /></span>
        <div class="admin-create-user__heading">
          <span class="admin-create-user__eyebrow">مدیریت کاربران / حساب جدید</span>
          <h2 id="admin-create-user-title">ساخت حساب کاربری</h2>
          <p>برای کاربر نام کاربری و گذرواژهٔ اولیه تعیین کنید.</p>
        </div>
        <v-btn class="admin-create-user__close" icon="mdi-close" variant="text" aria-label="بستن فرم ساخت حساب"
          :disabled="saving" @click="close" />
      </header>

      <v-card-text class="admin-create-user__body">
        <form id="admin-create-user-fields" class="admin-create-user__form" @submit.prevent="submit">
          <section class="admin-create-user__section" aria-labelledby="admin-create-user-identity-title">
            <div class="admin-create-user__section-head">
              <span class="admin-create-user__step" aria-hidden="true">۱</span>
              <div>
                <h3 id="admin-create-user-identity-title">هویت حساب</h3>
                <p>این حساب با نقش کاربر ساخته می‌شود؛ گروه‌های امدادگر را بعداً می‌توانید تعیین کنید.</p>
              </div>
            </div>
            <v-text-field v-model="username" label="نام کاربری" placeholder="مثلاً rescue_user1" dir="ltr"
              autocomplete="off" autocapitalize="none" spellcheck="false" aria-required="true"
              hint="۳ تا ۳۰ نویسه؛ فقط حروف کوچک انگلیسی، رقم و زیرخط" persistent-hint
              density="comfortable" variant="outlined" rounded="lg" maxlength="30"
              :error-messages="fieldErrors.username ?? ''" :disabled="saving" data-test="admin-create-username"
              @update:model-value="clearFeedback('username')" />
          </section>

          <section class="admin-create-user__section" aria-labelledby="admin-create-user-password-title">
            <div class="admin-create-user__section-head">
              <span class="admin-create-user__step" aria-hidden="true">۲</span>
              <div>
                <h3 id="admin-create-user-password-title">گذرواژهٔ اولیه</h3>
                <p>گذرواژه را از یک مسیر امن به صاحب حساب برسانید؛ در این صفحه دوباره نمایش داده نمی‌شود.</p>
              </div>
            </div>
            <div class="admin-create-user__password-fields">
              <v-text-field v-model="password" label="گذرواژه" autocomplete="new-password" aria-required="true"
                :type="showPassword ? 'text' : 'password'" hint="۸ تا ۱۰۲۴ نویسه؛ دست‌کم یک حرف و یک عدد" persistent-hint
                density="comfortable" variant="outlined" rounded="lg"
                :error-messages="fieldErrors.password ?? ''" :disabled="saving"
                @update:model-value="clearFeedback('password')" />
              <v-text-field v-model="confirmation" label="تکرار گذرواژه" autocomplete="new-password" aria-required="true"
                :type="showPassword ? 'text' : 'password'" density="comfortable" variant="outlined" rounded="lg"
                :error-messages="fieldErrors.confirmation ?? ''" :disabled="saving"
                @update:model-value="clearFeedback('confirmation')" />
            </div>
            <v-checkbox v-model="showPassword" label="نمایش گذرواژه‌ها" color="primary" density="compact"
              hide-details :disabled="saving" class="admin-create-user__show-password" />
          </section>

          <section class="admin-create-user__section" aria-labelledby="admin-create-user-access-title">
            <div class="admin-create-user__section-head">
              <span class="admin-create-user__step" aria-hidden="true">۳</span>
              <div>
                <h3 id="admin-create-user-access-title">دسترسی و راه‌اندازی</h3>
                <p>فعال بودن حساب تعیین می‌کند که کاربر بتواند وارد شود یا نه.</p>
              </div>
            </div>
            <v-switch v-model="isActive" label="حساب فعال باشد" color="primary" inset hide-details
              :disabled="saving" class="admin-create-user__active" />
            <div class="admin-create-user__onboarding" role="note">
              <v-icon icon="mdi-shield-key-outline" size="23" aria-hidden="true" />
              <p>در این فرم پاسخ پرسش‌های امنیتی دریافت نمی‌شود. کاربر پس از نخستین ورود باید پنج پرسش امنیتی را تکمیل کند؛ تا آن زمان دسترسی به امکانات برنامه قفل است.</p>
            </div>
          </section>
          <v-alert v-if="formError" type="error" variant="tonal" rounded="lg" role="alert">{{ formError }}</v-alert>
        </form>
      </v-card-text>
      <v-card-actions class="admin-create-user__actions">
        <v-spacer />
        <v-btn variant="text" rounded="lg" :disabled="saving" @click="close">انصراف</v-btn>
        <v-btn color="primary" variant="flat" rounded="lg" type="submit" form="admin-create-user-fields"
          :loading="saving" :disabled="saving">ساخت حساب</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import { createAdminUserSchema, type UserProfile } from "@shared/index";
import { ApiError } from "../../api/http";
import { friendlyErrorMessage } from "../../api/error-message";
import { createAdminUser } from "../../api/admin-users";
import { useAuthStore } from "../../stores/auth";

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [open: boolean]; created: [user: UserProfile]; closed: [] }>();
const auth = useAuthStore();
const isPhone = useMediaQuery("(max-width: 600px)");
const username = ref("");
const password = ref("");
const confirmation = ref("");
const isActive = ref(true);
const showPassword = ref(false);
const saving = ref(false);
const fieldErrors = ref<Partial<Record<"username" | "password" | "confirmation", string>>>({});
const formError = ref("");

function reset(): void {
  username.value = "";
  password.value = "";
  confirmation.value = "";
  isActive.value = true;
  showPassword.value = false;
  fieldErrors.value = {};
  formError.value = "";
}
watch(() => props.modelValue, () => reset());

function clearFeedback(field: "username" | "password" | "confirmation"): void {
  fieldErrors.value[field] = undefined;
  formError.value = "";
}
function close(): void {
  if (!saving.value) emit('update:modelValue', false);
}

async function submit(): Promise<void> {
  if (saving.value) return;
  fieldErrors.value = {};
  formError.value = "";
  const parsed = createAdminUserSchema.safeParse({ username: username.value.trim(), password: password.value, isActive: isActive.value });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === "username") fieldErrors.value.username = "نام کاربری باید ۳ تا ۳۰ نویسه و فقط حروف کوچک انگلیسی، رقم و زیرخط داشته باشد.";
      if (issue.path[0] === "password") fieldErrors.value.password = "گذرواژه باید ۸ تا ۱۰۲۴ نویسه و شامل دست‌کم یک حرف و یک عدد باشد.";
    }
  }
  if (confirmation.value !== password.value || !confirmation.value) {
    fieldErrors.value.confirmation = "تکرار گذرواژه باید با گذرواژه یکسان باشد.";
  }
  if (!parsed.success || fieldErrors.value.confirmation) return;

  saving.value = true;
  try {
    await auth.ensureSession();
    const token = auth.accessToken;
    if (!token) {
      formError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }
    const created = await createAdminUser(parsed.data, token);
    emit("created", created);
    emit("update:modelValue", false);
  } catch (error) {
    if (error instanceof ApiError && error.code === "USERNAME_TAKEN") {
      fieldErrors.value.username = "این نام کاربری قبلاً ثبت شده است؛ نام دیگری انتخاب کنید.";
    } else if (error instanceof ApiError && error.status === 401) {
      formError.value = "نشست مدیر پایان یافته است؛ دوباره وارد حساب شوید.";
    } else if (error instanceof ApiError && error.status === 403) {
      formError.value = "دسترسی مدیر برای ساخت حساب تأیید نشد.";
    } else {
      formError.value = friendlyErrorMessage(error, "ساخت حساب انجام نشد. دوباره تلاش کنید.");
    }
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.admin-create-user { color: var(--bb-color-text); background: rgb(var(--v-theme-surface)); font-family: var(--bb-font-family); }
.admin-create-user__header { display: flex; align-items: center; gap: .8rem; flex: none; padding: 1rem 1.3rem;
  border-bottom: 1px solid var(--bb-color-outline);
  background: linear-gradient(110deg, rgba(var(--v-theme-primary), .1), rgba(var(--v-theme-primary), .025) 75%); }
.admin-create-user__header-icon { display: grid; flex: none; place-items: center; width: 46px; height: 46px;
  border-radius: .9rem; color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); }
.admin-create-user__heading { min-width: 0; flex: 1; }
.admin-create-user__eyebrow { color: var(--bb-color-primary); font-size: .82rem; font-weight: 750; }
.admin-create-user__heading h2 { margin: .1rem 0 0; font-size: 1.25rem; font-weight: 800; line-height: 1.45; }
.admin-create-user__heading p { margin: .15rem 0 0; color: var(--bb-color-muted); font-size: .84rem; line-height: 1.6; }
.admin-create-user__close { flex: none; align-self: flex-start; }
.admin-create-user__close.v-btn { width: 44px; height: 44px; }
.admin-create-user__body { padding: 1.1rem 1.3rem 1.3rem; }
.admin-create-user__form { display: grid; gap: .9rem; }
.admin-create-user__section { min-width: 0; }
.admin-create-user__section + .admin-create-user__section { padding-block-start: .9rem;
  border-top: 1px solid color-mix(in srgb, var(--bb-color-outline) 28%, transparent); }
.admin-create-user__section-head { display: flex; align-items: center; gap: .65rem; margin-bottom: .75rem; }
.admin-create-user__section-head > div { min-width: 0; }
.admin-create-user__step { display: grid; flex: none; place-items: center; width: 34px; height: 34px;
  border-radius: .7rem; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .1); font-weight: 800; }
.admin-create-user__section-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
.admin-create-user__section-head p { margin: .1rem 0 0; color: var(--bb-color-muted); font-size: .82rem; line-height: 1.6; }
.admin-create-user__password-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .7rem; align-items: start; }
.admin-create-user__show-password { margin-top: -.25rem; }
.admin-create-user__show-password :deep(.v-selection-control) { min-height: 44px; }
.admin-create-user__active :deep(.v-selection-control) { min-height: 44px; }
.admin-create-user__onboarding { display: flex; align-items: flex-start; gap: .65rem; margin-top: .5rem;
  padding: .75rem .9rem; border-radius: .75rem; background: rgba(var(--v-theme-primary), .08);
  color: var(--bb-color-text); font-size: .84rem; line-height: 1.7; }
.admin-create-user__onboarding :deep(.v-icon) { flex: none; color: var(--bb-color-primary); margin-top: .12rem; }
.admin-create-user__onboarding p { margin: 0; }
.admin-create-user__actions { flex: none; gap: .4rem; padding: .7rem 1.3rem; border-top: 1px solid var(--bb-color-outline); }
.admin-create-user__actions :deep(.v-btn) { min-height: 44px; margin: 0; }
@media (forced-colors: active) {
  .admin-create-user__header, .admin-create-user__onboarding { background: Canvas; color: CanvasText; }
  .admin-create-user__section + .admin-create-user__section { border-color: CanvasText; }
}
@media (max-width: 600px) {
  .admin-create-user { height: 100dvh; max-height: 100dvh; border-radius: 0 !important; }
  .admin-create-user__header { padding: calc(var(--bb-form-phone-headerBlock) + env(safe-area-inset-top, 0px)) var(--bb-form-phone-inline) var(--bb-form-phone-headerBlock); }
  .admin-create-user__header-icon { width: var(--bb-form-phone-icon); height: var(--bb-form-phone-icon); }
  .admin-create-user__heading h2 { font-size: var(--bb-form-phone-title); }
  .admin-create-user__heading p { display: none; }
  .admin-create-user__body { padding: var(--bb-form-phone-bodyBlock) var(--bb-form-phone-inline); }
  .admin-create-user__form { gap: var(--bb-form-phone-sectionGap); }
  .admin-create-user__section + .admin-create-user__section { padding-block-start: var(--bb-form-phone-sectionGap); }
  .admin-create-user__section-head { margin-bottom: .65rem; }
  .admin-create-user__password-fields { grid-template-columns: minmax(0, 1fr); gap: .25rem; }
  .admin-create-user__actions { flex-direction: column; align-items: stretch;
    padding: var(--bb-form-phone-actionBlock) var(--bb-form-phone-inline) calc(var(--bb-form-phone-actionBlock) + env(safe-area-inset-bottom, 0px)); }
  .admin-create-user__actions :deep(.v-spacer) { display: none; }
  .admin-create-user__actions :deep(.v-btn) { width: 100%; height: auto; white-space: normal; }
}
</style>
