<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VAlert, VBtn, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import { groupStatusLabel } from '@/utils/status.ts';

/** Service group management with capacity and incident coverage. */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const draft = ref({ name: '', color: '#0E6666', capacity: 12 as number | string });
const formError = ref<string | null>(null);
const groups = computed(() => admin.groups);

/**
 * Checks the draft against the rules the server applies.
 *
 * Every one of these is rejected server-side with a bare "Invalid request.", so the form names the
 * rule instead. The incident coverage is the subtle one: the payload requires at least one incident
 * type, and it is taken from a catalog this screen loads in parallel, so a failed catalog load used
 * to make every submission fail with no visible cause.
 *
 * @returns The message to show, or null when the draft would be accepted.
 */
function draftIssue(): string | null {
  const name = draft.value.name.trim();
  if (name.length < 2) return 'نام گروه باید دست‌کم ۲ نویسه باشد.';
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.value.color)) return 'رنگ باید در قالب #RRGGBB باشد.';
  const capacity = Number(draft.value.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return 'ظرفیت باید عددی میان ۱ و ۵۰۰ باشد.';
  if (!admin.incidentTypes.length) return 'نوع حادثه‌ای در دسترس نیست؛ بی‌آن‌که گروه پوششی داشته باشد ساخته نمی‌شود.';
  return null;
}

async function create(): Promise<void> {
  formError.value = null;
  const issue = draftIssue();
  if (issue) {
    formError.value = issue;
    return;
  }
  try {
    await admin.createGroup({
      name: draft.value.name.trim(),
      color: draft.value.color,
      capacity: Number(draft.value.capacity),
      incidentIds: admin.incidentTypes.slice(0, 1).map((item) => item.id),
      status: 'active'
    });
    draft.value = { name: '', color: '#0E6666', capacity: 12 };
    toast.push('گروه ساخته شد.', 'success', 2400);
  } catch (caught) {
    formError.value = errorMessage(caught);
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
            <small>ظرفیت {{ format.number(group.capacity) }} · {{ groupStatusLabel(group.status) }}</small>
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
        <VAlert v-if="formError" type="error" variant="tonal" density="compact">{{ formError }}</VAlert>
        <VBtn type="submit" color="primary" block>ساخت گروه</VBtn>
      </form>
    </article>
  </section>
</template>
