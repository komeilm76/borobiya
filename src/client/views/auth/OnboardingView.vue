<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { VAlert, VBtn, VCard, VSelect, VTextField } from 'vuetify/components';
import { useAuthStore } from '@/stores/auth.ts';
import { errorMessage } from '@/api/client.ts';
import { landingRoute } from '@/router/index.ts';

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

onMounted(() => void auth.loadSecurityQuestions());

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
    <p class="auth-card__hint">برای ادامه، پنج پرسش امنیتی متفاوت را انتخاب و پاسخ دهید.</p>
    <form @submit.prevent="submit">
      <div v-for="index in 5" :key="index" class="auth-card__question">
        <VSelect v-model="selected[index - 1]" :items="options" density="compact" placeholder="پرسش امنیتی" :disabled="busy" />
        <VTextField v-model="answers[index - 1]" density="compact" placeholder="پاسخ" :disabled="busy" />
      </div>
      <VAlert v-if="error" type="error" variant="tonal" density="compact" class="mb-3">{{ error }}</VAlert>
      <VBtn type="submit" block color="primary" :loading="busy">تکمیل حساب</VBtn>
    </form>
  </VCard>
</template>

<style scoped>
.auth-card { background: var(--surface); padding: 22px; border-radius: var(--r20); box-shadow: var(--shadow-sm); }
.auth-card__hint { font-size: 13px; color: var(--muted); margin-block-end: 12px; }
.auth-card__question { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; margin-block-end: 8px; }
</style>
