<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { VAlert, VBtn, VSelect, VTextField } from 'vuetify/components';
import { useAdminStore } from '@/stores/admin.ts';
import AdminInlineError from '@/components/AdminInlineError.vue';
import { useFormatters } from '@/composables/useFormatters.ts';
import { errorMessage } from '@/api/client.ts';
import { useToast } from '@/composables/useToast.ts';
import type { IncidentTypeView } from '@/api/types.ts';

/**
 * Incident-type catalog: the label, glyph and color every surface (map, SOS form, groups,
 * reports) renders for a class of emergency. Create and inline edit are supported; the list
 * keeps the canonical rank order. Icon names are limited to the generated client subset and
 * re-checked server-side, so an administrator cannot ship an invisible type.
 */
const admin = useAdminStore();
const format = useFormatters();
const toast = useToast();
const HEX = /^#[0-9A-Fa-f]{6}$/;

const ICON_OPTIONS = [
  { title: 'هشدار عمومی', value: 'alert-outline' },
  { title: 'هشدار هشت‌گوش', value: 'alert-octagon' },
  { title: 'هشدار لوزی', value: 'alert-rhombus-outline' },
  { title: 'چراغ اضطراری', value: 'alarm-light' },
  { title: 'آمبولانس', value: 'ambulance' },
  { title: 'خودرو', value: 'car' },
  { title: 'تصادف خودرو', value: 'car-emergency' },
  { title: 'خرابی خودرو', value: 'car-wrench' },
  { title: 'آتش‌سوزی', value: 'fire' },
  { title: 'امداد انسانی', value: 'hand-heart-outline' },
  { title: 'پزشکی (ضربان قلب)', value: 'heart-pulse' },
  { title: 'سیل و آب‌گرفتگی', value: 'home-flood' },
  { title: 'ساختمان', value: 'home-outline' },
  { title: 'نجات', value: 'lifebuoy' },
  { title: 'کیف پزشکی', value: 'medical-bag' },
  { title: 'جاده', value: 'road-variant' },
  { title: 'چراغ راهنمایی', value: 'traffic-light' },
  { title: 'آب و موج', value: 'waves' },
  { title: 'خدمات فنی و تأسیسات', value: 'wrench-outline' }
];
const SWATCHES = [
  { title: 'قرمز امداد', value: '#AF3438' },
  { title: 'نارنجی آتش', value: '#B35A18' },
  { title: 'کهربایی', value: '#8C5609' },
  { title: 'آبی آب‌گرفتگی', value: '#316D86' },
  { title: 'سبزآبی', value: '#0E6666' },
  { title: 'زغالی خنثی', value: '#464E5A' }
];

const items = computed(() => [...admin.incidentTypes].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)));
/** How many groups cover each incident type — the "who answers this" fact, derived client-side from the roster. */
const coverage = computed(() => {
  const counts = new Map<string, number>();
  for (const group of admin.groups) {
    for (const id of group.incidentIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
});

const draft = ref({ label: '', icon: 'alert-outline', color: '#0E6666' });
const formError = ref<string | null>(null);
const saving = ref(false);

const editId = ref<string | null>(null);
const editDraft = ref({ label: '', icon: 'alert-outline', color: '#0E6666' });
const editError = ref<string | null>(null);
const editBusy = ref(false);

/** Validates a draft against the same rules the server applies, in the UI's language. */
function issueFor(value: { label: string; color: string }): string | null {
  if (!value.label.trim()) return 'برچسب نوع حادثه لازم است.';
  if (!HEX.test(value.color.trim())) return 'رنگ باید در قالب #RRGGBB باشد.';
  return null;
}
const isActive = (swatch: string, color: string): boolean => color.trim().toUpperCase() === swatch;

async function reload(): Promise<void> {
  await admin.loadIncidentTypes();
}

async function create(): Promise<void> {
  formError.value = null;
  const issue = issueFor(draft.value);
  if (issue) {
    formError.value = issue;
    return;
  }
  saving.value = true;
  try {
    await admin.createIncidentType({ label: draft.value.label.trim(), icon: draft.value.icon, color: draft.value.color.trim().toUpperCase() });
    draft.value = { label: '', icon: 'alert-outline', color: '#0E6666' };
    await reload();
    toast.push('نوع حادثه ساخته شد.', 'success', 2400);
  } catch (caught) {
    formError.value = errorMessage(caught);
  } finally {
    saving.value = false;
  }
}

/** Opens the inline editor for a catalog row, or closes it when it is already open. */
function startEdit(item: IncidentTypeView): void {
  if (editId.value === item.id) {
    editId.value = null;
    editError.value = null;
    return;
  }
  editId.value = item.id;
  editDraft.value = { label: item.label, icon: item.icon, color: item.color.toUpperCase() };
  editError.value = null;
}

async function saveEdit(): Promise<void> {
  const target = editId.value;
  if (!target) return;
  editError.value = null;
  const issue = issueFor(editDraft.value);
  if (issue) {
    editError.value = issue;
    return;
  }
  editBusy.value = true;
  try {
    await admin.updateIncidentType(target, {
      label: editDraft.value.label.trim(),
      icon: editDraft.value.icon,
      color: editDraft.value.color.trim().toUpperCase()
    });
    editId.value = null;
    await reload();
    toast.push('نوع حادثه به‌روزرسانی شد.', 'success', 2400);
  } catch (caught) {
    editError.value = errorMessage(caught);
  } finally {
    editBusy.value = false;
  }
}

async function reloadAll(): Promise<void> {
  await Promise.all([admin.loadIncidentTypes(), admin.loadGroups()]);
}

onMounted(() => void reloadAll());
</script>

<template>
  <section class="admin-page" data-testid="admin-incidents">
    <article class="panel">
      <header class="panel__head">
        <h2>نوع حادثه</h2>
        <span class="panel__hint">{{ format.number(items.length) }} مورد</span>
      </header>
      <p class="panel__hint">برچسب، آیکون و رنگ هر نوع در همهٔ سطوح (نقشه، فرم SOS، گروه‌ها و گزارش‌ها) یکسان است.</p>
      <div class="incident-grid">
        <div v-for="item in items" :key="item.id" class="incident-card" :data-testid="`incident-card-${item.id}`">
          <div class="incident-card__top">
            <span class="incident-card__chip" :style="{ background: `color-mix(in srgb, ${item.color} 14%, transparent)`, color: item.color }" aria-hidden="true">
              <span :class="['mdi', `mdi-${item.icon}`]" />
            </span>
            <div class="incident-card__identity">
              <strong>{{ item.label }}</strong>
              <small class="incident-item__id">شناسه: {{ item.id }}</small>
            </div>
            <button type="button" class="group-toggle" :aria-expanded="editId === item.id" :data-testid="`incident-edit-${item.id}`" :aria-label="`ویرایش ${item.label}`" @click="startEdit(item)">
              <span class="mdi mdi-pencil-outline" aria-hidden="true" />
            </button>
          </div>
          <p class="incident-card__foot">{{ format.number(coverage.get(item.id) ?? 0) }} گروه پوشش می‌دهد · رتبهٔ {{ format.number(item.rank ?? 0) }}</p>
        </div>
      </div>

      <form v-if="editId" class="incident-edit" :data-testid="`incident-edit-form-${editId}`" @submit.prevent="saveEdit">
        <p class="incident-edit__title">ویرایش نوع حادثه</p>
        <VTextField v-model="editDraft.label" label="برچسب" density="compact" :disabled="editBusy" maxlength="80" />
        <VSelect v-model="editDraft.icon" :items="ICON_OPTIONS" label="آیکون" density="compact" :disabled="editBusy" />
        <div class="incident-swatches" role="group" aria-label="رنگ">
          <button v-for="swatch in SWATCHES" :key="swatch.value" type="button" class="incident-swatch" :class="{ 'is-active': isActive(swatch.value, editDraft.color) }" :style="{ background: swatch.value }" :title="swatch.title" :aria-label="swatch.title" :aria-pressed="isActive(swatch.value, editDraft.color)" :disabled="editBusy" @click="editDraft.color = swatch.value" />
        </div>
        <VTextField v-model="editDraft.color" label="رنگ (#RRGGBB)" density="compact" :disabled="editBusy" maxlength="7" />
        <VAlert v-if="editError" type="error" variant="tonal" density="compact" :data-testid="`incident-edit-error-${editId}`">{{ editError }}</VAlert>
        <div class="incident-edit__actions">
          <VBtn type="submit" color="primary" :loading="editBusy">ذخیرهٔ تغییرات</VBtn>
          <VBtn type="button" variant="text" :disabled="editBusy" @click="editId = null">انصراف</VBtn>
        </div>
      </form>
      <div v-if="admin.loading && !items.length" class="skeleton-stack" role="status" data-testid="incidents-loading" aria-label="در حال بارگذاری انواع حادثه">
        <div v-for="row in 4" :key="row" class="skeleton-stack__row">
          <span class="skeleton skeleton--avatar" />
          <span class="skeleton skeleton--bar skeleton--bar-wide" />
        </div>
      </div>
      <p v-else-if="!items.length" class="panel__empty">هنوز نوع حادثه‌ای تعریف نشده است.</p>
    </article>

    <article class="panel">
      <header class="panel__head"><h2>نوع حادثهٔ تازه</h2></header>
      <form class="stack-form" data-testid="incident-create" @submit.prevent="create">
        <VTextField v-model="draft.label" label="برچسب نوع حادثه" density="compact" hide-details maxlength="80" />
        <VSelect v-model="draft.icon" :items="ICON_OPTIONS" density="compact" hide-details aria-label="آیکون" />
        <div class="incident-swatches" role="group" aria-label="رنگ">
          <button v-for="swatch in SWATCHES" :key="swatch.value" type="button" class="incident-swatch" :class="{ 'is-active': isActive(swatch.value, draft.color) }" :style="{ background: swatch.value }" :title="swatch.title" :aria-label="swatch.title" :aria-pressed="isActive(swatch.value, draft.color)" @click="draft.color = swatch.value" />
        </div>
        <VTextField v-model="draft.color" label="رنگ (#RRGGBB)" density="compact" hide-details maxlength="7" />
        <VAlert v-if="formError" type="error" variant="tonal" density="compact" data-testid="incident-form-error">{{ formError }}</VAlert>
        <VBtn type="submit" color="primary" block :loading="saving">ساخت نوع حادثه</VBtn>
      </form>
    </article>
    <AdminInlineError testid="incidents" :retry="reloadAll" />
  </section>
</template>

<style scoped>
.incident-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.incident-card { border: 1px solid var(--border); border-radius: var(--r12); padding: 12px; display: grid; gap: 10px; align-content: start; background: var(--surface); }
.incident-card__top { display: flex; align-items: center; gap: 10px; }
.incident-card__chip { inline-size: 44px; block-size: 44px; border-radius: var(--r11); display: inline-flex; align-items: center; justify-content: center; font-size: 22px; flex-shrink: 0; }
.incident-card__identity { flex: 1; min-width: 0; }
.incident-card__identity strong { display: block; font-size: 13px; }
.incident-item__id { opacity: .65; }
.incident-card__foot { margin: 0; font-size: 11px; color: var(--muted); }
.group-toggle { display: inline-flex; align-items: center; justify-content: center; inline-size: 36px; block-size: 36px; border-radius: var(--r11); border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; transition: color .15s, border-color .15s; flex-shrink: 0; }
.group-toggle:hover { color: var(--primary); border-color: var(--primary); }
.incident-edit { display: grid; gap: 10px; padding: 12px; border: 1px dashed var(--border); border-radius: var(--r12); margin-top: 12px; }
.incident-edit__title { margin: 0; font-size: 12px; font-weight: 700; color: var(--muted); }
.incident-edit__actions { display: flex; gap: 8px; }
.incident-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.incident-swatch { inline-size: 28px; block-size: 28px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; box-shadow: 0 0 0 1px var(--border); transition: transform .12s, box-shadow .12s; }
.incident-swatch:hover { transform: scale(1.12); }
.incident-swatch.is-active { border-color: var(--surface); box-shadow: 0 0 0 2px var(--primary); }
</style>
