import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned: the repository does not mount Vue SFCs in unit tests.
const drawer = readFileSync(
  new URL("../../components/admin/AdminUserDrawer.vue", import.meta.url),
  "utf8"
);
const view = readFileSync(new URL("./AdminUsersView.vue", import.meta.url), "utf8");

describe("admin account drill-down", () => {
  it("reads the detail route instead of inferring a device list from the row", () => {
    expect(view).toContain("import AdminUserDrawer from");
    expect(view).toContain("<AdminUserDrawer");
    expect(drawer).toContain("import { getAdminUser, type AdminUserDetail } from \"../../api/admin-users\";");
    expect(drawer).toContain("const user = await getAdminUser(userId, accessToken, active.signal);");
    // The list row only carries the profile; devices and missions live behind `GET /_admin/users/:id`.
    expect(drawer).not.toContain("listAdminUsers");
  });

  it("keeps the drawer on a linkable query so reload and back both work", () => {
    expect(view).toContain("const detailUserId = computed<string | null>(() => {");
    expect(view).toContain("void router.replace({ query: { ...route.query, user: user.id } });");
    expect(view).toContain("delete query.user;");
    expect(view).toContain(':user-id="detailUserId"');
    expect(view).toContain('v-model="detailOpen"');
  });

  it("fences an in-flight read when the admin opens another account", () => {
    expect(drawer).toContain("abortActive();");
    expect(drawer).toContain("const current = ++requestVersion;");
    expect(drawer).toContain("const active = new AbortController();");
    expect(drawer).toContain("if (caught instanceof DOMException && caught.name === \"AbortError\") return;");
    expect(drawer.match(/if \(current !== requestVersion\) return;/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("tells a lost connection apart from a refused session", () => {
    expect(drawer).toContain("(caught.status === 401 || caught.status === 403)");
    expect(drawer).toContain('state.value = "forbidden";');
    expect(drawer).toContain('if (typeof navigator !== "undefined" && navigator.onLine === false) {');
    expect(drawer).toContain('state.value = "offline";');
    expect(drawer).toContain('<AdminStatePanel\n        v-else-if="state === \'offline\'"');
  });

  it("cannot deactivate the admin's own account from the drawer", () => {
    expect(view).toContain(':self-id="auth.user?.id ?? null"');
    expect(drawer).toContain("const isSelf = computed(");
    expect(drawer).toContain(':disabled="isSelf"');
  });

  it("routes the status change through the list's confirmation dialog", () => {
    // One dialog, one wording: the drawer raises the request instead of PATCHing behind the admin's back.
    expect(drawer).toContain('@click="emit(\'request-status\', detail)"');
    expect(drawer).not.toContain("updateAdminUserStatus");
    expect(view).toContain('@request-status="requestStatusFromDrawer"');
    expect(view).toContain("statusChange.value = { user, nextIsActive: !user.isActive };");
  });

  it("re-reads the account after that dialog commits", () => {
    expect(view).toContain("if (detailUserId.value === pendingChange.user.id) detailVersion.value += 1;");
    expect(drawer).toContain("() => [props.modelValue, props.userId, props.version ?? 0] as const,");
  });

  it("shows an honest empty line for accounts with no session or mission", () => {
    expect(drawer).toContain("هیچ نشست فعالی برای این حساب ثبت نشده است.");
    expect(drawer).toContain("این حساب هنوز در مأموریتی شرکت نکرده است.");
    expect(drawer).toContain('v-if="detail.devices.length > 0"');
    expect(drawer).toContain('v-if="recentMissions.length > 0"');
    // Both lists are real lists for assistive tech, not styled divs.
    expect(drawer.match(/class="user-drawer__list"/g)?.length).toBe(2);
    expect(drawer.match(/role="list"/g)?.length).toBe(2);
  });

  it("links a mission back to the dispatch board that resolves its request", () => {
    expect(drawer).toContain(
      ':to="`/_admin/dispatch?request=${encodeURIComponent(mission.sosRequestId)}`"'
    );
  });

  it("is a labelled, keyboard-closable drawer", () => {
    expect(drawer).toContain('aria-label="جزئیات حساب کاربر"');
    expect(drawer).toContain('aria-label="بستن جزئیات حساب"');
    expect(drawer).toContain('location="left"');
    expect(drawer).toContain("temporary");
    expect(drawer).not.toContain("v-html");
  });

  it("offers the same drill-down from the mobile card list", () => {
    expect(view).toContain('class="admin-user-cell admin-user-cell--button"');
    expect(view).toContain('class="admin-mobile-details"');
    expect(view).toContain('@click="openUserDetails(user, $event)"');
    // The event is what makes the drawer able to hand focus back to the exact control that opened it.
    expect(view).toContain("const target = event?.currentTarget;");
    expect(view).toContain("if (target?.isConnected) target.focus();");
  });
});
