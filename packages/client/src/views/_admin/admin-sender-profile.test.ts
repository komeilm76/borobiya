import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// No Vue SFC mounting in unit tests (docs/TASKS.md).
const dispatch = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const users = readFileSync(new URL("./AdminUsersView.vue", import.meta.url), "utf8");
const profile = readFileSync(new URL("./AdminUserProfileDialog.vue", import.meta.url), "utf8");

describe("admin sender identity and profile access", () => {
  it("links the selected SOS requester by exact ID without interrupting dispatch", () => {
    expect(dispatch).toContain('class="admin-dispatch__sender" role="group"');
    const incident = dispatch.slice(dispatch.indexOf('id="dispatch-incident"'), dispatch.indexOf('id="dispatch-dialog-01"'));
    expect(incident).not.toContain('adminSos.selectedRequest.requesterId');
    expect(incident).toContain('class="admin-dispatch__sender-name"');
    expect(dispatch).toContain('@click="profileUserId = null; senderProfileOpen = true"');
    expect(dispatch).toContain(':user-id="profileUserId ?? adminSos.selectedRequest?.requesterId ?? null"');
    expect(dispatch).toMatch(/watch\(\(\) => adminSos\.selectedRequest\?\.id, \(\) => \{\s*senderProfileOpen\.value = false;\s*profileUserId\.value = null;\s*photoDialogOpen\.value = false;[\s\S]*?\}, \{ flush: "sync" \}\);/);
    expect(dispatch).toContain('title="پروفایل ارسال‌کننده"');
    expect(dispatch).toContain('@click="requestDispatch"');
    expect(dispatch).toContain('class="admin-dispatch__map-and-actions"');
    expect(users.match(/<button type="button" class="admin-user-identity"/g)).toHaveLength(2);
    expect(users.match(/@click="openProfile\(user.id, \$event\)"/g)).toHaveLength(2);
    expect(users).toContain('@closed="restoreProfileFocus"');
    expect(users).toContain("profileTrigger?.isConnected");
    expect(users).not.toContain('admin-users-profile-link');
    expect(users).toContain('<AdminUserProfileDialog :model-value="profileUserId !== null"');
  });

  it("makes the avatar and name one accessible profile target on desktop and mobile", () => {
    const triggers = [...users.matchAll(/<button type="button" class="admin-user-identity"([\s\S]*?)<\/button>/g)];
    expect(triggers).toHaveLength(2);
    for (const [, content] of triggers) {
      expect(content).toContain(':aria-label="`مشاهدهٔ پروفایل ${user.username}`"');
      expect(content).toContain('class="admin-user-avatar"');
      expect(content).toContain('dir="ltr"');
      expect(content).toContain('admin-user-identity__arrow');
      expect(content).not.toContain('<v-btn');
    }
    expect(users).toContain('.admin-user-identity:hover');
    expect(users).toContain('.admin-user-identity:focus-visible');
  });

  it("groups verified profile data into a clear identity, account, groups and reference hierarchy", () => {
    expect(profile).toContain('class="admin-profile__hero" aria-label="هویت کاربر"');
    expect(profile).toContain("profile.isActive ? 'admin-profile__badge--active' : 'admin-profile__badge--inactive'");
    expect(profile).toContain('class="admin-profile__facts"');
    expect(profile).toContain('id="admin-profile-account-title"');
    expect(profile).toContain('id="admin-profile-groups-title"');
    expect(profile).toContain('id="admin-profile-id-title"');
    expect(profile).toContain('هنوز امتیازی ثبت نشده');
    expect(profile).toContain('گروهی به این حساب اختصاص داده نشده است.');
    expect(profile).toContain('aria-label="کپی شناسهٔ کامل حساب"');
    expect(profile).toContain('role="status">شناسهٔ کامل کپی شد.');
  });

  it("only shows an admin-authorized, current-session profile and clears stale responses", () => {
    expect(profile).toContain('auth.user?.role === "admin" ? accountSessionKey(auth.user.id, auth.accessToken) : null');
    expect(profile).toContain('onCleanup(() => { active = false; controller.abort(); });');
    expect(profile).toContain('profile.value = null;');
    expect(profile).toContain('await auth.ensureSession();');
    expect(profile).toContain('session.value !== sessionKey');
    expect(profile).toContain('props.userId === userId && props.modelValue');
    expect(profile).toContain('getAdminUser(userId, auth.accessToken, controller.signal)');
    expect(profile).toContain('role="alert"');
    expect(profile).toContain('role="status" aria-live="polite"');
    expect(profile).toContain('shortId(profile.id)');
    expect(profile).toContain('await navigator.clipboard.writeText(id)');
    expect(profile).toContain('generation === copyGeneration && props.modelValue && session.value === currentSession && profile.value?.id === id');
    expect(profile).toContain('aria-label="شناسهٔ کامل حساب برای کپی دستی"');
    expect(profile).not.toContain('profile.devices'); // Avoid exposing device IPs in a sender summary.
    for (const [filename, source] of [["AdminDispatchView.vue", dispatch], ["AdminUsersView.vue", users],
      ["AdminUserProfileDialog.vue", profile]] as const) {
      const descriptor = parse(source).descriptor;
      expect(compileTemplate({ filename, id: filename, source: descriptor.template!.content }).errors).toEqual([]);
      expect(compileStyle({ filename, id: filename, source: descriptor.styles[0]!.content, scoped: true }).errors).toEqual([]);
    }
  });

  it("keeps profile actions reachable on narrow screens and colors from theme tokens", () => {
    expect(dispatch).toContain('.admin-dispatch__sender-action { width: 100%; }');
    expect(dispatch).toContain('.dispatch-request-row.v-list-item--active');
    expect(users).toContain('.admin-user-identity:focus-visible { outline: 3px solid rgb(var(--v-theme-primary));');
    expect(users).toContain('.admin-mobile-header .admin-user-identity { flex: 1 1 12rem; }');
    expect(profile).toContain(':fullscreen="isPhone"');
    expect(profile).toContain('.admin-profile__content { grid-template-columns: minmax(0, 1fr); }');
    expect(profile).toContain('background: var(--bb-color-inset)');
    const css = parse(dispatch).descriptor.styles[0]!.content;
    const compiled = compileStyle({ filename: "AdminDispatchView.vue", id: "data-v-dispatch-sender", scoped: true, source: css });
    expect(compiled.code).toContain('.dispatch-request-row.v-list-item--active[data-v-dispatch-sender]');
  });
});
