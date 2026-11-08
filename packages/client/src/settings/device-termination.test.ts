import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import { useDeviceTermination } from "./device-termination";
import type { UserDevice } from "@shared/index";
import type { DeviceRow } from "./priority-device";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const device = (id: string): UserDevice => ({
  id, deviceId: id, deviceName: id, ip: null, isCurrentDevice: false,
  isOnline: true, lastActiveAt: "2026-10-23T10:00:00.000Z"
});
const row = (id: string): DeviceRow => ({
  deviceId: id, label: id, hasName: true, isCurrent: false, isOnline: true,
  ip: null, minutesSinceActive: 0, pinnedShareCount: 0
});

function setup(ensureSession: () => Promise<unknown> = async () => undefined,
  revoke: (id: string, token: string) => Promise<void> = async () => undefined) {
  const scope = effectScope();
  const session = ref("account-a/session-a");
  const token = ref("token-a");
  const devices = ref([device("old"), device("new")]);
  const loading = ref(false);
  const failed = ref(false);
  const refreshCalls: string[] = [];
  const api = scope.run(() => useDeviceTermination({
    session: () => session.value,
    accessToken: () => token.value,
    ensureSession, devices, loading, failed,
    refresh: async () => { refreshCalls.push(session.value); }, revoke
  }))!;
  return { scope, session, token, devices, loading, failed, refreshCalls, api };
}

describe("session termination feedback", () => {
  it("releases the old busy lock on account switch even if session recovery never settles", async () => {
    const oldSession = deferred<unknown>();
    const nextSession = deferred<unknown>();
    let attempts = 0;
    const revoked: string[] = [];
    const state = setup(() => ++attempts === 1 ? oldSession.promise : nextSession.promise,
      async (id) => { revoked.push(id); });
    state.api.askTerminate(row("old"));
    const oldWrite = state.api.terminate();
    expect(state.api.terminating.value).toBe(true);

    state.session.value = "account-b/session-b";
    state.token.value = "token-b";
    state.devices.value = [device("new")];
    expect(state.api.terminating.value).toBe(false);
    expect(state.api.confirmOpen.value).toBe(false);
    state.api.askTerminate(row("new"));
    const newWrite = state.api.terminate();
    expect(state.api.terminating.value).toBe(true);

    oldSession.resolve(undefined);
    await oldWrite;
    expect(revoked).toEqual([]);
    expect(state.api.terminating.value).toBe(true);
    expect(state.api.pending.value?.deviceId).toBe("new");
    nextSession.resolve(undefined);
    await newWrite;
    expect(revoked).toEqual(["new"]);
    expect(state.api.message.value).toContain("نشست پایان یافت");
    state.scope.stop();
  });

  it("ignores an old completed revocation without unlocking or rewriting the next session's feedback", async () => {
    const oldRequest = deferred<void>();
    const newRequest = deferred<void>();
    const sent: string[] = [];
    const state = setup(undefined, (id) => {
      sent.push(id);
      return id === "old" ? oldRequest.promise : newRequest.promise;
    });
    state.api.askTerminate(row("old"));
    const oldWrite = state.api.terminate();
    await nextTick();
    expect(sent).toEqual(["old"]);

    state.session.value = "account-b/session-b";
    state.token.value = "token-b";
    state.devices.value = [device("new")];
    state.api.askTerminate(row("new"));
    const newWrite = state.api.terminate();
    await nextTick();
    expect(sent).toEqual(["old", "new"]);
    oldRequest.resolve();
    await oldWrite;
    expect(state.api.terminating.value).toBe(true);
    expect(state.api.pending.value?.deviceId).toBe("new");
    expect(state.api.message.value).toBeNull();
    expect(state.refreshCalls).toEqual([]);

    newRequest.reject(new Error("offline"));
    await newWrite;
    expect(state.api.terminating.value).toBe(false);
    expect(state.api.error.value).toBe(true);
    expect(state.api.message.value).toBeTruthy();
    expect(state.refreshCalls).toEqual(["account-b/session-b"]);
    state.scope.stop();
  });

  it("retains the confirmation on a same-session bearer renewal and ignores late replies after disposal", async () => {
    const request = deferred<void>();
    const state = setup(undefined, async () => request.promise);
    state.api.askTerminate(row("old"));
    state.token.value = "renewed-token-a";
    expect(state.api.confirmOpen.value).toBe(true);
    const write = state.api.terminate();
    await nextTick();
    state.scope.stop();
    request.resolve();
    await write;
    expect(state.api.message.value).toBeNull();
    expect(state.refreshCalls).toEqual([]);
  });
});
