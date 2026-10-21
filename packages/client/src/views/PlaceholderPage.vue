<template>
  <section class="page-shell mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 sm:py-12">
    <div class="hero-grid">
      <div class="hero-copy-block">
        <div class="eyebrow">
          <span class="eyebrow-dot" />
          {{ area }}
          <span class="eyebrow-separator">/</span>
          فضای امن برای همراهی
        </div>
        <h1 class="hero-title">{{ title }}</h1>
        <p class="hero-copy">{{ description }}</p>

        <div class="hero-chips">
          <v-chip prepend-icon="mdi-shield-check-outline" color="primary" variant="tonal" rounded="lg">
            حریم خصوصی در اولویت
          </v-chip>
          <v-chip prepend-icon="mdi-account-group-outline" color="secondary" variant="tonal" rounded="lg">
            همراهی جامعه‌محور
          </v-chip>
        </div>
      </div>

      <v-card class="welcome-card" elevation="0" rounded="xl">
        <v-card-text class="welcome-card-content">
          <div class="welcome-symbol" aria-hidden="true">
            <span class="symbol-orbit orbit-one" />
            <span class="symbol-orbit orbit-two" />
            <v-icon :icon="icon" size="44" />
            <span class="symbol-spark" />
          </div>
          <div class="status-label">
            <span class="status-dot" />
            در حال آماده‌سازی
          </div>
          <h2 class="welcome-title">این بخش به‌زودی آماده می‌شود</h2>
          <p class="welcome-copy">
            چارچوب برنامه آماده است؛ قابلیت‌های این صفحه در گام‌های بعدی به‌تدریج اضافه می‌شوند.
          </p>
          <v-btn to="/_public/landing" color="primary" variant="flat" rounded="lg" size="large" block>
            <v-icon class="me-2" icon="mdi-home-outline" />
            بازگشت به خانه
          </v-btn>
        </v-card-text>
      </v-card>
    </div>

    <div class="skeleton-note">
      <span class="note-icon"><v-icon icon="mdi-sparkles" size="20" /></span>
      <span>
        <strong>اسکلت رابط کاربری</strong>
        <span class="note-copy">مسیرها، پوستهٔ برنامه و سامانهٔ طراحی پایه راه‌اندازی شده‌اند.</span>
      </span>
      <span class="note-version">T1.0.5</span>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  area: string;
  description: string;
  icon: string;
}>();
</script>
