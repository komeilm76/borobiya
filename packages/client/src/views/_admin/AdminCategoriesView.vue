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
        <v-btn class="admin-categories-create" color="primary" rounded="lg" prepend-icon="mdi-plus" @click="openCreate">
          گروه جدید
        </v-btn>
      </div>
    </header>

    <v-alert v-if="listError" class="mb-4" type="error" variant="tonal" rounded="lg" role="alert">{{ listError }}</v-alert>
    <v-alert v-if="incidentTypes.length === 0 && !loading && !listError" class="mb-4" type="warning" variant="tonal" rounded="lg">
      فهرست نوع رویدادها خالی است. یک گروه بدون نوع رویداد قابل انتخاب است، ولی تا آن فهرست پر نشود
      هیچ امدادگری به رویدادی وصل نمی‌شود.
    </v-alert>

    <v-card elevation="0" rounded="xl" class="overflow-hidden">
      <v-progress-linear v-if="loading" indeterminate color="primary" />
      <v-table class="admin-categories-table">
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
              <v-btn size="small" variant="text" prepend-icon="mdi-pencil-outline" @click="openEdit(category)">ویرایش</v-btn>
            </td>
          </tr>
          <tr v-if="!loading && categories.length === 0">
            <td colspan="5" class="py-6 text-center opacity-60">هنوز گروهی ساخته نشده است.</td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <v-dialog v-model="formOpen" max-width="640" persistent>
      <v-card rounded="xl" :title="editing ? `ویرایش ${editing.name}` : 'گروه امدادگر جدید'">
        <v-card-text>
          <div class="grid gap-4">
            <v-text-field
              v-model="draft.name"
              label="نام"
              density="comfortable"
              variant="outlined"
              rounded="lg"
              :error-messages="fieldErrors.name ?? ''"
              :disabled="saving"
              data-test="category-name"
            />
            <v-textarea
              v-model="draft.description"
              label="توضیح"
              rows="2"
              density="comfortable"
              variant="outlined"
              rounded="lg"
              :error-messages="fieldErrors.description ?? ''"
              :disabled="saving"
            />
            <div class="admin-categories-picker">
              <p class="mb-1 text-sm font-medium">نوع رویدادهای این گروه</p>
              <p class="mb-2 text-xs opacity-70">انتخاب کامل جایگزین می‌شود؛ برای حذف، تیک را بردارید.</p>
              <div v-if="incidentTypes.length === 0" class="text-sm opacity-60">ابتدا یک نوع رویداد بسازید.</div>
              <v-checkbox
                v-for="type in incidentTypes"
                :key="type.id"
                :model-value="draft.incidentTypeIds.includes(type.id)"
                :label="`${type.name} — ${type.slug}`"
                density="compact"
                hide-details
                :disabled="saving"
                @update:model-value="toggleType(type.id, $event as boolean)"
              />
              <p v-if="fieldErrors.incidentTypeIds" class="text-sm text-error">{{ fieldErrors.incidentTypeIds }}</p>
            </div>
            <v-alert v-if="formError" type="error" variant="tonal" rounded="lg" role="alert">{{ formError }}</v-alert>
            <p v-if="formNotice" class="admin-categories-notice text-sm opacity-80" aria-live="polite">{{ formNotice }}</p>
          </div>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" rounded="lg" :disabled="saving" @click="formOpen = false">انصراف</v-btn>
          <v-btn color="primary" variant="flat" rounded="lg" :loading="saving" @click="submit">ذخیره</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="membersOpen" max-width="640" persistent>
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
            @update:model-value="queueSearch"
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
        <v-card-actions>
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
import { computed, onMounted, onUnmounted, ref } from "vue";
import type { Category, CategoryMember, IncidentType, UserProfile } from "@shared/index";
import { friendlyErrorMessage } from "../../api/error-message";
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
import { useAuthStore } from "../../stores/auth";

const auth = useAuthStore();

const categories = ref<Category[]>([]);
const incidentTypes = ref<IncidentType[]>([]);
const loading = ref(false);
const listError = ref("");

const formOpen = ref(false);
const editing = ref<Category | null>(null);
const draft = ref<CategoryFormDraft>({ ...EMPTY_CATEGORY_DRAFT, incidentTypeIds: [] });
const fieldErrors = ref<CatalogFieldErrors>({});
const formError = ref("");
const formNotice = ref("");
const saving = ref(false);

const membersOpen = ref(false);
const membersFor = ref<Category | null>(null);
const memberSearch = ref("");
const candidates = ref<UserProfile[]>([]);
const selectedIds = ref<string[]>([]);
const searching = ref(false);
const searchError = ref("");
const membersError = ref("");
const removingMemberId = ref<string | null>(null);

const successVisible = ref(false);
const successMessage = ref("");

let requestVersion = 0;
let activeController: AbortController | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchVersion = 0;

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

function openCreate(): void {
  editing.value = null;
  draft.value = { ...EMPTY_CATEGORY_DRAFT, incidentTypeIds: [] };
  fieldErrors.value = {};
  formError.value = "";
  formNotice.value = "";
  formOpen.value = true;
}

function openEdit(category: Category): void {
  editing.value = category;
  draft.value = categoryDraftFromCategory(category);
  fieldErrors.value = {};
  formError.value = "";
  formNotice.value = "";
  formOpen.value = true;
}

function toggleType(id: string, checked: boolean): void {
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
  membersFor.value = category;
  memberSearch.value = "";
  candidates.value = [];
  selectedIds.value = [];
  searchError.value = "";
  membersError.value = "";
  membersOpen.value = true;
}

function queueSearch(): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void searchMembers();
  }, 300);
}

/**
 * The picker is the admin user search, so a person is chosen by their username rather than by pasting
 * a uuid. The result list is deliberately not filtered to "not already a member": membership cannot be
 * read here, and pretending otherwise would need a rule the API does not expose.
 */
async function searchMembers(): Promise<void> {
  const version = ++searchVersion;
  const term = memberSearch.value.trim();
  if (!term) {
    candidates.value = [];
    searchError.value = "";
    searching.value = false;
    return;
  }

  searching.value = true;
  searchError.value = "";
  try {
    const accessToken = await adminToken();
    if (version !== searchVersion) return;
    if (!accessToken) {
      searchError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }
    const response = await listAdminUsers({ q: term, page: 1, limit: 10 }, accessToken);
    if (version !== searchVersion) return;
    const assignedIds = new Set((membersFor.value?.members ?? []).map((member) => member.id));
    candidates.value = response.items.filter(
      (candidate) => candidate.isActive && !assignedIds.has(candidate.id)
    );
  } catch (error) {
    if (version !== searchVersion) return;
    candidates.value = [];
    searchError.value = friendlyErrorMessage(error, "جست‌وجوی امدادگرها انجام نشد. دوباره تلاش کنید.");
  } finally {
    if (version === searchVersion) searching.value = false;
  }
}

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
  searchVersion += 1;
  if (searchTimer) clearTimeout(searchTimer);
  activeController?.abort();
});
</script>

<style scoped>
.admin-categories-description {
  max-width: 18rem;
  overflow-wrap: anywhere;
}

.admin-categories-members {
  max-height: 15rem;
  overflow-y: auto;
}
</style>
