import { readFileSync } from "node:fs";
import { createPinia, setActivePinia } from "pinia";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "./auth";
import { useBroadcastStore } from "./broadcast";

const { start, refresh } = vi.hoisted(() => ({ start: vi.fn(async () => {}), refresh: vi.fn(async () => {}) }));
vi.mock("@/composables/useLiveLocationBroadcast", () => ({
  useLiveLocationBroadcast: () => ({
    status: ref("idle"), lastErrorCode: ref(null), lastSentAt: ref(null), peerCount: ref(0),
    isSupported: ref(true), start, stop: vi.fn()
  })
}));
vi.mock("@/composables/use-priority-device", () => ({
  usePriorityDevice: () => ({
    refresh, clear: vi.fn(), hasMultipleDevices: ref(false), broadcastingShares: ref([]),
    unassignedShares: ref([]), ignoredShareIds: ref([]), liveShares: ref([])
  })
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const session = "33333333-3333-4333-8333-333333333333";
function jwt(owner: string, sessionId: string, nonce = 0): string {
  return `e30.${Buffer.from(JSON.stringify({ sub: owner, sessionId, nonce })).toString("base64url")}.sig`;
}

beforeEach(() => { setActivePinia(createPinia()); start.mockClear(); refresh.mockReset(); });

describe("broadcast start consent across the priority-device read", () => {
  it("wires the owner into the real broadcaster without mounting a Vue component", () => {
    const source = readFileSync(new URL("./broadcast.ts", import.meta.url), "utf8");
    expect(source).toContain("ownerId: computed(() => auth.user?.id ?? null)");
  });

  it("does not transfer account A's tap to B when the priority read settles late", async () => {
    let finish!: () => void;
    refresh.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    const broadcast = useBroadcastStore();
    const starting = broadcast.toggle();
    expect(refresh).toHaveBeenCalledOnce();
    auth.user = { id: B, username: "b", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(B, "44444444-4444-4444-8444-444444444444");
    finish();
    await starting;
    expect(start).not.toHaveBeenCalled();
  });

  it("does not reuse a tap after logout and login as the same user with a new session", async () => {
    let finish!: () => void;
    refresh.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    const broadcast = useBroadcastStore();
    const starting = broadcast.toggle();
    auth.accessToken = null;
    auth.user = null;
    auth.accessToken = jwt(A, "55555555-5555-4555-8555-555555555555");
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    finish();
    await starting;
    expect(start).not.toHaveBeenCalled();
  });

  it("still starts after normal token rotation within the same session", async () => {
    let finish!: () => void;
    refresh.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    const auth = useAuthStore();
    auth.user = { id: A, username: "a", role: "user", mustCompleteSecurityQuestions: false };
    auth.accessToken = jwt(A, session);
    const broadcast = useBroadcastStore();
    const starting = broadcast.toggle();
    auth.accessToken = jwt(A, session, 1);
    finish();
    await starting;
    expect(start).toHaveBeenCalledOnce();
  });
});
