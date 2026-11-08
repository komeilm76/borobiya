<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VCard, VForm, VTextField } from 'vuetify/components';
import { useAuthStore } from '@/stores/auth.ts';
import { landingRoute, ROUTE_NAMES } from '@/router/index.ts';
import { errorMessage } from '@/api/client.ts';

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
    <VForm @submit.prevent="onSubmit">
      <div class="auth-card__field">
        <label for="login-username">نام کاربری</label>
        <VTextField
          id="login-username"
          v-model="username"
          name="username"
          autocomplete="username"
          placeholder="saeed.k"
          :disabled="busy"
        />
      </div>
      <div class="auth-card__field">
        <label for="login-password">گذرواژه</label>
        <VTextField
          id="login-password"
          v-model="password"
          name="password"
          :type="showPassword ? 'text' : 'password'"
          autocomplete="current-password"
          :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
          :disabled="busy"
          @click:append-inner="showPassword = !showPassword"
        />
      </div>
      <VAlert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</VAlert>
      <VBtn type="submit" block color="primary" :loading="busy" data-testid="login-submit">ورود</VBtn>
      <div class="auth-card__links">
        <RouterLink :to="{ name: ROUTE_NAMES.register }">حساب تازه</RouterLink>
        <RouterLink :to="{ name: ROUTE_NAMES.recovery }">گذرواژه را فراموش کرده‌ام</RouterLink>
      </div>
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
.auth-card { background: var(--surface); padding: 24px; border-radius: var(--r20); box-shadow: var(--shadow-sm); }
.auth-card__field { display: grid; gap: 6px; margin-block-end: 14px; }
.auth-card__field label { font-size: 13px; color: var(--muted); }
.auth-card__links { display: flex; justify-content: space-between; margin-block-start: 14px; font-size: 13px; }
.auth-card__links a { color: var(--primary); text-decoration: none; }
.auth-card__demo { margin-block-start: 18px; display: grid; gap: 8px; font-size: 12px; color: var(--muted); }
.auth-card__demo div { display: flex; gap: 8px; }
</style>
