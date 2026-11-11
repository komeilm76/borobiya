<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VAlert, VBtn, VSelect, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import type { AdminJobTypeView } from '@/api/types.ts';

/**
 * Job types govern who receives offers and under which readiness policy.
 * `all` = the responder receives offers even when not ready (Policy A); accepting flips them ready.
 * `ready_only` = the responder only receives offers while on standby (Policy B).
 */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const items = ref<AdminJobTypeView[]>([]);
const formError = ref<string | null>(null);
const draft = ref({ label: '', offerPolicy: 'ready_only' as 'all' | 'ready_only' });
const policies = [
  { title: 'فقط وقتی آماده است (Policy B)', value: 'ready_only' },
  { title: 'همیشه پیشنهاد بگیر (Policy A؛ پذیرش = آماده شدن)', value: 'all' }
];
const policyLabel = (value: string): string => policies.find((policy) => policy.value === value)?.title ?? value;

async function reload(): Promise<void> {
  items.value = await admin.loadJobTypes();
}

async function create(): Promise<void> {
  formError.value = null;
  const label = draft.value.label.trim();
  if (!label) {
    formError.value = 'برچسب نوع شغل لازم است.';
    return;
  }
  try {
    await admin.createJobType({ label, offerPolicy: draft.value.offerPolicy });
    draft.value = { label: '', offerPolicy: 'ready_only' };
    await reload();
    toast.push('نوع شغل ساخته شد.', 'success', 2400);
  } catch (caught) {
    formError.value = errorMessage(caught);
  }
}

async function togglePolicy(jobType: AdminJobTypeView): Promise<void> {
  try {
    await admin.updateJobType(jobType.id, { offerPolicy: jobType.offerPolicy === 'all' ? 'ready_only' : 'all' });
    await reload();
    toast.push('سیاست پیشنهاد به‌روزرسانی شد.', 'success', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

async function toggleActive(jobType: AdminJobTypeView): Promise<void> {
  try {
    await admin.updateJobType(jobType.id, { active: !jobType.active });
    await reload();
    toast.push(jobType.active ? 'نوع شغل غیرفعال شد.' : 'نوع شغل فعال شد.', 'success', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

const sortedItems = computed(() => [...items.value].sort((a, b) => a.rank - b.rank));

onMounted(() => void reload());
</script>

<template>
  <section class="admin-page" data-testid="admin-job-types">
    <article class="panel">
      <header class="panel__head">
        <h2>نوع شغل امدادگر</h2>
        <span class="panel__hint">{{ format.number(items.length) }} مورد</span>
      </header>
      <p class="panel__hint">Policy A همه کاربران آن نوع را در پیشنهادها نگه می‌دارد و پذیرش مأموریت آن‌ها را آماده می‌کند؛ Policy B فقط کاربران آماده را نمایش می‌دهد.</p>
      <ul class="admin-list">
        <li v-for="item in sortedItems" :key="item.id">
          <span :class="['mdi', item.offerPolicy === 'all' ? 'mdi-account-check-outline' : 'mdi-account-clock-outline']" aria-hidden="true" />
          <div>
            <strong>{{ item.label }} <small style="opacity:.65">{{ item.id }}</small></strong>
            <small>{{ policyLabel(item.offerPolicy) }} · {{ format.number(item.memberCount) }} امدادگر فعال</small>
          </div>
          <button type="button" class="admin-action" data-testid="job-type-policy-toggle"
                  @click="togglePolicy(item)">
            {{ item.offerPolicy === 'all' ? 'تبدیل به Policy B' : 'تبدیل به Policy A' }}
          </button>
          <button type="button" class="admin-action" data-testid="job-type-active-toggle"
                  @click="toggleActive(item)">
            {{ item.active ? 'غیرفعال‌سازی' : 'فعال‌سازی' }}
          </button>
        </li>
      </ul>
      <p v-if="!items.length" class="panel__empty">هنوز نوع شغلی تعریف نشده است.</p>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>نوع شغل تازه</h2></header>
      <form class="stack-form" data-testid="job-type-create" @submit.prevent="create">
        <VTextField v-model="draft.label" label="برچسب نوع شغل" density="compact" hide-details maxlength="80" />
        <VSelect v-model="draft.offerPolicy" :items="policies" density="compact" hide-details />
        <VAlert v-if="formError" type="error" variant="tonal" density="compact" data-testid="job-type-form-error">{{ formError }}</VAlert>
        <VBtn type="submit" color="primary" block>ساخت نوع شغل</VBtn>
      </form>
    </article>
  </section>
</template>
