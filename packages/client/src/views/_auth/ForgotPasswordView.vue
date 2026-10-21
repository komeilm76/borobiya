<template>
  <section class="auth-page mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
    <div class="auth-layout">
      <aside class="auth-intro">
        <span class="auth-kicker"><span class="eyebrow-dot" /> بازیابی امن حساب</span>
        <h1 class="auth-hero-title">دوباره به<br /><span>حساب‌تان برسید.</span></h1>
        <p class="auth-hero-copy">
          با پاسخ به پرسش‌هایی که هنگام ساخت حساب انتخاب کرده‌اید، گذرواژهٔ تازه‌ای تنظیم کنید.
        </p>
        <div class="recovery-steps" aria-label="مراحل بازیابی گذرواژه">
          <div v-for="(label, index) in stepLabels" :key="label" class="recovery-step" :class="{ 'is-current': step === index + 1, 'is-complete': step > index + 1 }">
            <span class="recovery-step-number">{{ step > index + 1 ? '✓' : faNumber(index + 1) }}</span>
            <span>{{ label }}</span>
          </div>
        </div>
        <div class="auth-trust-row">
          <span class="trust-icon"><v-icon icon="mdi-key-chain-variant" /></span>
          <span><strong>بازیابی محرمانه</strong><small>پاسخ‌ها فقط برای بررسی این درخواست استفاده می‌شوند.</small></span>
        </div>
      </aside>

      <v-card class="auth-card" elevation="0" rounded="xl">
        <v-card-text class="auth-card-body">
          <template v-if="step < 4">
            <div class="auth-card-heading">
              <span class="auth-card-icon"><v-icon :icon="step === 3 ? 'mdi-lock-reset' : 'mdi-shield-key-outline'" size="25" /></span>
              <div>
                <p class="auth-eyebrow">مرحلهٔ {{ faNumber(step) }} از ۳</p>
                <h2>{{ currentTitle }}</h2>
              </div>
            </div>

            <v-alert v-if="formError" class="auth-alert" type="error" variant="tonal" density="comfortable" role="alert">
              {{ formError }}
            </v-alert>

            <form v-if="step === 1" class="auth-form" @submit.prevent="requestQuestions">
              <p class="auth-form-intro">نام کاربری حساب را وارد کنید تا پرسش‌های امنیتی نمایش داده شوند.</p>
              <v-text-field
                v-model="username"
                label="نام کاربری"
                autocomplete="username"
                autocapitalize="none"
                spellcheck="false"
                dir="ltr"
                prepend-inner-icon="mdi-account-outline"
                variant="outlined"
                rounded="lg"
                density="comfortable"
                :disabled="submitting"
              />
              <v-btn class="auth-submit" color="primary" type="submit" size="large" rounded="lg" :loading="submitting" block>
                نمایش پرسش‌ها <v-icon class="ms-2" icon="mdi-arrow-left" />
              </v-btn>
            </form>

            <form v-else-if="step === 2" class="auth-form" @submit.prevent="verifyAnswers">
              <p class="auth-form-intro">پاسخ‌ها را همان‌طور که هنگام ساخت حساب ثبت کردید وارد کنید.</p>
              <div v-for="question in challengeQuestions" :key="question.id" class="recovery-question">
                <p>{{ question.text }}</p>
                <v-text-field
                  v-model="question.answer"
                  label="پاسخ شما"
                  autocomplete="off"
                  prepend-inner-icon="mdi-comment-question-outline"
                  variant="outlined"
                  rounded="lg"
                  density="comfortable"
                  hide-details="auto"
                  :disabled="submitting"
                />
              </div>
              <div class="auth-button-row">
                <v-btn variant="tonal" rounded="lg" :disabled="submitting" @click="step = 1">بازگشت</v-btn>
                <v-btn class="auth-submit auth-submit-inline" color="primary" type="submit" size="large" rounded="lg" :loading="submitting">
                  بررسی پاسخ‌ها <v-icon class="ms-2" icon="mdi-arrow-left" />
                </v-btn>
              </div>
            </form>

            <form v-else class="auth-form" @submit.prevent="resetPassword">
              <p class="auth-form-intro">یک گذرواژهٔ تازه بسازید تا دوباره به حساب‌تان دسترسی پیدا کنید.</p>
              <v-text-field
                v-model="newPassword"
                label="گذرواژهٔ تازه"
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
                label="تکرار گذرواژهٔ تازه"
                autocomplete="new-password"
                :type="showPassword ? 'text' : 'password'"
                prepend-inner-icon="mdi-lock-check-outline"
                variant="outlined"
                rounded="lg"
                density="comfortable"
                :disabled="submitting"
              />
              <v-checkbox v-model="showPassword" class="auth-show-password" label="نمایش گذرواژه‌ها" color="primary" density="compact" hide-details />
              <div class="auth-button-row">
                <v-btn variant="tonal" rounded="lg" :disabled="submitting" @click="restartRecovery">شروع دوباره</v-btn>
                <v-btn class="auth-submit auth-submit-inline" color="primary" type="submit" size="large" rounded="lg" :loading="submitting">
                  تغییر گذرواژه <v-icon class="ms-2" icon="mdi-arrow-left" />
                </v-btn>
              </div>
            </form>
          </template>

          <div v-else class="auth-success-state">
            <span class="auth-success-icon"><v-icon icon="mdi-check" size="34" /></span>
            <p class="auth-eyebrow">بازیابی انجام شد</p>
            <h2>گذرواژهٔ تازه ذخیره شد</h2>
            <p>اکنون می‌توانید با گذرواژهٔ جدید وارد بوروبیا شوید.</p>
            <v-btn to="/_auth/login?reset=success" color="primary" size="large" rounded="lg" block>
              رفتن به صفحهٔ ورود <v-icon class="ms-2" icon="mdi-arrow-left" />
            </v-btn>
          </div>

          <p v-if="step < 4" class="auth-switch-copy">
            گذرواژه را به یاد آوردید؟
            <RouterLink class="text-link text-link-strong" to="/_auth/login">بازگشت به ورود</RouterLink>
          </p>
          <p class="auth-privacy-note">
            <v-icon icon="mdi-lock-check-outline" size="16" />
            بوروبیا هیچ‌گاه پاسخ‌های ثبت‌شدهٔ شما را نمایش نمی‌دهد.
          </p>
        </v-card-text>
      </v-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink } from "vue-router";
import { z } from "zod";
import {
  forgotPasswordRequestSchema,
  forgotPasswordQuestionsResponseSchema,
  forgotPasswordResetSchema,
  forgotPasswordVerifySchema,
  resetPasswordResponseSchema
} from "@shared/index";
import { authApiRoutes, requestJson } from "../../api/http";
import { friendlyErrorMessage } from "../../api/error-message";

interface ChallengeQuestion {
  id: string;
  text: string;
  answer: string;
}

const resetTokenResponseSchema = z.strictObject({ resetToken: z.string().min(1) });

const step = ref<1 | 2 | 3 | 4>(1);
const username = ref("");
const challengeQuestions = ref<ChallengeQuestion[]>([]);
const resetToken = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const showPassword = ref(false);
const submitting = ref(false);
const formError = ref("");
const stepLabels = ["حساب", "پرسش‌ها", "گذرواژه"];
const currentTitle = computed(() => step.value === 1 ? "حساب‌تان را پیدا کنید" : step.value === 2 ? "پاسخ پرسش‌ها" : "گذرواژهٔ تازه");

function faNumber(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

function restartRecovery(): void {
  step.value = 1;
  challengeQuestions.value = [];
  resetToken.value = "";
  newPassword.value = "";
  confirmPassword.value = "";
  formError.value = "";
}

async function requestQuestions(): Promise<void> {
  formError.value = "";
  const parsed = forgotPasswordRequestSchema.safeParse({ username: username.value.trim().toLowerCase() });
  if (!parsed.success) {
    formError.value = "نام کاربری معتبر وارد کنید.";
    return;
  }

  submitting.value = true;
  try {
    const response = forgotPasswordQuestionsResponseSchema.parse(await requestJson<unknown>(authApiRoutes.forgotPasswordRequest.url, {
      method: "POST",
      body: parsed.data
    }));
    challengeQuestions.value = response.questionIds.map((id, index) => ({
      id,
      text: response.questions[index] ?? "پرسش امنیتی",
      answer: ""
    }));
    step.value = 2;
  } catch (error) {
    formError.value = friendlyErrorMessage(error, "دریافت پرسش‌های امنیتی انجام نشد.");
  } finally {
    submitting.value = false;
  }
}

async function verifyAnswers(): Promise<void> {
  formError.value = "";
  const parsed = forgotPasswordVerifySchema.safeParse({
    username: username.value.trim().toLowerCase(),
    answers: challengeQuestions.value.map(({ id, answer }) => ({ questionId: id, answer }))
  });
  if (!parsed.success) {
    formError.value = "پاسخ هر سه پرسش را وارد کنید.";
    return;
  }

  submitting.value = true;
  try {
    const response = resetTokenResponseSchema.parse(await requestJson<unknown>(authApiRoutes.forgotPasswordVerify.url, {
      method: "POST",
      body: parsed.data
    }));
    resetToken.value = response.resetToken;
    step.value = 3;
  } catch (error) {
    formError.value = friendlyErrorMessage(error, "پاسخ‌ها تأیید نشدند. دوباره بررسی کنید.");
  } finally {
    submitting.value = false;
  }
}

async function resetPassword(): Promise<void> {
  formError.value = "";
  const parsed = forgotPasswordResetSchema.safeParse({
    resetToken: resetToken.value,
    newPassword: newPassword.value,
    confirmPassword: confirmPassword.value
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some(({ path }) => path[0] === "confirmPassword");
    formError.value = mismatch ? "گذرواژه و تکرار آن یکسان نیستند." : "گذرواژهٔ تازه را بررسی کنید.";
    return;
  }

  submitting.value = true;
  try {
    const response = await requestJson<unknown>(authApiRoutes.forgotPasswordReset.url, {
      method: "POST",
      body: parsed.data
    });
    resetPasswordResponseSchema.parse(response);
    step.value = 4;
    resetToken.value = "";
  } catch (error) {
    formError.value = friendlyErrorMessage(error, "تغییر گذرواژه انجام نشد. دوباره تلاش کنید.");
  } finally {
    submitting.value = false;
  }
}
</script>
