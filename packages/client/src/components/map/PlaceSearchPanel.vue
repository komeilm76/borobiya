<template>
  <v-card class="place-search bb-floating-card" elevation="3" rounded="xl" aria-label="جست‌وجوی مکان">
    <form class="place-search__form" role="search" @submit.prevent="api.run()">
      <v-text-field
        :model-value="api.term.value"
        label="جست‌وجوی مکان"
        placeholder="نام خیابان یا مکان (حداقل ۲ حرف)"
        aria-label="جست‌وجوی مکان"
        density="compact"
        variant="outlined"
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
            size="x-small"
            aria-label="پاک کردن جست‌وجو"
            @click="api.clear()"
          />
        </template>
      </v-text-field>
    </form>
    <div v-if="api.term.value.trim().length >= 2" class="place-search__results" role="status" aria-live="polite">
      <p v-if="api.loading.value">در حال جست‌وجو…</p>
      <div v-else-if="api.failed.value">
        <p>جست‌وجوی مکان در دسترس نیست؛ اتصال به سرور نقشه را بررسی کنید.</p>
        <v-btn size="small" variant="tonal" @click="api.run()">تلاش دوباره</v-btn>
      </div>
      <p v-else-if="api.searched.value && !api.results.value.length">مکانی پیدا نشد.</p>
      <ul v-else-if="api.results.value.length" aria-label="نتایج جست‌وجوی مکان" role="list">
        <li v-for="place in api.results.value" :key="place.placeId">
          <button type="button" class="place-search__result" @click="$emit('select', place)">
            <strong>{{ place.name }}</strong>
            <small>{{ place.address }}</small>
          </button>
        </li>
      </ul>
    </div>
    <p v-if="!ready" class="place-search__hint">پس از بارگذاری نقشه می‌توانید مکان جست‌وجو کنید.</p>
  </v-card>
</template>

<script setup lang="ts">
import type { GeocodeResult } from "@shared/index";
import type { usePlaceSearch } from "@/composables/use-place-search";

defineProps<{ api: ReturnType<typeof usePlaceSearch>; ready: boolean }>();
defineEmits<{ select: [place: GeocodeResult] }>();
</script>

<style scoped>
.place-search { padding: 0.7rem; background: rgba(var(--v-theme-surface), 0.96); backdrop-filter: blur(12px); }
.place-search__results { margin-top: 0.5rem; max-height: min(17rem, 40dvh); overflow-y: auto; }
.place-search__results p, .place-search__hint { margin: 0.5rem; font-size: 0.82rem; line-height: 1.5; }
.place-search__results ul { margin: 0; padding: 0; list-style: none; }
.place-search__result { display: block; width: 100%; border: 0; border-radius: var(--bb-radius-nested, 16px); padding: 0.5rem; text-align: start; color: inherit; background: transparent; cursor: pointer; }
.place-search__result:hover, .place-search__result:focus-visible { background: rgba(var(--v-theme-primary), 0.12); outline-offset: -2px; }
.place-search__result strong, .place-search__result small { display: block; }
.place-search__result small { opacity: 0.7; font-size: 0.75rem; overflow-wrap: anywhere; }
:global(:root.dark) .place-search { background: rgba(27, 41, 42, 0.94); }
</style>
