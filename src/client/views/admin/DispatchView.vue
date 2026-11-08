<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';

/** Dispatch board: pending SOS requests on the right, groups on the left. */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const queue = computed(() => admin.dispatchQueue?.items ?? []);

async function dispatch(sosId: string): Promise<void> {
  const group = admin.groups[0];
  if (!group) {
    toast.push('گروهی برای اعزام تعریف نشده است.', 'warning', 3200);
    return;
  }
  try {
    await admin.dispatch(sosId, group.id, ['usr_responder']);
    toast.push('درخواست اعزام شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

onMounted(() => void admin.loadDispatch());
</script>

<template>
  <section class="admin-page" data-testid="admin-dispatch">
    <article class="panel">
      <header class="panel__head">
        <h2>صف اعزام</h2>
        <span class="panel__hint">{{ format.number(queue.length) }} درخواست</span>
      </header>
      <ul class="admin-list">
        <li v-for="item in queue" :key="item.id">
          <span class="mdi mdi-alarm-light-outline" aria-hidden="true" />
          <div>
            <strong>{{ item.incidentLabel }} · {{ item.severity }}</strong>
            <small>{{ item.description }}</small>
          </div>
          <button type="button" class="admin-action" @click="dispatch(item.id)">اعزام</button>
        </li>
      </ul>
      <p v-if="!queue.length" class="panel__empty">صف اعزام خالی است.</p>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>گروه‌های امداد</h2></header>
      <ul class="admin-list">
        <li v-for="group in admin.groups" :key="group.id">
          <i class="group-dot" :style="{ background: group.color }" />
          <div>
            <strong>{{ group.name }}</strong>
            <small>ظرفیت {{ format.number(group.capacity) }} · {{ group.status }}</small>
          </div>
          <span class="status-pill status-pill--neutral">{{ format.number(group.incidentIds.length) }} نوع</span>
        </li>
      </ul>
    </article>
  </section>
</template>
