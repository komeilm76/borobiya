<script setup lang="ts">
/**
 * Per-screen heading lockup for the auth family: a soft icon tile beside a small
 * eyebrow line and the screen title, as designed in the auth references.
 */
defineProps<{
  /** Small muted line above the title, e.g. «خوش آمدید». */
  eyebrow: string;
  /** Screen title, e.g. «ورود به حساب». */
  title: string;
  /** MDI icon rendered inside the soft tile. */
  icon: string;
}>();
</script>

<template>
  <div class="auth-heading">
    <span class="auth-heading__tile"><span :class="['mdi', icon]" aria-hidden="true" /></span>
    <span class="auth-heading__text">
      <span class="auth-heading__eyebrow">{{ eyebrow }}</span>
      <h2 class="auth-heading__title">{{ title }}</h2>
    </span>
  </div>
</template>

<style scoped>
.auth-heading { display: flex; align-items: center; gap: 12px; }
.auth-heading__tile {
  display: grid;
  place-items: center;
  inline-size: 54px;
  block-size: 54px;
  flex: 0 0 auto;
  border-radius: var(--r16);
  background: var(--primary-soft);
  color: var(--primary);
  font-size: 27px;
}
.auth-heading__text { display: grid; gap: 2px; }
.auth-heading__eyebrow { font-size: 12px; color: var(--muted); }
.auth-heading__title { margin: 0; font-size: 21px; font-weight: 800; line-height: 1.4; }
</style>
