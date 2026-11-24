import { readFileSync } from "node:fs";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./auth";
import { useBroadcastStore } from "./broadcast";

const { start, refresh, stopLive, liveState } = vi.hoisted(() => ({
  start: vi.fn(async () => {}), refresh: vi.fn(async () => {}), stopLive: vi.fn(),
  liveState: { status: null as { value: string } | null }
}));
vi.mock("@/composables/useLiveLocationBroadcast", () => ({
  useLiveLocationBroadcast: () => {
    const status = ref<"idle" | "connecting" | "broadcasting" | "stopped" | "rejected">("idle");
    liveState.status = status;
    return {
      status, lastErrorCode: ref(null), lastSentAt: ref(null), peerCount: ref(0),
      isSupported: ref(true), start, stop: stopLive
    };
  }
}));
vi.mock("@/composables/use-priority-device", () => ({
  usePriorityDevice: () => ({
    refresh, clear: vi.fn(), ownId: ref("device-owner"), hasMultipleDevices: ref(false), broadcastingShares: ref([]),
    unassignedShares: ref([]), ignoredShareIds: ref([]), liveShares: ref([])
  })
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const session = "33333333-3333-4333-8333-333333333333";
function jwt(owner: string, sessionId: string, nonce = 0): string {
  return `e30.${Buffer.from(JSON.stringify({ sub: owner, sessionId, nonce })).toString("base64url")}.sig`;
}

beforeEach(() => { setActivePinia(createPinia()); start.mockClear(); stopLive.mockClear(); refresh.mockReset(); });

describe("broadcast start consent across the priority-device read", () => {
  it("wires the owner into the real broadcaster without mounting a Vue component", () => {
    const source = readFileSync(new URL("./broadcast.ts", import.meta.url), "utf8");
    expect(source).toContain("ownerId: computed(() => auth.user?.id ?? null)");
  });

  it("waits for the profile and token to agree before refreshing a switched account", async () => {
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    useBroadcastStore();
    auth.user = { id: B, username: "b", role: "user", mustCompleteSecurityQuestions: false };
    await nextTick();
    expect(refresh).not.toHaveBeenCalled();
    auth.accessToken = jwt(B, "44444444-4444-4444-8444-444444444444");
    await nextTick();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("does not transfer account A's tap to B when the priority read settles late", async () => {
    let finish!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("navigation", true);
    expect(refresh).toHaveBeenCalledOnce();
    auth.user = { id: B, username: "b", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(B, "44444444-4444-4444-8444-444444444444");
    finish();
    await nextTick();
    expect(start).not.toHaveBeenCalled();
  });

  it("does not reuse a tap after logout and login as the same user with a new session", async () => {
    let finish!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("navigation", true);
    auth.accessToken = null;
    auth.user = null;
    auth.accessToken = jwt(A, "55555555-5555-4555-8555-555555555555");
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    finish();
    await nextTick();
    expect(start).not.toHaveBeenCalled();
  });

  it("shows Stop during the priority read and lets a second tap cancel GPS start", async () => {
    let finish!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("navigation", true);
    expect(broadcast.view.isActive).toBe(true);
    expect(broadcast.view.actionLabel).toContain("توقف");
    broadcast.setAutomatic("navigation", false);
    expect(broadcast.view.isActive).toBe(false);
    finish();
    await nextTick();
    expect(refresh).toHaveBeenCalledOnce();
    expect(start).not.toHaveBeenCalled();
  });

  it("cancels an outstanding priority read when Stop is called directly", async () => {
    let finish!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("navigation", true);
    broadcast.setAutomatic("navigation", false);
    finish();
    await nextTick();
    expect(start).not.toHaveBeenCalled();
  });

  it("revokes a pending Start on a same-tick logout and login before the read settles", async () => {
    let finish!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    const bearer = jwt(A, session);
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = bearer;
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("navigation", true);
    auth.accessToken = null;
    auth.accessToken = bearer;
    finish();
    await nextTick();
    expect(start).not.toHaveBeenCalled();
  });

  it("still starts after normal token rotation within the same session", async () => {
    let finish!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("navigation", true);
    auth.accessToken = jwt(A, session, 1);
    // Renewal must not replace the very read this Start tap is waiting on.
    expect(refresh).toHaveBeenCalledOnce();
    finish();
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
  });
});

function signedIn() {
  const auth = useAuthStore();
  auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
  auth.accessToken = jwt(A, session);
  return auth;
}

describe("activity-owned general broadcast", () => {
  it("automatically starts for an outgoing share and stops when the last share ends", async () => {
    signedIn();
    const broadcast = useBroadcastStore();
    expect(start).not.toHaveBeenCalled(); // Login is not an activity.
    broadcast.priority.liveShares = [{ id: "share-one", priorityDeviceId: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString() } as never];
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    broadcast.priority.liveShares = [];
    expect(stopLive).toHaveBeenCalledOnce();
  });
  it("does not wake GPS on a non-priority device or after a timed grant expires", async () => {
    signedIn();
    const broadcast = useBroadcastStore();
    broadcast.priority.liveShares = [{ id: "other-device", priorityDeviceId: "another-device",
      expiresAt: null } as never];
    await nextTick();
    expect(start).not.toHaveBeenCalled();
    broadcast.priority.liveShares = [{ id: "expired", priorityDeviceId: null,
      expiresAt: new Date(Date.now() - 60_000).toISOString() } as never];
    await nextTick();
    expect(start).not.toHaveBeenCalled();
  });

  it("starts on a confirmed activity, hides manual toggles and stops only after both reasons end", async () => {
    signedIn();
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("mission", true);
    expect(broadcast.automaticActive).toBe(true);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    broadcast.setAutomatic("navigation", true);
    broadcast.setAutomatic("mission", false);
    expect(stopLive).not.toHaveBeenCalled();
    expect(stopLive).not.toHaveBeenCalled();
    broadcast.setAutomatic("navigation", false);
    expect(broadcast.automaticActive).toBe(false);
    expect(stopLive).toHaveBeenCalledOnce();
  });

  it("does not let a slow priority read start GPS after guidance ends", async () => {
    let finish!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    signedIn();
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("navigation", true);
    expect(broadcast.view.isActive).toBe(true);
    broadcast.setAutomatic("navigation", false);
    finish();
    await nextTick();
    expect(start).not.toHaveBeenCalled();
    expect(stopLive).toHaveBeenCalledOnce();
  });

  it("ends only after overlapping share and mission activities both end", async () => {
    signedIn();
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("share", true);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    broadcast.setAutomatic("mission", true);
    broadcast.setAutomatic("share", false);
    expect(stopLive).not.toHaveBeenCalled();
    broadcast.setAutomatic("mission", false);
    expect(stopLive).toHaveBeenCalledOnce();
  });

  it("revokes an automatic pending start on logout even if the priority read resolves later", async () => {
    let finish!: () => void;
    refresh.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = signedIn();
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("mission", true);
    auth.accessToken = null;
    auth.user = null;
    finish();
    await nextTick();
    expect(broadcast.automaticActive).toBe(false);
    expect(start).not.toHaveBeenCalled();
    expect(stopLive).toHaveBeenCalled();
  });

  it("allows a retry after a permission or socket rejection while an activity remains active", async () => {
    signedIn();
    const broadcast = useBroadcastStore();
    broadcast.setAutomatic("navigation", true);
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    liveState.status!.value = "rejected";
    await broadcast.retryAutomatic();
    expect(start).toHaveBeenCalledTimes(2);
    broadcast.setAutomatic("navigation", false);
    expect(stopLive).toHaveBeenCalledOnce();
  });
});
