<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VAlert, VBtn, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';

/** User administration: search, role filter, activation toggle and account creation. */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const query = ref('');
const role = ref<string>('');
const draft = ref({ username: '', password: '', role: 'user' });
const formError = ref<string | null>(null);
const users = computed(() => admin.users?.items ?? []);
const roles = [
  { title: 'همه نقش‌ها', value: '' },
  { title: 'کاربر', value: 'user' },
  { title: 'امدادگر', value: 'responder' },
  { title: 'مدیر', value: 'admin' }
];

async function search(): Promise<void> {
  await admin.loadUsers({ q: query.value || undefined, role: role.value || undefined, page: 1, limit: 50 });
}

async function toggle(userId: string, active: boolean): Promise<void> {
  try {
    await admin.updateUser(userId, { active });
    toast.push(active ? 'حساب فعال شد.' : 'حساب غیرفعال شد.', 'success', 2200);
  } catch (caught) {
    toast.push(errorMessage(caught), 'error', 3800);
  }
}

async function create(): Promise<void> {
  formError.value = null;
  try {
    await admin.createUser({ ...draft.value, username: draft.value.username.trim().toLowerCase() });
    draft.value = { username: '', password: '', role: 'user' };
    toast.push('حساب ساخته شد؛ کاربر باید پرسش‌های امنیتی را کامل کند.', 'success', 3200);
  } catch (caught) {
    formError.value = errorMessage(caught);
  }
}

onMounted(() => void admin.loadUsers());
</script>

<template>
  <section class="admin-page" data-testid="admin-users">
    <article class="panel">
      <header class="panel__head">
        <h2>کاربران</h2>
        <div class="panel__filters">
          <VTextField v-model="query" density="compact" placeholder="جست‌وجو" hide-details clearable @keyup.enter="search" />
          <select v-model="role" class="admin-select" aria-label="نقش" @change="search">
            <option v-for="item in roles" :key="item.value" :value="item.value">{{ item.title }}</option>
          </select>
          <VBtn size="small" variant="tonal" @click="search">جست‌وجو</VBtn>
        </div>
      </header>
      <table class="admin-table">
        <thead>
          <tr><th>کاربر</th><th>نقش</th><th>وضعیت</th><th>امتیاز</th><th>عملیات</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in users" :key="item.id">
            <td>{{ item.username }}</td>
            <td>{{ item.role }}</td>
            <td>
              <span class="status-pill" :class="item.isActive ? 'status-pill--success' : 'status-pill--neutral'">
                {{ item.isActive ? 'فعال' : 'غیرفعال' }}
              </span>
            </td>
            <td>{{ format.number(item.averageRating.toFixed(1)) }}</td>
            <td>
              <button type="button" class="admin-action" @click="toggle(item.id, !item.isActive)">
                {{ item.isActive ? 'غیرفعال کردن' : 'فعال کردن' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="!users.length" class="panel__empty">کاربری یافت نشد.</p>
    </article>
    <article class="panel">
      <header class="panel__head"><h2>حساب تازه</h2></header>
      <form class="stack-form" @submit.prevent="create">
        <VTextField v-model="draft.username" label="نام کاربری" density="compact" />
        <VTextField v-model="draft.password" label="گذرواژه موقت" type="password" density="compact" />
        <select v-model="draft.role" class="admin-select" aria-label="نقش حساب تازه">
          <option value="user">کاربر</option>
          <option value="responder">امدادگر</option>
          <option value="admin">مدیر</option>
        </select>
        <VAlert v-if="formError" type="error" variant="tonal" density="compact">{{ formError }}</VAlert>
        <VBtn type="submit" color="primary" block>ساخت حساب</VBtn>
      </form>
    </article>
  </section>
</template>
