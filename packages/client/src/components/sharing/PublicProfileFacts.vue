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
.public-profile-facts { display: grid; gap: 0.3rem; margin: 0; font-size: 0.83rem; }
.public-profile-facts > div { display: flex; justify-content: space-between; gap: 0.75rem; align-items: baseline; }
.public-profile-facts dt { opacity: 0.72; flex: 0 0 auto; }
.public-profile-facts dd { margin: 0; text-align: end; overflow-wrap: anywhere; min-width: 0; }
</style>
