import { effectScope, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePriorityDevice } from "./use-priority-device";

/**
 * The read-only half of the priority rule: what this session may conclude from the two lists, and what it
 * must leave to the server.
 */

const PHONE = "11111111-1111-4111-8111-111111111111";
const LAPTOP = "22222222-2222-4222-8222-222222222222";
const NOW = Date.parse("2026-10-21T12:00:00.000Z");

let calls: string[] = [];
let responder: ((url: string) => { status: number; body: unknown }) | null = null;

function jsonResponse(body: unknown, status: number): Response {
  return { ok: status < 400, status, headers: new Headers({ "content-type": "application/json" }), json: async () => body } as unknown as Response;
}

function deviceRow(deviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: deviceId,
    deviceId,
    deviceName: deviceId === PHONE ? "Samsung Galaxy S23" : "Safari on macOS",
    ip: "10.0.0.7",
    isCurrentDevice: deviceId === PHONE,
    lastActiveAt: new Date(NOW - 60_000).toISOString(),
    isOnline: true,
    ...overrides
  };
}

function shareRow(id: string, priorityDeviceId: string | null) {
  return {
    id,
    ownerId: "77777777-7777-4777-8777-777777777777",
    targetUserId: "33333333-3333-4333-8333-333333333333",
    mode: "permanent",
    expiresAt: null,
    isRevoked: false,
    priorityDeviceId,
    note: null,
    createdAt: new Date(NOW - 3_600_000).toISOString()
  };
}

function okResponder(url: string) {
  if (url.endsWith("/_user/devices")) return { status: 200, body: [deviceRow(PHONE), deviceRow(LAPTOP)] };
  if (url.endsWith("/_user/location/shares")) {
    return {
      status: 200,
      body: {
        owned: [
          shareRow("88888888-8888-4888-8888-888888888888", PHONE),
          shareRow("99999999-9999-4999-8999-999999999999", LAPTOP),
          shareRow("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", null)
        ],
        sharedWithMe: []
      }
    };
  }
  return { status: 200, body: {} };
}

function token(deviceId: string | null): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const payload: Record<string, unknown> = { sub: "user-1", role: "user" };
  if (deviceId) payload.deviceId = deviceId;
  return `${encode({ alg: "HS256" })}.${encode(payload)}.signature`;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  calls = [];
  responder = okResponder;
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    const answer = (responder ?? okResponder)(url);
    return jsonResponse(answer.body, answer.status);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

function mount(deviceId: string | null = PHONE) {
  const scope = effectScope();
  const accessToken = ref<string | null>(token(deviceId));
  let api!: ReturnType<typeof usePriorityDevice>;
  scope.run(() => {
    api = usePriorityDevice({ accessToken });
  });
  return { scope, accessToken, api };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
  await nextTick();
}

describe("who am I", () => {
  it("reads this session's device from its own token", () => {
    const { api } = mount();
    expect(api.ownId.value).toBe(PHONE);
    expect(api.hasData.value).toBe(false);
  });

  it("handles a token without a device claim as no id, not as a guess", () => {
    const { api } = mount(null);
    expect(api.ownId.value).toBeNull();
  });

  it("lets a native shell override the id without touching anything else", () => {
    const scope = effectScope();
    const override = ref<string | null>(LAPTOP);
    let api!: ReturnType<typeof usePriorityDevice>;
    scope.run(() => {
      api = usePriorityDevice({ accessToken: ref(token(PHONE)), ownDeviceId: override });
    });
    expect(api.ownId.value).toBe(LAPTOP);
    override.value = "";
    expect(api.ownId.value).toBe(PHONE);
  });
});

describe("deriving from the two lists", () => {
  it("counts the shares this device broadcasts and the ones it does not", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    expect(calls.filter((url) => url.endsWith("/_user/devices"))).toHaveLength(1);
    expect(calls.filter((url) => url.endsWith("/_user/location/shares"))).toHaveLength(1);
    expect(api.isListed.value).toBe(true);
    expect(api.isOnline.value).toBe(true);
    expect(api.ownLabel.value).toBe("Samsung Galaxy S23");
    expect(api.hasMultipleDevices.value).toBe(true);
    expect(api.broadcastingShares.value.map((share) => share.id)).toEqual(["88888888-8888-4888-8888-888888888888"]);
    expect(api.ignoredShareIds.value).toEqual(["99999999-9999-4999-8999-999999999999"]);
    expect(api.isBroadcastingAnything.value).toBe(true);
    expect(api.loadedAtMs.value).toBe(NOW);
  });

  it("treats an unpinned share as everybody's, because that is what the server does", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    expect(api.unassignedShares.value.map((share) => share.id)).toEqual(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"]);
    expect(api.ignoredShareIds.value).not.toContain("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("says so when this device broadcasts nothing", async () => {
    const { api } = mount(LAPTOP);
    await api.refresh();
    await settle();
    // The laptop owns one share and is ignored for the phone's, so the answer is "one of yours, one not".
    expect(api.ownId.value).toBe(LAPTOP);
    expect(api.broadcastingShares.value).toHaveLength(1);
    expect(api.ignoredShareIds.value).toHaveLength(1);

    const other = mount("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");
    await other.api.refresh();
    await settle();
    expect(other.api.isListed.value).toBe(false);
    expect(other.api.isBroadcastingAnything.value).toBe(false);
    // "Not in the list" and "in the list, broadcasting nothing" are different sentences, and the null-
    // pinned share is still open to this device either way: it is the *server* that decides who may send.
    expect(other.api.ignoredShareIds.value).toHaveLength(2);
    expect(other.api.unassignedShares.value).toHaveLength(1);
  });

  it("asks nobody when there is no session", async () => {
    const { accessToken, api } = mount();
    accessToken.value = null;
    await api.refresh();
    await settle();
    expect(calls).toEqual([]);
    expect(api.hasData.value).toBe(false);
    expect(api.failed.value).toBe(false);
  });

  it("keeps the last good answer when a refresh fails", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    responder = () => ({ status: 500, body: { code: "INTERNAL", message: "boom", issues: [] } });
    await api.refresh();
    await settle();
    expect(api.failed.value).toBe(true);
    expect(api.devices.value).toHaveLength(2);
    expect(api.ignoredShareIds.value).toHaveLength(1);

    responder = okResponder;
    await api.refresh();
    await settle();
    expect(api.failed.value).toBe(false);
    expect(api.loadedAtMs.value).toBe(NOW);
  });
});
