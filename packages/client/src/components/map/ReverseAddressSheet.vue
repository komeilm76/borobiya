<template>
  <v-bottom-sheet :model-value="api.open.value" @update:model-value="onVisible">
    <v-card class="reverse-address" rounded="xl" role="dialog" aria-label="نشانی نقطهٔ انتخاب‌شده">
      <v-card-title class="reverse-address__header">
        <span>نشانی نقطهٔ انتخاب‌شده</span>
        <v-btn icon="mdi-close" variant="text" size="small" aria-label="بستن نشانی" @click="api.close()" />
      </v-card-title>
      <v-card-text>
        <p v-if="api.loading.value" role="status">در حال یافتن نشانی…</p>
        <div v-else-if="api.failed.value" role="status">
          <p>دریافت نشانی از سرور نقشه ممکن نشد.</p>
          <v-btn variant="tonal" size="small" @click="api.load()">تلاش دوباره</v-btn>
        </div>
        <template v-else-if="api.address.value">
          <label for="reverse-address-text">نشانی قابل کپی</label>
          <textarea id="reverse-address-text" class="reverse-address__text" readonly
            :value="api.address.value.formattedAddress" />
          <v-btn color="primary" variant="tonal" prepend-icon="mdi-content-copy" @click="api.copy()">
            کپی نشانی
          </v-btn>
          <p v-if="api.copied.value" role="status">نشانی کپی شد.</p>
          <p v-if="api.copyFailed.value" role="status">کپی خودکار ممکن نشد؛ متن بالا را انتخاب و کپی کنید.</p>
        </template>
        <p v-else role="status">برای این نقطه نشانی پیدا نشد. نقطهٔ دیگری را انتخاب کنید.</p>
      </v-card-text>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup lang="ts">
import type { useReversePlace } from "@/composables/use-reverse-place";
const props = defineProps<{ api: ReturnType<typeof useReversePlace> }>();
function onVisible(visible: boolean): void {
  if (!visible) props.api.close();
}
</script>

<style scoped>
.reverse-address { margin-inline: auto; max-width: 34rem; width: 100%; }
.reverse-address__header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; white-space: normal; }
.reverse-address__text { display: block; width: 100%; min-height: 4.5rem; padding: 0.65rem; margin: 0.5rem 0 0.75rem; border: 1px solid rgba(var(--v-theme-on-surface), 0.3); border-radius: 0.5rem; color: inherit; resize: vertical; }
</style>
