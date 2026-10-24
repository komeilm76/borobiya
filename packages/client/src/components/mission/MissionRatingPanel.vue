<template>
  <section v-if="rating.eligible.value" class="rating" dir="rtl" aria-label="امتیازدهی به امدادگر">
    <div class="rating__header">
      <div><span class="rating__eyebrow">نظر شما مهم است</span><h3>امتیاز به امدادگر</h3></div>
      <v-btn variant="text" size="small" prepend-icon="mdi-refresh" :loading="rating.loading.value"
        :disabled="rating.submitting.value" @click="rating.load()">تازه‌سازی</v-btn>
    </div>
    <v-alert v-if="rating.error.value" type="warning" variant="tonal" role="alert" class="mb-3">{{ rating.error.value }}</v-alert>
    <v-progress-linear v-if="rating.loading.value" indeterminate color="primary" aria-label="بررسی امتیاز قبلی" />
    <p v-else-if="rating.rating.value !== null" class="rating__saved" role="status">
      <span :aria-label="`امتیاز ثبت‌شده: ${rating.rating.value} از ۵`">{{ stars(rating.rating.value) }}</span>
      امتیاز شما ثبت شد. برای هر مأموریت تنها یک امتیاز می‌توان ثبت کرد.
    </p>
    <div v-else-if="rating.loaded.value">
      <p>پس از پایان مأموریت، یک‌بار از ۱ تا ۵ ستاره انتخاب کنید.</p>
      <div class="rating__choices" role="group" aria-label="انتخاب امتیاز از ۱ تا ۵">
        <button v-for="value in 5" :key="value" type="button" :aria-label="`${value} از ۵ ستاره`"
          :aria-pressed="rating.score.value === value" :disabled="rating.submitting.value"
          @click="rating.score.value = value">{{ rating.score.value >= value ? '★' : '☆' }}</button>
      </div>
      <v-textarea v-model="rating.comment.value" label="نظر شما (اختیاری)" variant="outlined" rows="2"
        counter="500" maxlength="500" :disabled="rating.submitting.value" />
      <v-btn color="primary" variant="flat" rounded="lg" :loading="rating.submitting.value"
        :disabled="!rating.canSubmit.value" @click="rating.submit()">ثبت امتیاز</v-btn>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, toRef } from "vue";
import type { Mission } from "@shared/index";
import { useAuthStore } from "@/stores/auth";
import { useMissionRating } from "@/composables/use-mission-rating";
import { stars } from "@/mission/rating-presentation";

const props = defineProps<{ mission: Mission | null }>();
const auth = useAuthStore();
const rating = useMissionRating(toRef(props, "mission"), computed(() => auth.accessToken),
  computed(() => auth.user?.id ?? null), () => auth.ensureSession());
</script>

<style scoped>
.rating { border: 1px solid rgba(28,112,95,.22); background: rgb(var(--v-theme-surface)); border-radius: 22px; padding: clamp(18px,3vw,28px); margin-block: 20px; }
.rating__header { display: flex; align-items: start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }.rating__header h3 { margin: 5px 0 15px; font-size: 1.15rem; }.rating__eyebrow { color: #16826c; font-weight: 700; font-size: .8rem; }
.rating p { font-size: .85rem; line-height: 1.8; }.rating__saved span { display: block; color: #ad6800; font-size: 1.65rem; letter-spacing: 3px; }.rating__choices { display: flex; gap: 7px; margin: 12px 0 22px; }.rating__choices button { border: 1px solid rgba(98,146,137,.4); border-radius: 12px; background: transparent; color: #ad6800; font-size: 2rem; cursor: pointer; width: 48px; height: 48px; line-height: 1; }.rating__choices button:focus-visible { outline: 3px solid #26977b; outline-offset: 2px; }.rating__choices button:disabled { opacity: .5; cursor: wait; }
</style>
