<template>
  <section class="auth-page mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
    <div class="auth-layout">
      <aside class="auth-intro">
        <span class="auth-kicker"><span class="eyebrow-dot" /> ورود امن به بوروبیا</span>
        <h1 class="auth-hero-title">با هم،<br /><span>آماده‌تر</span> هستیم.</h1>
        <p class="auth-hero-copy">
          وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید و در زمان نیاز، سریع‌تر به کمک برسید.
        </p>
        <div class="auth-trust-row">
          <span class="trust-icon"><v-icon icon="mdi-shield-check-outline" /></span>
          <span>
            <strong>حساب شما امن می‌ماند</strong>
            <small>اطلاعات ورود شما فقط برای دسترسی به حساب استفاده می‌شود.</small>
          </span>
        </div>
        <div class="auth-decoration" aria-hidden="true">
          <span class="auth-ring ring-large" />
          <span class="auth-ring ring-small" />
          <span class="auth-cross"><v-icon icon="mdi-plus" size="52" /></span>
          <span class="auth-spark spark-one" />
          <span class="auth-spark spark-two" />
        </div>
      </aside>

      <v-card class="auth-card" elevation="0" rounded="xl">
        <v-card-text class="auth-card-body">
          <div class="auth-card-heading">
            <span class="auth-card-icon"><v-icon icon="mdi-account-key-outline" size="25" /></span>
            <div>
              <p class="auth-eyebrow">خوش آمدید</p>
              <h2>ورود به حساب</h2>
            </div>
          </div>

          <v-alert v-if="registered" class="auth-alert" type="success" variant="tonal" density="comfortable">
            حساب شما ساخته شد. برای ادامه وارد شوید.
          </v-alert>
          <v-alert v-else-if="resetComplete" class="auth-alert" type="success" variant="tonal" density="comfortable">
            گذرواژه با موفقیت تغییر کرد. حالا می‌توانید وارد شوید.
          </v-alert>
          <v-alert v-if="formError" class="auth-alert" type="error" variant="tonal" density="comfortable" role="alert">
            {{ formError }}
          </v-alert>

          <form class="auth-form" @submit.prevent="submitLogin">
            <v-text-field
              v-model="username"
              label="نام کاربری"
              name="username"
              autocomplete="username"
              autocapitalize="none"
              spellcheck="false"
              dir="ltr"
              prepend-inner-icon="mdi-account-outline"
              variant="outlined"
              rounded="lg"
              density="comfortable"
              hide-details="auto"
              :disabled="submitting"
            />
            <v-text-field
              v-model="password"
              label="گذرواژه"
              name="password"
              autocomplete="current-password"
              :type="showPassword ? 'text' : 'password'"
              prepend-inner-icon="mdi-lock-outline"
              :append-inner-icon="showPassword ? 'mdi-eye-off-outline' : 'mdi-eye-outline'"
              variant="outlined"
              rounded="lg"
              density="comfortable"
              hide-details="auto"
              :disabled="submitting"
              @click:append-inner="showPassword = !showPassword"
            />

            <div class="auth-form-options">
              <RouterLink class="text-link" to="/_auth/forgot-password">گذرواژه را فراموش کرده‌اید؟</RouterLink>
            </div>

            <v-btn
              class="auth-submit"
              color="primary"
              type="submit"
              size="large"
              rounded="lg"
              :loading="submitting"
              :disabled="submitting"
              block
            >
              ورود به حساب
              <v-icon class="ms-2" icon="mdi-arrow-left" />
            </v-btn>
          </form>

          <div class="auth-divider"><span>یا</span></div>
          <p class="auth-switch-copy">
            هنوز حساب ندارید؟
            <RouterLink class="text-link text-link-strong" to="/_auth/register">ساخت حساب جدید</RouterLink>
          </p>
          <p class="auth-privacy-note">
            <v-icon icon="mdi-lock-check-outline" size="16" />
            با ورود، اطلاعات حساب‌تان محرمانه می‌ماند.
          </p>
        </v-card-text>
      </v-card>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { loginSchema } from "@shared/index";
import { friendlyErrorMessage } from "../../api/error-message";
import { loginDeviceName } from "../../device/capacitor";
import { resolvePostLoginDestination } from "../../router/guards";
import { useAuthStore } from "../../stores/auth";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const username = ref("");
const password = ref("");
const showPassword = ref(false);
const submitting = ref(false);
const formError = ref("");
const registered = computed(() => route.query.registered === "1");
const resetComplete = computed(() => route.query.reset === "success");

async function submitLogin(): Promise<void> {
  formError.value = "";
  const parsed = loginSchema.safeParse({ username: username.value.trim().toLowerCase(), password: password.value });
  if (!parsed.success) {
    formError.value = "نام کاربری یا گذرواژه را بررسی کنید.";
    return;
  }

  submitting.value = true;
  // Session restoration can redirect an already-open auth view while login is in flight.
  // Keep the original return path rather than reading the now-changed route afterwards.
  const returnTo = route.query.redirect;
  try {
    // The device label a native build reports (spec §7.3) is looked up only once the credentials have
    // parsed, and it can never cost anyone their login: `loginDeviceName()` resolves to `undefined` on
    // web and swallows any plugin failure, so the body simply omits the field and the server derives its
    // own short label from the `User-Agent`. The store re-parses the whole body, so a device ROM that
    // reports something absurd is bounded before it leaves the browser.
    const deviceName = await loginDeviceName();
    await auth.login(deviceName ? { ...parsed.data, deviceName } : parsed.data);
    await router.replace(resolvePostLoginDestination(returnTo, auth));
  } catch (error) {
    formError.value = friendlyErrorMessage(error, "ورود انجام نشد. دوباره تلاش کنید.");
  } finally {
    submitting.value = false;
  }
}
</script>
