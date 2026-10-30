<template>
  <v-bottom-sheet :model-value="!!peer" :close-on-back="false" persistent @update:model-value="onVisible">
    <v-card v-if="peer" id="companion-detail-sheet" class="companion-detail" rounded="xl" role="dialog"
      :aria-label="`اطلاعات همراه ${peer.name}`" @keydown.esc.stop="$emit('close')">
      <v-card-title class="companion-detail__header">
        <v-avatar class="companion-detail__avatar" color="primary" size="48" aria-hidden="true">
          {{ avatarInitial(peer.name) }}
        </v-avatar>
        <div class="companion-detail__identity">
          <strong>{{ peer.name }}</strong>
          <span>پروفایل و موقعیت اشتراکی</span>
        </div>
        <v-btn class="companion-detail__close" icon="mdi-close" variant="text" size="small"
          aria-label="بستن اطلاعات همراه" @click="$emit('close')" />
      </v-card-title>
      <v-card-text class="companion-detail__body">
        <div class="companion-detail__section">
          <h2>پروفایل عمومی</h2>
          <p v-if="profileLoading" role="status">در حال دریافت اطلاعات عمومی…</p>
          <div v-else-if="profileFailed" role="status">
            <p>دریافت اطلاعات عمومی ممکن نشد.</p>
            <v-btn size="small" variant="tonal" @click="$emit('retry-profile')">تلاش دوباره</v-btn>
          </div>
          <dl v-else-if="profile" class="companion-detail__facts">
            <div><dt>نام کاربری</dt><dd>{{ profile.username }}</dd></div>
            <div v-if="profile.category"><dt>دسته‌بندی</dt><dd>{{ profile.category }}</dd></div>
            <div v-if="profile.avgRating !== null"><dt>میانگین امتیاز</dt><dd>{{ profile.avgRating.toLocaleString('fa-IR') }} از ۵</dd></div>
            <div><dt>وضعیت حساب</dt><dd>{{ profile.isOnline ? 'آنلاین' : 'آفلاین' }}</dd></div>
          </dl>
          <p v-else role="status">جزئیات عمومی بیشتری برای این همراه در دسترس نیست.</p>
        </div>

        <div class="companion-detail__section">
          <h2>موقعیت اشتراکی</h2>
          <p class="companion-detail__freshness" :class="{ 'companion-detail__freshness--stale': peer.stale }">
            <v-icon :icon="peer.stale ? 'mdi-clock-alert-outline' : 'mdi-access-point'" size="18" aria-hidden="true" />
            {{ peer.stale ? 'موقعیت قدیمی یا بدون زمان' : 'موقعیت تازه' }} · {{ ageWords(peer.ageMs) }}
          </p>
          <dl class="companion-detail__facts">
            <div><dt>زمان ثبت</dt><dd>{{ observedAtMs === null ? 'نامشخص (آخرین موقعیت ثبت‌شده)' : new Date(observedAtMs).toLocaleString('fa-IR') }}</dd></div>
            <div><dt>دقت GPS</dt><dd>{{ peer.accuracy === null ? 'نامشخص' : `±${Math.round(peer.accuracy).toLocaleString('fa-IR')} متر` }}</dd></div>
            <div><dt>مختصات</dt><dd dir="ltr">{{ peer.position[1].toFixed(6) }}, {{ peer.position[0].toFixed(6) }}</dd></div>
          </dl>
        </div>

        <div class="companion-detail__section">
          <h2>جزئیات مکان</h2>
          <p v-if="placeLoading" role="status">در حال یافتن نشانی از سرور نقشه…</p>
          <div v-else-if="placeFailed" role="status">
            <p>دریافت نشانی ممکن نشد.</p>
            <v-btn size="small" variant="tonal" @click="$emit('retry-place')">تلاش دوباره</v-btn>
          </div>
          <template v-else-if="place">
            <p class="companion-detail__address">{{ place.formattedAddress }}</p>
            <dl class="companion-detail__facts">
              <div v-if="place.city"><dt>شهر</dt><dd>{{ place.city }}</dd></div>
              <div v-if="place.country"><dt>کشور</dt><dd>{{ place.country }}</dd></div>
              <div v-if="place.street"><dt>خیابان</dt><dd>{{ place.street }}</dd></div>
              <div v-if="place.houseNumber"><dt>شماره</dt><dd>{{ place.houseNumber }}</dd></div>
            </dl>
          </template>
          <p v-else role="status">نشانی برای این مختصات پیدا نشد.</p>
        </div>
      </v-card-text>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup lang="ts">
import type { ReverseGeocodeResult, UserSearchResult } from "@shared/index";
import type { CompanionView } from "@/live/companion-locations";
import { ageWords } from "@/live/companion-locations";
import { avatarInitial } from "@/live/avatar-initial";

defineProps<{
  peer: CompanionView | null;
  observedAtMs: number | null;
  profile: UserSearchResult | null;
  profileLoading: boolean;
  profileFailed: boolean;
  place: ReverseGeocodeResult | null;
  placeLoading: boolean;
  placeFailed: boolean;
}>();
const emit = defineEmits<{ close: []; 'retry-profile': []; 'retry-place': [] }>();
function onVisible(visible: boolean): void {
  if (!visible) emit("close");
}
</script>

<style scoped>
.companion-detail {
  width: 100%; max-width: 38rem; margin-inline: auto;
  max-height: calc(100dvh - 1rem - env(safe-area-inset-bottom, 0px));
  display: flex; flex-direction: column; overflow: hidden;
  color: rgb(var(--v-theme-on-surface));
}
.companion-detail__header { display: flex; align-items: center; gap: 0.8rem; flex: 0 0 auto; padding: 0.9rem 1rem; white-space: normal; }
.companion-detail__avatar { flex: 0 0 auto; font-weight: 800; }
.companion-detail__identity { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.5; }
.companion-detail__identity strong { font-size: 1rem; overflow-wrap: anywhere; }
.companion-detail__identity span { font-size: 0.76rem; opacity: 0.72; }
.companion-detail__close { flex: 0 0 auto; min-width: 44px; min-height: 44px; }
.companion-detail__body { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding-block: 0 1.4rem; }
.companion-detail__section { padding-block: 0.7rem; border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12); }
.companion-detail__section h2 { font-size: 0.88rem; font-weight: 800; margin: 0 0 0.55rem; }
.companion-detail__section p { font-size: 0.85rem; line-height: 1.7; margin: 0.15rem 0 0.5rem; }
.companion-detail__facts { display: grid; gap: 0.35rem; margin: 0; font-size: 0.85rem; }
.companion-detail__facts > div { display: flex; justify-content: space-between; gap: 1rem; align-items: baseline; }
.companion-detail__facts dt { opacity: 0.72; flex: 0 0 auto; }
.companion-detail__facts dd { margin: 0; text-align: end; overflow-wrap: anywhere; }
.companion-detail__freshness { display: flex; align-items: center; gap: 0.35rem; color: rgb(var(--v-theme-success)); }
.companion-detail__freshness--stale { color: rgb(var(--v-theme-warning)); }
.companion-detail__address { font-weight: 700; overflow-wrap: anywhere; }
.companion-detail__body :deep(.v-btn) { min-height: 44px; }
</style>
