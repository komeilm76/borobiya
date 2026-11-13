<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VCard, VForm, VTextField } from 'vuetify/components';
import { useAuthStore } from '@/stores/auth.ts';
import { landingRoute, ROUTE_NAMES } from '@/router/index.ts';
import { errorMessage } from '@/api/client.ts';
import AuthHeading from '@/components/AuthHeading.vue';

/**
 * Login screen. Uses Vuetify form controls inside the Borobiya design tokens, reports the
 * server's typed errors inline, and redirects by role after a successful sign-in.
 */
const router = useRouter();
const auth = useAuthStore();
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);

async function onSubmit(): Promise<void> {
  if (busy.value) return;
  error.value = null;
  busy.value = true;
  try {
    const user = await auth.login(username.value.trim().toLowerCase(), password.value, navigator.userAgent.slice(0, 60));
    await router.push({ name: landingRoute(user.role, user.mustCompleteSecurityQuestions) });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}

const demo = async (name: string): Promise<void> => {
  username.value = name;
  password.value = name === 'admin' ? 'AdminPass!2026' : 'DemoPass!2026';
};
</script>

<template>
  <VCard class="auth-card" flat>
    <VForm class="auth-form" @submit.prevent="onSubmit">
      <AuthHeading eyebrow="خوش آمدید" title="ورود به حساب" icon="mdi-account-outline" />
      <VTextField
        id="login-username"
        v-model="username"
        name="username"
        autocomplete="username"
        label="نام کاربری"
        placeholder="saeed.k"
        prepend-inner-icon="mdi-account-outline"
        :disabled="busy"
      />
      <VTextField
        id="login-password"
        v-model="password"
        name="password"
        :type="showPassword ? 'text' : 'password'"
        autocomplete="current-password"
        label="گذرواژه"
        prepend-inner-icon="mdi-lock-outline"
        :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
        :disabled="busy"
        @click:append-inner="showPassword = !showPassword"
      />
      <div class="auth-form__row">
        <RouterLink :to="{ name: ROUTE_NAMES.recovery }">گذرواژه را فراموش کرده‌اید؟</RouterLink>
      </div>
      <VAlert v-if="error" type="error" variant="tonal" density="compact">{{ error }}</VAlert>
      <VBtn type="submit" block color="primary" class="auth-submit" :loading="busy" data-testid="login-submit">
        <span>ورود به حساب</span>
        <span class="mdi mdi-arrow-left" aria-hidden="true" />
      </VBtn>
      <div class="auth-divider" role="separator" aria-hidden="true"><span>یا</span></div>
      <p class="auth-switch">هنوز حساب ندارید؟<RouterLink :to="{ name: ROUTE_NAMES.register }">ساخت حساب جدید</RouterLink></p>
      <p class="auth-footnote"><span class="mdi mdi-lock-outline" aria-hidden="true" /><span>اطلاعات حساب شما محرمانه می‌ماند.</span></p>
      <div class="auth-card__demo">
        <span>حساب‌های نمایشی</span>
        <div>
          <VBtn size="small" variant="tonal" @click="demo('saeed.k')">کاربر</VBtn>
          <VBtn size="small" variant="tonal" @click="demo('reza.m')">امدادگر</VBtn>
          <VBtn size="small" variant="tonal" @click="demo('admin')">مدیر</VBtn>
        </div>
      </div>
    </VForm>
  </VCard>
</template>

<style scoped>
.auth-card { background: transparent; padding: 0; border-radius: 0; box-shadow: none; }
.auth-form { display: grid; gap: 14px; }
.auth-form__row { display: flex; justify-content: flex-start; margin-block-start: -6px; font-size: 12.5px; }
.auth-form__row a { color: var(--primary); text-decoration: none; }
.auth-submit { height: 52px; font-size: 15px; border-radius: var(--r14); gap: 10px; letter-spacing: 0; }
.auth-divider { display: flex; align-items: center; gap: 12px; color: var(--muted); font-size: 12px; }
.auth-divider::before,
.auth-divider::after { content: ''; flex: 1; block-size: 1px; background: var(--border); }
.auth-switch { margin: 0; text-align: center; font-size: 13px; color: var(--muted); }
.auth-switch a { color: var(--primary); font-weight: 700; text-decoration: none; margin-inline-start: 6px; }
.auth-footnote { display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; color: var(--muted); font-size: 11.5px; }
.auth-card__demo { display: grid; gap: 8px; padding-block-start: 14px; border-top: 1px dashed var(--border); font-size: 12px; color: var(--muted); }
.auth-card__demo div { display: flex; gap: 8px; }
</style>
