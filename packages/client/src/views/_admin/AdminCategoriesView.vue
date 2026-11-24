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
            <th class="admin-categories-actions-heading">عملیات</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="listState === 'loading'">
            <td colspan="4">
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
            <td class="admin-categories-actions">
              <div class="admin-categories-actions__buttons">
                <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-account-plus-outline" @click="openMembers(category, $event)">
                  افزودن عضو ({{ category.members.length.toLocaleString('fa-IR') }})
                </v-btn>
                <v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-pencil-outline" @click="openEdit(category, $event)">ویرایش</v-btn>
              </div>
            </td>
          </tr>
          <tr v-if="listState === 'error'">
            <td colspan="4" class="py-6 text-center">
              دریافت گروه‌ها انجام نشد.
              <v-btn size="small" variant="text" color="primary" @click="load">تلاش دوباره</v-btn>
            </td>
          </tr>
          <tr v-if="listState === 'empty'">
            <td colspan="4" class="py-6 text-center opacity-60">هنوز گروهی ساخته نشده است.</td>
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
          </dl>
          <div class="admin-categories-mobile__actions">
            <v-btn variant="tonal" color="primary" prepend-icon="mdi-account-plus-outline" @click="openMembers(category, $event)">
              افزودن عضو ({{ category.members.length.toLocaleString('fa-IR') }})
            </v-btn>
            <v-btn variant="tonal" color="primary" prepend-icon="mdi-pencil-outline" @click="openEdit(category, $event)">ویرایش</v-btn>
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

    <v-dialog v-model="membersOpen" max-width="800" scrollable persistent :fullscreen="isPhone"
      aria-labelledby="admin-category-members-title" @after-leave="restoreMembersFocus">
      <v-card class="admin-category-members" rounded="xl" dir="rtl">
        <header class="admin-category-members__header">
          <span class="admin-category-members__header-icon" aria-hidden="true"><v-icon icon="mdi-account-multiple-plus-outline" size="25" /></span>
          <div class="admin-category-members__heading">
            <span class="admin-category-members__eyebrow">افزودن عضو به گروه</span>
            <h2 id="admin-category-members-title">{{ membersFor?.name ?? 'مدیریت اعضا' }}</h2>
          </div>
          <v-btn class="admin-category-members__close" icon="mdi-close" variant="text" aria-label="بستن مدیریت اعضا"
            :disabled="saving || removingMemberId !== null" @click="membersOpen = false" />
        </header>

        <v-card-text class="admin-category-members__body">
          <section class="admin-category-members__section admin-category-members__section--search" aria-labelledby="admin-category-add-title">
            <div class="admin-category-members__section-head">
              <span class="admin-category-members__section-icon" aria-hidden="true"><v-icon icon="mdi-account-search-outline" size="21" /></span>
              <div>
                <h3 id="admin-category-add-title">افزودن حساب</h3>
                <p id="admin-category-search-hint">جست‌وجو فقط حساب‌های فعالِ خارج از این گروه را نشان می‌دهد.</p>
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
              :disabled="saving || removingMemberId !== null"
              aria-describedby="admin-category-search-hint"
              data-test="member-search"
              @update:model-value="queueSearch($event)"
            />
            <div class="admin-categories-members">
              <div v-if="!memberSearch.trim()" class="admin-category-members__search-state" role="status">
                <v-icon icon="mdi-magnify" size="22" aria-hidden="true" />
                <span>برای پیدا کردن حساب، نام کاربری را وارد کنید.</span>
              </div>
              <div v-else-if="searching" class="admin-category-members__search-state" role="status">
                <v-progress-circular indeterminate color="primary" size="22" aria-hidden="true" />
                <span>در حال جست‌وجو…</span>
              </div>
              <v-alert v-else-if="searchError" type="error" variant="tonal" rounded="lg" role="alert">
                {{ searchError }}
                <template #append><v-btn size="small" variant="text" @click="queueSearch(memberSearch)">تلاش دوباره</v-btn></template>
              </v-alert>
              <div v-else-if="candidates.length === 0" class="admin-category-members__search-state" role="status">
                <v-icon icon="mdi-account-search-outline" size="22" aria-hidden="true" />
                <span>حساب فعالِ تازه‌ای با این عبارت پیدا نشد. عبارت دقیق‌تری امتحان کنید.</span>
              </div>
              <template v-else>
                <div class="admin-category-members__results" role="group" aria-label="نتایج جست‌وجوی حساب‌ها">
                  <v-checkbox
                    v-for="candidate in candidates"
                    :key="candidate.id"
                    :model-value="selectedIds.includes(candidate.id)"
                    density="comfortable"
                    hide-details
                    :disabled="saving || removingMemberId !== null"
                    class="admin-categories-member"
                    :class="{ 'admin-categories-member--selected': selectedIds.includes(candidate.id) }"
                    @update:model-value="toggleMember(candidate.id, $event as boolean)"
                  >
                    <template #label>
                      <span class="admin-category-members__candidate">
                        <span class="admin-category-members__avatar" aria-hidden="true">{{ candidate.username.slice(0, 1).toUpperCase() }}</span>
                        <span dir="ltr">{{ candidate.username }}</span>
                      </span>
                    </template>
                  </v-checkbox>
                </div>
                <p v-if="candidates.length === 10" class="admin-category-members__results-hint">۱۰ نتیجهٔ نخست؛ جست‌وجو را دقیق‌تر کنید.</p>
              </template>
            </div>
            <div v-if="selectedIds.length" class="admin-category-members__selection" role="group" aria-label="حساب‌های انتخاب‌شده برای افزودن">
              <strong class="admin-category-members__selection-heading">انتخاب‌شده ({{ selectedIds.length.toLocaleString('fa-IR') }})</strong>
              <div class="admin-category-members__selection-chips">
                <v-chip v-for="id in selectedIds" :key="id" closable color="primary" variant="tonal"
                  :disabled="saving || removingMemberId !== null" :close-label="`حذف ${selectedUsernames[id] ?? 'کاربر'} از انتخاب‌ها`"
                  @click:close="toggleMember(id, false)"><span dir="ltr">{{ selectedUsernames[id] ?? 'کاربر' }}</span></v-chip>
              </div>
            </div>
          </section>

          <section class="admin-category-members__section admin-category-members__section--current" aria-labelledby="admin-category-current-title" data-test="current-members">
            <button class="admin-category-members__disclosure" type="button" :aria-expanded="currentMembersExpanded"
              aria-controls="admin-category-current-list" @click="currentMembersExpanded = !currentMembersExpanded">
              <span class="admin-category-members__section-icon" aria-hidden="true"><v-icon icon="mdi-account-check-outline" size="20" /></span>
              <span id="admin-category-current-title">اعضای فعلی</span>
              <span class="admin-category-members__count">{{ (membersFor?.members.length ?? 0).toLocaleString('fa-IR') }} عضو</span>
              <v-icon :icon="currentMembersExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'" size="20" aria-hidden="true" />
            </button>
            <div v-show="currentMembersExpanded" id="admin-category-current-list" class="admin-category-members__current-content">
              <p class="admin-category-members__remove-hint">حذف عضو فقط عضویت در همین گروه را برمی‌دارد.</p>
              <div v-if="!membersFor || membersFor.members.length === 0" class="admin-category-members__empty">
                هنوز عضوی در این گروه ثبت نشده است.
              </div>
              <ul v-else class="admin-category-members__current" aria-label="اعضای فعلی گروه">
                <li v-for="member in membersFor.members" :key="member.id" class="admin-category-members__person">
                  <span class="admin-category-members__avatar" aria-hidden="true">{{ member.username.slice(0, 1).toUpperCase() }}</span>
                  <span class="admin-category-members__username" dir="ltr">{{ member.username }}</span>
                  <v-btn size="small" variant="text" color="error" prepend-icon="mdi-account-minus-outline"
                    :loading="removingMemberId === member.id" :disabled="saving || removingMemberId !== null"
                    :aria-label="`حذف ${member.username} از ${membersFor.name}`" @click="removeMember(member)">حذف</v-btn>
                </li>
              </ul>
            </div>
          </section>

          <v-alert v-if="membersError" class="admin-category-members__error" type="error" variant="tonal" rounded="lg" role="alert">{{ membersError }}</v-alert>
        </v-card-text>
        <v-card-actions class="admin-catalog-dialog-actions admin-category-members__actions">
          <v-spacer />
          <v-btn variant="text" rounded="lg" :disabled="saving || removingMemberId !== null" @click="membersOpen = false">بستن</v-btn>
          <v-btn color="primary" variant="flat" rounded="lg" :loading="saving"
            :disabled="saving || removingMemberId !== null || selectedIds.length === 0" @click="addMembers">
            {{ selectedIds.length ? `افزودن ${selectedIds.length.toLocaleString('fa-IR')} عضو` : 'افزودن عضو' }}
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
import { withConfirmedMembers, withoutConfirmedMember } from "../../admin/category-members";
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
const currentMembersExpanded = ref(true);
const selectedIds = ref<string[]>([]);
const selectedUsernames = ref<Record<string, string>>({});
let membersTrigger: HTMLElement | null = null;
function restoreMembersFocus(): void {
  if (membersTrigger?.isConnected) membersTrigger.focus({ preventScroll: true });
  membersTrigger = null;
}
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

function openMembers(category: Category, event: MouseEvent): void {
  membersTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  currentMembersExpanded.value = !isPhone.value;
  resetSearch();
  membersFor.value = category;
  selectedIds.value = [];
  selectedUsernames.value = {};
  membersError.value = "";
  membersOpen.value = true;
}

// The picker is an admin username search, not a raw-UUID form. Closing or switching categories
// invalidates replies that might otherwise offer candidates for an old dialog context.
watch(isPhone, (phone) => { if (membersOpen.value) currentMembersExpanded.value = !phone; });
watch(membersOpen, (open) => {
  if (!open) {
    resetSearch();
    selectedIds.value = [];
    selectedUsernames.value = {};
  }
}, { flush: "sync" });

function toggleMember(id: string, checked: boolean): void {
  const next = new Set(selectedIds.value);
  if (checked) {
    const candidate = candidates.value.find((person) => person.id === id);
    if (!candidate) return;
    next.add(id);
    selectedUsernames.value = { ...selectedUsernames.value, [id]: candidate.username };
  } else {
    next.delete(id);
    const remaining = { ...selectedUsernames.value };
    delete remaining[id];
    selectedUsernames.value = remaining;
  }
  selectedIds.value = [...next];
  membersError.value = "";
}

async function addMembers(): Promise<void> {
  const category = membersFor.value;
  if (!category || saving.value || removingMemberId.value !== null || !hasSelection.value) return;

  saving.value = true;
  membersError.value = "";
  try {
    const accessToken = await adminToken();
    if (!accessToken) {
      membersError.value = "نشست مدیر در دسترس نیست؛ دوباره وارد حساب شوید.";
      return;
    }
    const confirmed = selectedIds.value.flatMap((id) => {
      const username = selectedUsernames.value[id];
      return username ? [{ id, username }] : [];
    });
    await assignCategoryUsers(category.id, selectedIds.value, accessToken);
    const addedCount = selectedIds.value.length;
    // The write committed: keep its result visible even if the subsequent list refresh fails.
    categories.value = categories.value.map((row) => withConfirmedMembers(row, category.id, confirmed));
    if (membersFor.value?.id === category.id) {
      membersFor.value = withConfirmedMembers(membersFor.value, category.id, confirmed);
    }
    selectedIds.value = [];
    selectedUsernames.value = {};
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
.admin-category-form__section { min-width: 0; padding: 0; border: 0; background: transparent; }
.admin-category-form__section + .admin-category-form__section { padding-block-start: 1.15rem;
  border-top: 1px solid color-mix(in srgb, var(--bb-color-outline) 28%, transparent); }
.admin-category-form__section-head { display: flex; align-items: center; flex-wrap: wrap; gap: .7rem; margin-bottom: 1rem; }
.admin-category-form__section-head > div { min-width: 0; flex: 1 1 12rem; }
.admin-category-form__step { display: grid; flex: none; place-items: center; width: 36px; height: 36px;
  border-radius: .75rem; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .11);
  font-weight: 800; }
.admin-category-form__section-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
.admin-category-form__section-head p { margin: .15rem 0 0; color: var(--bb-color-muted); font-size: .84rem; line-height: 1.65; }
.admin-category-form__count { flex: none; padding: .35rem .7rem;
  border-radius: 999px; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .08);
  font-size: .82rem; font-weight: 750; }
.admin-category-form__fields { display: grid; gap: .3rem; }
.admin-category-form__fields :deep(.v-input:last-child .v-input__details) { min-height: 0; }
.admin-categories-picker { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .6rem; }
.admin-category-form__option { min-width: 0; border-radius: .85rem;
  background: var(--bb-color-inset); transition: background .15s ease, box-shadow .15s ease; }
.admin-category-form__option--selected { background: rgba(var(--v-theme-primary), .1);
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary)); }
.admin-category-form__option:hover:not(.v-input--disabled):not(.admin-category-form__option--selected) {
  background: rgba(var(--v-theme-primary), .08); }
.admin-category-form__option :deep(.v-selection-control) { min-height: 62px; padding: .3rem .65rem; }
.admin-category-form__option :deep(.v-label) { min-width: 0; flex: 1; opacity: 1; }
.admin-category-form__option :deep(.v-selection-control--focus-visible) { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: .55rem; }
.admin-category-form__option-label { display: grid; min-width: 0; gap: .15rem; padding-block: .2rem; overflow-wrap: anywhere; }
.admin-category-form__option-label strong { color: var(--bb-color-text); font-size: .86rem; font-weight: 750; }
.admin-category-form__option-label small { justify-self: start; max-width: 100%; color: var(--bb-color-muted);
  font-size: .8rem; overflow-wrap: anywhere; }
.admin-category-form__hint, .admin-category-form__empty { margin: .8rem 0 0; color: var(--bb-color-muted); font-size: .83rem; line-height: 1.7; }
.admin-category-form__empty { display: flex; align-items: flex-start; gap: .5rem; padding: .85rem 1rem;
  border-radius: .75rem; background: var(--bb-color-inset); }
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
  .admin-category-form__empty, .admin-category-form__notice { background: Canvas; color: CanvasText; }
  .admin-category-form__section + .admin-category-form__section { border-color: CanvasText; }
  .admin-category-form__option--selected { outline: 2px solid Highlight; outline-offset: -2px; }
  .admin-category-form__option :deep(.v-selection-control--focus-visible) { outline-color: Highlight; }
}
@media (prefers-reduced-motion: reduce) { .admin-category-form__option { transition: none; } }

.admin-category-members { color: var(--bb-color-text); background: rgb(var(--v-theme-surface)); font-family: var(--bb-font-family); }
.admin-category-members__header {
  display: flex; align-items: center; gap: .7rem; flex: none;
  padding: .75rem 1.1rem; border-bottom: 1px solid var(--bb-color-outline);
  background: linear-gradient(110deg, rgba(var(--v-theme-primary), .1), rgba(var(--v-theme-primary), .025) 75%);
}
.admin-category-members__header-icon { display: grid; flex: none; place-items: center; width: 40px; height: 40px;
  border-radius: 1rem; color: rgb(var(--v-theme-on-primary)); background: rgb(var(--v-theme-primary)); }
.admin-category-members__heading { min-width: 0; flex: 1; }
.admin-category-members__eyebrow { color: var(--bb-color-primary); font-size: .82rem; font-weight: 750; }
.admin-category-members__heading h2 { margin: .15rem 0 0; font-size: 1.25rem; font-weight: 800; line-height: 1.45; overflow-wrap: anywhere; }
.admin-category-members__close { flex: none; align-self: flex-start; }
.admin-category-members__close.v-btn { width: 44px; height: 44px; }
.admin-category-members__body {
  display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, .8fr);
  gap: .75rem; align-content: start; align-items: start; padding: .85rem 1.1rem;
  background: var(--bb-color-inset);
}
.admin-category-members__section { min-width: 0; padding: .85rem; border: 0; border-radius: var(--bb-radius-nested, 16px); }
.admin-category-members__section--search { grid-column: 1; grid-row: 1;
  background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-item); }
.admin-category-members__section--current { grid-column: 2; grid-row: 1;
  background: rgba(var(--v-theme-primary), .09); }
.admin-category-members__section-head { display: flex; align-items: center; gap: .5rem; margin-bottom: .6rem; }
.admin-category-members__section-head > div { min-width: 0; flex: 1 1 9rem; }
.admin-category-members__section-icon { display: grid; flex: none; place-items: center; width: 34px; height: 34px;
  border-radius: .8rem; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .1); }
.admin-category-members__section-head h3 { margin: 0; font-size: 1rem; font-weight: 800; }
.admin-category-members__section-head p { margin: .1rem 0 0; color: var(--bb-color-muted); font-size: .8rem; line-height: 1.5; }
.admin-category-members__count { padding: .3rem .65rem; border-radius: 999px; color: var(--bb-color-primary);
  background: rgba(var(--v-theme-primary), .09); font-size: .82rem; font-weight: 750; }
.admin-categories-members { min-width: 0; margin-top: .5rem; }
.admin-category-members__search-state, .admin-category-members__empty { display: flex; align-items: flex-start; gap: .55rem;
  padding: .55rem .7rem; border-radius: .8rem;
  background: var(--bb-color-inset); color: var(--bb-color-muted); font-size: .85rem; line-height: 1.7; }
.admin-category-members__section--current .admin-category-members__empty { padding-inline: 0; background: transparent; }
.admin-category-members__search-state :deep(.v-icon), .admin-category-members__search-state :deep(.v-progress-circular) { flex: none; margin-top: .1rem; }
.admin-category-members__current { display: grid; gap: .3rem; max-height: 11rem; margin: 0; padding: 0 .1rem;
  overflow-y: auto; list-style: none; overscroll-behavior: contain; }
.admin-category-members__person { display: flex; align-items: center; gap: .4rem; min-width: 0; min-height: 48px;
  padding: .1rem .35rem; }
.admin-category-members__person + .admin-category-members__person { border-top: 1px solid color-mix(in srgb, var(--bb-color-outline) 24%, transparent); }
.admin-category-members__avatar { display: grid; flex: none; place-items: center; width: 30px; height: 30px;
  border-radius: .7rem; color: var(--bb-color-primary); background: rgba(var(--v-theme-primary), .12);
  font-size: .9rem; font-weight: 800; }
.admin-category-members__username { min-width: 0; flex: 1; color: var(--bb-color-text); font-size: .85rem;
  font-weight: 750; overflow-wrap: anywhere; }
.admin-category-members__person :deep(.v-btn) { min-width: 44px; min-height: 44px; flex: none; }
.admin-category-members__results { display: grid; gap: .3rem; max-height: 14rem; overflow-y: auto;
  padding: .1rem; overscroll-behavior: contain; }
.admin-categories-member { min-width: 0; border-radius: .8rem;
  background: var(--bb-color-inset); transition: background .15s ease, box-shadow .15s ease; }
.admin-categories-member--selected { background: rgba(var(--v-theme-primary), .1);
  box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary)); }
.admin-categories-member:hover:not(.v-input--disabled):not(.admin-categories-member--selected) {
  background: rgba(var(--v-theme-primary), .08); }
.admin-categories-member :deep(.v-selection-control) { min-height: 48px; padding: .15rem .4rem; }
.admin-categories-member :deep(.v-label) { min-width: 0; flex: 1; opacity: 1; }
.admin-categories-member :deep(.v-selection-control--focus-visible) { outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: 2px; border-radius: .55rem; }
.admin-category-members__candidate { display: flex; align-items: center; gap: .55rem; min-width: 0; }
.admin-category-members__candidate > span:last-child { min-width: 0; color: var(--bb-color-text);
  font-size: .85rem; font-weight: 700; overflow-wrap: anywhere; }
.admin-category-members__results-hint { margin: .4rem 0 0; color: var(--bb-color-muted); font-size: .8rem; line-height: 1.6; }
.admin-category-members__selection { display: flex; align-items: center; flex-wrap: wrap; gap: .4rem .7rem;
  min-width: 0; margin-top: .7rem; padding: .45rem .7rem;
  border-radius: .75rem; background: rgba(var(--v-theme-primary), .1); }
.admin-category-members__selection-heading { flex: none; color: var(--bb-color-primary); font-size: .84rem; font-weight: 800; }
.admin-category-members__selection-chips { display: flex; flex: 1 1 14rem; flex-wrap: wrap; gap: .35rem; min-width: 0;
  max-width: 100%; max-height: 7rem; overflow-y: auto; }
.admin-category-members__selection-chips :deep(.v-chip) { min-height: 44px; max-width: 100%; }
.admin-category-members__selection-chips :deep(.v-chip__content) { white-space: normal; overflow-wrap: anywhere; }
.admin-category-members__error { grid-column: 1 / -1; }
.admin-category-members__actions { flex: none; gap: .4rem; padding: .55rem 1.1rem; border-top: 1px solid var(--bb-color-outline); }
.admin-category-members__disclosure { display: flex; align-items: center; gap: .45rem; width: 100%; min-height: 44px;
  padding: 0; border: 0; background: transparent; color: var(--bb-color-text); font-size: .9rem; font-weight: 800;
  text-align: start; cursor: pointer; }
.admin-category-members__disclosure .admin-category-members__count { margin-inline-start: auto; background: rgb(var(--v-theme-surface)); }
.admin-category-members__disclosure:focus-visible { outline: 3px solid rgb(var(--v-theme-primary)); outline-offset: 2px; border-radius: .4rem; }
.admin-category-members__current-content { margin-top: .45rem; }
.admin-category-members__remove-hint { margin: 0 0 .45rem; color: var(--bb-color-muted); font-size: .8rem; line-height: 1.5; }
.admin-category-members__actions :deep(.v-btn) { min-height: 44px; margin: 0; }
@media (forced-colors: active) {
  .admin-category-members__header, .admin-category-members__section, .admin-category-members__person,
  .admin-category-members__selection, .admin-categories-member, .admin-category-members__empty,
  .admin-category-members__search-state { background: Canvas; color: CanvasText; }
  .admin-category-members__section { outline: 1px solid CanvasText; }
  .admin-category-members__person + .admin-category-members__person { border-color: CanvasText; }
  .admin-categories-member--selected { outline: 2px solid Highlight; outline-offset: -2px; }
  .admin-category-members__disclosure:focus-visible,
  .admin-categories-member :deep(.v-selection-control--focus-visible) { outline-color: Highlight; }
}
@media (prefers-reduced-motion: reduce) { .admin-categories-member { transition: none; } }

.admin-categories-table td { vertical-align: middle; }
.admin-categories-table .admin-categories-row > td:first-child { overflow-wrap: anywhere; }
.admin-categories-description { max-width: 18rem; overflow-wrap: anywhere; }
.admin-categories-actions-heading, .admin-categories-actions { width: 15rem; }
.admin-categories-actions__buttons { display: flex; flex-wrap: wrap; gap: .25rem; }
.admin-categories-actions__buttons :deep(.v-btn) { min-height: 36px; height: auto; padding-block: .25rem; white-space: normal; }

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
  .admin-category-members { height: 100dvh; max-height: 100dvh; border-radius: 0 !important; }
  .admin-category-members__header { padding: calc(var(--bb-form-phone-compactHeaderBlock) + env(safe-area-inset-top, 0px)) var(--bb-form-phone-compactInline) var(--bb-form-phone-compactHeaderBlock); }
  .admin-category-members__header-icon { width: var(--bb-form-phone-compactIcon); height: var(--bb-form-phone-compactIcon); }
  .admin-category-members__heading h2 { font-size: var(--bb-form-phone-title); }
  .admin-category-members__body { grid-template-columns: minmax(0, 1fr); gap: .4rem; padding: var(--bb-form-phone-compactBodyBlock) var(--bb-form-phone-compactInline); }
  .admin-category-members__section--search, .admin-category-members__section--current { grid-column: 1; grid-row: auto; }
  .admin-category-members__section { padding: var(--bb-form-phone-compactSectionInset) var(--bb-form-phone-compactInline); }
  .admin-category-members__section-head { margin-bottom: .35rem; }
  .admin-category-members__section-head .admin-category-members__section-icon { display: none; }
  .admin-category-members__results { max-height: min(34dvh, 14rem); }
  .admin-category-members__actions { flex-direction: row; padding: var(--bb-form-phone-compactActionBlock) var(--bb-form-phone-compactInline) calc(var(--bb-form-phone-compactActionBlock) + env(safe-area-inset-bottom, 0px)); }
  .admin-category-members__actions :deep(.v-btn) { flex: 1; width: auto; min-width: 0; }
  .admin-category-members__eyebrow { display: none; }
  .admin-category-form { height: 100dvh; max-height: 100dvh; border-radius: 0 !important; }
  .admin-category-form__header { padding: calc(var(--bb-form-phone-headerBlock) + env(safe-area-inset-top, 0px)) var(--bb-form-phone-inline) var(--bb-form-phone-headerBlock); }
  .admin-category-form__header-icon { width: var(--bb-form-phone-icon); height: var(--bb-form-phone-icon); }
  .admin-category-form__heading h2 { font-size: var(--bb-form-phone-title); }
  .admin-category-form__body { gap: var(--bb-form-phone-sectionGap); padding: var(--bb-form-phone-bodyBlock) var(--bb-form-phone-inline); }
  .admin-category-form__section + .admin-category-form__section { padding-block-start: var(--bb-form-phone-sectionGap); }
  .admin-category-form__section-head { margin-bottom: .75rem; }
  .admin-category-form__option :deep(.v-selection-control) { min-height: 56px; }
  .admin-categories-picker { grid-template-columns: minmax(0, 1fr); }
  .admin-category-form__actions { padding: var(--bb-form-phone-actionBlock) var(--bb-form-phone-inline) calc(var(--bb-form-phone-actionBlock) + env(safe-area-inset-bottom, 0px)); }
  .admin-category-form__action-hint { max-width: none; text-align: center; }
  .admin-categories-mobile__actions { flex-direction: column; }
  .admin-categories-mobile__actions :deep(.v-btn) { width: 100%; }
  .admin-catalog-dialog-actions { flex-direction: column; align-items: stretch; }
  .admin-catalog-dialog-actions :deep(.v-spacer) { display: none; }
  .admin-catalog-dialog-actions :deep(.v-btn) { width: 100%; min-height: 44px; height: auto; white-space: normal; }
  .admin-catalog-dialog-actions.admin-category-members__actions { flex-direction: row; }
  .admin-catalog-dialog-actions.admin-category-members__actions :deep(.v-btn) { flex: 1; width: auto; min-width: 0; }
}
</style>
