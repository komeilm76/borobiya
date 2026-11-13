<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VBtn, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import { useFormatters } from '@/composables/useFormatters.ts';
import { tryDownloadPreviewCsv } from '@/preview/demo-downloads.ts';

/** Audit log with a text filter and CSV export. */
const admin = useAdminStore();
const format = useFormatters();
/** Persian labels for audit actions — raw dotted enums must never reach the UI. */
const ACTION_LABELS: Record<string, string> = {
  'user.create': 'ایجاد کاربر',
  'user.update': 'ویرایش کاربر',
  'user_ready_toggle': 'تغییر آماده‌باش',
  'group.create': 'ایجاد گروه امداد',
  'group.update': 'ویرایش گروه امداد',
  'group.member.add': 'افزودن عضو گروه',
  'group.member.remove': 'حذف عضو گروه',
  'alert.resolve': 'بستن هشدار',
  'settings.update': 'تغییر تنظیمات',
  'job-type.create': 'ایجاد نوع خدمت',
  'job-type.update': 'ویرایش نوع خدمت',
  'job-type.delete': 'حذف نوع خدمت',
  'incident-type.create': 'ایجاد نوع حادثه',
  'incident-type.update': 'ویرایش نوع حادثه',
  'mission_offer_accept': 'پذیرش پیشنهاد مأموریت',
  'support_request_created': 'ثبت درخواست پشتیبانی',
  'support_request_approved': 'تأیید درخواست پشتیبانی',
  'support_request_rejected': 'رد درخواست پشتیبانی',
  'support_request_cancelled': 'لغو درخواست پشتیبانی',
  'sos.requeued': 'بازگرداندن SOS به صف',
  'mission_team.dispatched': 'اعزام تیمی',
  'mission_requirements.updated': 'بروزرسانی نیازمندی‌های مأموریت',
  'mission_offer.expired': 'انقضای پیشنهاد مأموریت',
  'mission_offer.superseded': 'جایگزینی پیشنهاد مأموریت',
  'mission_member.added': 'افزودن عضو مأموریت',
  'mission_member.removed': 'حذف عضو مأموریت',
  'mission_leader.designated': 'تعیین رهبر مأموریت',
  'mission_complete': 'تکمیل مأموریت',
  'location_share.created': 'ایجاد اشتراک موقعیت',
  'location_share.revoked': 'لغو اشتراک موقعیت',
  'admin.track.read': 'مشاهده مسیر',
  'user.record_track': 'ثبت مسیر',
  'track.consent': 'رضایت ردیابی',
  'admin_login': 'ورود مدیر',
  'share_create': 'ایجاد اشتراک',
  'assign': 'اعزام'
};
// Unmapped actions render verbatim — inventing a translation would misstate what happened.
const actionLabel = (action: string): string => ACTION_LABELS[action] ?? action;const query = ref('');
const entries = computed(() => admin.audit?.items ?? []);

async function search(): Promise<void> {
  await admin.loadAudit({ q: query.value || undefined, limit: 100 });
}

function saveCsv(event: MouseEvent): void {
  if (tryDownloadPreviewCsv('/_admin/audit.csv')) event.preventDefault();
}

onMounted(() => void admin.loadAudit());
</script>

<template>
  <section class="admin-page" data-testid="admin-audit">
    <article class="panel">
      <header class="panel__head">
        <h2>رویدادهای سیستم</h2>
        <div class="panel__filters">
          <VTextField v-model="query" density="compact" placeholder="جست‌وجو در رویداد" hide-details @keyup.enter="search" />
          <VBtn size="small" variant="tonal" @click="search">جست‌وجو</VBtn>
          <a class="admin-action" href="/_admin/audit.csv" download @click="saveCsv">CSV</a>
        </div>
      </header>
      <table class="admin-table">
        <thead><tr><th>زمان</th><th>عامل</th><th>کنش</th><th>هدف</th></tr></thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <td>{{ format.dateTime(entry.createdAt) }}</td>
            <td>{{ entry.actorUsername ?? '—' }}</td>
            <td>{{ actionLabel(entry.action) }}</td>
            <td>{{ entry.target }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="!entries.length" class="panel__empty">رویدادی ثبت نشده است.</p>
    </article>
  </section>
</template>
