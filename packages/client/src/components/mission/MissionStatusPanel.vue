<template>
  <v-card tag="section" elevation="3" rounded="xl" id="mission-status-panel"
    class="mission-desk__card bb-floating-card bb-map-navigation-card" aria-label="اطلاعات مأموریت" tabindex="-1">
    <div class="mission-desk__card-header">
      <h2>اطلاعات مأموریت</h2>
      <v-btn icon="mdi-close" variant="text" aria-label="بستن اطلاعات مأموریت" @click="emit('close')" />
    </div>
    <MissionBriefDetails :mission-id="desk.activeMission.value?.id ?? ''" :visible="visible" />
  </v-card>
</template>

<script setup lang="ts">
import type { useMissionDesk } from "@/composables/use-mission-desk";
import MissionBriefDetails from "./MissionBriefDetails.vue";

defineProps<{ desk: ReturnType<typeof useMissionDesk>; visible: boolean }>();
const emit = defineEmits<{ close: [] }>();
</script>

<style scoped>
.mission-desk__card-header { position: sticky; top: -1rem; z-index: 1;
  display: flex; align-items: center; justify-content: space-between; gap: .5rem;
  margin: -1rem -1rem .65rem; padding: .5rem 1rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), .12); background: rgb(var(--v-theme-surface)); }
.mission-desk__card-header h2 { margin: 0; font-size: 1rem; line-height: 1.5; font-weight: 800; }
.mission-desk__card-header :deep(.v-btn) { flex: none; width: 44px; min-width: 44px; height: 44px; }
</style>
