<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VCard, VSelect, VTextField } from 'vuetify/components';
import { useAuthStore } from '@/stores/auth.ts';
import { errorMessage } from '@/api/client.ts';
import { landingRoute } from '@/router/index.ts';
import AuthHeading from '@/components/AuthHeading.vue';

/**
 * Forced onboarding for administrator-created accounts: five distinct questions must be
 * answered before any user or administrator screen becomes reachable.
 */
const router = useRouter();
const auth = useAuthStore();
// null keeps VSelect's placeholder visible; '' would render the field blank-but-dirty.
const selected = ref<Array<string | null>>([null, null, null, null, null]);
const answers = ref<string[]>(['', '', '', '', '']);
const error = ref<string | null>(null);
const busy = ref(false);

const questions = computed(() => auth.securityQuestions);
const options = computed(() => questions.value.map((item) => ({ title: item.label, value: item.id })));
const questionsLoading = ref(true);
const questionsError = ref<string | null>(null);

async function loadQuestions(): Promise<void> {
  questionsLoading.value = true;
  questionsError.value = null;
  try {
    await auth.loadSecurityQuestions();
  } catch (caught) {
    questionsError.value = errorMessage(caught);
  } finally {
    questionsLoading.value = false;
  }
}

onMounted(() => void loadQuestions());

async function submit(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    // Unanswered slots stay '' so the server sees five positions and can name the gap.
    await auth.completeSecurityQuestions(selected.value.map((questionId, index) => ({ questionId: questionId ?? '', answer: answers.value[index] ?? '' })));
    const user = auth.user;
    await router.push({ name: landingRoute(user?.role, false) });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <VCard class="auth-card" flat>
    <AuthHeading eyebrow="تکمیل راه‌اندازی حساب" title="پرسش‌های امنیتی شما" icon="mdi-shield-key-outline" />
    <p class="auth-card__hint">پنج پرسش امنیتی متفاوت را انتخاب و پاسخ دهید؛ پاسخ‌ها را فقط شما می‌دانید.</p>
    <p v-if="questionsLoading" class="onboarding-loading" role="status" data-testid="onboarding-loading">
      <span class="mdi mdi-information-outline" aria-hidden="true" />
      <span>در حال بارگذاری فهرست پرسش‌ها…</span>
    </p>
    <div v-if="questionsLoading" class="onboarding-skeletons" aria-hidden="true">
      <div v-for="index in 5" :key="index" class="onboarding-skeleton-row">
        <span class="skeleton skeleton--bar" />
        <span class="skeleton skeleton--bar skeleton--bar-wide" />
      </div>
    </div>
    <div v-else-if="questionsError" class="onboarding-loading onboarding-loading--error" role="alert" data-testid="onboarding-load-error">
      <span class="mdi mdi-alert-circle-outline" aria-hidden="true" />
      <span>{{ questionsError }}</span>
      <button type="button" class="ghost-button" data-testid="onboarding-load-retry" @click="loadQuestions">تلاش دوباره</button>
    </div>
    <form @submit.prevent="submit" v-show="!questionsLoading">
      <div v-for="index in 5" :key="index" class="auth-card__question">
        <VSelect v-model="selected[index - 1]" :items="options" density="compact" placeholder="پرسش امنیتی" :disabled="busy" />
        <VTextField v-model="answers[index - 1]" density="compact" placeholder="پاسخ" :disabled="busy" />
      </div>
      <VAlert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</VAlert>
      <VBtn type="submit" block color="primary" :loading="busy" :disabled="busy || questionsLoading || !!questionsError">تکمیل حساب</VBtn>
    </form>
  </VCard>
</template>

<style scoped>
.auth-card { background: transparent; padding: 0; border-radius: 0; box-shadow: none; display: grid; gap: 12px; }
.auth-card__hint { font-size: 13px; color: var(--muted); margin-block-end: 12px; }
.onboarding-loading { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: var(--r12); background: var(--surface-2); color: var(--muted); font-size: 12.5px; margin-block-end: 12px; }
.onboarding-loading--error { color: var(--danger); justify-content: space-between; flex-wrap: wrap; background: rgba(175,52,56,.08); }
.onboarding-skeletons { display: grid; gap: 10px; margin-block-end: 12px; }
.onboarding-skeleton-row { display: flex; gap: 10px; align-items: center; padding: 14px 12px; border-radius: var(--r12); border: 1px solid var(--row-line); }
.skeleton--bar-wide { inline-size: 220px; }
.auth-card__question { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; margin-block-end: 8px; }
</style>
