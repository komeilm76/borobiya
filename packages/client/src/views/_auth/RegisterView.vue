<template>
  <section class="auth-page mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
    <div class="auth-layout auth-layout-wide">
      <aside class="auth-intro">
        <span class="auth-kicker"><span class="eyebrow-dot" /> یک قدم تا همراهی</span>
        <h1 class="auth-hero-title">حسابی امن،<br /><span>همراهی نزدیک.</span></h1>
        <p class="auth-hero-copy">
          با ساخت حساب، به شبکه‌ای از همراهان محلی می‌پیوندید. پرسش‌های امنیتی را طوری انتخاب کنید که پاسخ‌شان را به‌خاطر بسپارید.
        </p>
        <div class="auth-feature-list">
          <div class="auth-feature-item">
            <span class="feature-number">۰۱</span>
            <span><strong>پاسخ‌ها محرمانه می‌مانند</strong><small>پاسخ‌ها به‌صورت امن ذخیره می‌شوند، نه به شکل متن قابل‌خواندن.</small></span>
          </div>
          <div class="auth-feature-item">
            <span class="feature-number">۰۲</span>
            <span><strong>پنج پرسش متفاوت انتخاب کنید</strong><small>برای بازیابی آینده، پاسخ‌هایی انتخاب کنید که فراموش نمی‌کنید.</small></span>
          </div>
        </div>
      </aside>

      <v-card class="auth-card auth-card-register" elevation="0" rounded="xl">
        <v-card-text class="auth-card-body">
          <div class="auth-card-heading">
            <span class="auth-card-icon"><v-icon icon="mdi-account-plus-outline" size="25" /></span>
            <div>
              <p class="auth-eyebrow">شروع همراهی</p>
              <h2>ساخت حساب جدید</h2>
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

          <form class="auth-form" @submit.prevent="submitRegistration">
            <v-text-field
              v-model="username"
              label="نام کاربری"
              name="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              dir="ltr"
              hint="۳ تا ۳۰ نویسه؛ فقط حروف کوچک انگلیسی، عدد و زیرخط"
              persistent-hint
              prepend-inner-icon="mdi-at"
              variant="outlined"
              rounded="lg"
              density="comfortable"
              :disabled="submitting"
            />

            <div class="auth-password-grid">
              <v-text-field
                v-model="password"
                label="گذرواژه"
                name="new-password"
                autocomplete="new-password"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="mdi-lock-outline"
                variant="outlined"
                rounded="lg"
                density="comfortable"
                hint="حداقل ۸ نویسه، شامل دست‌کم یک حرف و یک عدد"
                persistent-hint
                :disabled="submitting"
              />
              <v-text-field
                v-model="confirmPassword"
                label="تکرار گذرواژه"
                name="confirm-password"
                autocomplete="new-password"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="mdi-lock-check-outline"
                variant="outlined"
                rounded="lg"
                density="comfortable"
                :disabled="submitting"
              />
            </div>
            <v-checkbox
              v-model="showPassword"
              class="auth-show-password"
              label="نمایش گذرواژه‌ها"
              color="primary"
              density="compact"
              hide-details
            />

            <div class="question-section-heading">
              <div>
                <span class="auth-eyebrow">برای امنیت و بازیابی حساب</span>
                <h3>پنج پرسش امنیتی</h3>
              </div>
              <v-chip color="primary" variant="tonal" size="small">{{ selectedCount }} از ۵</v-chip>
            </div>
            <v-progress-linear v-if="loadingQuestions" class="question-loading" color="primary" indeterminate rounded />
            <div v-else class="question-list">
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
              ساخت حساب امن
              <v-icon class="ms-2" icon="mdi-arrow-left" />
            </v-btn>
          </form>

          <p class="auth-switch-copy">
            قبلاً حساب ساخته‌اید؟
            <RouterLink class="text-link text-link-strong" to="/_auth/login">وارد شوید</RouterLink>
          </p>
          <p class="auth-privacy-note">
            <v-icon icon="mdi-shield-lock-outline" size="16" />
            از پاسخ‌هایی استفاده کنید که فقط شما می‌دانید.
          </p>
        </v-card-text>
      </v-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { registerSchema, type SecurityQuestion } from "@shared/index";
import { ApiError, authApiRoutes, requestJson } from "../../api/http";
import { friendlyErrorMessage } from "../../api/error-message";
import { getSecurityQuestions } from "../../api/security-questions";

interface AnswerDraft {
  questionId: string;
  answer: string;
}

const router = useRouter();
const username = ref("");
const password = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const answers = ref<AnswerDraft[]>(Array.from({ length: 5 }, () => ({ questionId: "", answer: "" })));
const questions = ref<SecurityQuestion[]>([]);
const loadingQuestions = ref(true);
const submitting = ref(false);
const formError = ref("");
const questionError = ref("");
const selectedCount = computed(() => answers.value.filter(({ questionId }) => questionId).length);

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

async function submitRegistration(): Promise<void> {
  formError.value = "";
  const parsed = registerSchema.safeParse({
    username: username.value.trim().toLowerCase(),
    password: password.value,
    confirmPassword: confirmPassword.value,
    securityQuestions: answers.value
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some(({ path }) => path[0] === "confirmPassword");
    formError.value = mismatch
      ? "گذرواژه و تکرار آن یکسان نیستند."
      : "نام کاربری، گذرواژه و هر پنج پرسش را بررسی کنید.";
    return;
  }

  submitting.value = true;
  try {
    await requestJson(authApiRoutes.register.url, { method: "POST", body: parsed.data });
    await router.replace({ path: "/_auth/login", query: { registered: "1" } });
  } catch (error) {
    if (error instanceof ApiError && error.code === "USERNAME_TAKEN") {
      formError.value = "این نام کاربری قبلاً انتخاب شده است. نام دیگری امتحان کنید.";
    } else {
      formError.value = friendlyErrorMessage(error, "ساخت حساب انجام نشد. دوباره تلاش کنید.");
    }
  } finally {
    submitting.value = false;
  }
}

onMounted(loadCatalog);
</script>
