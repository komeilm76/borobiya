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
        <v-btn
          v-if="auth.isAuthenticated && auth.mustCompleteSecurityQuestions"
          class="nav-button d-none d-sm-flex"
          to="/_user/complete-security-questions"
          variant="text"
          rounded="lg"
        >
          تکمیل حساب
        </v-btn>
        <v-btn
          v-else-if="auth.isAuthenticated"
          class="nav-button d-none d-sm-flex"
          to="/_user/dashboard"
          variant="text"
          rounded="lg"
        >
          پیشخوان
        </v-btn>
        <v-btn v-if="!auth.isAuthenticated" class="login-button" to="/_auth/login" color="primary" variant="flat" rounded="lg">
          <v-icon class="me-1" icon="mdi-account-outline" />
          ورود
        </v-btn>
        <v-btn v-else class="login-button" color="primary" variant="tonal" rounded="lg" @click="logout">
          خروج
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
import { onMounted } from "vue";
import { RouterLink, RouterView, useRouter } from "vue-router";
import { pinia } from "./stores";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore(pinia);
const router = useRouter();

async function logout(): Promise<void> {
  try {
    await auth.logout();
  } catch {
    // Clear the local session and return to the guest flow even if the network is unavailable.
  } finally {
    await router.replace("/_auth/login");
  }
}

onMounted(async () => {
  await auth.ensureSession();
  if (auth.isAuthenticated && auth.mustCompleteSecurityQuestions) {
    await router.replace("/_user/complete-security-questions");
  }
});
</script>
