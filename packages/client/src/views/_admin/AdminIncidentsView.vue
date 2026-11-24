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
        <v-btn class="admin-incidents-create" color="primary" rounded="lg" prepend-icon="mdi-plus" @click="openCreate($event)">
          نوع رویداد جدید
        </v-btn>
      </div>
    </header>

    <v-alert v-if="listError" class="mb-4" type="error" variant="tonal" rounded="lg" role="alert">{{ listError }}</v-alert>
    <v-alert v-if="listState === 'empty'" class="mb-4" type="info" variant="tonal" rounded="lg">
      هنوز هیچ نوع رویدادی تعریف نشده است. برای اولین نوع، «نوع رویداد جدید» را بزنید.
    </v-alert>

    <v-card elevation="0" rounded="xl" class="overflow-hidden bb-surface-card">
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
            <th class="admin-incidents-actions-heading">عملیات</th>
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
            <td class="admin-incidents-actions">
              <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-pencil-outline"
                :aria-label="`ویرایش ${type.name}`" @click="openEdit(type, $event)">ویرایش</v-btn>
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
      <ul v-if="types.length || listState === 'loading'" class="admin-incidents-mobile" aria-label="نوع رویدادها" :aria-busy="loading" role="list">
        <li v-if="listState === 'loading'" class="admin-incidents-mobile__card" aria-hidden="true">
          <v-skeleton-loader v-for="row in 3" :key="row" type="list-item-two-line" />
        </li>
        <li v-for="type in types" :key="type.id" class="admin-incidents-mobile__card">
          <div class="admin-incidents-mobile__heading">
            <h2>{{ type.name }}</h2>
            <v-btn variant="tonal" color="primary" size="small" prepend-icon="mdi-pencil-outline"
              :aria-label="`ویرایش ${type.name}`" @click="openEdit(type, $event)">ویرایش</v-btn>
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
      </ul>
      <div v-if="listState === 'error'" class="admin-incidents-mobile admin-incidents-mobile__card">
        دریافت نوع رویدادها انجام نشد.
        <v-btn variant="tonal" color="primary" @click="load">تلاش دوباره</v-btn>
      </div>
      <p v-if="listState === 'empty'" class="admin-incidents-mobile admin-incidents-mobile__card" role="status">موردی برای نمایش نیست.</p>
    </v-card>

    <v-dialog v-model="formOpen" max-width="760" scrollable persistent :fullscreen="isPhone"
      aria-labelledby="admin-incident-form-title" @after-leave="restoreFormFocus">
      <v-card class="admin-incident-form" rounded="xl" dir="rtl">
        <header class="admin-incident-form__header">
          <span class="admin-incident-form__header-icon" aria-hidden="true">
            <v-icon :icon="editing ? 'mdi-pencil-outline' : 'mdi-alert-circle-outline'" size="25" />
          </span>
          <div class="admin-incident-form__heading">
            <span class="admin-incident-form__eyebrow">نوع رویدادها / {{ editing ? 'ویرایش' : 'ایجاد' }}</span>
            <h2 id="admin-incident-form-title">{{ editing ? `ویرایش ${editing.name}` : 'نوع رویداد جدید' }}</h2>
            <p>مشخصات نمایشی و شناسهٔ این نوع رویداد را تنظیم کنید.</p>
          </div>
          <v-btn class="admin-incident-form__close" icon="mdi-close" variant="text" aria-label="بستن فرم نوع رویداد"
            :disabled="saving" @click="closeForm" />
        </header>

        <v-card-text class="admin-incident-form__body">
          <v-form id="admin-incident-form-fields" class="admin-incident-form__form" @submit.prevent="submit">
            <section class="admin-incident-form__section" aria-labelledby="admin-incident-identity-title">
              <div class="admin-incident-form__section-head">
                <span class="admin-incident-form__step" aria-hidden="true">۱</span>
                <div>
                  <h3 id="admin-incident-identity-title">نام و نامک</h3>
                  <p>نام هنگام ثبت درخواست SOS دیده می‌شود؛ نامک شناسهٔ ارجاع به این نوع رویداد است.</p>
                </div>
              </div>
              <div class="admin-incident-form__fields">
                <v-text-field
                  v-model="draft.name"
                  label="نام نوع رویداد"
                  placeholder="مثلاً سیل"
                  aria-required="true"
                  density="comfortable"
                  variant="outlined"
                  rounded="lg"
                  :error-messages="fieldErrors.name ?? ''"
                  :disabled="saving"
                  data-test="incident-name"
                  @update:model-value="clearFormFeedback('name')"
                />
                <v-text-field
                  v-model="draft.slug"
                  :label="!editing && draft.name.trim() && !incidentSlugPreview(draft.name) ? 'نامک (برای این نام لازم است)' : 'نامک (اختیاری)'"
                  placeholder="مثلاً flood-response"
                  :aria-required="!editing && !!draft.name.trim() && !incidentSlugPreview(draft.name)"
                  :hint="slugHint"
                  persistent-hint
                  density="comfortable"
                  variant="outlined"
                  rounded="lg"
                  :error-messages="fieldErrors.slug ?? ''"
                  :disabled="saving"
                  @update:model-value="clearFormFeedback('slug')"
                />
              </div>
            </section>

            <section class="admin-incident-form__section" aria-labelledby="admin-incident-appearance-title">
              <div class="admin-incident-form__section-head">
                <span class="admin-incident-form__step" aria-hidden="true">۲</span>
                <div>
                  <h3 id="admin-incident-appearance-title">نمایش روی نقشه</h3>
                  <p>نماد و رنگ اختیاری‌اند؛ خالی‌کردن آن‌ها هنگام ویرایش مقدار فعلی را حذف می‌کند.</p>
                </div>
              </div>
              <div class="admin-incident-form__appearance-fields">
                <v-text-field
                  v-model="draft.icon"
                  label="نماد MDI (اختیاری)"
                  placeholder="mdi-waves"
                  hint="نام آیکن را با mdi- شروع کنید."
                  persistent-hint
                  density="comfortable"
                  variant="outlined"
                  rounded="lg"
                  :error-messages="fieldErrors.icon ?? ''"
                  :disabled="saving"
                  @update:model-value="clearFormFeedback('icon')"
                />
                <v-text-field
                  v-model="draft.color"
                  label="رنگ (اختیاری)"
                  placeholder="#0ea5e9"
                  hint="همان رنگی که روی نقشه نمایش داده می‌شود."
                  persistent-hint
                  density="comfortable"
                  variant="outlined"
                  rounded="lg"
                  :error-messages="fieldErrors.color ?? ''"
                  :disabled="saving"
                  @update:model-value="clearFormFeedback('color')"
                />
              </div>
              <div class="admin-incident-form__preview" role="group" aria-label="پیش‌نمایش نوع رویداد">
                <span class="admin-incident-form__preview-icon" aria-hidden="true">
                  <v-icon :icon="draft.icon.trim() || 'mdi-image-off-outline'" size="24" />
                </span>
                <div class="admin-incident-form__preview-copy">
                  <strong>{{ draft.name.trim() || 'نام نوع رویداد' }}</strong>
                  <code dir="ltr">{{ draft.slug.trim() || (editing?.slug ?? incidentSlugPreview(draft.name)) || '—' }}</code>
                </div>
                <span v-if="draft.color.trim()" class="admin-incident-form__preview-swatch" role="img"
                  :style="{ backgroundColor: draft.color.trim() }" :aria-label="`رنگ ${draft.color.trim()}`" />
                <small v-else class="admin-incident-form__preview-no-color">بدون رنگ</small>
              </div>
            </section>

            <section class="admin-incident-form__section" aria-labelledby="admin-incident-description-title">
              <div class="admin-incident-form__section-head">
                <span class="admin-incident-form__step" aria-hidden="true">۳</span>
                <div>
                  <h3 id="admin-incident-description-title">توضیح</h3>
                  <p>یک توضیح کوتاه برای شناخت بهتر این نوع رویداد بنویسید.</p>
                </div>
              </div>
              <v-textarea
                v-model="draft.description"
                label="توضیح (اختیاری)"
                placeholder="موقعیت‌هایی که این نوع رویداد برای آن‌ها به‌کار می‌رود."
                rows="2"
                auto-grow
                density="comfortable"
                variant="outlined"
                rounded="lg"
                :error-messages="fieldErrors.description ?? ''"
                :disabled="saving"
                @update:model-value="clearFormFeedback('description')"
              />
            </section>
            <v-alert v-if="formError" class="admin-incident-form__alert" type="error" variant="tonal" rounded="lg" role="alert">{{ formError }}</v-alert>
            <p v-if="formNotice" class="admin-incident-form__notice" role="status" aria-live="polite">{{ formNotice }}</p>
          </v-form>
        </v-card-text>
        <v-card-actions class="admin-catalog-dialog-actions admin-incident-form__actions">
          <v-spacer />
          <v-btn variant="text" rounded="lg" :disabled="saving" @click="closeForm">انصراف</v-btn>
          <v-btn color="primary" variant="flat" rounded="lg" type="submit" form="admin-incident-form-fields"
            :loading="saving" :disabled="saving">
            {{ editing ? 'ذخیرهٔ تغییرات' : 'ساخت نوع رویداد' }}
          </v-btn>
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
import { useMediaQuery } from "@vueuse/core";
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
const isPhone = useMediaQuery("(max-width: 600px)");

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
let formTrigger: HTMLElement | null = null;
function rememberFormTrigger(event: MouseEvent): void {
  formTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
}
function restoreFormFocus(): void {
  if (formTrigger?.isConnected) formTrigger.focus({ preventScroll: true });
  formTrigger = null;
}
function clearFormFeedback(field: keyof IncidentFormDraft): void {
  fieldErrors.value[field] = undefined;
  formError.value = "";
  formNotice.value = "";
}

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

function openCreate(event: MouseEvent): void {
  rememberFormTrigger(event);
  editing.value = null;
  draft.value = { ...EMPTY_INCIDENT_DRAFT };
  fieldErrors.value = {};
  formError.value = "";
  formNotice.value = "";
  formOpen.value = true;
}

function openEdit(type: IncidentType, event: MouseEvent): void {
  rememberFormTrigger(event);
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
.admin-incident-form { color: var(--bb-color-text); background: rgb(var(--v-theme-surface)); font-family: var(--bb-font-family); }
.admin-incident-form__header { display: flex; align-items: center; gap: 1rem; flex: none;
  padding: 1.15rem 1.5rem; border-bottom: 1px solid var(--bb-color-outline);
  background: linear-gradient(110deg, rgba(var(--v-theme-primary), .1), rgba(var(--v-theme-primary), .025) 75%); }
.admin-incident-form__header-icon { display: grid; flex: none; place-items: center; width: 48px; height: 48px;
  border-radius: 1rem; color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); }
.admin-incident-form__heading { min-width: 0; flex: 1; }
.admin-incident-form__eyebrow { color: var(--bb-color-primary); font-size: .82rem; font-weight: 750; }
.admin-incident-form__heading h2 { margin: .1rem 0 0; font-size: 1.25rem; font-weight: 800; line-height: 1.45; overflow-wrap: anywhere; }
.admin-incident-form__heading p { margin: .15rem 0 0; color: var(--bb-color-muted); font-size: .84rem; line-height: 1.6; }
.admin-incident-form__close { flex: none; align-self: flex-start; }
.admin-incident-form__close.v-btn { width: 44px; height: 44px; }
.admin-incident-form__body { padding: 1.15rem 1.5rem 1.4rem; }
.admin-incident-form__form { display: grid; gap: 1rem; }
.admin-incident-form__section { min-width: 0; }
.admin-incident-form__section + .admin-incident-form__section { padding-block-start: 1rem;
  border-top: 1px solid color-mix(in srgb, var(--bb-color-outline) 28%, transparent); }
.admin-incident-form__section-head { display: flex; align-items: center; gap: .7rem; margin-bottom: .9rem; }
.admin-incident-form__section-head > div { min-width: 0; }
.admin-incident-form__step { display: grid; flex: none; place-items: center; width: 34px; height: 34px;
  border-radius: .7rem; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .1); font-weight: 800; }
.admin-incident-form__section-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
.admin-incident-form__section-head p { margin: .1rem 0 0; color: var(--bb-color-muted); font-size: .82rem; line-height: 1.6; }
.admin-incident-form__fields, .admin-incident-form__appearance-fields {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .65rem; align-items: start; }
.admin-incident-form__preview { display: flex; align-items: center; gap: .7rem; min-width: 0;
  margin-top: .65rem; padding: .6rem .8rem; border-radius: .85rem; background: var(--bb-color-inset); }
.admin-incident-form__preview-icon { display: grid; flex: none; place-items: center; width: 40px; height: 40px;
  border-radius: .75rem; background: rgba(var(--v-theme-primary), .11); color: var(--bb-color-primary); }
.admin-incident-form__preview-copy { display: grid; min-width: 0; flex: 1; gap: .05rem; }
.admin-incident-form__preview-copy strong { font-size: .86rem; overflow-wrap: anywhere; }
.admin-incident-form__preview-copy code { justify-self: start; max-width: 100%; color: var(--bb-color-muted);
  font-size: .8rem; overflow-wrap: anywhere; }
.admin-incident-form__preview-swatch { flex: none; width: 28px; height: 28px; border-radius: 50%;
  box-shadow: 0 0 0 2px rgb(var(--v-theme-surface)), 0 0 0 3px color-mix(in srgb, var(--bb-color-outline) 45%, transparent); }
.admin-incident-form__preview-no-color { flex: none; color: var(--bb-color-muted); font-size: .8rem; }
.admin-incident-form__section :deep(.v-textarea .v-input__details) { min-height: 0; }
.admin-incident-form__alert { margin: 0; }
.admin-incident-form__notice { margin: 0; padding: .7rem .85rem; border-radius: .75rem;
  color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .09); font-size: .85rem; }
.admin-incident-form__actions { flex: none; gap: .4rem; padding: .75rem 1.5rem;
  border-top: 1px solid var(--bb-color-outline); }
.admin-incident-form__actions :deep(.v-btn) { min-height: 44px; margin: 0; }
@media (forced-colors: active) {
  .admin-incident-form__header, .admin-incident-form__preview, .admin-incident-form__notice {
    background: Canvas; color: CanvasText; }
  .admin-incident-form__section + .admin-incident-form__section { border-color: CanvasText; }
  .admin-incident-form__preview-swatch { outline: 1px solid CanvasText; }
}

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
.admin-incidents-table .admin-incidents-row > td:first-child { overflow-wrap: anywhere; }
.admin-incidents-actions-heading, .admin-incidents-actions { width: 7.5rem; }
.admin-incidents-actions :deep(.v-btn) { min-height: 36px; height: auto; padding-block: .25rem; white-space: normal; }

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
  .admin-incident-form { height: 100dvh; max-height: 100dvh; border-radius: 0 !important; }
  .admin-incident-form__header { padding: calc(var(--bb-form-phone-headerBlock) + env(safe-area-inset-top, 0px)) var(--bb-form-phone-inline) var(--bb-form-phone-headerBlock); }
  .admin-incident-form__header-icon { width: var(--bb-form-phone-icon); height: var(--bb-form-phone-icon); }
  .admin-incident-form__heading h2 { font-size: var(--bb-form-phone-title); }
  .admin-incident-form__heading p { display: none; }
  .admin-incident-form__body { padding: var(--bb-form-phone-bodyBlock) var(--bb-form-phone-inline); }
  .admin-incident-form__form { gap: var(--bb-form-phone-sectionGap); }
  .admin-incident-form__section + .admin-incident-form__section { padding-block-start: var(--bb-form-phone-sectionGap); }
  .admin-incident-form__fields, .admin-incident-form__appearance-fields { grid-template-columns: minmax(0, 1fr); gap: .3rem; }
  .admin-incident-form__section-head { margin-bottom: .5rem; }
  .admin-incident-form__actions { padding: var(--bb-form-phone-actionBlock) var(--bb-form-phone-inline) calc(var(--bb-form-phone-actionBlock) + env(safe-area-inset-bottom, 0px)); }
  .admin-catalog-dialog-actions { flex-direction: column; align-items: stretch; }
  .admin-catalog-dialog-actions :deep(.v-spacer) { display: none; }
  .admin-catalog-dialog-actions :deep(.v-btn) { width: 100%; min-height: 44px; height: auto; white-space: normal; }
}
</style>
