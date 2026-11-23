<template>
  <dl class="public-profile-facts">
    <div v-if="showUsername"><dt>نام کاربری</dt><dd dir="auto">{{ profile.username }}</dd></div>
    <div v-if="profile.category"><dt>دسته‌بندی</dt><dd>{{ profile.category }}</dd></div>
    <div v-if="profile.avgRating !== null"><dt>میانگین امتیاز</dt><dd>{{ profile.avgRating.toLocaleString('fa-IR') }} از ۵</dd></div>
    <div><dt>وضعیت حساب</dt><dd>{{ profile.isOnline ? 'آنلاین' : 'آفلاین' }}</dd></div>
  </dl>
</template>

<script setup lang="ts">
import type { UserSearchResult } from "@shared/index";
withDefaults(defineProps<{ profile: UserSearchResult; showUsername?: boolean }>(), { showUsername: true });
</script>

<style scoped>
.public-profile-facts { display: grid; gap: var(--bb-rhythm-r030); margin: 0; font-size: var(--bb-sharing-font-facts); }
.public-profile-facts > div { display: flex; justify-content: space-between; gap: var(--bb-rhythm-r075); align-items: baseline; }
.public-profile-facts dt { opacity: var(--bb-finish-profileFactCaptionOpacity); flex: 0 0 auto; }
.public-profile-facts dd { margin: 0; text-align: end; overflow-wrap: anywhere; min-width: 0; }
</style>
