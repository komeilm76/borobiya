<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VCard, VTextField } from 'vuetify/components';
import { useAuthStore } from '@/stores/auth.ts';
import { errorMessage } from '@/api/client.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { passwordIssue, passwordIssueMessage } from '@/composables/usePasswordPolicy.ts';
import AuthHeading from '@/components/AuthHeading.vue';

/**
 * Five-question password recovery: account lookup, three challenge answers, then a
 * one-use reset token. Unknown usernames receive decoy challenges, so the UI cannot be used
 * to enumerate accounts.
 */
type Step = 'account' | 'answers' | 'reset';

const router = useRouter();
const auth = useAuthStore();
const step = ref<Step>('account');
const username = ref('');
const recoveryId = ref('');
const resetToken = ref('');
const questions = ref<Array<{ id: string; label: string }>>([]);
const answers = ref<string[]>(['', '', '']);
const newPassword = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

const stepTitle = computed(() => (step.value === 'account' ? 'حسابتان را پیدا کنید' : step.value === 'answers' ? 'پاسخ پرسش‌ها' : 'گذرواژه تازه'));
const stepEyebrow = computed(() => (step.value === 'account' ? 'مرحله ۱ از ۳' : step.value === 'answers' ? 'مرحله ۲ از ۳' : 'مرحله ۳ از ۳'));
const stepIcon = computed(() => (step.value === 'account' ? 'mdi-shield-account-outline' : step.value === 'answers' ? 'mdi-comment-question-outline' : 'mdi-shield-lock-outline'));
const stepSub = computed(() => (step.value === 'account'
  ? 'نام کاربری حساب را وارد کنید تا پرسش‌های امنیتی نمایش داده شوند.'
  : step.value === 'answers'
    ? 'به هر سه پرسش پاسخ دهید؛ حساب نامشخص می‌ماند تا همه درست باشند.'
    : 'گذرواژه تازه را وارد کنید و آن را در جایی مطمئن یادداشت کنید.'));

async function startAccount(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const result = await auth.startRecovery(username.value.trim().toLowerCase());
    recoveryId.value = result.recoveryId;
    questions.value = result.questions;
    step.value = 'answers';
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function answerQuestions(): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const payload = questions.value.map((question, index) => ({ questionId: question.id, answer: answers.value[index] ?? '' }));
    const result = await auth.answerRecovery(recoveryId.value, payload);
    resetToken.value = result.resetToken;
    step.value = 'reset';
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}

async function reset(): Promise<void> {
  const issue = passwordIssueMessage(passwordIssue(newPassword.value));
  if (issue) {
    error.value = issue;
    return;
  }
  busy.value = true;
  error.value = null;
  try {
    await auth.resetPassword(recoveryId.value, resetToken.value, newPassword.value);
    await router.push({ name: ROUTE_NAMES.login });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <VCard class="auth-card" flat>
    <AuthHeading :eyebrow="stepEyebrow" :title="stepTitle" :icon="stepIcon" />
    <p class="auth-card__sub">{{ stepSub }}</p>
    <VForm v-if="step === 'account'" @submit.prevent="startAccount">
      <VTextField v-model="username" name="username" label="نام کاربری" autocomplete="username" :disabled="busy" />
      <VBtn type="submit" block color="primary" class="mt-3" :loading="busy">دریافت پرسش‌ها</VBtn>
    </VForm>
    <VForm v-else-if="step === 'answers'" @submit.prevent="answerQuestions">
      <div v-for="(question, index) in questions" :key="question.id" class="auth-card__question">
        <label :for="`answer-${index}`">{{ question.label }}</label>
        <VTextField :id="`answer-${index}`" v-model="answers[index]" :disabled="busy" />
      </div>
      <VBtn type="submit" block color="primary" class="mt-3" :loading="busy">تأیید پاسخ‌ها</VBtn>
    </VForm>
    <VForm v-else @submit.prevent="reset">
      <VTextField v-model="newPassword" name="newPassword" type="password" label="گذرواژه تازه" autocomplete="new-password" :disabled="busy" />
      <VBtn type="submit" block color="primary" class="mt-3" :loading="busy">ذخیره گذرواژه</VBtn>
    </VForm>
    <VAlert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">{{ error }}</VAlert>
    <div class="auth-card__links">
      <RouterLink :to="{ name: ROUTE_NAMES.login }">بازگشت به ورود</RouterLink>
    </div>
  </VCard>
</template>

<style scoped>
.auth-card { background: transparent; padding: 0; border-radius: 0; box-shadow: none; }
.auth-card__sub { margin: -8px 0 4px; font-size: 12.5px; color: var(--muted); line-height: 1.9; }
.auth-card__question { display: grid; gap: 4px; margin-block-end: 10px; }
.auth-card__question label { font-size: 13px; color: var(--muted); }
.auth-card__links { margin-block-start: 12px; text-align: center; font-size: 13px; }
.auth-card__links a { color: var(--primary); }
</style>
