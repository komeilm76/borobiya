<template>
  <section class="admin-categories-page mx-auto w-full max-w-7xl px-4 py-8 sm:px-8 sm:py-10">
    <header class="admin-categories-header mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="admin-categories-eyebrow text-sm font-medium opacity-70">
          <v-icon icon="mdi-shield-account-outline" size="17" /> پنل مدیریت
        </p>
        <h1 class="text-2xl font-bold">گروه‌های امدادگر</h1>
        <p class="admin-categories-intro mt-1 max-w-prose opacity-80">
          هر گروه می‌گوید کدام امدادگرها برای کدام نوع رویداد پیشنهاد و اعزام می‌شوند. افزودن و حذف اعضای
          گروه در همین صفحه انجام می‌شود.
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <v-btn class="admin-categories-refresh" variant="tonal" color="primary" rounded="lg" :loading="loading" :disabled="loading" @click="load">
          <v-icon class="me-2" icon="mdi-refresh" />
          به‌روزرسانی
        </v-btn>
        <v-btn class="admin-categories-create" color="primary" rounded="lg" prepend-icon="mdi-plus" @click="openCreate($event)">
          گروه جدید
        </v-btn>
      </div>
    </header>

    <v-alert v-if="listError" class="mb-4" type="error" variant="tonal" rounded="lg" role="alert">{{ listError }}</v-alert>
    <v-alert v-if="incidentTypes.length === 0 && !loading && !listError" class="mb-4" type="warning" variant="tonal" rounded="lg">
      فهرست نوع رویدادها خالی است. یک گروه بدون نوع رویداد قابل انتخاب است، ولی تا آن فهرست پر نشود
      هیچ امدادگری به رویدادی وصل نمی‌شود.
    </v-alert>

    <v-card elevation="0" rounded="xl" class="overflow-hidden bb-surface-card">
      <p v-if="listState === 'loading'" class="sr-only" role="status" aria-live="polite">در حال بارگذاری گروه‌ها…</p>
      <v-progress-linear v-if="listState === 'refreshing'" indeterminate color="primary" aria-label="در حال تازه‌سازی گروه‌ها" />
      <v-table class="admin-categories-table" :aria-busy="loading">
        <thead>
          <tr>
            <th>نام</th>
            <th>توضیح</th>
            <th>نوع رویدادها</th>
            <th>اعضا</th>
            <th aria-label="عملیات"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="listState === 'loading'">
            <td colspan="5">
              <v-skeleton-loader v-for="row in 3" :key="row" type="list-item-two-line" aria-hidden="true" />
            </td>
          </tr>
          <tr v-for="category in categories" :key="category.id" class="admin-categories-row">
            <td class="font-medium">{{ category.name }}</td>
            <td class="admin-categories-description">{{ category.description || "—" }}</td>
            <td>
              <div class="flex flex-wrap gap-1">
                <v-chip v-for="id in category.incidentTypeIds" :key="id" size="small" variant="tonal" :title="id">
                  {{ incidentTypeName(id) }}
                </v-chip>
                <span v-if="category.incidentTypeIds.length === 0" class="opacity-50">هیچ‌کدام</span>
              </div>
            </td>
            <td>
              <div class="flex flex-wrap items-center gap-1">
                <v-chip
                  v-for="member in category.members"
                  :key="member.id"
                  size="small"
                  variant="tonal"
                  color="primary"
                >
                  <span dir="ltr">{{ member.username }}</span>
                </v-chip>
                <span v-if="category.members.length === 0" class="opacity-50">بدون عضو</span>
              </div>
            </td>
            <td class="text-start whitespace-nowrap">
              <v-btn size="small" variant="text" prepend-icon="mdi-account-plus-outline" @click="openMembers(category)">
                افزودن عضو ({{ category.members.length }})
              </v-btn>
              <v-btn size="small" variant="text" prepend-icon="mdi-pencil-outline" @click="openEdit(category, $event)">ویرایش</v-btn>
            </td>
          </tr>
          <tr v-if="listState === 'error'">
            <td colspan="5" class="py-6 text-center">
              دریافت گروه‌ها انجام نشد.
              <v-btn size="small" variant="text" color="primary" @click="load">تلاش دوباره</v-btn>
            </td>
          </tr>
          <tr v-if="listState === 'empty'">
            <td colspan="5" class="py-6 text-center opacity-60">هنوز گروهی ساخته نشده است.</td>
          </tr>
        </tbody>
      </v-table>
      <ul v-if="categories.length || listState === 'loading'" class="admin-categories-mobile" aria-label="گروه‌های امدادگر" :aria-busy="loading" role="list">
        <li v-if="listState === 'loading'" class="admin-categories-mobile__card" aria-hidden="true">
          <v-skeleton-loader v-for="row in 3" :key="row" type="list-item-two-line" />
        </li>
        <li v-for="category in categories" :key="category.id" class="admin-categories-mobile__card">
          <h2>{{ category.name }}</h2>
          <dl class="admin-categories-mobile__details">
            <div><dt>توضیح</dt><dd>{{ category.description || "—" }}</dd></div>
            <div><dt>نوع رویدادها</dt><dd class="admin-categories-mobile__chips">
              <v-chip v-for="id in category.incidentTypeIds" :key="id" size="small" variant="tonal" :title="id">
                {{ incidentTypeName(id) }}
              </v-chip>
              <span v-if="category.incidentTypeIds.length === 0">هیچ‌کدام</span>
            </dd></div>
            <div><dt>اعضا</dt><dd class="admin-categories-mobile__chips">
              <v-chip v-for="member in category.members" :key="member.id" size="small" variant="tonal" color="primary">
                <span dir="ltr">{{ member.username }}</span>
              </v-chip>
              <span v-if="category.members.length === 0">بدون عضو</span>
            </dd></div>
          </dl>
          <div class="admin-categories-mobile__actions">
            <v-btn variant="tonal" prepend-icon="mdi-account-plus-outline" @click="openMembers(category)">
              افزودن عضو ({{ category.members.length }})
            </v-btn>
            <v-btn variant="text" prepend-icon="mdi-pencil-outline" @click="openEdit(category, $event)">ویرایش</v-btn>
          </div>
        </li>
      </ul>
      <div v-if="listState === 'error'" class="admin-categories-mobile admin-categories-mobile__card">
        دریافت گروه‌ها انجام نشد.
        <v-btn variant="tonal" color="primary" @click="load">تلاش دوباره</v-btn>
      </div>
      <p v-if="listState === 'empty'" class="admin-categories-mobile admin-categories-mobile__card" role="status">هنوز گروهی ساخته نشده است.</p>
    </v-card>

    <v-dialog v-model="formOpen" max-width="760" scrollable persistent :fullscreen="isPhone"
      aria-labelledby="admin-category-form-title" @after-leave="restoreFormFocus">
      <v-card class="admin-category-form" rounded="xl" dir="rtl">
        <header class="admin-category-form__header">
          <span class="admin-category-form__header-icon" aria-hidden="true">
            <v-icon :icon="editing ? 'mdi-pencil-outline' : 'mdi-account-group-outline'" size="25" />
          </span>
          <div class="admin-category-form__heading">
            <span class="admin-category-form__eyebrow">گروه‌های امدادگر / {{ editing ? 'ویرایش' : 'ایجاد' }}</span>
            <h2 id="admin-category-form-title">{{ editing ? `ویرایش ${editing.name}` : 'گروه امدادگر جدید' }}</h2>
            <p>نام و نوع رویدادهای مرتبط با این گروه را مشخص کنید.</p>
          </div>
          <v-btn class="admin-category-form__close" icon="mdi-close" variant="text" aria-label="بستن فرم گروه"
            :disabled="saving" @click="formOpen = false" />
        </header>

        <v-card-text class="admin-category-form__body">
          <section class="admin-category-form__section" aria-labelledby="admin-category-identity-title">
            <div class="admin-category-form__section-head">
              <span class="admin-category-form__step" aria-hidden="true">۱</span>
              <div>
                <h3 id="admin-category-identity-title">مشخصات گروه</h3>
                <p>نام گروه در فهرست و هنگام مدیریت اعضا نمایش داده می‌شود.</p>
              </div>
            </div>
            <div class="admin-category-form__fields">
              <v-text-field
                v-model="draft.name"
                label="نام گروه"
                placeholder="مثلاً گروه امداد کوهستان"
                aria-required="true"
                density="comfortable"
                variant="outlined"
                rounded="lg"
                :error-messages="fieldErrors.name ?? ''"
                :disabled="saving"
                data-test="category-name"
                @update:model-value="clearFormFeedback('name')"
              />
              <v-textarea
                v-model="draft.description"
                label="توضیح گروه (اختیاری)"
                placeholder="محدودهٔ فعالیت یا مهارت این گروه را کوتاه توضیح دهید."
                rows="2"
                auto-grow
                density="comfortable"
                variant="outlined"
                rounded="lg"
                :error-messages="fieldErrors.description ?? ''"
                :disabled="saving"
                @update:model-value="clearFormFeedback('description')"
              />
            </div>
          </section>

          <section class="admin-category-form__section" aria-labelledby="admin-category-types-title">
            <div class="admin-category-form__section-head">
              <span class="admin-category-form__step" aria-hidden="true">۲</span>
              <div>
                <h3 id="admin-category-types-title">نوع رویدادهای مرتبط</h3>
                <p id="admin-category-types-hint">انتخاب‌های این بخش هنگام ذخیره جایگزین فهرست فعلی می‌شوند.</p>
              </div>
              <span class="admin-category-form__count" aria-live="polite">{{ draft.incidentTypeIds.length.toLocaleString('fa-IR') }} انتخاب‌شده</span>
            </div>
            <div v-if="incidentTypes.length === 0" class="admin-category-form__empty" role="status">
              <v-icon icon="mdi-information-outline" size="21" aria-hidden="true" />
              <span>هنوز نوع رویدادی تعریف نشده است. می‌توانید گروه را بدون نوع رویداد ذخیره کنید.</span>
            </div>
            <div v-else class="admin-categories-picker" role="group" aria-labelledby="admin-category-types-title"
              aria-describedby="admin-category-types-hint">
              <v-checkbox
                v-for="type in incidentTypes"
                :key="type.id"
                class="admin-category-form__option"
                :class="{ 'admin-category-form__option--selected': draft.incidentTypeIds.includes(type.id) }"
                :model-value="draft.incidentTypeIds.includes(type.id)"
                density="comfortable"
                hide-details
                :disabled="saving"
                @update:model-value="toggleType(type.id, $event as boolean)"
              >
                <template #label>
                  <span class="admin-category-form__option-label">
                    <strong>{{ type.name }}</strong>
                    <small dir="ltr">{{ type.slug }}</small>
                  </span>
                </template>
              </v-checkbox>
            </div>
            <p v-if="fieldErrors.incidentTypeIds" class="admin-category-form__field-error" role="alert">{{ fieldErrors.incidentTypeIds }}</p>
            <p v-if="incidentTypes.length && draft.incidentTypeIds.length === 0" class="admin-category-form__hint">
              بدون انتخاب نوع رویداد هم می‌توانید گروه را ذخیره کنید؛ این گروه فعلاً به هیچ رویدادی وصل نمی‌شود.
            </p>
          </section>
          <v-alert v-if="formError" class="admin-category-form__alert" type="error" variant="tonal" rounded="lg" role="alert">{{ formError }}</v-alert>
          <p v-if="formNotice" class="admin-category-form__notice" role="status" aria-live="polite">{{ formNotice }}</p>
        </v-card-text>
        <v-card-actions class="admin-catalog-dialog-actions admin-category-form__actions">
          <span class="admin-category-form__action-hint">افزودن یا حذف اعضا در بخش جداگانهٔ فهرست انجام می‌شود.</span>
          <v-spacer />
          <v-btn variant="text" rounded="lg" :disabled="saving" @click="formOpen = false">انصراف</v-btn>
          <v-btn color="primary" variant="flat" rounded="lg" :loading="saving" :disabled="saving" @click="submit">
            {{ editing ? 'ذخیرهٔ تغییرات' : 'ساخت گروه' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="membersOpen" max-width="640" scrollable persistent>
      <v-card rounded="xl" :title="`مدیریت اعضا — ${membersFor?.name ?? ''}`">
        <v-card-text>
          <div class="mb-4" data-test="current-members">
            <p class="mb-2 text-sm font-medium">اعضای فعلی ({{ membersFor?.members.length ?? 0 }})</p>
            <p v-if="!membersFor || membersFor.members.length === 0" class="text-sm opacity-60">
              هنوز عضوی در این گروه ثبت نشده است.
            </p>
            <div v-else class="flex flex-wrap gap-2">
              <v-chip
                v-for="member in membersFor.members"
                :key="member.id"
                closable
                variant="tonal"
                color="primary"
                :disabled="saving || removingMemberId === member.id"
                :aria-label="`حذف ${member.username} از ${membersFor.name}`"
                @click:close="removeMember(member)"
              >
                <span dir="ltr">{{ member.username }}</span>
              </v-chip>
            </div>
          </div>
          <v-text-field
            v-model="memberSearch"
            label="جست‌وجوی نام کاربری"
            placeholder="مثلاً rescue_user1"
            prepend-inner-icon="mdi-magnify"
            density="comfortable"
            variant="outlined"
            rounded="lg"
            maxlength="30"
            clearable
            hide-details
            :loading="searching"
            :disabled="saving"
            data-test="member-search"
            @update:model-value="queueSearch($event)"
          />
          <div class="admin-categories-members mt-3" aria-live="polite">
            <p v-if="searchError" class="text-sm text-error">{{ searchError }}</p>
            <p v-else-if="searching" class="text-sm opacity-70">در حال جست‌وجو…</p>
            <p v-else-if="memberSearch.trim() && candidates.length === 0" class="text-sm opacity-70">
              حسابی با این نام پیدا نشد.
            </p>
            <v-checkbox
              v-for="candidate in candidates"
              :key="candidate.id"
              :model-value="selectedIds.includes(candidate.id)"
              :label="candidate.username"
              density="compact"
              hide-details
              :disabled="saving"
              class="admin-categories-member"
              @update:model-value="toggleMember(candidate.id, $event as boolean)"
            />
          </div>
          <p class="mt-3 text-sm opacity-80">
            {{ selectedIds.length === 0 ? "هنوز کسی انتخاب نشده است." : `${selectedIds.length} عضو برای افزودن انتخاب شده است.` }}
          </p>
          <v-alert v-if="membersError" type="error" variant="tonal" rounded="lg" class="mt-2" role="alert">{{ membersError }}</v-alert>
        </v-card-text>
        <v-card-actions class="admin-catalog-dialog-actions">
          <v-spacer />
          <v-btn variant="text" rounded="lg" :disabled="saving" @click="membersOpen = false">بستن</v-btn>
          <v-btn color="primary" variant="flat" rounded="lg" :loading="saving" :disabled="selectedIds.length === 0" @click="addMembers">
            افزودن
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
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useMediaQuery } from "@vueuse/core";
import type { Category, CategoryMember, IncidentType } from "@shared/index";
import { friendlyErrorMessage } from "../../api/error-message";
import { ApiError } from "../../api/http";
import { listAdminUsers } from "../../api/admin-users";
import {
  assignCategoryUsers,
  createCategory,
  listCategories,
  listIncidentTypes,
  removeCategoryUser,
  updateCategory
} from "../../api/admin-catalog";
import {
  categoryCreateBody,
  categoryDraftFromCategory,
  categoryPatchBody,
  EMPTY_CATEGORY_DRAFT,
  requiredNameError,
  unknownTargetLabels,
  type CatalogFieldErrors,
  type CategoryFormDraft
} from "../../admin/catalog-form";
import { catalogListPresentation } from "../../admin/catalog-list-presentation";
import { withoutConfirmedMember } from "../../admin/category-members";
import { useCategoryMemberSearch } from "../../admin/use-category-member-search";
import { useAuthStore } from "../../stores/auth";

const auth = useAuthStore();
const isPhone = useMediaQuery("(max-width: 600px)");

const categories = ref<Category[]>([]);
const incidentTypes = ref<IncidentType[]>([]);
const loading = ref(true);
const listError = ref("");
const listState = computed(() => catalogListPresentation(loading.value, categories.value.length, listError.value));

const formOpen = ref(false);
const editing = ref<Category | null>(null);
const draft = ref<CategoryFormDraft>({ ...EMPTY_CATEGORY_DRAFT, incidentTypeIds: [] });
const fieldErrors = ref<CatalogFieldErrors>({});
const formError = ref("");
const formNotice = ref("");
const saving = ref(false);
let formTrigger: HTMLElement | null = null;
function rememberFormTrigger(event: MouseEvent): void {
  formTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
}
function restoreFormFocus(): void {
  if (formTrigger?.isConnected) formTrigger.focus({ preventScroll: true });
  formTrigger = null;
}
function clearFormFeedback(field: "name" | "description" | "incidentTypeIds"): void {
  fieldErrors.value[field] = undefined;
  formError.value = "";
  formNotice.value = "";
}

const membersOpen = ref(false);
const membersFor = ref<Category | null>(null);
const selectedIds = ref<string[]>([]);
const {
  memberSearch, candidates, searching, searchError, queueSearch, reset: resetSearch
} = useCategoryMemberSearch(async (term) => {
  const accessToken = await adminToken();
  if (!accessToken) throw new ApiError(401, "INVALID_REFRESH", "Admin session unavailable");
  const response = await listAdminUsers({ q: term, page: 1, limit: 10 }, accessToken);
  return response.items;
}, () => new Set((membersFor.value?.members ?? []).map((member) => member.id)));
const membersError = ref("");
const removingMemberId = ref<string | null>(null);

const successVisible = ref(false);
const successMessage = ref("");

let requestVersion = 0;
let activeController: AbortController | null = null;

const hasSelection = computed(() => selectedIds.value.length > 0);

async function adminToken(): Promise<string | null> {
  await auth.ensureSession();
  return auth.accessToken;
}

function incidentTypeName(id: string): string {
  // An id with no row in the local list is shown as the id rather than as an empty chip: the category
  // references a type that was deleted or that this page has not loaded, and a blank chip would look
  // like a bug in the table.
  return incidentTypes.value.find((type) => type.id === id)?.name ?? id;
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
    const [categoryRecords, typeRecords] = await Promise.all([
      listCategories(accessToken, controller.signal),
      listIncidentTypes(accessToken, controller.signal)
    ]);
    if (version !== requestVersion) return;
    categories.value = categoryRecords;
    incidentTypes.value = typeRecords;
    if (membersFor.value) {
      membersFor.value = categoryRecords.find((item) => item.id === membersFor.value?.id) ?? membersFor.value;
    }
  } catch (error) {
    if (controller.signal.aborted || version !== requestVersion) return;
    listError.value = friendlyErrorMessage(error, "بارگذاری گروه‌ها انجام نشد. دوباره تلاش کنید.");
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

function openCreate(event: MouseEvent): void {
  rememberFormTrigger(event);
  editing.value = null;
  draft.value = { ...EMPTY_CATEGORY_DRAFT, incidentTypeIds: [] };
  fieldErrors.value = {};
  formError.value = "";
  formNotice.value = "";
  formOpen.value = true;
}

function openEdit(category: Category, event: MouseEvent): void {
  rememberFormTrigger(event);
  editing.value = category;
  draft.value = categoryDraftFromCategory(category);
  fieldErrors.value = {};
  formError.value = "";
  formNotice.value = "";
  formOpen.value = true;
}

function toggleType(id: string, checked: boolean): void {
  clearFormFeedback("incidentTypeIds");
  const next = new Set(draft.value.incidentTypeIds);
  if (checked) next.add(id);
  else next.delete(id);
  draft.value = { ...draft.value, incidentTypeIds: [...next] };
}

async function submit(): Promise<void> {
  if (saving.value) return;

  const missingName = requiredNameError(draft.value.name);
  if (missingName) {
    fieldErrors.value = { name: missingName };
    return;
  }

  // See `AdminIncidentsView`'s note: the two verbs prepare their own request so no cast is needed
  // to convince the compiler a create body and a patch body are different shapes.
  let send: (accessToken: string) => Promise<Category>;
  if (editing.value) {
    const patch = categoryPatchBody(editing.value, draft.value);
    if (patch.status === "invalid") {
      fieldErrors.value = patch.fieldErrors;
      return;
    }
    if (patch.status === "unchanged") {
      fieldErrors.value = {};
      formNotice.value = "چیزی تغییر نکرد؛ همان مقادیر ذخیره شده‌اند.";
      return;
    }
    const target = editing.value.id;
    send = (accessToken) => updateCategory(target, patch.body, accessToken);
  } else {
    const create = categoryCreateBody(draft.value);
    if (create.status === "invalid") {
      fieldErrors.value = create.fieldErrors;
      return;
    }
    send = (accessToken) => createCategory(create.body, accessToken);
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
    successMessage.value = editing.value ? `${saved.name} به‌روزرسانی شد.` : `${saved.name} ساخته شد.`;
    successVisible.value = true;
    await load();
  } catch (error) {
    formError.value = friendlyErrorMessage(error, "ذخیرهٔ گروه انجام نشد. دوباره تلاش کنید.");
  } finally {
    saving.value = false;
  }
}

function openMembers(category: Category): void {
  resetSearch();
  membersFor.value = category;
  selectedIds.value = [];
  membersError.value = "";
  membersOpen.value = true;
}

// The picker is an admin username search, not a raw-UUID form. Closing or switching categories
// invalidates replies that might otherwise offer candidates for an old dialog context.
watch(membersOpen, (open) => {
  if (!open) resetSearch();
}, { flush: "sync" });

function toggleMember(id: string, checked: boolean): void {
  const next = new Set(selectedIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedIds.value = [...next];
}

async function addMembers(): Promise<void> {
  const category = membersFor.value;
  if (!category || saving.value || !hasSelection.value) return;

  saving.value = true;
  membersError.value = "";
  try {
    const accessToken = await adminToken();
    if (!accessToken) {
      membersError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }
    await assignCategoryUsers(category.id, selectedIds.value, accessToken);
    const addedCount = selectedIds.value.length;
    selectedIds.value = [];
    await load();
    membersOpen.value = false;
    successMessage.value = `${addedCount} عضو به ${category.name} اضافه شد.`;
    successVisible.value = true;
  } catch (error) {
    // A refused id is named from the picker's own rows, because `path: ["userIds", 2]` means nothing
    // to a person who selected three usernames.
    const refused = unknownTargetLabels(error, selectedIds.value, (id) => candidates.value.find((c) => c.id === id)?.username ?? null);
    membersError.value = refused.length
      ? `این حساب‌ها در دسترس نیستند: ${refused.join("، ")}.`
      : friendlyErrorMessage(error, "افزودن عضو انجام نشد. دوباره تلاش کنید.");
  } finally {
    saving.value = false;
  }
}

async function removeMember(member: CategoryMember): Promise<void> {
  const category = membersFor.value;
  if (!category || removingMemberId.value !== null) return;

  removingMemberId.value = member.id;
  membersError.value = "";
  try {
    const accessToken = await adminToken();
    if (!accessToken) {
      membersError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }
    await removeCategoryUser(category.id, member.id, accessToken);
    // DELETE has committed. If the subsequent list read fails, do not keep a removed member
    // visible or offer a second DELETE; the failed refresh still gets its own warning.
    categories.value = categories.value.map((row) => withoutConfirmedMember(row, category.id, member.id));
    if (membersFor.value?.id === category.id) {
      membersFor.value = withoutConfirmedMember(membersFor.value, category.id, member.id);
    }
    await load();
    successMessage.value = `${member.username} از ${category.name} حذف شد.`;
    successVisible.value = true;
  } catch (error) {
    membersError.value = friendlyErrorMessage(error, "حذف عضو انجام نشد. دوباره تلاش کنید.");
  } finally {
    removingMemberId.value = null;
  }
}

onMounted(() => {
  void load();
});

onUnmounted(() => {
  requestVersion += 1;
  resetSearch();
  activeController?.abort();
});
</script>

<style scoped>
.admin-category-form { color: var(--bb-color-text); background: rgb(var(--v-theme-surface)); font-family: var(--bb-font-family); }
.admin-category-form__header {
  display: flex; align-items: center; gap: 1rem; flex: none;
  padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--bb-color-outline);
  background: linear-gradient(110deg, rgba(var(--v-theme-primary), .1), rgba(var(--v-theme-primary), .025) 75%);
}
.admin-category-form__header-icon { display: grid; flex: none; place-items: center; width: 52px; height: 52px;
  border-radius: 1rem; color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); }
.admin-category-form__heading { min-width: 0; flex: 1; }
.admin-category-form__eyebrow { color: var(--bb-color-primary); font-size: .82rem; font-weight: 750; }
.admin-category-form__heading h2 { margin: .15rem 0 0; font-size: 1.25rem; font-weight: 800; line-height: 1.45; overflow-wrap: anywhere; }
.admin-category-form__heading p { margin: .25rem 0 0; color: var(--bb-color-muted); font-size: .85rem; line-height: 1.65; }
.admin-category-form__close { flex: none; align-self: flex-start; }
.admin-category-form__close.v-btn { width: 44px; height: 44px; }
.admin-category-form__body { display: grid; gap: 1rem; padding: 1.25rem 1.5rem 1.5rem; }
.admin-category-form__section { min-width: 0; padding: 1.2rem; border: 1px solid var(--bb-color-outline);
  border-radius: var(--bb-radius-nested, 16px); background: rgb(var(--v-theme-surface)); }
.admin-category-form__section-head { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; margin-bottom: 1rem; }
.admin-category-form__section-head > div { min-width: 0; flex: 1 1 12rem; }
.admin-category-form__step { display: grid; flex: none; place-items: center; width: 36px; height: 36px;
  border-radius: .75rem; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .11);
  font-weight: 800; }
.admin-category-form__section-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
.admin-category-form__section-head p { margin: .15rem 0 0; color: var(--bb-color-muted); font-size: .84rem; line-height: 1.65; }
.admin-category-form__count { flex: none; padding: .35rem .7rem; border: 1px solid rgba(var(--v-theme-primary), .25);
  border-radius: 999px; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .08);
  font-size: .82rem; font-weight: 750; }
.admin-category-form__fields { display: grid; gap: .3rem; }
.admin-category-form__fields :deep(.v-input:last-child .v-input__details) { min-height: 0; }
.admin-categories-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; }
.admin-category-form__option { min-width: 0; border: 1px solid var(--bb-color-outline); border-radius: .85rem;
  background: var(--bb-color-inset); transition: border-color .15s ease, background .15s ease; }
.admin-category-form__option--selected { border-color: rgba(var(--v-theme-primary), .55);
  background: rgba(var(--v-theme-primary), .1); }
.admin-category-form__option:hover:not(.v-input--disabled) { border-color: rgb(var(--v-theme-primary)); }
.admin-category-form__option :deep(.v-selection-control) { min-height: 62px; padding: .3rem .65rem; }
.admin-category-form__option :deep(.v-label) { min-width: 0; flex: 1; opacity: 1; }
.admin-category-form__option :deep(.v-selection-control--focus-visible) { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: .55rem; }
.admin-category-form__option-label { display: grid; min-width: 0; gap: .15rem; padding-block: .2rem; overflow-wrap: anywhere; }
.admin-category-form__option-label strong { color: var(--bb-color-text); font-size: .86rem; font-weight: 750; }
.admin-category-form__option-label small { justify-self: start; max-width: 100%; color: var(--bb-color-muted);
  font-size: .8rem; overflow-wrap: anywhere; }
.admin-category-form__hint, .admin-category-form__empty { margin: .8rem 0 0; color: var(--bb-color-muted); font-size: .83rem; line-height: 1.7; }
.admin-category-form__empty { display: flex; align-items: flex-start; gap: .5rem; padding: .85rem 1rem;
  border: 1px dashed var(--bb-color-outline); border-radius: .75rem; background: var(--bb-color-inset); }
.admin-category-form__empty :deep(.v-icon) { flex: none; margin-top: .12rem; }
.admin-category-form__field-error { margin: .75rem 0 0; color: var(--bb-color-error); font-size: .84rem; }
.admin-category-form__alert { margin: 0; }
.admin-category-form__notice { margin: 0; padding: .75rem .9rem; border-radius: .75rem;
  color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .09); font-size: .85rem; }
.admin-category-form__actions { flex: none; gap: .4rem; padding: .8rem 1.5rem; border-top: 1px solid var(--bb-color-outline); }
.admin-category-form__action-hint { max-width: 15rem; color: var(--bb-color-muted); font-size: .8rem; line-height: 1.5; }
.admin-category-form__actions :deep(.v-btn) { min-height: 44px; margin: 0; }
@media (forced-colors: active) {
  .admin-category-form__header, .admin-category-form__section, .admin-category-form__option,
  .admin-category-form__empty, .admin-category-form__notice { border-color: CanvasText; background: Canvas; color: CanvasText; }
  .admin-category-form__option--selected { border-width: 2px; }
  .admin-category-form__option :deep(.v-selection-control--focus-visible) { outline-color: Highlight; }
}
@media (prefers-reduced-motion: reduce) { .admin-category-form__option { transition: none; } }

.admin-categories-description {
  max-width: 18rem;
  overflow-wrap: anywhere;
}

.admin-categories-members {
  max-height: 15rem;
  overflow-y: auto;
}

.admin-categories-mobile { display: none; margin: 0; padding: 0; list-style: none; }
.admin-categories-mobile__card { min-width: 0; padding: 1rem; border-block-start: 1px solid rgba(var(--v-theme-on-surface), .12); overflow-wrap: anywhere; }
.admin-categories-mobile__card h2 { font-size: 1rem; font-weight: 700; }
.admin-categories-mobile__details { display: grid; gap: .75rem; margin-block: .75rem; }
.admin-categories-mobile__details > div { display: grid; grid-template-columns: minmax(4.5rem, .35fr) minmax(0, 1fr); gap: .5rem; }
.admin-categories-mobile__details dt { opacity: .75; }
.admin-categories-mobile__details dd { min-width: 0; margin: 0; overflow-wrap: anywhere; }
.admin-categories-mobile__chips { display: flex; flex-wrap: wrap; gap: .25rem; }
.admin-categories-mobile__chips :deep(.v-chip) { max-width: 100%; height: auto; min-height: 32px; }
.admin-categories-mobile__chips :deep(.v-chip__content) { white-space: normal; overflow-wrap: anywhere; }
.admin-categories-mobile__actions { display: flex; flex-wrap: wrap; gap: .5rem; }
.admin-categories-mobile__actions :deep(.v-btn) { min-height: 44px; height: auto; white-space: normal; }

@media (max-width: 850px) {
  .admin-categories-table { display: none; }
  .admin-categories-mobile { display: grid; }
}

@media (max-width: 600px) {
  .admin-category-form { height: 100dvh; max-height: 100dvh; border-radius: 0 !important; }
  .admin-category-form__header { padding: calc(.75rem + env(safe-area-inset-top, 0px)) 1rem .75rem; }
  .admin-category-form__header-icon { width: 44px; height: 44px; }
  .admin-category-form__heading h2 { font-size: 1.1rem; }
  .admin-category-form__body { padding: 1rem; }
  .admin-category-form__section { padding: 1rem; }
  .admin-categories-picker { grid-template-columns: minmax(0, 1fr); }
  .admin-category-form__actions { padding: .75rem 1rem calc(.75rem + env(safe-area-inset-bottom, 0px)); }
  .admin-category-form__action-hint { max-width: none; text-align: center; }
  .admin-categories-mobile__actions { flex-direction: column; }
  .admin-categories-mobile__actions :deep(.v-btn) { width: 100%; }
  .admin-catalog-dialog-actions { flex-direction: column; align-items: stretch; }
  .admin-catalog-dialog-actions :deep(.v-spacer) { display: none; }
  .admin-catalog-dialog-actions :deep(.v-btn) { width: 100%; min-height: 44px; height: auto; white-space: normal; }
}
</style>
