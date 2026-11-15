<script setup lang="ts">
import { ref } from 'vue';
import { useAdminStore } from '@/stores/admin.ts';

/**
 * Shared inline load-failure surface for the administrator console. The admin store's
 * `guard()` swallows loader failures into the shared `error` ref (it never throws), so
 * screens that showed nothing stayed silently empty after a failed first load. This panel
 * renders the last load error with a retry that re-issues the screen's own primary pull;
 * it renders nothing while there is no error. The retry is disabled and relabelled while
 * the re-pull is in flight.
 *
 * The message is the store's shared `error` — the same ref the overview screen surfaces,
 * so any admin load failure (including mutations) can appear here; keep in mind the retry
 * re-pulls lists, not the mutation that failed.
 */
const props = defineProps<{
  /** Re-pull for the screen's primary data (the same work its mount hook does). */
  retry: () => Promise<unknown>;
  /** Prefix for the `-error` / `-retry` test ids, e.g. `groups` -> `groups-error`. */
  testid: string;
}>();

const admin = useAdminStore();
const retrying = ref(false);

async function go(): Promise<void> {
  if (retrying.value) return;
  retrying.value = true;
  try {
    await props.retry();
  } finally {
    retrying.value = false;
  }
}
</script>

<template>
  <p v-if="admin.error" class="panel__error" role="alert" :data-testid="`${props.testid}-error`">
    <span>{{ admin.error }}</span>
    <button
      type="button"
      class="admin-offline__retry"
      :disabled="retrying"
      :data-testid="`${props.testid}-retry`"
      @click="go"
    >
      <span :class="['mdi', retrying ? 'mdi-loading is-spinning' : 'mdi-refresh']" aria-hidden="true" />
      <span>{{ retrying ? 'در حال تلاش…' : 'تلاش دوباره' }}</span>
    </button>
  </p>
</template>
