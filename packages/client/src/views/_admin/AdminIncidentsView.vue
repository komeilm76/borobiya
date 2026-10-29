<template>
  <section class="admin-incidents-page mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
    <header class="admin-incidents-header mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="admin-incidents-eyebrow text-sm font-medium opacity-70">
          <v-icon icon="mdi-shield-account-outline" size="17" /> پنل مدیریت
        </p>
        <h1 class="text-2xl font-bold">نوع رویدادها</h1>
        <p class="admin-incidents-intro mt-1 max-w-prose opacity-80">
          فهرست نوع رویداد همان چیزی است که هنگام ثبت SOS انتخاب می‌شود. چیزی به‌طور پیش‌فرض ساخته نشده؛
          تا این فهرست خالی است، هیچ درخواستی نمی‌تواند ثبت شود.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <v-btn class="admin-incidents-refresh" variant="tonal" color="primary" rounded="lg" :loading="loading" :disabled="loading" @click="load">
          <v-icon class="me-2" icon="mdi-refresh" />
          به‌روزرسانی
        </v-btn>
        <v-btn class="admin-incidents-create" color="primary" rounded="lg" prepend-icon="mdi-plus" @click="openCreate">
          نوع رویداد جدید
        </v-btn>
      </div>
    </header>

    <v-alert v-if="listError" class="mb-4" type="error" variant="tonal" rounded="lg" role="alert">{{ listError }}</v-alert>
    <v-alert v-if="listState === 'empty'" class="mb-4" type="info" variant="tonal" rounded="lg">
      هنوز هیچ نوع رویدادی تعریف نشده است. برای اولین نوع، «نوع رویداد جدید» را بزنید.
    </v-alert>

    <v-card elevation="0" rounded="xl" class="overflow-hidden">
      <p v-if="listState === 'loading'" class="sr-only" role="status" aria-live="polite">در حال بارگذاری نوع رویدادها…</p>
      <v-progress-linear v-if="listState === 'refreshing'" indeterminate color="primary" aria-label="در حال تازه‌سازی نوع رویدادها" />
      <v-table class="admin-incidents-table" :aria-busy="loading">
        <thead>
          <tr>
            <th>نام</th>
            <th>نامک</th>
            <th>نماد</th>
            <th>رنگ</th>
            <th>توضیح</th>
            <th aria-label="عملیات"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="listState === 'loading'">
            <td colspan="6">
              <v-skeleton-loader v-for="row in 3" :key="row" type="list-item-two-line" aria-hidden="true" />
            </td>
          </tr>
          <tr v-for="type in types" :key="type.id" class="admin-incidents-row" :data-slug="type.slug">
            <td class="font-medium">{{ type.name }}</td>
            <td><code class="admin-incidents-slug">{{ type.slug }}</code></td>
            <td><v-icon v-if="type.icon" :icon="type.icon" size="20" /><span v-else class="opacity-50">—</span></td>
            <td>
              <span v-if="type.color" class="admin-incidents-swatch" :style="{ backgroundColor: type.color }" :title="type.color" />
              <span v-else class="opacity-50">—</span>
            </td>
            <td class="admin-incidents-description">{{ type.description || "—" }}</td>
            <td class="text-start">
              <v-btn size="small" variant="text" prepend-icon="mdi-pencil-outline" @click="openEdit(type)">ویرایش</v-btn>
            </td>
          </tr>
          <tr v-if="listState === 'error'">
            <td colspan="6" class="py-6 text-center">
              دریافت نوع رویدادها انجام نشد.
              <v-btn size="small" variant="text" color="primary" @click="load">تلاش دوباره</v-btn>
            </td>
          </tr>
          <tr v-if="listState === 'empty'">
            <td colspan="6" class="py-6 text-center opacity-60">موردی برای نمایش نیست.</td>
          </tr>
        </tbody>
      </v-table>
      <ul class="admin-incidents-mobile" aria-label="نوع رویدادها" :aria-busy="loading">
        <li v-if="listState === 'loading'" class="admin-incidents-mobile__card" aria-hidden="true">
          <v-skeleton-loader v-for="row in 3" :key="row" type="list-item-two-line" />
        </li>
        <li v-for="type in types" :key="type.id" class="admin-incidents-mobile__card">
          <div class="admin-incidents-mobile__heading">
            <h2>{{ type.name }}</h2>
            <v-btn variant="tonal" size="small" prepend-icon="mdi-pencil-outline"
              :aria-label="`ویرایش ${type.name}`" @click="openEdit(type)">ویرایش</v-btn>
          </div>
          <dl class="admin-incidents-mobile__details">
            <div><dt>نامک</dt><dd><code class="admin-incidents-slug" dir="ltr">{{ type.slug }}</code></dd></div>
            <div><dt>نماد</dt><dd><v-icon v-if="type.icon" :icon="type.icon" size="20" /><span v-else>—</span></dd></div>
            <div><dt>رنگ</dt><dd>
              <span v-if="type.color" class="admin-incidents-swatch" :style="{ backgroundColor: type.color }" aria-hidden="true" />
              {{ type.color || "—" }}
            </dd></div>
            <div><dt>توضیح</dt><dd>{{ type.description || "—" }}</dd></div>
          </dl>
        </li>
        <li v-if="listState === 'error'" class="admin-incidents-mobile__card">
          دریافت نوع رویدادها انجام نشد.
          <v-btn variant="tonal" color="primary" @click="load">تلاش دوباره</v-btn>
        </li>
        <li v-if="listState === 'empty'" class="admin-incidents-mobile__card">موردی برای نمایش نیست.</li>
      </ul>
    </v-card>

    <v-dialog v-model="formOpen" max-width="640" scrollable persistent>
      <v-card rounded="xl" :title="editing ? `ویرایش ${editing.name}` : 'نوع رویداد جدید'">
        <v-card-text>
          <v-form class="grid gap-4" @submit.prevent="submit">
            <v-text-field
              v-model="draft.name"
              label="نام"
              density="comfortable"
              variant="outlined"
              rounded="lg"
              :error-messages="fieldErrors.name ?? ''"
              :disabled="saving"
              data-test="incident-name"
            />
            <v-text-field
              v-model="draft.slug"
              label="نامک (اختیاری)"
              :hint="slugHint"
              persistent-hint
              density="comfortable"
              variant="outlined"
              rounded="lg"
              :error-messages="fieldErrors.slug ?? ''"
              :disabled="saving"
            />
            <div class="grid gap-4 sm:grid-cols-2">
              <v-text-field
                v-model="draft.icon"
                label="نماد"
                placeholder="mdi-waves"
                hint="نام یک آیکن mdi؛ خالی بگذارید تا نمادی نباشد."
                persistent-hint
                density="comfortable"
                variant="outlined"
                rounded="lg"
                :error-messages="fieldErrors.icon ?? ''"
                :disabled="saving"
              />
              <v-text-field
                v-model="draft.color"
                label="رنگ"
                placeholder="#0ea5e9"
                hint="همان چیزی که در نقشه دیده می‌شود؛ خالی برای حذف."
                persistent-hint
                density="comfortable"
                variant="outlined"
                rounded="lg"
                :error-messages="fieldErrors.color ?? ''"
                :disabled="saving"
              />
            </div>
            <v-textarea
              v-model="draft.description"
              label="توضیح"
              rows="3"
              density="comfortable"
              variant="outlined"
              rounded="lg"
              :error-messages="fieldErrors.description ?? ''"
              :disabled="saving"
            />
            <v-alert v-if="formError" type="error" variant="tonal" rounded="lg" role="alert">{{ formError }}</v-alert>
            <p v-if="formNotice" class="admin-incidents-notice text-sm opacity-80" aria-live="polite">{{ formNotice }}</p>
          </v-form>
        </v-card-text>
        <v-card-actions class="admin-catalog-dialog-actions">
          <v-spacer />
          <v-btn variant="text" rounded="lg" :disabled="saving" @click="closeForm">انصراف</v-btn>
          <v-btn color="primary" variant="flat" rounded="lg" :loading="saving" @click="submit">ذخیره</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="successVisible" color="success" location="bottom start" timeout="4000" rounded="lg">
      {{ successMessage }}
    </v-snackbar>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { IncidentType } from "@shared/index";
import { friendlyErrorMessage } from "../../api/error-message";
import { createIncidentType, listIncidentTypes, updateIncidentType } from "../../api/admin-catalog";
import {
  EMPTY_INCIDENT_DRAFT,
  incidentCreateBody,
  incidentDraftFromType,
  incidentPatchBody,
  incidentSlugPreview,
  requiredNameError,
  slugNeedsManualEntry,
  slugConflictTarget,
  type CatalogFieldErrors,
  type IncidentFormDraft
} from "../../admin/catalog-form";
import { catalogListPresentation } from "../../admin/catalog-list-presentation";
import { useAuthStore } from "../../stores/auth";

const auth = useAuthStore();

const types = ref<IncidentType[]>([]);
const loading = ref(true);
const listError = ref("");
const listState = computed(() => catalogListPresentation(loading.value, types.value.length, listError.value));
const formOpen = ref(false);
const saving = ref(false);
const editing = ref<IncidentType | null>(null);
const draft = ref<IncidentFormDraft>({ ...EMPTY_INCIDENT_DRAFT });
const fieldErrors = ref<CatalogFieldErrors>({});
const formError = ref("");
const formNotice = ref("");
const successVisible = ref(false);
const successMessage = ref("");

let requestVersion = 0;
let activeController: AbortController | null = null;

/**
 * A mounted admin page outlives a 15-minute access token, so every request goes through
 * `ensureSession()` first — the same reason the user table refreshes before it loads or writes.
 */
async function adminToken(): Promise<string | null> {
  await auth.ensureSession();
  return auth.accessToken;
}

async function load(): Promise<void> {
  const version = ++requestVersion;
  activeController?.abort();
  const controller = new AbortController();
  activeController = controller;
  listError.value = "";
  loading.value = true;
  try {
    const accessToken = await adminToken();
    if (version !== requestVersion) return;
    if (!accessToken) {
      listError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }
    const records = await listIncidentTypes(accessToken, controller.signal);
    if (version !== requestVersion) return;
    types.value = records;
  } catch (error) {
    if (controller.signal.aborted || version !== requestVersion) return;
    listError.value = friendlyErrorMessage(error, "بارگذاری فهرست نوع رویدادها انجام نشد. دوباره تلاش کنید.");
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

const slugHint = computed(() => {
  if (editing.value) {
    // Renaming a slug is legal (the PATCH route validates and reports conflicts), so the form says what
    // changing it costs rather than forbidding it: the slug is the value clients hardcode.
    return "نامک همان چیزی است که کلاینت‌ها به آن ارجاع می‌دهند؛ تغییرش ارجاع‌های بیرونی را می‌شکند.";
  }
  const preview = incidentSlugPreview(draft.value.name);
  if (draft.value.slug.trim()) return "همین مقدار ذخیره می‌شود.";
  if (!preview) return "این نام از حروف لاتین و عدد ساخته نشده، پس نامک خودتان را بنویسید.";
  return `اگر خالی بگذارید، از نام ساخته می‌شود: ${preview}`;
});

function openCreate(): void {
  editing.value = null;
  draft.value = { ...EMPTY_INCIDENT_DRAFT };
  fieldErrors.value = {};
  formError.value = "";
  formNotice.value = "";
  formOpen.value = true;
}

function openEdit(type: IncidentType): void {
  editing.value = type;
  draft.value = incidentDraftFromType(type);
  fieldErrors.value = {};
  formError.value = "";
  formNotice.value = "";
  formOpen.value = true;
}

function closeForm(): void {
  formOpen.value = false;
}

function describeConflict(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const owner = slugConflictTarget(error, types.value);
  if (owner) return `نامک «${owner.slug}» در دست «${owner.name}» است؛ نام یا نامک دیگری انتخاب کنید.`;
  return null;
}

async function submit(): Promise<void> {
  if (saving.value) return;

  const missingName = requiredNameError(draft.value.name);
  if (missingName) {
    fieldErrors.value = { name: missingName };
    return;
  }

  // Create and edit differ in verb and in body type, so each half decides its own request and the tail
  // below is shared. A union of the two bodies would typecheck only with a cast, and a cast here would
  // hide the one thing worth seeing: that a rename cannot send a create's payload.
  let send: (accessToken: string) => Promise<IncidentType>;
  if (editing.value) {
    const patch = incidentPatchBody(editing.value, draft.value);
    if (patch.status === "invalid") {
      fieldErrors.value = patch.fieldErrors;
      return;
    }
    // The route would answer 400 to an empty patch; the dialog says so first, because "nothing changed"
    // is information about the admin's edit rather than an error to be recovered from.
    if (patch.status === "unchanged") {
      fieldErrors.value = {};
      formNotice.value = "چیزی تغییر نکرد؛ همان مقادیر ذخیره شده‌اند.";
      return;
    }
    const target = editing.value.id;
    send = (accessToken) => updateIncidentType(target, patch.body, accessToken);
  } else {
    // `deriveIncidentSlug` returning null is a `400` server-side, so the form asks the same question
    // first and puts the answer under the one field that can fix it.
    if (slugNeedsManualEntry(draft.value)) {
      fieldErrors.value = { slug: "این نام نامک نمی‌سازد؛ یک نامک بنویسید." };
      return;
    }
    const create = incidentCreateBody(draft.value);
    if (create.status === "invalid") {
      fieldErrors.value = create.fieldErrors;
      return;
    }
    send = (accessToken) => createIncidentType(create.body, accessToken);
  }

  saving.value = true;
  formError.value = "";
  fieldErrors.value = {};
  try {
    const accessToken = await adminToken();
    if (!accessToken) {
      formError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }
    const saved = await send(accessToken);

    formOpen.value = false;
    successMessage.value = editing.value ? `${saved.name} به‌روزرسانی شد.` : `${saved.name} به فهرست اضافه شد.`;
    successVisible.value = true;
    await load();
  } catch (error) {
    const conflict = describeConflict(error);
    if (conflict) {
      fieldErrors.value = { slug: conflict };
      formError.value = "";
    } else {
      formError.value = friendlyErrorMessage(error, "ذخیرهٔ نوع رویداد انجام نشد. دوباره تلاش کنید.");
    }
  } finally {
    saving.value = false;
  }
}

onMounted(() => {
  void load();
});

onUnmounted(() => {
  requestVersion += 1;
  activeController?.abort();
});
</script>

<style scoped>
.admin-incidents-swatch {
  display: inline-block;
  width: 16px;
  height: 16px;
  border-radius: 4px;
  border: 1px solid rgb(0 0 0 / 0.15);
  vertical-align: middle;
}

.admin-incidents-slug {
  font-family: monospace;
  font-size: 0.85em;
}

.admin-incidents-description {
  max-width: 24rem;
  overflow-wrap: anywhere;
}

.admin-incidents-mobile { display: none; margin: 0; padding: 0; list-style: none; }
.admin-incidents-mobile__card { min-width: 0; padding: 1rem; border-block-start: 1px solid rgba(var(--v-theme-on-surface), .12); overflow-wrap: anywhere; }
.admin-incidents-mobile__heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .75rem; }
.admin-incidents-mobile__heading h2 { min-width: 0; font-size: 1rem; font-weight: 700; }
.admin-incidents-mobile__details { display: grid; gap: .6rem; margin-block-start: .75rem; }
.admin-incidents-mobile__details > div { display: grid; grid-template-columns: minmax(4rem, .35fr) minmax(0, 1fr); gap: .5rem; }
.admin-incidents-mobile__details dt { opacity: .75; }
.admin-incidents-mobile__details dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }

@media (max-width: 850px) {
  .admin-incidents-table { display: none; }
  .admin-incidents-mobile { display: grid; }
  .admin-incidents-mobile__heading :deep(.v-btn) { min-height: 44px; }
}

@media (max-width: 600px) {
  .admin-catalog-dialog-actions { flex-direction: column; align-items: stretch; }
  .admin-catalog-dialog-actions :deep(.v-spacer) { display: none; }
  .admin-catalog-dialog-actions :deep(.v-btn) { width: 100%; min-height: 44px; height: auto; white-space: normal; }
}
</style>
