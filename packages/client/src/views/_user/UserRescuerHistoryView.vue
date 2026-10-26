<template>
  <main class="history" dir="rtl">
    <div class="history__shell">
      <header class="history__hero">
        <span><v-icon icon="mdi-history" /> سوابق امدادگری</span>
        <h1>ردّ هر مأموریت، روشن و قابل پیگیری.</h1>
        <p>مأموریت‌های خود را مرور کنید؛ زمان هر گام از سوابق ثبت‌شدهٔ سرور خوانده می‌شود.</p>
      </header>
      <div class="history__toolbar">
        <div><h2>مأموریت‌های من</h2><p>{{ history.total.value.toLocaleString('fa-IR') }} مأموریت</p></div>
        <v-btn color="primary" variant="tonal" prepend-icon="mdi-refresh" :loading="history.loading.value"
          @click="history.load()">تازه‌سازی</v-btn>
      </div>
      <v-alert v-if="history.error.value" type="error" variant="tonal" role="alert" class="mb-4">
        {{ history.error.value }} <v-btn variant="text" @click="history.load()">تلاش دوباره</v-btn>
      </v-alert>
      <v-alert v-if="history.linkError.value" type="warning" variant="tonal" role="status" class="mb-4">
        {{ history.linkError.value }}
      </v-alert>
      <v-progress-linear v-if="history.loading.value && !history.items.value.length" indeterminate color="primary"
        aria-label="دریافت سوابق مأموریت" />
      <section v-else-if="!history.items.value.length && !history.error.value" class="history__empty">
        <v-icon icon="mdi-lifebuoy" size="42" color="primary" />
        <h2>هنوز مأموریتی ندارید</h2>
        <p>پیشنهادهای مأموریت از بخش «پیشنهادها» در دسترس‌اند.</p>
        <v-btn to="/_user/proposals" color="primary" variant="tonal">مشاهدهٔ پیشنهادها</v-btn>
      </section>
      <div v-else class="history__grid">
        <section class="history__list" aria-label="فهرست مأموریت‌های امدادگری">
          <div class="history__items" role="region" aria-label="مأموریت‌ها؛ برای موارد بیشتر پیمایش کنید"
            :tabindex="history.items.value.length > 1 ? 0 : -1">
            <button v-for="item in history.items.value" :key="item.id" type="button" class="history__item"
              :class="{ 'history__item--selected': history.selected.value?.id === item.id }"
              :aria-pressed="history.selected.value?.id === item.id" @click="history.choose(item.id)">
              <v-icon icon="mdi-lifebuoy" color="primary" />
              <span><strong>{{ statusLabel(item.status) }}</strong><small>{{ new Date(item.createdAt).toLocaleString('fa-IR') }}</small></span>
              <v-icon v-if="item.status === 'completed'" icon="mdi-check-circle" color="success" size="20" />
            </button>
          </div>
          <div v-if="history.totalPages.value > 1" class="history__pages">
            <v-btn icon="mdi-chevron-right" aria-label="صفحهٔ قبل" variant="text"
              :disabled="history.page.value <= 1 || history.loading.value" @click="history.load(history.page.value - 1)" />
            <span>صفحهٔ {{ history.page.value.toLocaleString('fa-IR') }} از {{ history.totalPages.value.toLocaleString('fa-IR') }}</span>
            <v-btn icon="mdi-chevron-left" aria-label="صفحهٔ بعد" variant="text"
              :disabled="history.page.value >= history.totalPages.value || history.loading.value" @click="history.load(history.page.value + 1)" />
          </div>
        </section>
        <section class="history__detail" aria-label="جزئیات مأموریت">
          <v-progress-linear v-if="history.detailLoading.value" indeterminate color="primary" aria-label="دریافت جزئیات" />
          <v-alert v-if="history.detailError.value" type="error" variant="tonal" role="alert">
            {{ history.detailError.value }}
            <v-btn variant="text" @click="history.load()">تلاش دوباره</v-btn>
          </v-alert>
          <template v-if="history.selected.value">
            <span class="history__eyebrow">مأموریت · {{ new Date(history.selected.value.createdAt).toLocaleString('fa-IR') }}</span>
            <h2>{{ statusLabel(history.selected.value.status) }}</h2>
            <p>آخرین به‌روزرسانی: {{ new Date(history.selected.value.updatedAt).toLocaleString('fa-IR') }}</p>
            <p>شناسهٔ پیگیری: <bdi dir="ltr">{{ history.selected.value.id }}</bdi></p>
            <p v-if="history.selected.value.cancellationReason">دلیل پایان: {{ history.selected.value.cancellationReason.labelFa || history.selected.value.cancellationReason.label }}</p>
            <p v-if="history.selected.value.rating !== null" class="history__stars" :aria-label="`امتیاز ثبت‌شده: ${history.selected.value.rating} از ۵`">
              <span aria-hidden="true">{{ stars(history.selected.value.rating) }}</span> امتیاز درخواست‌کننده
            </p>
            <MissionTimelinePanel :key="history.selected.value.id" :mission="history.selected.value" audience="user" />
          </template>
        </section>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useRescuerHistory } from "@/composables/use-rescuer-history";
import MissionTimelinePanel from "@/components/mission/MissionTimelinePanel.vue";
import { statusLabel } from "@/mission/timeline-presentation";
import { stars } from "@/mission/rating-presentation";

const auth = useAuthStore();
const route = useRoute();
const history = useRescuerHistory(computed(() => auth.accessToken), computed(() => auth.user?.id ?? null),
  () => auth.ensureSession());
onMounted(() => { void history.load(1, typeof route.query.mission === "string" ? route.query.mission : undefined); });
watch(() => auth.user?.id, () => { history.reset(); if (auth.user?.id) void history.load(1); });
onBeforeUnmount(history.reset);
</script>

<style scoped>
.history { min-height: calc(100vh - 130px); padding: clamp(18px,4vw,52px) 18px 100px; background: radial-gradient(ellipse at 80% 0%,rgba(44,132,113,.1),transparent 52%),rgb(var(--v-theme-background)); }
.history__shell { max-width: 1100px; margin-inline: auto; }
.history__hero { border-radius: 28px; padding: clamp(24px,4vw,44px); background: linear-gradient(120deg,#143d42,#226e6a); color: white; }
.history__hero span { color: #ace7d6; font-weight: 700; }.history__hero h1 { font-size: clamp(1.6rem,3vw,2.5rem); margin: 16px 0 10px; }.history__hero p { color: #dcf3e9; line-height: 1.9; margin: 0; }
.history__toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin: 30px 0 17px; }.history__toolbar h2 { font-size: 1.25rem; margin: 0; }.history__toolbar p { font-size: .8rem; opacity: .7; margin: 4px 0 0; }
.history__grid { display: grid; grid-template-columns: minmax(250px,350px) minmax(0,1fr); gap: 18px; align-items: start; }
.history__list,.history__items { display: grid; gap: 10px; min-width: 0; }.history__item { width: 100%; display: flex; align-items: center; gap: 12px; text-align: start; font: inherit; cursor: pointer; padding: 17px; border: 1px solid rgba(98,146,137,.25); border-radius: 17px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface)); }.history__item:focus-visible { outline: 3px solid #26977b; }.history__item--selected { border-color: #269b7c; box-shadow: 0 0 0 2px rgba(38,155,124,.14); }.history__item span { flex: 1; display: grid; gap: 5px; min-width: 0; }.history__item small { opacity: .7; overflow-wrap: anywhere; }
.history__detail,.history__empty { border-radius: 23px; background: rgb(var(--v-theme-surface)); border: 1px solid rgba(98,146,137,.23); padding: clamp(22px,3vw,34px); }.history__detail bdi { overflow-wrap: anywhere; }.history__detail p { font-size: .84rem; opacity: .8; }.history__eyebrow { color: rgb(var(--v-theme-primary)); font-weight: 700; font-size: .82rem; }.history__stars { color: #ad6800; font-weight: 700; }.history__stars span { font-size: 1.25rem; letter-spacing: 2px; }
.history__pages { display: flex; align-items: center; justify-content: center; gap: 8px; font-size: .8rem; }.history__empty { text-align: center; padding: 60px 24px; }
:global(:root.dark) .history__stars { color: var(--bb-color-secondary); }
@media(max-width:780px) {
  .history__grid { grid-template-columns: 1fr; }
  .history__items { grid-template-columns: 1fr; max-height: min(42vh, 22rem); max-height: min(42dvh, 22rem); overflow-y: auto; padding: 3px 4px 6px; }
  .history__items:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: 17px; }
  .history__toolbar { flex-wrap: wrap; }
}
</style>
