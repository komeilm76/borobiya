import { readFileSync } from "node:fs";
import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { UserProfile } from "@shared/index";
import { accountSessionKey } from "@/composables/device-identity";
import { useAdminUserStatusChange } from "./user-status-change";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const adminId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const target = { id: targetId, username: "rescuer", isActive: true } as UserProfile;

function setup(ensureSession: () => Promise<unknown> = async () => {},
  update: (id: string, active: boolean, token: string) => Promise<unknown> = async () => {}) {
  const scope = effectScope();
  const session = ref("admin/session-one");
  const bearer = ref("first-token");
  const loading = ref(false);
  const refresh = vi.fn(async () => {});
  const write = vi.fn(update);
  const change = scope.run(() => useAdminUserStatusChange({
    session: () => session.value, accessToken: () => bearer.value, ensureSession,
    update: write, refresh, listLoading: loading, isCurrentAdmin: (id) => id === adminId,
    errorMessage: (cause, fallback) => cause instanceof Error ? cause.message : fallback
  }))!;
  return { scope, session, bearer, loading, refresh, write, change };
}

describe("admin user status confirmation session boundary", () => {
  it("distinguishes a renewed bearer from another login, including the same admin account", () => {
    const jwt = (sub: string, sessionId: string, nonce: number) =>
      `header.${btoa(JSON.stringify({ sub, sessionId, nonce }))}.signature`;
    expect(accountSessionKey(adminId, jwt(adminId, "first", 1)))
      .toBe(accountSessionKey(adminId, jwt(adminId, "first", 2)));
    expect(accountSessionKey(adminId, jwt(adminId, "first", 1)))
      .not.toBe(accountSessionKey(adminId, jwt(adminId, "second", 1)));
    expect(accountSessionKey(adminId, jwt(targetId, "first", 1))).toBeNull();
  });

  it("does not submit the old confirmation under a different login after session recovery", async () => {
    const first = deferred<unknown>();
    const next = deferred<unknown>();
    let reads = 0;
    const s = setup(() => ++reads === 1 ? first.promise : next.promise);
    try {
      s.change.requestStatusChange(target, false);
      const oldAction = s.change.confirmStatusChange();
      expect(s.change.statusSavingUserId.value).toBe(targetId);
      s.session.value = "admin/session-two"; // same account, new login; not a bearer refresh
      s.bearer.value = "second-token";
      expect(s.change.statusSavingUserId.value).toBeNull();
      expect(s.change.statusChange.value).toBeNull();
      s.change.requestStatusChange(target, false);
      const newAction = s.change.confirmStatusChange();
      first.resolve(undefined);
      await oldAction;
      expect(s.write).not.toHaveBeenCalled();
      expect(s.change.statusSavingUserId.value).toBe(targetId);
      next.resolve(undefined);
      await newAction;
      expect(s.write).toHaveBeenCalledExactlyOnceWith(targetId, false, "second-token");
      expect(s.refresh).toHaveBeenCalledOnce();
    } finally { first.resolve(undefined); next.resolve(undefined); s.scope.stop(); }
  });

  it("ignores a committed old write's reply without clearing the new session's busy state or feedback", async () => {
    const oldPost = deferred<unknown>();
    const newPost = deferred<unknown>();
    const s = setup(undefined, (_id, _active, token) => token === "first-token" ? oldPost.promise : newPost.promise);
    try {
      s.change.requestStatusChange(target, false);
      const oldAction = s.change.confirmStatusChange();
      await nextTick();
      expect(s.write).toHaveBeenCalledExactlyOnceWith(targetId, false, "first-token");
      s.session.value = "other-admin/session-two";
      s.bearer.value = "second-token";
      s.change.requestStatusChange({ ...target, isActive: false }, true);
      const newAction = s.change.confirmStatusChange();
      await nextTick();
      oldPost.resolve(undefined);
      await oldAction;
      expect(s.change.statusSavingUserId.value).toBe(targetId);
      expect(s.change.statusChange.value?.nextIsActive).toBe(true);
      expect(s.change.successVisible.value).toBe(false);
      expect(s.refresh).not.toHaveBeenCalled();
      newPost.resolve(undefined);
      await newAction;
      expect(s.change.statusSavingUserId.value).toBeNull();
      expect(s.change.successVisible.value).toBe(true);
      expect(s.refresh).toHaveBeenCalledOnce();
    } finally { oldPost.resolve(undefined); newPost.resolve(undefined); s.scope.stop(); }
  });

  it("does not show an old PATCH failure in a replacement admin's confirmation", async () => {
    const oldPost = deferred<unknown>();
    const nextPost = deferred<unknown>();
    const s = setup(undefined, (_id, _active, token) => token === "first-token" ? oldPost.promise : nextPost.promise);
    try {
      s.change.requestStatusChange(target, false);
      const oldAction = s.change.confirmStatusChange();
      await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(1));
      s.session.value = "admin/session-two";
      s.bearer.value = "second-token";
      s.change.requestStatusChange(target, false);
      const nextAction = s.change.confirmStatusChange();
      await vi.waitFor(() => expect(s.write).toHaveBeenCalledTimes(2));
      oldPost.reject(new Error("old network failure"));
      await oldAction;
      expect(s.change.statusError.value).toBe("");
      expect(s.change.statusSavingUserId.value).toBe(targetId);
      nextPost.reject(new Error("new network failure"));
      await nextAction;
      expect(s.change.statusError.value).toBe("new network failure");
      expect(s.change.statusSavingUserId.value).toBeNull();
    } finally { oldPost.resolve(undefined); nextPost.resolve(undefined); s.scope.stop(); }
  });

  it("keeps same-session bearer renewal during recovery, rejects invalid targets and suppresses disposal replies", async () => {
    const check = deferred<unknown>();
    const post = deferred<unknown>();
    const s = setup(async () => check.promise, async () => post.promise);
    s.change.requestStatusChange({ ...target, id: adminId }, false);
    expect(s.change.statusChange.value).toBeNull();
    s.loading.value = true;
    s.change.requestStatusChange(target, false);
    expect(s.change.statusChange.value).toBeNull();
    s.loading.value = false;
    s.change.requestStatusChange(target, false);
    const action = s.change.confirmStatusChange();
    s.bearer.value = "renewed-token"; // A normal bearer refresh does not change session identity.
    expect(s.change.statusChange.value?.user.id).toBe(targetId);
    check.resolve(undefined);
    await vi.waitFor(() => expect(s.write).toHaveBeenCalledExactlyOnceWith(targetId, false, "renewed-token"));
    s.scope.stop();
    post.resolve(undefined);
    await action;
    expect(s.change.successVisible.value).toBe(false);
    expect(s.refresh).not.toHaveBeenCalled();
  });

  it("wires a role/session-scoped confirmation to the view without mounting Vue SFCs", () => {
    const view = readFileSync(new URL("../views/_admin/AdminUsersView.vue", import.meta.url), "utf8");
    expect(view).toContain('useAdminUserStatusChange({');
    expect(view).toContain('auth.user?.role === "admin"');
    expect(view).toContain('accountSessionKey(auth.user.id, auth.accessToken)');
    expect(view).not.toContain('await updateAdminUserStatus(pendingChange.user.id, pendingChange.nextIsActive, accessToken)');
  });
});
