<template>
  <section class="auth-page mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
    <div class="auth-layout auth-layout-wide">
      <aside class="auth-intro">
        <span class="auth-kicker"><span class="eyebrow-dot" /> یک مرحلهٔ ضروری</span>
        <h1 class="auth-hero-title">از حساب‌تان<br /><span>بهتر محافظت کنید.</span></h1>
        <p class="auth-hero-copy">
          برای ادامه، پنج پرسش امنیتی متفاوت انتخاب کنید و پاسخ‌هایی بنویسید که بعداً به یاد می‌آورید.
        </p>
        <div class="auth-trust-row">
          <span class="trust-icon"><v-icon icon="mdi-shield-lock-outline" /></span>
          <span><strong>فقط پاسخ رمزنگاری‌شده نگه‌داری می‌شود</strong><small>پاسخ‌های شما برای هیچ‌کس، حتی مدیران، قابل‌مشاهده نیست.</small></span>
        </div>
      </aside>

      <v-card class="auth-card auth-card-register" elevation="0" rounded="xl">
        <v-card-text class="auth-card-body">
          <div class="auth-card-heading">
            <span class="auth-card-icon"><v-icon icon="mdi-shield-key-outline" size="25" /></span>
            <div>
              <p class="auth-eyebrow">تکمیل راه‌اندازی حساب</p>
              <h2>پرسش‌های امنیتی شما</h2>
            </div>
          </div>

          <v-alert v-if="formError" class="auth-alert" type="error" variant="tonal" density="comfortable" role="alert">
            {{ formError }}
          </v-alert>
          <v-alert v-if="questionError" class="auth-alert" type="warning" variant="tonal" density="comfortable">
            {{ questionError }}
            <template #append>
              <v-btn size="small" variant="text" @click="loadCatalog">تلاش دوباره</v-btn>
            </template>
          </v-alert>
          <v-alert v-if="loadingQuestions" class="auth-alert" type="info" variant="tonal" density="comfortable">
            در حال بارگذاری فهرست پرسش‌ها…
          </v-alert>

          <form class="auth-form" @submit.prevent="submitAnswers">
            <div v-if="!loadingQuestions" class="question-list">
              <div v-for="(entry, index) in answers" :key="index" class="question-item">
                <span class="question-index">{{ faNumber(index + 1) }}</span>
                <div class="question-fields">
                  <v-select
                    v-model="entry.questionId"
                    :items="availableQuestions(index)"
                    @update:model-value="entry.answer = ''"
                    item-title="text"
                    item-value="id"
                    :label="`پرسش ${faNumber(index + 1)}`"
                    variant="outlined"
                    rounded="lg"
                    density="comfortable"
                    hide-details="auto"
                    :disabled="submitting || !questions.length"
                  />
                  <v-text-field
                    v-model="entry.answer"
                    label="پاسخ شما"
                    autocomplete="off"
                    prepend-inner-icon="mdi-comment-question-outline"
                    variant="outlined"
                    rounded="lg"
                    density="comfortable"
                    hide-details="auto"
                    :disabled="submitting || !entry.questionId"
                  />
                </div>
              </div>
            </div>
            <v-btn
              class="auth-submit"
              color="primary"
              type="submit"
              size="large"
              rounded="lg"
              :loading="submitting"
              :disabled="submitting || loadingQuestions || questions.length < 5"
              block
            >
              ذخیره و ادامه
              <v-icon class="ms-2" icon="mdi-arrow-left" />
            </v-btn>
          </form>

          <p class="auth-privacy-note">
            <v-icon icon="mdi-lock-check-outline" size="16" />
            برای حفظ امنیت، پاسخ‌ها را با دیگران به اشتراک نگذارید.
          </p>
        </v-card-text>
      </v-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { completeSecurityQuestionsSchema, type SecurityQuestion } from "@shared/index";
import { friendlyErrorMessage } from "../../api/error-message";
import { getSecurityQuestions } from "../../api/security-questions";
import { useAuthStore } from "../../stores/auth";

interface AnswerDraft {
  questionId: string;
  answer: string;
}

const router = useRouter();
const auth = useAuthStore();
const questions = ref<SecurityQuestion[]>([]);
const answers = ref<AnswerDraft[]>(Array.from({ length: 5 }, () => ({ questionId: "", answer: "" })));
const loadingQuestions = ref(true);
const submitting = ref(false);
const formError = ref("");
const questionError = ref("");

function faNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function availableQuestions(index: number): SecurityQuestion[] {
  const selectedElsewhere = new Set(answers.value.flatMap((entry, entryIndex) =>
    entryIndex !== index && entry.questionId ? [entry.questionId] : []
  ));
  return questions.value.filter(({ id }) => !selectedElsewhere.has(id));
}

async function loadCatalog(): Promise<void> {
  loadingQuestions.value = true;
  questionError.value = "";
  try {
    questions.value = await getSecurityQuestions();
    if (questions.value.length < 5) questionError.value = "فهرست پرسش‌های امنیتی هنوز آماده نیست.";
  } catch (error) {
    questionError.value = friendlyErrorMessage(error, "بارگذاری پرسش‌ها انجام نشد.");
  } finally {
    loadingQuestions.value = false;
  }
}

async function submitAnswers(): Promise<void> {
  formError.value = "";
  const parsed = completeSecurityQuestionsSchema.safeParse({ securityQuestions: answers.value });
  if (!parsed.success) {
    formError.value = "پنج پرسش متفاوت انتخاب کنید و پاسخ همهٔ آن‌ها را بنویسید.";
    return;
  }

  submitting.value = true;
  try {
    await auth.completeSecurityQuestions(parsed.data);
    await router.replace("/_user/map");
  } catch (error) {
    formError.value = friendlyErrorMessage(error, "ذخیرهٔ پاسخ‌ها انجام نشد. دوباره تلاش کنید.");
  } finally {
    submitting.value = false;
  }
}

onMounted(loadCatalog);
</script>
