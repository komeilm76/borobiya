<template>
  <v-card class="live-companions bb-floating-card" elevation="2" rounded="xl">
    <header class="live-companions__header">
      <div class="live-companions__title-block">
        <p>موقعیت زنده</p>
        <h2>همراهان</h2>
      </div>
      <v-chip class="live-companions__count" size="small" variant="tonal" color="primary">
        {{ api.status.value.peerCount }}
      </v-chip>
      <v-icon
        class="live-companions__signal"
        :icon="api.connected.value ? 'mdi-wifi' : 'mdi-wifi-off'"
        size="18"
        :title="connectionTitle(api.connected.value)"
        :aria-label="connectionTitle(api.connected.value)"
      />
    </header>

    <p class="live-companions__status" role="status" aria-live="polite">
      {{ visible ? api.status.value.line : 'همراهان روی نقشه پنهان‌اند؛ با انتخاب یک همراه دوباره نمایش داده می‌شوند.' }}
    </p>
    <v-switch
      :model-value="visible"
      color="primary"
      hide-details
      aria-label="نمایش همراهان روی نقشه"
      @update:model-value="$emit('update:visible', Boolean($event))"
    >
      <template #label>نمایش همراهان روی نقشه</template>
    </v-switch>

    <ul v-if="members.length" class="live-companions__peers" role="list" tabindex="0" aria-label="فهرست همراهان روی نقشه">
      <li v-for="member in members" :key="member.userId" class="live-companions__peer">
        <v-btn class="live-companions__peer-button" variant="text" block
          :color="selectedUserId === member.userId ? 'primary' : undefined"
          :aria-label="member.position ? `نمایش ${member.name} روی نقشه` : `${member.name}؛ در انتظار موقعیت`"
          :disabled="!member.position" @click="$emit('select', member.userId)">
          <span class="live-companions__dot"
            :style="{ background: member.position ? (member.stale ? colors.stale : colors.live) : colors.stale }"
            aria-hidden="true" />
          <span class="live-companions__name">{{ member.name }}</span>
          <span class="live-companions__age">{{ member.position ? ageWords(member.ageMs) : 'در انتظار موقعیت' }}</span>
          <v-chip v-if="member.accuracy !== null" size="x-small" variant="tonal" class="live-companions__accuracy">
            ±{{ Math.round(member.accuracy) }} متر
          </v-chip>
        </v-btn>
      </li>
    </ul>

    <v-btn
      v-if="api.readFailed.value"
      class="live-companions__retry"
      size="small"
      variant="text"
      color="primary"
      @click="api.refresh()"
    >
      تازه‌سازی فهرست
    </v-btn>
  </v-card>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useThemeStore } from "@/stores/theme";
import { ageWords, connectionTitle, liveMarkerColors } from "@/live/companion-locations";
import type { useLiveCompanions } from "@/composables/use-live-companions";

/**
 * The reader's side of live sharing (T2.1.8): who is on the map, how old each position is, and why the
 * map might be empty.
 *
 * It renders the state `useLiveCompanions` already derived and nothing else. The sentences come from
 * `liveStatus` and the ages from `ageWords` — both pure, both tested — because the empty cases are the
 * part users act on: "nobody has shared with you", "the list did not load" and "waiting for their first
 * update" look identical if a component is allowed to improvise them.
 */
const props = defineProps<{
  api: ReturnType<typeof useLiveCompanions>;
  visible: boolean;
  selectedUserId?: string | null;
}>();
defineEmits<{ 'update:visible': [visible: boolean]; select: [userId: string] }>();

// Include permitted users who are waiting for their first fix; disabling their
// action avoids pretending we can center on an unknown coordinate.
const members = computed(() => Object.values(props.api.registry.value).map((entry) => {
  const positioned = props.api.peers.value.find((peer) => peer.userId === entry.userId);
  return { userId: entry.userId, name: entry.name, position: positioned?.position ?? null,
    stale: positioned?.stale ?? true, ageMs: positioned?.ageMs ?? null, accuracy: positioned?.accuracy ?? null };
}));

const theme = useThemeStore();
const colors = computed(() => liveMarkerColors(theme.isDark));
</script>

<style scoped>
.live-companions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.7rem 0.85rem;
  background: rgba(var(--v-theme-surface), 0.94);
  backdrop-filter: blur(10px);
}

.live-companions__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.live-companions__title-block {
  min-width: 0;
  flex: 1 1 auto;
}

.live-companions__title-block p {
  margin: 0;
  color: #536d6c;
  font-size: 0.68rem;
  font-weight: 700;
}

.live-companions__title-block h2 {
  margin: 0.1rem 0 0;
  color: #193536;
  font-size: 0.92rem;
  font-weight: 800;
  line-height: 1.4;
}

.live-companions__count,
.live-companions__signal {
  flex: 0 0 auto;
}

.live-companions__signal {
  color: #0e6666;
}

.live-companions__status {
  margin: 0;
  color: #536d6c;
  font-size: 0.74rem;
  line-height: 1.6;
}

.live-companions__peers {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 11rem;
  overflow-y: auto;
}

.live-companions__peers:focus-visible {
  outline: 2px solid var(--bb-color-primary);
  outline-offset: -2px;
}

.live-companions__peer { min-width: 0; }

.live-companions__peer-button {
  min-width: 0;
  min-height: 48px;
  height: auto;
  padding: 0.5rem 0.65rem;
  border-radius: 0.75rem;
}
.live-companions__peer-button :deep(.v-btn__content) {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  min-width: 0;
  font-size: 0.8rem;
  line-height: 1.5;
  white-space: normal;
  text-align: start;
}
.live-companions__peer-button:focus-visible { outline: 2px solid rgb(var(--v-theme-primary)); outline-offset: -2px; }

.live-companions__peer-button.v-btn--disabled { opacity: 1; }
.live-companions__peer-button.v-btn--disabled :deep(.v-btn__content) { opacity: 1; }
.live-companions__peer-button.v-btn--disabled .live-companions__name { color: #536d6c; }
:global(:root.dark .live-companions__peer-button.v-btn--disabled .live-companions__name) { color: #a0b6b2; }

.live-companions__dot {
  flex: 0 0 auto;
  width: 0.6rem;
  height: 0.6rem;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.7);
}

.live-companions__name {
  flex: 1 1 auto;
  min-width: 0;
  color: #193536;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.live-companions__age {
  color: #536d6c;
  font-size: 0.7rem;
}

.live-companions__accuracy {
  margin-inline-start: auto;
  flex: 0 0 auto;
}

.live-companions__retry {
  align-self: flex-start;
}

:global(:root.dark .live-companions) {
  background: rgba(27, 41, 42, 0.94);
}

:global(:root.dark .live-companions__title-block h2),
:global(:root.dark .live-companions__name) {
  color: #edf5f2;
}

:global(:root.dark .live-companions__status),
:global(:root.dark .live-companions__title-block p),
:global(:root.dark .live-companions__age) {
  color: #a0b6b2;
}

:global(:root.dark .live-companions__signal) {
  color: #71c7be;
}

:global(:root.dark .live-companions__dot) {
  box-shadow: 0 0 0 2px rgba(7, 27, 28, 0.7);
}
</style>
