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
    expect(users.match(/@click="profileUserId = user.id"/g)).toHaveLength(2);
    expect(users).toContain('<AdminUserProfileDialog :model-value="profileUserId !== null"');
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
    expect(users).toContain('.admin-users-profile-link { justify-self: start; min-height: 44px;');
    expect(profile).toContain('@media (max-width: 480px) { .admin-profile__facts { grid-template-columns: minmax(0, 1fr); } }');
    expect(profile).toContain('background: var(--bb-color-inset)');
    const css = parse(dispatch).descriptor.styles[0]!.content;
    const compiled = compileStyle({ filename: "AdminDispatchView.vue", id: "data-v-dispatch-sender", scoped: true, source: css });
    expect(compiled.code).toContain('.dispatch-request-row.v-list-item--active[data-v-dispatch-sender]');
  });
});
