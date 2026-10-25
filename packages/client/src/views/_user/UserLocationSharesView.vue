<template>
  <section class="user-shares-page mx-auto w-full max-w-4xl px-4 py-8 sm:px-8" aria-labelledby="user-shares-title">
    <header class="user-shares-page__header">
      <div>
        <p class="user-shares-page__eyebrow">
          <v-icon icon="mdi-crosshairs-gps" size="18" />
          حریم خصوصی و همراهی
        </p>
        <h1 id="user-shares-title">اشتراک موقعیت</h1>
        <p class="user-shares-page__lead">
          پخش زندهٔ موقعیت، اشتراک‌های مدت‌دار یا دائمی، و بازه‌های تاریخچهٔ مسیر خود را از یکجا مدیریت کنید.
        </p>
      </div>
      <div class="user-shares-page__actions">
        <v-btn to="/_user/devices" variant="tonal" color="primary" rounded="lg" size="small">
          <v-icon class="me-1" icon="mdi-devices" size="18" />
          دستگاه‌ها
        </v-btn>
        <v-btn to="/_user/map" variant="flat" color="primary" rounded="lg" size="small">
          <v-icon class="me-1" icon="mdi-map-outline" size="18" />
          نقشهٔ همراهان
        </v-btn>
      </div>
    </header>

    <div class="user-shares-page__stack">
      <LiveBroadcastBar />
      <ShareLists ref="shareLists" @create="shareOpen = true" @changed="onSharesChanged" />
    </div>

    <ShareDialog v-model="shareOpen" @shared="onShared" />
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import LiveBroadcastBar from "@/components/sharing/LiveBroadcastBar.vue";
import ShareDialog from "@/components/sharing/ShareDialog.vue";
import ShareLists from "@/components/sharing/ShareLists.vue";
import { useBroadcastStore } from "@/stores/broadcast";

const broadcast = useBroadcastStore();
const shareOpen = ref(false);
const shareLists = ref<{ refresh: () => Promise<void> } | null>(null);

function onShared(): void {
  void shareLists.value?.refresh();
  void broadcast.refreshPriority();
}

function onSharesChanged(): void {
  void broadcast.refreshPriority();
}
</script>

<style scoped>
.user-shares-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.user-shares-page__header {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}

.user-shares-page__eyebrow {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0;
  color: var(--bb-color-muted);
  font-size: 0.8rem;
  font-weight: 800;
}

.user-shares-page__header h1 {
  margin: 0.25rem 0 0;
  color: #173b3c;
  font-size: 1.45rem;
  font-weight: 800;
}

.user-shares-page__lead {
  margin: 0.3rem 0 0;
  max-width: 44rem;
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.9rem;
  line-height: 1.7;
}

.user-shares-page__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.user-shares-page__stack {
  display: grid;
  gap: 1rem;
}

:global(:root.dark) .user-shares-page__header h1 {
  color: #edf5f2;
}
</style>
