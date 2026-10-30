<template>
  <v-card
    class="place-search bb-floating-card"
    elevation="2"
    rounded="xl"
    :class="{ 'place-search--active': api.results.value.length > 0, 'place-search--warn': api.loading.value,
      'place-search--error': api.failed.value }"
    aria-label="جست‌وجوی مکان"
  >
    <div class="place-search__body">
      <span class="place-search__indicator" aria-hidden="true" />
      <div class="place-search__copy">
        <h2 class="place-search__headline">جست‌وجوی مکان</h2>
        <p class="place-search__detail">
          {{ !ready ? 'پس از بارگذاری نقشه می‌توانید مکان جست‌وجو کنید.'
            : api.scope.value === 'viewport' ? 'فقط محدودهٔ دید؛ با جابه‌جایی نقشه نتایج تازه می‌شود.'
              : 'در سراسر محدودهٔ نصب‌شدهٔ نقشه.' }}
        </p>
      </div>
      <div class="place-search__actions">
        <v-btn
          size="small"
          color="primary"
          :variant="api.scope.value === 'viewport' ? 'flat' : 'tonal'"
          rounded="lg"
          prepend-icon="mdi-selection-search"
          :aria-pressed="api.scope.value === 'viewport'"
          :disabled="!ready"
          @click="api.setScope(api.scope.value === 'viewport' ? 'library' : 'viewport')"
        >
          فقط محدودهٔ دید
        </v-btn>
      </div>
    </div>
    <form class="place-search__form" role="search" @submit.prevent="api.run(api.mapActive.value)">
      <v-text-field
        :model-value="api.term.value"
        label="نام مکان یا خیابان"
        placeholder="حداقل ۲ حرف"
        aria-label="نام مکان یا خیابان"
        density="compact"
        variant="outlined"
        rounded="lg"
        hide-details
        autocomplete="off"
        maxlength="200"
        :disabled="!ready"
        :loading="api.loading.value"
        @update:model-value="api.update(String($event ?? ''))"
        @keydown.esc="api.clear()"
      >
        <template #append-inner>
          <v-btn
            v-if="api.term.value"
            icon="mdi-close"
            variant="text"
            size="small"
            aria-label="پاک کردن جست‌وجو"
            @click="api.clear()"
          />
        </template>
      </v-text-field>
      <v-btn
        class="place-search__show-all"
        type="button"
        color="primary"
        variant="flat"
        rounded="lg"
        prepend-icon="mdi-map-marker-multiple"
        aria-label="نمایش همهٔ نتایج روی نقشه"
        title="نمایش همهٔ نتایج روی نقشه"
        :disabled="!ready || (!api.mapResults.value.length && (api.loading.value || !api.results.value.length))"
        @click="$emit('show-all')"
      ><span class="place-search__show-all-label">نقشه ({{ (api.mapActive.value ? api.mapResults.value.length : api.results.value.length).toLocaleString('fa-IR') }})</span></v-btn>
    </form>
    <div v-if="api.term.value.trim().length >= 2" class="place-search__results">
      <p v-if="api.loading.value && !api.results.value.length" class="place-search__feedback" role="status">در حال جست‌وجو…</p>
      <div v-else-if="api.failed.value && !api.results.value.length" class="place-search__feedback" role="alert">
        <p>جست‌وجوی مکان در دسترس نیست؛ اتصال یا محدودهٔ نقشه را بررسی کنید.</p>
        <v-btn size="small" variant="tonal" color="primary" rounded="lg" @click="api.retry()">تلاش دوباره</v-btn>
      </div>
      <p v-else-if="api.searched.value && !api.results.value.length" class="place-search__feedback" role="status">
        مکانی در این محدوده پیدا نشد.
      </p>
      <template v-else-if="api.results.value.length">
        <p v-if="api.loading.value" class="place-search__feedback" role="status">در حال به‌روزرسانی این محدوده؛ فقط نتایج داخل محدوده باقی می‌مانند.</p>
        <div v-else-if="api.failed.value" class="place-search__feedback" role="alert">
          <p>به‌روزرسانی ناموفق بود؛ نتایج قبلیِ داخل همین محدوده در دسترس‌اند.</p>
          <v-btn size="small" variant="tonal" color="primary" rounded="lg" @click="api.retry()">تلاش دوباره</v-btn>
        </div>
        <p v-else class="place-search__feedback" role="status">نتایج را از فهرست انتخاب کنید یا همه را روی نقشه ببینید.</p>
        <ul aria-label="نتایج جست‌وجوی مکان" role="list">
          <li v-for="place in api.results.value" :key="place.placeId">
            <button
              type="button"
              class="place-search__result"
              :class="{ 'place-search__result--selected': api.selectedPlaceId.value === place.placeId }"
              :aria-pressed="api.selectedPlaceId.value === place.placeId"
              @click="$emit('select', place)"
            >
              <span class="place-search__result-title">
                <strong>{{ place.name }}</strong>
                <small v-if="api.selectedPlaceId.value === place.placeId">انتخاب‌شده</small>
              </span>
              <span class="place-search__address">{{ place.address }}</span>
            </button>
          </li>
        </ul>
      </template>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import type { GeocodeResult } from "@shared/index";
import type { usePlaceSearch } from "@/composables/use-place-search";

defineProps<{ api: ReturnType<typeof usePlaceSearch>; ready: boolean }>();
defineEmits<{ select: [place: GeocodeResult]; 'show-all': [] }>();
</script>

<style scoped>
.place-search {
  container-type: inline-size;
  padding: 0.6rem 0.85rem;
  border: 1px solid rgba(25, 53, 54, 0.09);
  background: rgba(var(--v-theme-surface), 0.95);
  backdrop-filter: blur(10px);
}

.place-search__body { display: flex; flex-wrap: wrap; align-items: center; gap: 0.65rem 0.85rem; }
.place-search__indicator { flex: 0 0 auto; width: 0.65rem; height: 0.65rem; border-radius: 50%; background: #7d9291; }
.place-search--active .place-search__indicator { background: #1f8a5b; box-shadow: 0 0 0 4px rgba(31, 138, 91, 0.18); }
.place-search--warn .place-search__indicator { background: #c57b14; box-shadow: none; }
.place-search--error .place-search__indicator { background: #b3261e; box-shadow: none; }
.place-search__copy { min-width: 0; flex: 1 1 9rem; }
.place-search__headline { margin: 0; color: #173b3c; font-size: 0.86rem; font-weight: 800; line-height: 1.4; }
.place-search__detail { margin: 0.12rem 0 0; color: #536d6c; font-size: 0.75rem; line-height: 1.55; overflow-wrap: anywhere; }
.place-search__actions { display: flex; align-items: center; margin-inline-start: auto; }
.place-search__form { display: flex; align-items: start; gap: 0.5rem; margin-top: 0.75rem; }
.place-search__form :deep(.v-input) { flex: 1 1 auto; min-width: 0; }
.place-search__show-all { flex: 0 0 auto; min-width: 44px; min-height: 44px; height: 44px; white-space: nowrap; }
.place-search__results { margin-top: 0.5rem; max-height: min(17rem, 40dvh); overflow-y: auto; overscroll-behavior: contain; }
.place-search__feedback { margin: 0.35rem 0.25rem 0.5rem; color: #536d6c; font-size: 0.75rem; line-height: 1.6; }
.place-search__feedback p { margin: 0 0 0.5rem; }
.place-search__results ul { margin: 0; padding: 0; list-style: none; }
.place-search__results li + li { margin-top: 0.3rem; }
.place-search__result {
  display: block; width: 100%; border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: var(--bb-radius-nested, 16px); padding: 0.55rem 0.7rem;
  text-align: start; color: rgb(var(--v-theme-on-surface)); background: rgba(var(--v-theme-surface), 0.75);
  cursor: pointer; overflow-wrap: anywhere;
}
.place-search__result:hover, .place-search__result:focus-visible { background: rgba(var(--v-theme-primary), 0.12); }
.place-search__result:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }
.place-search__result--selected { border-color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), 0.12); }
.place-search__result-title { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 0.25rem 0.5rem; }
.place-search__result-title strong { font-size: 0.82rem; line-height: 1.5; }
.place-search__result-title small { color: rgb(var(--v-theme-primary)); font-size: 0.72rem; font-weight: 700; }
.place-search__address { display: block; color: #536d6c; font-size: 0.75rem; line-height: 1.55; }

@container (max-width: 380px) {
  .place-search__show-all { width: 44px; padding-inline: 0; }
  .place-search__show-all-label { display: none; }
  .place-search__show-all :deep(.v-btn__prepend) { margin-inline-end: 0; }
  .place-search__body { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: start; }
  .place-search__indicator { margin-top: 0.35rem; }
  .place-search__actions { grid-column: 1 / -1; width: 100%; min-width: 0; margin-inline-start: 0; }
  .place-search__actions :deep(.v-btn) { flex: 1 1 100%; min-width: 0; min-height: 44px; height: auto; white-space: normal; }
  .place-search__actions :deep(.v-btn__content) { white-space: normal; overflow-wrap: anywhere; text-align: center; }
}

:global(:root.dark .place-search) { background: rgba(27, 41, 42, 0.95); }
:global(:root.dark .place-search__headline) { color: #edf5f2; }
:global(:root.dark .place-search__detail), :global(:root.dark .place-search__feedback), :global(:root.dark .place-search__address) { color: #a0b6b2; }
@media (forced-colors: active) {
  .place-search__indicator { outline: 1px solid CanvasText; }
  .place-search__result--selected { outline: 2px solid Highlight; outline-offset: -2px; }
}
</style>
