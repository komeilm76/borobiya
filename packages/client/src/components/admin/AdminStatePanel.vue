<template>
  <div class="admin-state" :class="`admin-state--${state}`" role="status" aria-live="polite">
    <template v-if="state === 'loading'">
      <div class="admin-state__skeleton" aria-hidden="true">
        <span v-for="row in 4" :key="row" class="admin-state__skeleton-row">
          <i class="admin-state__skeleton-avatar" />
          <i class="admin-state__skeleton-line admin-state__skeleton-line--wide" />
          <i class="admin-state__skeleton-line" />
        </span>
      </div>
      <p class="admin-state__caption">{{ title || "در حال دریافت داده از سرور…" }}</p>
    </template>

    <template v-else>
      <span class="admin-state__icon" :class="`admin-state__icon--${state}`">
        <v-icon :icon="icon" size="26" />
      </span>
      <h3>{{ title }}</h3>
      <p v-if="description">{{ description }}</p>
      <p v-if="reference" class="admin-state__ref">کد رهگیری: <code>{{ reference }}</code></p>
      <v-btn
        v-if="actionLabel"
        class="admin-state__action"
        variant="flat"
        color="primary"
        rounded="lg"
        @click="$emit('retry')"
      >
        <v-icon class="ms-2" :icon="actionIcon" size="17" />
        {{ actionLabel }}
      </v-btn>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

type PanelState = "loading" | "empty" | "error" | "offline" | "forbidden";

const props = defineProps<{
  state: PanelState;
  title?: string;
  description?: string;
  reference?: string;
  actionLabel?: string;
  actionIcon?: string;
}>();

defineEmits<{ retry: [] }>();

const icon = computed(
  () =>
    ({
      empty: "mdi-account-search-outline",
      error: "mdi-server-network-off",
      offline: "mdi-cloud-off-outline",
      forbidden: "mdi-shield-lock-outline"
    })[props.state as Exclude<PanelState, "loading">] ?? "mdi-information-outline"
);
</script>

<style scoped>
.admin-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 2.4rem 1.5rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 20px;
  background: rgb(var(--v-theme-surface));
  text-align: center;
}

.admin-state h3 {
  margin: 0.3rem 0 0;
  font-size: 1.02rem;
  font-weight: 700;
}

.admin-state p {
  max-width: 46ch;
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.82rem;
  line-height: 1.8;
}

.admin-state__ref {
  font-size: 0.82rem;
  direction: ltr;
}

.admin-state__ref code {
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.07);
}

.admin-state__icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: rgba(var(--v-theme-info), 0.12);
  color: rgb(var(--v-theme-info));
}

.admin-state__icon--empty {
  background: rgba(var(--v-theme-primary), 0.1);
  color: rgb(var(--v-theme-primary));
}

.admin-state__icon--error {
  background: rgba(var(--v-theme-error), 0.12);
  color: rgb(var(--v-theme-error));
}

.admin-state__icon--offline {
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.admin-state__icon--forbidden {
  background: rgba(var(--v-theme-warning), 0.14);
  color: rgb(var(--v-theme-warning));
}

.admin-state__action {
  margin-top: 0.4rem;
  text-transform: none;
}

.admin-state__caption {
  margin: 0;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.82rem;
}

.admin-state__skeleton {
  display: grid;
  width: 100%;
  gap: 0.9rem;
}

.admin-state__skeleton-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.admin-state__skeleton-avatar,
.admin-state__skeleton-line {
  display: block;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-on-surface), 0.06),
    rgba(var(--v-theme-on-surface), 0.12),
    rgba(var(--v-theme-on-surface), 0.06)
  );
  background-size: 200% 100%;
  animation: admin-shimmer 1.6s ease-in-out infinite;
}

.admin-state__skeleton-avatar {
  width: 32px;
  height: 32px;
}

.admin-state__skeleton-line {
  height: 11px;
  flex: 0 1 120px;
}

.admin-state__skeleton-line--wide {
  flex: 1 1 auto;
  max-width: 320px;
}

@keyframes admin-shimmer {
  0% {
    background-position: 100% 0;
  }
  100% {
    background-position: -100% 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .admin-state__skeleton-avatar,
  .admin-state__skeleton-line {
    animation: none;
  }
}
</style>
