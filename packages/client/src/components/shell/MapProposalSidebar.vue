<template>
  <v-dialog
    v-model="open"
    class="map-proposal__dialog"
    :width="360"
    transition="slide-x-reverse-transition"
    aria-labelledby="map-proposal-title"
  >
    <template #activator="{ props: activatorProps }">
      <div class="map-proposal__launcher">
        <v-btn
          v-bind="activatorProps"
          class="map-proposal__bell"
          color="surface"
          variant="flat"
          :aria-label="bellLabel"
          title="پیشنهادهای مأموریت"
          @click="inbox.refresh()"
        >
          <v-badge
            :model-value="inbox.failed || inbox.total > 0"
            :content="inbox.total > 99 ? '99+' : inbox.total.toLocaleString('fa-IR')"
            :dot="inbox.failed"
            :color="inbox.failed ? 'warning' : 'error'"
            aria-hidden="true"
          >
            <v-icon icon="mdi-bell-outline" size="24" aria-hidden="true" />
          </v-badge>
        </v-btn>
      </div>
    </template>

    <v-card class="map-proposal__panel" rounded="xl" elevation="0">
      <v-card-title class="map-proposal__header">
        <div class="map-proposal__header-copy">
          <span class="map-proposal__eyebrow">میز امدادگر</span>
          <h2 id="map-proposal-title">پیشنهادهای مأموریت</h2>
          <span class="map-proposal__header-count" aria-live="polite">
            {{ inbox.failed ? 'تعداد نامشخص' : `${inbox.total.toLocaleString('fa-IR')} پیشنهاد در انتظار` }}
          </span>
        </div>
        <div class="map-proposal__header-actions">
          <v-btn icon="mdi-refresh" variant="text" :loading="inbox.loading" :disabled="inbox.loading"
            aria-label="به‌روزرسانی پیشنهادها" @click="inbox.refresh()" />
          <v-btn icon="mdi-close" variant="text" aria-label="بستن پیشنهادها" @click="open = false" />
        </div>
      </v-card-title>

      <v-card-text class="map-proposal__scroll">
        <div v-if="inbox.loading && !inbox.proposals.length && !inbox.failed" class="map-proposal__state" role="status">
          <v-progress-circular indeterminate color="primary" size="28" aria-hidden="true" />
          <span>در حال دریافت پیشنهادها…</span>
        </div>
        <div v-if="inbox.failed" class="map-proposal__notice" role="alert">
          <v-icon icon="mdi-wifi-alert" size="20" aria-hidden="true" />
          <span>{{ inbox.proposals.length ? 'به‌روزرسانی ناموفق بود؛ پیشنهادهای زیر ممکن است قدیمی باشند.' : 'دریافت پیشنهادها ناموفق بود. دوباره تلاش کنید.' }}</span>
          <v-btn variant="text" color="primary" size="small" :disabled="inbox.loading" @click="inbox.refresh()">تلاش دوباره</v-btn>
        </div>
        <div v-if="inbox.acceptedMissionId" class="map-proposal__state" role="status">
          <v-icon icon="mdi-check-circle-outline" size="30" color="success" aria-hidden="true" />
          <strong>مأموریت پذیرفته شد</strong>
          <span>پیشنهادهای دیگر شما خودکار بسته شدند.</span>
          <RouterLink class="map-proposal__inline-link" to="/_user/mission" @click="open = false">مشاهدهٔ مأموریت</RouterLink>
        </div>
        <div v-else-if="!inbox.failed && !inbox.loading && !inbox.proposals.length" class="map-proposal__state" role="status">
          <v-icon icon="mdi-bell-check-outline" size="32" color="primary" aria-hidden="true" />
          <strong>پیشنهاد جدیدی ندارید</strong>
          <span>به محض رسیدن پیشنهاد، اینجا نمایش داده می‌شود.</span>
        </div>

        <ul v-if="inbox.proposals.length" class="map-proposal__list" aria-label="پیشنهادهای دریافتی">
          <li v-for="offer in inbox.proposals" :key="offer.id">
            <button type="button" class="map-proposal__item" @click="openOffer(offer.id)">
              <span class="map-proposal__item-head">
                <span class="map-proposal__incident">{{ offer.details?.incidentTypeName ?? 'درخواست امداد' }}</span>
                <span class="map-proposal__severity" :class="`map-proposal__severity--${proposalSeverity[offer.details?.sosRequest.severity ?? 'medium'].tone}`">
                  {{ proposalSeverity[offer.details?.sosRequest.severity ?? 'medium'].label }}
                </span>
              </span>
              <span v-if="offer.details?.sosRequest.description" class="map-proposal__description">{{ offer.details.sosRequest.description }}</span>
              <span v-else class="map-proposal__description">برای بررسی، جزئیات پیشنهاد را باز کنید.</span>
              <span v-if="offer.details?.requesterName" class="map-proposal__requester">
                <v-icon icon="mdi-account-outline" size="16" aria-hidden="true" />
                درخواست‌دهنده: <span dir="auto">{{ offer.details.requesterName }}</span>
              </span>
              <span class="map-proposal__item-foot">
                <span><v-icon icon="mdi-clock-outline" size="16" aria-hidden="true" /> {{ proposalTime(offer.createdAt) }}</span>
                <span>جزئیات <v-icon icon="mdi-chevron-left" size="17" aria-hidden="true" /></span>
              </span>
            </button>
          </li>
        </ul>
        <nav v-if="inbox.totalPages > 1" class="map-proposal__pages" aria-label="صفحه‌بندی پیشنهادها">
          <v-btn icon="mdi-chevron-right" variant="text" aria-label="صفحهٔ قبل"
            :disabled="inbox.page <= 1 || inbox.loading" @click="inbox.setPage(inbox.page - 1)" />
          <span>صفحهٔ {{ inbox.page.toLocaleString('fa-IR') }} از {{ inbox.totalPages.toLocaleString('fa-IR') }}</span>
          <v-btn icon="mdi-chevron-left" variant="text" aria-label="صفحهٔ بعد"
            :disabled="inbox.page >= inbox.totalPages || inbox.loading" @click="inbox.setPage(inbox.page + 1)" />
        </nav>
      </v-card-text>

      <v-card-actions class="map-proposal__footer">
        <span>برای پذیرش یا رد، جزئیات هر پیشنهاد را باز کنید.</span>
        <v-btn block variant="tonal" color="primary" rounded="lg"
          append-icon="mdi-arrow-left" @click="openOffer(null)">بررسی همهٔ پیشنهادها</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <v-dialog v-model="detailsOpen" class="map-proposal__details" fullscreen
    :persistent="Boolean(inbox.decidingId)" aria-labelledby="map-proposal-details-title"
    @after-leave="restoreBellFocus">
    <v-card class="map-proposal__details-panel" rounded="xl" elevation="0">
      <v-card-title class="map-proposal__details-header">
        <h2 id="map-proposal-details-title">بررسی پیشنهادهای مأموریت</h2>
        <v-btn icon="mdi-close" variant="text" aria-label="بستن جزئیات پیشنهادها"
          :disabled="Boolean(inbox.decidingId)" @click="closeDetails" />
      </v-card-title>
      <v-card-text class="map-proposal__details-scroll">
        <ProposalInboxContent v-if="detailsOpen" :selected-offer-id="selectedOfferId" @close="closeDetails" />
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { proposalSeverity, proposalTime } from "@/sos/proposal-presentation";
import type { useProposalInboxStore } from "@/stores/proposal-inbox";

const props = defineProps<{ inbox: ReturnType<typeof useProposalInboxStore>; userId: string }>();
const ProposalInboxContent = defineAsyncComponent(() => import("./ProposalInboxContent.vue"));
const open = ref(false);
const detailsOpen = ref(false);
const selectedOfferId = ref<string | null>(null);
const route = useRoute();

function openOffer(id: string | null): void {
  selectedOfferId.value = id;
  open.value = false;
  detailsOpen.value = true;
}
function closeDetails(): void {
  if (props.inbox.decidingId) return;
  detailsOpen.value = false;
}
function restoreBellFocus(): void {
  if (!detailsOpen.value) document.querySelector<HTMLButtonElement>(".map-proposal__bell")?.focus({ preventScroll: true });
}
const bellLabel = computed(() => props.inbox.failed
  ? "پیشنهادهای مأموریت؛ به‌روزرسانی ناموفق"
  : props.inbox.total
    ? `پیشنهادهای مأموریت؛ ${props.inbox.total.toLocaleString('fa-IR')} پیشنهاد در انتظار`
    : "پیشنهادهای مأموریت؛ بدون پیشنهاد جدید");

// The store fences late reads on account changes. Hide both overlays immediately
// so no previous-account details linger while a new session is restoring.
watch(() => props.userId, () => { open.value = false; detailsOpen.value = false; selectedOfferId.value = null; });
watch(() => route.fullPath, () => {
  open.value = false;
  detailsOpen.value = false;
  if (route.path !== "/_user/map") return;
  if (typeof route.query.offer === "string") openOffer(route.query.offer);
  else if (route.query.inbox === "1") { open.value = true; void props.inbox.refresh(); }
}, { immediate: true });
</script>

<style scoped>
/* Paired with the map menu, but anchored to the physical right in the RTL app. */
.map-proposal__launcher {
  position: fixed; z-index: 900;
  top: calc(0.75rem + env(safe-area-inset-top, 0px));
  right: calc(0.75rem + env(safe-area-inset-right, 0px));
}
.map-proposal__bell {
  width: 48px; height: 48px; min-width: 48px; padding: 0;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 1rem; color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-surface), 0.97) !important;
  box-shadow: var(--bb-shadow-overlay) !important;
  backdrop-filter: blur(12px);
}
.map-proposal__bell:focus-visible, .map-proposal__item:focus-visible,
.map-proposal__inline-link:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px;
}
:global(.map-proposal__dialog.v-dialog > .v-overlay__content) {
  position: fixed !important; top: 0 !important; bottom: 0 !important;
  right: 0 !important; left: auto !important;
  width: min(22.5rem, 100vw) !important; max-width: 100vw !important;
  height: 100dvh !important; max-height: 100dvh !important; margin: 0 !important;
}
.map-proposal__panel {
  display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0;
  color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface));
}
/* Vuetify's dialog > card rules otherwise reinstate 24px body gutters and a
   second scrollbar on the outer card. Keep only the proposal list scrollable. */
:global(.map-proposal__dialog.v-dialog > .v-overlay__content > .map-proposal__panel) {
  overflow: hidden !important; border-radius: 0 !important;
  box-shadow: var(--bb-shadow-overlay) !important;
}
:global(.map-proposal__dialog.v-dialog > .v-overlay__content > .map-proposal__panel > .map-proposal__scroll) {
  flex: 1 1 auto; min-height: 0;
  padding: 1rem calc(1rem + env(safe-area-inset-right, 0px)) 1rem
    calc(1rem + env(safe-area-inset-left, 0px)) !important;
  overflow-y: auto; overscroll-behavior: contain;
}
.map-proposal__header {
  display: flex; align-items: center; justify-content: space-between; gap: 0.25rem;
  flex: 0 0 auto; min-height: calc(5.25rem + env(safe-area-inset-top, 0px));
  padding: calc(0.85rem + env(safe-area-inset-top, 0px))
    calc(0.75rem + env(safe-area-inset-right, 0px)) 0.85rem
    calc(0.75rem + env(safe-area-inset-left, 0px));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.map-proposal__header-copy { min-width: 0; white-space: normal; }
.map-proposal__eyebrow { display: block; color: rgb(var(--v-theme-primary)); font-size: 0.82rem; font-weight: 800; }
.map-proposal__header h2 { margin: 0.15rem 0; font-size: 1rem; font-weight: 800; line-height: 1.35; white-space: normal; }
.map-proposal__header-count { display: block; font-size: 0.82rem; opacity: 0.8; }
.map-proposal__header-actions { display: flex; flex: 0 0 auto; }
.map-proposal__header-actions :deep(.v-btn), .map-proposal__pages :deep(.v-btn) { min-width: 44px; min-height: 44px; }
.map-proposal__header-actions :deep(.v-btn:focus-visible), .map-proposal__pages :deep(.v-btn:focus-visible),
.map-proposal__footer :deep(.v-btn:focus-visible) { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.map-proposal__scroll { scrollbar-gutter: stable; }
.map-proposal__state {
  display: flex; flex-direction: column; align-items: center; gap: 0.45rem;
  padding: 2.25rem 1rem; text-align: center; font-size: 0.87rem;
}
.map-proposal__state strong { font-size: 0.98rem; }
.map-proposal__notice {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.45rem;
  padding: 0.75rem; border: 1px solid rgba(var(--v-theme-warning), 0.3);
  border-radius: 0.85rem; background: rgba(var(--v-theme-warning), 0.1);
  font-size: 0.82rem; line-height: 1.5;
}
.map-proposal__notice > span { flex: 1 1 10rem; }
.map-proposal__inline-link { color: rgb(var(--v-theme-primary)); font-weight: 800; text-decoration: underline; }
.map-proposal__list { display: grid; gap: 0.65rem; margin: 0; padding: 0; list-style: none; }
.map-proposal__item {
  display: grid; gap: 0.55rem; width: 100%; min-height: 108px; padding: 0.85rem;
  font: inherit; color: inherit; text-align: start; cursor: pointer;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.13); border-radius: 1rem;
  background: rgba(var(--v-theme-primary), 0.035);
  transition: border-color 0.15s ease, background-color 0.15s ease;
}
.map-proposal__item:hover { border-color: rgba(var(--v-theme-primary), 0.5); background: rgba(var(--v-theme-primary), 0.08); }
.map-proposal__item-head, .map-proposal__item-foot { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; }
.map-proposal__incident { min-width: 0; font-weight: 800; line-height: 1.4; overflow-wrap: anywhere; }
.map-proposal__severity { flex: 0 0 auto; padding: 0.15rem 0.4rem; border-radius: 0.45rem; font-size: 0.82rem; font-weight: 800; }
.map-proposal__severity--urgent { color: #ad2525; background: rgba(220, 38, 38, 0.12); }
.map-proposal__severity--important { color: #915509; background: rgba(217, 119, 6, 0.12); }
.map-proposal__severity--standard { color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.12); }
.map-proposal__description { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-height: 1.55; font-size: 0.82rem; overflow-wrap: anywhere; }
.map-proposal__requester { display: flex; align-items: center; gap: 0.25rem; font-size: 0.82rem; opacity: 0.8; overflow-wrap: anywhere; }
.map-proposal__requester > span { min-width: 0; }
.map-proposal__item-foot { color: rgb(var(--v-theme-primary)); font-size: 0.82rem; font-weight: 700; }
.map-proposal__item-foot span { display: inline-flex; align-items: center; gap: 0.2rem; }
.map-proposal__pages { display: flex; justify-content: space-between; align-items: center; gap: 0.25rem; margin-top: 0.75rem; font-size: 0.8rem; }
.map-proposal__footer {
  display: flex; flex-direction: column; align-items: stretch; gap: 0.55rem;
  flex: 0 0 auto; padding: 0.85rem calc(1rem + env(safe-area-inset-right, 0px))
    calc(0.85rem + env(safe-area-inset-bottom, 0px)) calc(1rem + env(safe-area-inset-left, 0px));
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.map-proposal__footer > span { font-size: 0.82rem; line-height: 1.4; opacity: 0.8; }
.map-proposal__footer :deep(.v-btn) { min-height: 44px; height: auto; }
.map-proposal__footer :deep(.v-btn__content) { white-space: normal; text-align: center; }
:global(.map-proposal__details.v-dialog > .v-overlay__content) {
  width: 100vw !important; max-width: 100vw !important;
  height: 100dvh !important; max-height: 100dvh !important; margin: 0 !important;
}
:global(.map-proposal__details.v-dialog > .v-overlay__content > .map-proposal__details-panel) {
  display: flex; flex-direction: column; width: 100%; height: 100%; min-height: 0;
  overflow: hidden !important; border-radius: 0 !important;
}
.map-proposal__details-header {
  display: flex; flex: 0 0 auto; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: calc(0.5rem + env(safe-area-inset-top, 0px))
    calc(1rem + env(safe-area-inset-right, 0px)) 0.5rem
    calc(1rem + env(safe-area-inset-left, 0px));
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}
.map-proposal__details-header h2 { min-width: 0; font-size: 1rem; font-weight: 800; overflow-wrap: anywhere; }
.map-proposal__details-header :deep(.v-btn) { flex: 0 0 auto; min-width: 44px; min-height: 44px; }
:global(.map-proposal__details.v-dialog > .v-overlay__content > .map-proposal__details-panel > .map-proposal__details-scroll) {
  flex: 1 1 auto; min-height: 0; padding: 0 !important;
  overflow-y: auto; overscroll-behavior: contain;
}
:global(:root.dark .map-proposal__severity--urgent) { color: #ffadad; }
:global(:root.dark .map-proposal__severity--important) { color: #f9ca76; }
@media (forced-colors: active) {
  .map-proposal__bell, .map-proposal__item, .map-proposal__severity { border: 1px solid CanvasText; }
}
@media (prefers-reduced-motion: reduce) { .map-proposal__item { transition: none; } .map-proposal__bell { backdrop-filter: none; } }
</style>
