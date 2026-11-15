<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth.ts';
import { landingRoute } from '@/router/index.ts';
import { toPersianDigits } from '@shared/geo.ts';

/**
 * Forbidden (403). The data model has exactly three roles (user, responder, admin) with no
 * finer permission scope, so this screen is shown exactly in one situation: a signed-in
 * non-admin reached an administrator URL. Everything is stated from that fact — no invented
 * "manager" permission, no fake audit entry — with the reference's centered composition
 * (design: admin-panel/states/05-forbidden).
 */
const router = useRouter();
const auth = useAuthStore();

const ROLE_LABEL: Record<string, string> = { user: 'کاربر', responder: 'امدادگر', admin: 'مدیر' };
const role = computed(() => auth.user?.role ?? undefined);
const roleLabel = computed(() => (role.value ? ROLE_LABEL[role.value] ?? role.value : 'بدون نقش'));
const destination = computed(() => landingRoute(role.value, auth.user?.mustCompleteSecurityQuestions ?? false));

const FORBIDDEN_CODE = toPersianDigits(403);
</script>

<template>
  <div class="forbidden">
    <div class="forbidden__mark" aria-hidden="true">
      <span class="mdi mdi-shield-lock-outline" />
    </div>
    <h2 class="forbidden__title">دسترسی به این بخش برای نقش شما مجاز نیست</h2>
    <p class="forbidden__body">پنل مدیریت فقط برای حساب‌های با نقش مدیر باز است. اگر برای انجام کارتان به این بخش نیاز دارید، با یک مدیر سامانه هماهنگ کنید؛ تغییر نقش از همین‌جا برای شما ممکن نیست.</p>
    <button type="button" class="primary-button forbidden__cta" data-testid="forbidden-back" @click="router.push({ name: destination })">
      <span>بازگشت</span>
      <span class="mdi mdi-arrow-left" aria-hidden="true" />
    </button>
    <p class="forbidden__code">کد خطا: {{ FORBIDDEN_CODE }} · نقش فعلی: {{ roleLabel }}</p>
  </div>
</template>

<style scoped>
.forbidden { display: grid; gap: 14px; justify-items: center; text-align: center; padding: 28px 24px 8px; max-width: 480px; margin-inline: auto; }
.forbidden__mark { inline-size: 88px; block-size: 88px; border-radius: 50%; background: color-mix(in srgb, var(--warning) 22%, transparent); display: grid; place-items: center; }
.forbidden__mark .mdi { font-size: 40px; color: #8a6d1b; }
.forbidden__title { margin: 0; font-size: 20px; font-weight: 800; }
.forbidden__body { margin: 0; font-size: 13px; color: var(--muted); line-height: 2; }
.forbidden__cta { display: inline-flex; gap: 8px; }
.forbidden__code { margin: 0; font-size: 11px; color: var(--muted); }
</style>
