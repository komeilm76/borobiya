<template>
  <v-app>
    <v-app-bar class="app-topbar px-sm-6" flat height="76">
      <RouterLink class="brand-link" to="/_public/landing" aria-label="بازگشت به صفحهٔ اصلی بوروبیا">
        <span class="brand-mark" aria-hidden="true">
          <v-icon icon="mdi-plus" size="26" />
        </span>
        <span class="brand-copy">
          <span class="brand-name">بوروبیا</span>
          <span class="brand-tagline">شبکهٔ امداد و همراهی</span>
        </span>
      </RouterLink>

      <v-spacer />

      <nav class="top-nav" aria-label="پیمایش اصلی">
        <v-btn class="nav-button" to="/_public/landing" variant="text" rounded="lg">
          خانه
        </v-btn>
        <v-btn class="nav-button d-none d-sm-flex" to="/_user/dashboard" variant="text" rounded="lg">
          پیشخوان
        </v-btn>
        <v-btn class="login-button" to="/_auth/login" color="primary" variant="flat" rounded="lg">
          <v-icon class="me-1" icon="mdi-account-outline" />
          ورود
        </v-btn>
      </nav>
    </v-app-bar>

    <v-main class="app-main">
      <RouterView v-slot="{ Component, route }">
        <Transition mode="out-in" name="page-fade">
          <component :is="Component" :key="route.fullPath" />
        </Transition>
      </RouterView>
    </v-main>

    <footer class="app-footer">
      <span>بوروبیا، برای روزهایی که کنار هم بودن مهم است.</span>
      <span class="footer-status"><span class="status-dot" /> نسخهٔ اولیه</span>
    </footer>
  </v-app>
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from "vue-router";
</script>
