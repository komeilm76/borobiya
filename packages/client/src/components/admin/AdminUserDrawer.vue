<template>
  <!--
    The account drill-down. The list row answers "is this account in the right state"; an admin investigating a
    complaint needs the rest — which devices are signed in, what this rescuer has actually been dispatched to.
    `GET /_admin/users/:id` has served that since the users API landed; nothing in the panel called it.

    The drawer opens from the physical left end: the navigation rail owns the right side of the panel and it
    must stay visible while an account is being read.
  -->
  <v-navigation-drawer
    :model-value="modelValue"
    location="left"
    temporary
    width="460"
    class="user-drawer"
    aria-label="جزئیات حساب کاربر"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="user-drawer__head">
      <span class="user-drawer__avatar" aria-hidden="true">{{ initial }}</span>
      <div class="user-drawer__identity">
        <strong dir="ltr">{{ detail?.username ?? "…" }}</strong>
        <small>{{ subtitle }}</small>
        <div class="user-drawer__chips">
          <span
            v-if="detail"
            :class="[
              'admin-role-pill',
              detail.role === 'admin' ? 'is-admin' : '',
            ]"
          >
            {{ detail.role === "admin" ? "مدیر سامانه" : "امدادگر" }}
          </span>
          <span
            v-if="detail"
            :class="[
              'admin-account-status',
              detail.isActive ? 'is-active' : 'is-inactive',
            ]"
          >
            <span class="admin-status-dot" />
            {{ detail.isActive ? "حساب فعال" : "حساب غیرفعال" }}
          </span>
        </div>
      </div>
      <v-btn
        icon="mdi-close"
        variant="text"
        size="small"
        aria-label="بستن جزئیات حساب"
        @click="emit('update:modelValue', false)"
      />
    </div>

    <div class="user-drawer__body">
      <AdminStatePanel
        v-if="state === 'loading'"
        state="loading"
        title="در حال دریافت پروندهٔ حساب…"
      />

      <AdminStatePanel
        v-else-if="state === 'forbidden'"
        state="forbidden"
        title="دسترسی به پروندهٔ این حساب مجاز نیست"
        description="نشست مدیر منقضی شده یا نقش شما اجازهٔ خواندن حساب‌ها را ندارد."
      />

      <AdminStatePanel
        v-else-if="state === 'offline'"
        state="offline"
        title="برای خواندن پروندهٔ حساب به اینترنت نیاز است"
        description="پس از برقراری اتصال دوباره تلاش کنید؛ فهرست کاربران نیز تازه‌سازی می‌شود."
        action-label="تلاش دوباره"
        action-icon="mdi-refresh"
        @retry="load"
      />

      <AdminStatePanel
        v-else-if="state === 'error'"
        state="error"
        title="خواندن پروندهٔ حساب ناموفق بود"
        :description="errorMessage"
        action-label="تلاش دوباره"
        action-icon="mdi-refresh"
        @retry="load"
      />

      <template v-else-if="detail">
        <dl class="user-drawer__facts">
          <div>
            <dt>نام کاربری</dt>
            <dd dir="ltr">{{ detail.username }}</dd>
          </div>
          <div>
            <dt>گروه‌های امدادگر</dt>
            <dd>
              <template v-if="detail.categories.length > 0">
                {{
                  detail.categories.map((category) => category.name).join("، ")
                }}
              </template>
              <span v-else class="user-drawer__muted">بدون گروه</span>
            </dd>
          </div>
          <div>
            <dt>تاریخ عضویت</dt>
            <dd>{{ formatDate(detail.createdAt) }}</dd>
          </div>
          <div>
            <dt>امتیاز میانگین</dt>
            <dd>
              {{
                detail.avgRating === null
                  ? "—"
                  : toFa(detail.avgRating.toFixed(1))
              }}
            </dd>
          </div>
          <div>
            <dt>راه‌اندازی حساب</dt>
            <dd>
              {{
                detail.mustCompleteSecurityQuestions
                  ? "ناتمام — نیازمند پرسش‌های امنیتی"
                  : "کامل"
              }}
            </dd>
          </div>
        </dl>

        <section
          class="user-drawer__section"
          aria-labelledby="user-drawer-devices"
        >
          <header class="user-drawer__section-head">
            <h3 id="user-drawer-devices">دستگاه‌ها و نشست‌ها</h3>
            <span class="user-drawer__count">{{
              toFa(detail.devices.length)
            }}</span>
          </header>
          <ul
            v-if="detail.devices.length > 0"
            class="user-drawer__list"
            role="list"
          >
            <li
              v-for="device in detail.devices"
              :key="device.id"
              class="user-drawer__device"
            >
              <v-icon
                class="user-drawer__device-icon"
                :icon="
                  device.isOnline ? 'mdi-cellphone-link' : 'mdi-cellphone-off'
                "
                size="18"
              />
              <span class="user-drawer__device-copy">
                <strong>{{ device.deviceName || "دستگاه بی‌نام" }}</strong>
                <small>
                  <span v-if="device.ip" dir="ltr">{{ device.ip }}</span>
                  <span v-if="device.ip" aria-hidden="true"> · </span>
                  {{ formatRelative(device.lastActiveAt) }}
                </small>
              </span>
              <span
                :class="[
                  'admin-account-status',
                  device.isOnline ? 'is-active' : 'is-inactive',
                ]"
              >
                <span class="admin-status-dot" />
                {{ device.isOnline ? "آنلاین" : "آفلاین" }}
              </span>
            </li>
          </ul>
          <p v-else class="user-drawer__empty">
            هیچ نشست فعالی برای این حساب ثبت نشده است.
          </p>
        </section>

        <section
          class="user-drawer__section"
          aria-labelledby="user-drawer-missions"
        >
          <header class="user-drawer__section-head">
            <h3 id="user-drawer-missions">مأموریت‌های اخیر</h3>
            <span class="user-drawer__count">{{
              toFa(detail.missions.length)
            }}</span>
          </header>
          <ul
            v-if="recentMissions.length > 0"
            class="user-drawer__list"
            role="list"
          >
            <li
              v-for="mission in recentMissions"
              :key="mission.id"
              class="user-drawer__mission"
            >
              <span
                :class="['user-drawer__mission-status', `is-${mission.status}`]"
              >
                {{ missionStatusLabel(mission.status) }}
              </span>
              <span class="user-drawer__mission-meta">{{
                formatRelative(mission.createdAt)
              }}</span>
              <RouterLink
                class="user-drawer__mission-link"
                :to="`/_admin/dispatch?request=${encodeURIComponent(mission.sosRequestId)}`"
              >
                درخواست
                <v-icon icon="mdi-chevron-left" size="15" />
              </RouterLink>
            </li>
          </ul>
          <p v-else class="user-drawer__empty">
            این حساب هنوز در مأموریتی شرکت نکرده است.
          </p>
          <p
            v-if="detail.missions.length > recentMissions.length"
            class="user-drawer__hint"
          >
            {{ toFa(detail.missions.length - recentMissions.length) }} مأموریت
            قدیمی‌تر در فهرست اعزام دیده می‌شود.
          </p>
        </section>

        <p class="user-drawer__note">
          غیرفعال‌کردن حساب، نشست‌های باز آن را پایان می‌دهد و ورود بعدی را
          می‌بندد؛ داده‌ها حذف نمی‌شوند.
        </p>
      </template>
    </div>

    <div class="user-drawer__foot">
      <v-btn
        variant="text"
        rounded="lg"
        @click="emit('update:modelValue', false)"
        >بستن</v-btn
      >
      <v-spacer />
      <v-btn
        v-if="detail"
        :color="detail.isActive ? 'error' : 'primary'"
        :variant="detail.isActive ? 'tonal' : 'flat'"
        rounded="lg"
        :disabled="isSelf"
        :title="isSelf ? 'حساب خودتان را نمی‌توانید غیرفعال کنید' : undefined"
        @click="emit('request-status', detail)"
      >
        <v-icon
          class="ms-2"
          :icon="
            detail.isActive
              ? 'mdi-account-cancel-outline'
              : 'mdi-account-check-outline'
          "
          size="17"
        />
        {{ detail.isActive ? "غیرفعال‌کردن حساب" : "فعال‌کردن حساب" }}
      </v-btn>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { MissionStatus } from "@shared/index";
import { ApiError } from "../../api/http";
import { getAdminUser, type AdminUserDetail } from "../../api/admin-users";
import { friendlyErrorMessage } from "../../api/error-message";
import { useAuthStore } from "../../stores/auth";
import AdminStatePanel from "./AdminStatePanel.vue";

const props = defineProps<{
  modelValue: boolean;
  userId: string | null;
  /** Bumped by the parent after it changes something the drawer shows (account status). */
  version?: number;
  /** The signed-in admin's own id: the panel refuses to deactivate yourself, so the button says so. */
  selfId?: string | null;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  "request-status": [user: AdminUserDetail];
}>();

const MAX_MISSIONS = 5;
const dateFormatter = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" });
const numberFormatter = new Intl.NumberFormat("fa-IR", { useGrouping: false });

const auth = useAuthStore();
const state = ref<
  "idle" | "loading" | "ready" | "error" | "forbidden" | "offline"
>("idle");
const detail = ref<AdminUserDetail | null>(null);
const errorMessage = ref("");
let controller: AbortController | null = null;
let requestVersion = 0;

const initial = computed(() =>
  (detail.value?.username ?? "?").slice(0, 1).toUpperCase(),
);
const isSelf = computed(
  () => Boolean(props.selfId) && props.selfId === props.userId,
);
const subtitle = computed(() => {
  if (!detail.value) return "در حال خواندن پروندهٔ حساب…";
  const groups = detail.value.categories.map((category) => category.name);
  return groups.length > 0 ? groups.join("، ") : "بدون گروه امدادگر";
});
const recentMissions = computed(() =>
  [...(detail.value?.missions ?? [])]
    .sort(
      (left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt),
    )
    .slice(0, MAX_MISSIONS),
);

function toFa(value: number | string): string {
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

const MISSION_LABELS: Record<MissionStatus, string> = {
  pending: "در انتظار پذیرش",
  on_the_way: "در مسیر",
  arrived: "در محل",
  in_progress: "در حال امداد",
  completed: "پایان‌یافته",
  cancelled_by_requester: "لغو توسط درخواست‌کننده",
  cancelled_by_rescuer: "لغو توسط امدادگر",
  expired: "منقضی",
};

function missionStatusLabel(status: MissionStatus): string {
  return MISSION_LABELS[status] ?? status;
}

/** "۳ دقیقه پیش" for the last day, then a concrete date — a rescuer's last sign-in is often days old. */
function formatRelative(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const minutes = Math.max(
    0,
    Math.round((Date.now() - date.getTime()) / 60_000),
  );
  if (minutes < 1) return "همین حالا";
  if (minutes < 60) return `${toFa(numberFormatter.format(minutes))} دقیقه پیش`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${toFa(hours)} ساعت پیش`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${toFa(days)} روز پیش`;
  return formatDate(value);
}

function abortActive(): void {
  controller?.abort();
  controller = null;
}

function reset(): void {
  abortActive();
  requestVersion += 1;
  detail.value = null;
  errorMessage.value = "";
  state.value = "idle";
}

async function load(): Promise<void> {
  const userId = props.userId;
  if (!userId) return;
  abortActive();
  const current = ++requestVersion;
  const active = new AbortController();
  controller = active;
  state.value = "loading";
  errorMessage.value = "";
  try {
    await auth.ensureSession();
    const accessToken = auth.accessToken;
    if (!accessToken) {
      if (current === requestVersion) state.value = "forbidden";
      return;
    }
    const user = await getAdminUser(userId, accessToken, active.signal);
    if (current !== requestVersion) return;
    detail.value = user;
    state.value = "ready";
  } catch (caught) {
    if (caught instanceof DOMException && caught.name === "AbortError") return;
    if (current !== requestVersion) return;
    if (
      caught instanceof ApiError &&
      (caught.status === 401 || caught.status === 403)
    ) {
      state.value = "forbidden";
      return;
    }
    // A dead network and a 5xx deserve different copy: one asks to wait for a connection, the other to retry.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      state.value = "offline";
      return;
    }
    errorMessage.value = friendlyErrorMessage(
      caught,
      "پروندهٔ این حساب خوانده نشد.",
    );
    state.value = "error";
  } finally {
    if (current === requestVersion) controller = null;
  }
}

watch(
  () => [props.modelValue, props.userId, props.version ?? 0] as const,
  ([open, userId]) => {
    if (!open || !userId) {
      reset();
      return;
    }
    void load();
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  requestVersion += 1;
  abortActive();
});
</script>

<style scoped>
.user-drawer {
  display: flex;
  flex-direction: column;
  font-family: var(--bb-font-family);
  background: rgb(var(--v-theme-surface)) !important;
}

.user-drawer__head {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.85rem;
  padding: 1.1rem 1.2rem;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.user-drawer__avatar {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 16px;
  background: rgb(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
  font-size: 1.15rem;
  font-weight: 700;
}

.user-drawer__identity {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}

.user-drawer__identity strong {
  font-size: 1.05rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-drawer__identity small {
  color: rgba(var(--v-theme-on-surface), 0.62);
  font-size: 0.78rem;
}

.user-drawer__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.2rem;
}

.user-drawer__body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 1rem 1.2rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}

.user-drawer__facts {
  display: grid;
  gap: 0.55rem;
  margin: 0;
  padding: 0.9rem 1rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 16px;
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.user-drawer__facts > div {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
  gap: 0.5rem;
  align-items: baseline;
}

.user-drawer__facts dt {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.76rem;
}

.user-drawer__facts dd {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  word-break: break-word;
}

.user-drawer__muted {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-weight: 500;
}

.user-drawer__section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.user-drawer__section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.user-drawer__section-head h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
}

.user-drawer__count {
  display: grid;
  place-items: center;
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.74rem;
  font-weight: 600;
}

.user-drawer__list {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.user-drawer__device,
.user-drawer__mission {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  border-radius: 14px;
  background: rgb(var(--v-theme-surface));
}

.user-drawer__device-icon {
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.user-drawer__device-copy {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1 1 auto;
  min-width: 0;
}

.user-drawer__device-copy strong {
  font-size: 0.84rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-drawer__device-copy small {
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.74rem;
}

.user-drawer__mission {
  justify-content: space-between;
  gap: 0.5rem;
}

.user-drawer__mission-status {
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.78);
  font-size: 0.74rem;
  font-weight: 600;
  white-space: nowrap;
}

.user-drawer__mission-status.is-completed {
  background: rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-success));
}

.user-drawer__mission-status.is-in_progress,
.user-drawer__mission-status.is-on_the_way,
.user-drawer__mission-status.is-arrived {
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.user-drawer__mission-status.is-cancelled_by_requester,
.user-drawer__mission-status.is-cancelled_by_rescuer,
.user-drawer__mission-status.is-expired {
  background: rgba(var(--v-theme-error), 0.12);
  color: rgb(var(--v-theme-error));
}

.user-drawer__mission-meta {
  flex: 1 1 auto;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.74rem;
  text-align: center;
}

.user-drawer__mission-link {
  display: inline-flex;
  align-items: center;
  gap: 0.1rem;
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  text-decoration: none;
  white-space: nowrap;
}

.user-drawer__mission-link:hover {
  text-decoration: underline;
}

.user-drawer__empty,
.user-drawer__hint {
  margin: 0;
  padding: 0.75rem 0.85rem;
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.16);
  border-radius: 14px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.78rem;
  text-align: center;
}

.user-drawer__hint {
  border: 0;
  padding: 0;
  text-align: start;
  font-size: 0.74rem;
}

.user-drawer__note {
  margin: 0;
  padding: 0.7rem 0.85rem;
  border-radius: 14px;
  background: rgba(var(--v-theme-warning), 0.1);
  color: rgba(var(--v-theme-on-surface), 0.72);
  font-size: 0.76rem;
  line-height: 1.7;
}

.user-drawer__foot {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.9rem 1.2rem;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgb(var(--v-theme-surface));
}

@media (max-width: 600px) {
  .user-drawer {
    width: 92vw !important;
  }

  .user-drawer__facts > div {
    grid-template-columns: 1fr;
    gap: 0.1rem;
  }
}
</style>
