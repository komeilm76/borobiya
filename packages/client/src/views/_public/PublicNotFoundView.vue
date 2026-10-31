<template>
  <div class="public-not-found">
    <div class="public-not-found__symbol" aria-hidden="true"><v-icon icon="mdi-map-marker-question-outline" size="48" /></div>
    <p class="public-section__eyebrow">نشانی نامعتبر · ۴۰۴</p>
    <h1>این صفحه را پیدا نکردیم.</h1>
    <p>شاید نشانی تغییر کرده یا پیوند نادرست باشد. از صفحهٔ اصلی دوباره شروع کنید.</p>
    <div class="public-health__links">
      <RouterLink class="public-button public-button--primary" to="/_public/landing">بازگشت به خانه</RouterLink>
      <RouterLink class="public-button public-button--outline" to="/_auth/login">ورود به حساب</RouterLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
</script>
