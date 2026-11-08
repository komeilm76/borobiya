<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VBtn, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';

/** Service group management with capacity and incident coverage. */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const draft = ref({ name: '', color: '#0E6666', capacity: 12 });
const groups = computed(() => admin.groups);

async function create(): Promise<void> {
  try {
    await admin.createGroup({
      name: draft.value.name,
      color: draft.value.color,
      capacity: Number(draft.value.capacity),
      incidentIds: admin.incidentTypes.slice(0, 1).map((item) => item.id),
      status: 'active'
    });
    draft.value = { name: '', color: '#0E6666', capacity: 12 };
    toast.push('گروه ساخته شد.', 'success', 2400);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

onMounted(async () => {
  await Promise.all([admin.loadGroups(), admin.loadIncidentTypes()]);
});
</script>

<template>
  <section class="admin-page" data-testid="admin-groups">
    <article class="panel">
      <header class="panel__head"><h2>گروه‌های امداد</h2></header>
      <ul class="admin-list">
        <li v-for="group in groups" :key="group.id">
          <i class="group-dot" :style="{ background: group.color }" />
          <div>
            <strong>{{ group.name }}</strong>
            <small>ظرفیت {{ format.number(group.capacity) }} · {{ group.status }}</small>
          </div>
          <span class="status-pill status-pill--neutral">{{ format.number(group.memberCount) }} عضو</span>
        </li>
      </ul>
      <p v-if="!groups.length" class="panel__empty">گروهی تعریف نشده است.</p>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>گروه تازه</h2></header>
      <form class="stack-form" @submit.prevent="create">
        <VTextField v-model="draft.name" label="نام گروه" density="compact" />
        <VTextField v-model="draft.color" label="رنگ (#RRGGBB)" density="compact" />
        <VTextField v-model.number="draft.capacity" label="ظرفیت" type="number" density="compact" />
        <VBtn type="submit" color="primary" block>ساخت گروه</VBtn>
      </form>
    </article>
  </section>
</template>
