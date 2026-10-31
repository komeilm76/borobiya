<template>
  <div class="public-health" aria-labelledby="public-health-title">
    <div class="public-health__heading">
      <p class="public-section__eyebrow">شفافیت در دسترسی</p>
      <h1 id="public-health-title">وضعیت ارتباط با سرور</h1>
      <p>از همین مرورگر، پاسخ‌گویی API بوروبیا را بررسی کنید.</p>
    </div>

    <section class="public-health__card" aria-labelledby="health-probe-title">
      <div class="public-health__badge" :class="`public-health__badge--${state}`" aria-hidden="true">
        <v-icon :icon="state === 'online' ? 'mdi-check' : state === 'unavailable' ? 'mdi-alert-outline' : 'mdi-progress-clock'" size="30" />
      </div>
      <div class="public-health__body" role="status" aria-live="polite">
        <p class="public-section__eyebrow">بررسی لحظه‌ای API</p>
        <h2 id="health-probe-title">{{ state === 'online' ? 'سرور پاسخ می‌دهد' : state === 'unavailable' ? 'بررسی ناموفق بود' : 'در حال بررسی ارتباط…' }}</h2>
        <p v-if="state === 'online'">این مرورگر توانست به سرویس API متصل شود.</p>
        <p v-else-if="state === 'unavailable'">پاسخ موفق از API دریافت نشد؛ ممکن است مشکل از سرور یا شبکه باشد. دوباره تلاش کنید.</p>
        <p v-else>لطفاً چند لحظه منتظر بمانید.</p>
        <small v-if="checkedAt">آخرین بررسی: {{ new Date(checkedAt).toLocaleTimeString('fa-IR') }}</small>
      </div>
      <button class="public-health__retry" type="button" :disabled="state === 'checking'" @click="checkHealth">
        <v-icon icon="mdi-refresh" size="19" aria-hidden="true" /> تلاش دوباره
      </button>
    </section>

    <div class="public-health__note">
      <v-icon icon="mdi-information-outline" size="23" aria-hidden="true" />
      <p>این بررسی فقط پاسخ‌گویی API را نشان می‌دهد؛ وضعیت نقشه، GPS، شبکهٔ همراهان یا امدادرسانی را تأیید نمی‌کند.</p>
    </div>

    <div class="public-health__links">
      <RouterLink class="public-button public-button--outline" to="/_public/landing">بازگشت به خانه</RouterLink>
      <RouterLink class="public-button public-button--primary" to="/_auth/login">ورود به حساب <v-icon icon="mdi-arrow-left" size="20" aria-hidden="true" /></RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { apiRoutes } from "@shared/api";
import { requestJson } from "@/api/http";

type ProbeState = "checking" | "online" | "unavailable";
const state = ref<ProbeState>("checking");
const checkedAt = ref<number | null>(null);
let request: AbortController | null = null;

async function checkHealth(): Promise<void> {
  request?.abort();
  const controller = new AbortController();
  request = controller;
  state.value = "checking";
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await requestJson<unknown>(apiRoutes.public.health.url, { signal: controller.signal, cache: "no-store" });
    if (request !== controller) return;
    state.value = response !== null && typeof response === "object" && "status" in response && response.status === "ok"
      ? "online" : "unavailable";
  } catch {
    if (request !== controller) return;
    state.value = "unavailable";
  } finally {
    clearTimeout(timeout);
    if (request === controller) {
      checkedAt.value = Date.now();
      request = null;
    }
  }
}

onMounted(() => { void checkHealth(); });
onBeforeUnmount(() => { request?.abort(); request = null; });
</script>
