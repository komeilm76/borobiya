<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VCard, VSelect, VTextField } from 'vuetify/components';
import { useAuthStore } from '@/stores/auth.ts';
import { errorMessage } from '@/api/client.ts';
import { ROUTE_NAMES } from '@/router/index.ts';
import { passwordIssue, passwordIssueMessage } from '@/composables/usePasswordPolicy.ts';
import AuthHeading from '@/components/AuthHeading.vue';

/**
 * Registration requires five distinct catalog-backed security questions; the server
 * re-validates the selection, so the form only mirrors the rule for immediate feedback.
 */
const router = useRouter();
const auth = useAuthStore();
const username = ref('');
const password = ref('');
const confirm = ref('');
const selected = ref<Array<string | null>>([null, null, null, null, null]);
const answers = ref<string[]>(['', '', '', '', '']);
const error = ref<string | null>(null);
const busy = ref(false);

const questions = computed(() => auth.securityQuestions);
const questionOptions = computed(() => questions.value.map((item) => ({ title: item.label, value: item.id })));
const duplicateSelection = computed(() => new Set(selected.value.filter(Boolean)).size !== selected.value.filter(Boolean).length);

onMounted(() => void auth.loadSecurityQuestions());

async function submit(): Promise<void> {
  if (busy.value) return;
  error.value = null;
  if (password.value !== confirm.value) {
    error.value = 'دو گذرواژه یکسان نیستند.';
    return;
  }
  if (duplicateSelection.value) {
    error.value = 'پرسش‌های امنیتی باید متفاوت باشند.';
    return;
  }
  // The server rejects a weak password with "Invalid request.", so name the rule here instead.
  const weak = passwordIssueMessage(passwordIssue(password.value));
  if (weak) {
    error.value = weak;
    return;
  }
  if (selected.value.some((questionId) => !questionId)) {
    error.value = 'هر پنج پرسش امنیتی را انتخاب کنید.';
    return;
  }
  // Answers are 2-100 characters server-side; an empty one is silently a failed match later.
  if (answers.value.some((answer) => answer.trim().length < 2)) {
    error.value = 'پاسخ هر پرسش باید دست‌کم ۲ نویسه باشد.';
    return;
  }
  busy.value = true;
  try {
    // Slots are all non-null here (the some() check above blocks this path otherwise);
    // the ?? '' keeps the payload type string-only if that invariant ever moves.
    const payload = selected.value.map((questionId, index) => ({ questionId: questionId ?? '', answer: answers.value[index] ?? '' }));
    const user = await auth.register(username.value.trim().toLowerCase(), password.value, payload);
    await router.push({ name: user.role === 'admin' ? ROUTE_NAMES.adminOverview : ROUTE_NAMES.map });
  } catch (caught) {
    error.value = errorMessage(caught);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <VCard class="auth-card" flat>
    <form @submit.prevent="submit">
      <AuthHeading eyebrow="شروع همراهی" title="ساخت حساب جدید" icon="mdi-account-plus-outline" />
      <div class="auth-grid">
        <VTextField id="reg-username" v-model="username" name="username" autocomplete="username" label="نام کاربری" placeholder="user.name" prepend-inner-icon="mdi-at" :disabled="busy" />
        <VTextField id="reg-password" v-model="password" name="password" type="password" autocomplete="new-password" label="گذرواژه" prepend-inner-icon="mdi-lock-outline" :disabled="busy" />
        <p class="auth-hint">۱۲ تا ۱۲۸ نویسه؛ حروف، عدد و نشانه.</p>
        <VTextField id="reg-confirm" v-model="confirm" name="confirm" type="password" autocomplete="new-password" label="تکرار گذرواژه" prepend-inner-icon="mdi-lock-check-outline" :disabled="busy" />
      </div>
      <h3 class="auth-card__section">پنج پرسش امنیتی برای بازیابی</h3>
      <div v-for="(question, index) in questions.slice(0, 5)" :key="question.id" class="auth-grid auth-grid--question">
        <label :for="`sq-${index}`">پرسش {{ index + 1 }}</label>
        <div class="auth-question">
          <VSelect
            :id="`sq-${index}`"
            v-model="selected[index]"
            :items="questionOptions"
            density="compact"
            :disabled="busy"
            placeholder="پرسش را انتخاب کنید"
          />
          <VTextField v-model="answers[index]" density="compact" placeholder="پاسخ" :disabled="busy" />
        </div>
      </div>
      <VAlert v-if="error" type="error" variant="tonal" density="compact" class="my-3">{{ error }}</VAlert>
      <VBtn type="submit" block color="primary" :loading="busy" :disabled="questions.length < 5">ساخت حساب</VBtn>
      <div class="auth-card__links">
        <RouterLink :to="{ name: ROUTE_NAMES.login }">بازگشت به ورود</RouterLink>
      </div>
    </form>
  </VCard>
</template>

<style scoped>
.auth-card { background: transparent; padding: 0; border-radius: 0; box-shadow: none; }
.auth-grid { display: grid; gap: 10px; margin-block-end: 6px; }
.auth-grid label { font-size: 13px; color: var(--muted); }
.auth-hint { margin: -6px 2px 0; font-size: 11px; color: var(--muted); }
.auth-grid--question { grid-template-columns: 96px minmax(0, 1fr); align-items: start; }
.auth-question { display: grid; gap: 4px; }
.auth-card__section { margin: 10px 0 6px; font-size: 14px; font-weight: 600; }
.auth-card__links { margin-block-start: 12px; font-size: 13px; text-align: center; }
.auth-card__links a { color: var(--primary); }
</style>
