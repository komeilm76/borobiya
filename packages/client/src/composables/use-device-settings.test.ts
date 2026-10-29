import { readFileSync } from "node:fs";
import { effectScope, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDeviceSettings, DEVICE_CLOCK_INTERVAL_MS } from "./use-device-settings";
import { REPRIORITIZE_REFUSAL_COPY } from "@/settings/priority-device";

/**
 * The sequencing of the Active Devices screen: what a refresh joins, what a click actually posts, and
 * what is said when the two lists the screen reads disagree with the server.
 */

const NOW = Date.parse("2026-10-21T12:00:00.000Z");
const PHONE = "11111111-1111-4111-8111-111111111111";
const LAPTOP = "22222222-2222-4222-8222-222222222222";
const TARGET = "33333333-3333-4333-8333-333333333333";
const TARGET_TWO = "44444444-4444-4444-8444-444444444444";
const SHARE_ONE = "55555555-5555-4555-8555-555555555555";
const SHARE_TWO = "66666666-6666-4666-8666-666666666666";

interface Call {
  readonly url: string;
  readonly method: string;
  readonly body: unknown;
}

let calls: Call[] = [];
let responder: ((url: string, method: string) => { status: number; body: unknown }) | null = null;

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status < 400,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body
  } as unknown as Response;
}

function deviceRow(deviceId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: deviceId,
    deviceId,
    deviceName: deviceId === PHONE ? "Chrome on Android" : "Safari on macOS",
    ip: "10.0.0.7",
    isCurrentDevice: deviceId === PHONE,
    lastActiveAt: new Date(NOW - 5 * 60_000).toISOString(),
    isOnline: true,
    ...overrides
  };
}

function shareRow(id: string, targetUserId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    ownerId: "77777777-7777-4777-8777-777777777777",
    targetUserId,
    mode: "permanent",
    expiresAt: null,
    isRevoked: false,
    priorityDeviceId: PHONE,
    note: null,
    // An owned row carries the target's name as of P2-Q1; the response schema is strict, so a fixture
    // that omits it is refused at the boundary rather than rendering a blank label.
    targetUsername: "satellite",
    createdAt: new Date(NOW - 3_600_000).toISOString(),
    ...overrides
  };
}

/**
 * A `POST /_user/location/share` answer, without the list's label.
 *
 * `locationShareCreatedSchema` is strict and describes the rows the caller just wrote — the
 * `targetUsername` belongs to the list read, so a fixture that reuses the list shape here would be
 * refused by the client's own parse and every post would read as a server failure.
 */
function createdRow(id: string, targetUserId: string, overrides: Record<string, unknown> = {}) {
  const { targetUsername: _label, ...row } = shareRow(id, targetUserId, overrides);
  return row;
}

function defaultResponder(url: string, method: string) {
  if (url.endsWith("/_user/devices")) return { status: 200, body: [deviceRow(PHONE), deviceRow(LAPTOP)] };
  if (url.endsWith("/_user/location/shares") && method === "GET") {
    return {
      status: 200,
      body: { owned: [shareRow(SHARE_ONE, TARGET), shareRow(SHARE_TWO, TARGET_TWO)], sharedWithMe: [] }
    };
  }
  // A re-post of the same target/window answers with the reused row: `locationShareCreatedSchema`
  // requires at least one share, so a stub answering `shares: []` would fail the client's own parse and
  // every POST would look like a server refusal.
  return {
    status: 200,
    body: {
      shares: [createdRow(SHARE_ONE, TARGET, { priorityDeviceId: LAPTOP })],
      createdShareIds: [],
      reusedShareIds: [SHARE_ONE]
    }
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  calls = [];
  responder = defaultResponder;
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const answer = (responder ?? defaultResponder)(url, method);
    return jsonResponse(answer.body, answer.status);
  }) as unknown as typeof fetch;
});

afterEach(() => {
  vi.useRealTimers();
});

function mount(ensureSession?: () => Promise<void>) {
  const scope = effectScope();
  const token = ref<string | null>("access-token");
  const accountId = ref<string | null>("owner-a");
  let api!: ReturnType<typeof useDeviceSettings>;
  scope.run(() => {
    api = useDeviceSettings({ accessToken: token, accountId, ensureSession });
  });
  return { scope, token, accountId, api };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 6; index += 1) await Promise.resolve();
  await nextTick();
}

const posts = () => calls.filter((call) => call.method === "POST");
const deviceReads = () => calls.filter((call) => call.url.endsWith("/_user/devices"));

describe("reading the two lists", () => {
  it("starts unresolved, reports an initial failed read rather than an empty account, and recovers on retry", async () => {
    const { api } = mount();
    expect(api.loading.value).toBe(true);
    expect(api.loaded.value).toBe(false);
    responder = () => ({ status: 500, body: { code: "INTERNAL", message: "boom", issues: [] } });
    await api.refresh();
    expect(api.loading.value).toBe(false);
    expect(api.loaded.value).toBe(false);
    expect(api.failed.value).toBe(true);
    expect(api.status.value?.text).toContain("دوباره تلاش کنید");
    responder = defaultResponder;
    await api.refresh();
    expect(api.loaded.value).toBe(true);
    expect(api.failed.value).toBe(false);
    expect(api.status.value).toBeNull();
    expect(api.deviceRows.value).toHaveLength(2);
  });

  it("clears previously read private devices and shares if a refresh finds no session", async () => {
    const { api, token } = mount();
    await api.refresh();
    token.value = null;
    await api.refresh();
    expect(api.deviceRows.value).toHaveLength(0);
    expect(api.shareRows.value).toHaveLength(0);
    expect(api.loaded.value).toBe(false);
    expect(api.failed.value).toBe(true);
  });

  it("ignores an older pending read when a later refresh loses its session", async () => {
    const { api, token } = mount();
    let finishDeviceRead!: (response: Response) => void;
    const delayedDeviceRead = new Promise<Response>((resolve) => { finishDeviceRead = resolve; });
    globalThis.fetch = vi.fn((input: unknown) =>
      String(input).endsWith("/_user/devices")
        ? delayedDeviceRead
        : Promise.resolve(jsonResponse({ owned: [], sharedWithMe: [] }, 200))
    ) as unknown as typeof fetch;

    const oldRead = api.refresh();
    await settle();
    token.value = null;
    await api.refresh();
    finishDeviceRead(jsonResponse([deviceRow(PHONE)], 200));
    await oldRead;
    expect(api.loading.value).toBe(false);
    expect(api.loaded.value).toBe(false);
    expect(api.deviceRows.value).toEqual([]);
    expect(api.failed.value).toBe(true);
  });

  it("immediately clears private rows on logout and rejects an older pending response without another refresh", async () => {
    const { api, token } = mount();
    await api.refresh();
    let release!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => { release = resolve; });
    const originalFetch = globalThis.fetch;
    let interceptNext = true;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/_user/devices") && interceptNext) {
        interceptNext = false;
        return delayed;
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    const oldRead = api.refresh();
    await settle();
    token.value = null;
    expect(api.devices.value).toEqual([]);
    expect(api.liveShares.value).toEqual([]);
    expect(api.loaded.value).toBe(false);
    release(jsonResponse([deviceRow(PHONE)], 200));
    await oldRead;
    expect(api.deviceRows.value).toEqual([]);
    expect(api.shareRows.value).toEqual([]);
  });

  it("invalidates old account reads and loads only the newly signed-in account", async () => {
    const { api, token, accountId } = mount();
    await api.refresh();
    let release!: (response: Response) => void;
    const delayed = new Promise<Response>((resolve) => { release = resolve; });
    const originalFetch = globalThis.fetch;
    let interceptNext = true;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith("/_user/devices") && interceptNext) {
        interceptNext = false;
        return delayed;
      }
      return originalFetch(input, init);
    }) as typeof fetch;
    const oldRead = api.refresh();
    await settle();
    responder = (url, method) => url.endsWith("/_user/devices")
      ? { status: 200, body: [deviceRow(LAPTOP, { isCurrentDevice: true })] }
      : defaultResponder(url, method);
    token.value = "other-account-token";
    accountId.value = "owner-b";
    expect(api.deviceRows.value).toEqual([]);
    await vi.waitFor(() => expect(api.deviceRows.value[0]?.deviceId).toBe(LAPTOP));
    release(jsonResponse([deviceRow(PHONE)], 200));
    await oldRead;
    expect(api.deviceRows.value[0]?.deviceId).toBe(LAPTOP);
  });

  it("does not discard the same account's rows on an ordinary access-token rotation", async () => {
    const { api, token } = mount();
    await api.refresh();
    calls = [];
    token.value = "rotated-token";
    await settle();
    expect(api.deviceRows.value).toHaveLength(2);
    expect(api.shareRows.value).toHaveLength(2);
    expect(calls).toEqual([]);
  });

  it("joins the shares onto the sessions they pin", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    expect(api.deviceRows.value).toHaveLength(2);
    expect(api.deviceRows.value[0]).toMatchObject({ deviceId: PHONE, pinnedShareCount: 2, isCurrent: true });
    expect(api.deviceRows.value[1]).toMatchObject({ deviceId: LAPTOP, pinnedShareCount: 0 });
    expect(api.hasMultipleDevices.value).toBe(true);
    expect(api.shareRows.value).toHaveLength(2);
  });

  it("advances ages on the reactive clock and re-stamps them on a refresh", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    expect(api.deviceRows.value[0]!.minutesSinceActive).toBe(5);

    await vi.advanceTimersByTimeAsync(DEVICE_CLOCK_INTERVAL_MS * 2);
    // Without the ticking ref this would still read 5 forever: the counter a user reads is the age of
    // their last sign-in, not of the page.
    expect(api.deviceRows.value[0]!.minutesSinceActive).toBe(7);

    await api.refresh();
    await settle();
    expect(api.deviceRows.value[0]!.minutesSinceActive).toBe(7);
    api.nowMs.value = NOW + 60_000;
    await settle();
    expect(api.deviceRows.value[0]!.minutesSinceActive).toBe(6);
  });

  it("keeps what it had when a refresh fails, and says so", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    responder = () => ({ status: 500, body: { code: "INTERNAL", message: "boom", issues: [] } });
    await api.refresh();
    await settle();
    expect(api.failed.value).toBe(true);
    expect(api.deviceRows.value).toHaveLength(2);
    expect(api.status.value).toMatchObject({ tone: "error" });
    expect(api.status.value!.text).toContain("آخرین خوانده‌شده");
  });

  it("asks nobody for a session it does not have", async () => {
    const { token, api } = mount();
    token.value = null;
    await api.refresh();
    await settle();
    expect(calls).toEqual([]);
    expect(api.status.value).toMatchObject({ tone: "warn" });
  });
});

describe("device write session recovery", () => {
  it("reports a failed session check without posting or rejecting a single-device change", async () => {
    let offline = false;
    const { api, scope } = mount(async () => { if (offline) throw new Error("offline"); });
    try {
      await api.refresh();
      offline = true;
      calls = [];
      await expect(api.assign(SHARE_ONE, LAPTOP)).resolves.toBe(false);
      expect(posts()).toHaveLength(0);
      expect(api.busyShareId.value).toBeNull();
      expect(api.status.value).toMatchObject({ tone: "error" });
      expect(api.status.value?.text).toContain("بررسی نشست");
    } finally { scope.stop(); }
  });

  it("reports a failed session check for bulk and current-device changes without posting", async () => {
    let offline = false;
    const { api, scope } = mount(async () => { if (offline) throw new Error("offline"); });
    try {
      await api.refresh();
      offline = true;
      calls = [];
      await expect(api.assignEverywhere(LAPTOP)).resolves.toBeUndefined();
      expect(api.status.value).toMatchObject({ tone: "error" });
      await expect(api.assignCurrentDevice()).resolves.toBeUndefined();
      expect(api.status.value).toMatchObject({ tone: "error" });
      expect(api.bulkRunning.value).toBe(false);
      expect(posts()).toHaveLength(0);
    } finally { scope.stop(); }
  });

  it("does not replace a sign-in warning with a late old-account session error", async () => {
    let fail!: (reason: unknown) => void;
    const { api, token, accountId, scope } = mount(() => new Promise<void>((_resolve, reject) => { fail = reject; }));
    try {
      const oldWrite = api.assign(SHARE_ONE, LAPTOP);
      token.value = null;
      accountId.value = null;
      fail(new Error("old session failed"));
      await expect(oldWrite).resolves.toBe(false);
      expect(api.status.value).toMatchObject({ tone: "warn" });
      expect(api.status.value?.text).toContain("وارد حساب شوید");
      expect(posts()).toHaveLength(0);
    } finally { scope.stop(); }
  });
});

describe("serializing priority changes", () => {
  it("locks a single-share change before session recovery and refuses competing single/bulk writes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let hold = false;
    const { api, scope } = mount(() => hold ? gate : Promise.resolve());
    try {
      await api.refresh();
      calls = [];
      hold = true;
      const first = api.assign(SHARE_ONE, LAPTOP);
      const second = api.assign(SHARE_ONE, PHONE);
      const bulk = api.assignEverywhere(LAPTOP);
      expect(api.busyShareId.value).toBe(SHARE_ONE);
      release();
      const [firstResult, secondResult] = await Promise.all([first, second, bulk]);
      expect(firstResult).toBe(true);
      expect(secondResult).toBe(false);
      expect(posts()).toHaveLength(1);
      expect(api.busyShareId.value).toBeNull();
      expect(api.bulkRunning.value).toBe(false);
    } finally { release(); scope.stop(); }
  });

  it("keeps the write lock through the post-write device refresh", async () => {
    const { api, scope } = mount();
    let release!: (response: Response) => void;
    const pendingRead = new Promise<Response>((resolve) => { release = resolve; });
    try {
      await api.refresh();
      calls = [];
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
        String(input).endsWith("/_user/devices") && init?.method !== "POST"
          ? pendingRead : originalFetch(input, init)) as typeof fetch;
      const first = api.assign(SHARE_ONE, LAPTOP);
      await settle();
      expect(posts()).toHaveLength(1);
      expect(api.loading.value).toBe(true);
      expect(api.busyShareId.value).toBe(SHARE_ONE);
      expect(await api.assignEverywhere(PHONE)).toBeUndefined();
      expect(posts()).toHaveLength(1);
      release(jsonResponse(defaultResponder("/_user/devices", "GET").body, 200));
      expect(await first).toBe(true);
      expect(api.busyShareId.value).toBeNull();
    } finally { release(jsonResponse([], 200)); scope.stop(); }
  });

  it("locks a bulk pass before session recovery and refuses single and second bulk changes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let hold = false;
    const { api, scope } = mount(() => hold ? gate : Promise.resolve());
    try {
      await api.refresh();
      calls = [];
      hold = true;
      const bulk = api.assignEverywhere(LAPTOP);
      const single = api.assign(SHARE_ONE, LAPTOP);
      const secondBulk = api.assignEverywhere(PHONE);
      const currentDevice = api.assignCurrentDevice();
      expect(api.bulkRunning.value).toBe(true);
      release();
      await Promise.all([bulk, single, secondBulk, currentDevice]);
      expect(posts()).toHaveLength(2);
      expect(api.lastBulkSummary.value).toEqual({ applied: 2, failed: 0, skipped: 0, all: true });
      expect(api.bulkRunning.value).toBe(false);
      expect(api.busyShareId.value).toBeNull();
    } finally { release(); scope.stop(); }
  });
});

describe("changing one share", () => {
  it("does not report an old account's delayed write as a new session's success", async () => {
    const { api, token, accountId } = mount();
    await api.refresh();
    let release!: (response: Response) => void;
    const pendingPost = new Promise<Response>((resolve) => { release = resolve; });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      init?.method === "POST" ? pendingPost : originalFetch(input, init)
    ) as typeof fetch;
    const oldWrite = api.assign(SHARE_ONE, LAPTOP);
    await settle();
    expect(api.busyShareId.value).toBe(SHARE_ONE);
    token.value = null;
    accountId.value = null;
    release(jsonResponse(defaultResponder("/_user/location/shares", "POST").body, 200));
    expect(await oldWrite).toBe(false);
    expect(api.status.value?.tone).toBe("warn");
    expect(api.liveShares.value).toEqual([]);
  });

  it("posts the reuse body and re-reads the lists", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    calls = [];
    await expect(api.assign(SHARE_ONE, LAPTOP)).resolves.toBe(true);
    await settle();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).toEqual({
      targetUserIds: [TARGET],
      mode: "permanent",
      priorityDeviceId: LAPTOP
    });
    // The pin lives on the share row, so the list is the truth afterwards: exactly one re-read of each.
    expect(deviceReads()).toHaveLength(1);
    expect(calls.filter((call) => call.url.endsWith("/_user/location/shares"))).toHaveLength(1);
    expect(api.status.value).toMatchObject({ tone: "ok" });
  });

  it("does not post when nothing would change", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    calls = [];
    await expect(api.assign(SHARE_ONE, PHONE)).resolves.toBe(false);
    await settle();
    expect(posts()).toEqual([]);
    expect(api.status.value!.text).toBe(REPRIORITIZE_REFUSAL_COPY.unchanged);
  });

  it("refuses a share that left the list instead of creating it again", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    calls = [];
    await expect(api.assign("99999999-9999-4999-8999-999999999999", LAPTOP)).resolves.toBe(false);
    await settle();
    expect(posts()).toEqual([]);
    expect(deviceReads()).toHaveLength(1);
    expect(api.status.value!.text).toContain("فهرست تازه شد");
  });

  it("shows the server's own words when the chosen device has just signed out, and re-reads", async () => {
    const { api } = mount();
    await api.refresh();
    await settle();
    responder = (url, method) =>
      method === "POST"
        ? {
            status: 400,
            body: {
              code: "VALIDATION_ERROR",
              message: "The selected device is not a live session.",
              issues: [{ code: "unknown_priority_device", path: ["priorityDeviceId"] }]
            }
          }
        : defaultResponder(url, method);
    calls = [];
    await expect(api.assign(SHARE_ONE, LAPTOP)).resolves.toBe(false);
    await settle();
    // The same sentence the share dialog shows for this code, because both now read one table.
    expect(api.status.value!.text).toContain("دستگاه انتخابی دیگر زنده نیست");
    expect(deviceReads()).toHaveLength(1);
  });
});

describe("applying one device to everything", () => {
  it("stops the remaining posts on logout instead of mutating more shares with the old bearer", async () => {
    const { api, token, accountId } = mount();
    await api.refresh();
    let release!: (response: Response) => void;
    const pendingPost = new Promise<Response>((resolve) => { release = resolve; });
    const originalFetch = globalThis.fetch;
    let postsStarted = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { postsStarted++; return pendingPost; }
      return originalFetch(input, init);
    }) as typeof fetch;
    const oldSweep = api.assignEverywhere(LAPTOP);
    await settle();
    expect(postsStarted).toBe(1);
    token.value = null;
    accountId.value = null;
    release(jsonResponse(defaultResponder("/_user/location/shares", "POST").body, 200));
    await oldSweep;
    expect(postsStarted).toBe(1);
    expect(api.lastBulkSummary.value).toBeNull();
    expect(api.liveShares.value).toEqual([]);
  });

  it("posts once per share that needs it and counts what it skipped", async () => {
    responder = (url, method) => {
      if (url.endsWith("/_user/location/shares") && method === "GET") {
        return {
          status: 200,
          body: {
            owned: [
              shareRow(SHARE_ONE, TARGET),
              shareRow(SHARE_TWO, TARGET_TWO, { priorityDeviceId: LAPTOP }),
              shareRow("88888888-8888-4888-8888-888888888888", "99999999-9999-4999-8999-999999999999", {
                mode: "timed",
                expiresAt: new Date(NOW - 60_000).toISOString()
              })
            ],
            sharedWithMe: []
          }
        };
      }
      return defaultResponder(url, method);
    };
    const { api } = mount();
    await api.refresh();
    await settle();
    calls = [];
    await api.assignEverywhere(LAPTOP);
    await settle();
    expect(posts()).toHaveLength(1);
    expect(api.lastBulkSummary.value).toEqual({ applied: 1, failed: 0, skipped: 2, all: true });
    expect(api.status.value!.text).toContain("۱ از ۱");
    expect(api.status.value!.text).toContain("۲ مورد نیاز به تغییر نداشت");
  });

  it("reports a partial pass instead of a success", async () => {
    responder = (url, method) => {
      if (url.endsWith("/_user/location/shares") && method === "GET") {
        return {
          status: 200,
          body: {
            owned: [shareRow(SHARE_ONE, TARGET), shareRow(SHARE_TWO, TARGET_TWO)],
            sharedWithMe: []
          }
        };
      }
      if (method === "POST") {
        // The stub records the call before answering, so the first POST is index 1 and the second is 2.
        const second = posts().length > 1;
        return second
          ? { status: 403, body: { code: "ACCOUNT_SUSPENDED", message: "no", issues: [] } }
          : defaultResponder(url, method);
      }
      return defaultResponder(url, method);
    };
    const { api } = mount();
    await api.refresh();
    await settle();
    calls = [];
    await api.assignEverywhere(LAPTOP);
    await settle();
    expect(posts()).toHaveLength(2);
    expect(api.lastBulkSummary.value).toMatchObject({ applied: 1, failed: 1, all: false });
    expect(api.status.value).toMatchObject({ tone: "error" });
    expect(api.status.value!.text).toContain("۱ از ۲");
    expect(api.status.value!.text).toContain("۱ ناموفق");
  });

  it("does not post when there is nothing live to re-pin", async () => {
    responder = (url, method) =>
      url.endsWith("/_user/location/shares") && method === "GET"
        ? { status: 200, body: { owned: [], sharedWithMe: [] } }
        : defaultResponder(url, method);
    const { api } = mount();
    await api.refresh();
    await settle();
    calls = [];
    await api.assignEverywhere(LAPTOP);
    await settle();
    expect(posts()).toEqual([]);
    expect(api.status.value!.text).toBe("اشتراک زنده‌ای ندارید که دستگاهش عوض شود.");
  });
});

describe("leaving the screen", () => {
  it("stops remaining bulk priority posts after the screen is disposed", async () => {
    const { scope, api } = mount();
    await api.refresh();
    let release!: (response: Response) => void;
    const pendingPost = new Promise<Response>((resolve) => { release = resolve; });
    const originalFetch = globalThis.fetch;
    let postsStarted = 0;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") { postsStarted++; return pendingPost; }
      return originalFetch(input, init);
    }) as typeof fetch;
    const sweep = api.assignEverywhere(LAPTOP);
    await settle();
    expect(postsStarted).toBe(1);
    scope.stop();
    release(jsonResponse(defaultResponder("/_user/location/shares", "POST").body, 200));
    await sweep;
    expect(postsStarted).toBe(1); // The first POST may commit; do not send the next one.
    expect(api.bulkRunning.value).toBe(false);
    expect(api.liveShares.value).toEqual([]);
    expect(api.lastBulkSummary.value).toBeNull();
  });

  it("ignores a late private read after the screen is disposed", async () => {
    const { scope, api } = mount();
    let release!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { release = resolve; });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith("/_user/devices") ? pending : originalFetch(input, init)
    ) as typeof fetch;
    const read = api.refresh();
    await settle();
    scope.stop();
    release(jsonResponse([deviceRow(PHONE)], 200));
    await read;
    expect(api.devices.value).toEqual([]);
    expect(api.loaded.value).toBe(false);
    expect(api.loading.value).toBe(false);
  });

  it("stops the clock with the scope", async () => {
    const { scope, api } = mount();
    await api.refresh();
    await settle();
    scope.stop();
    const before = api.nowMs.value;
    await vi.advanceTimersByTimeAsync(DEVICE_CLOCK_INTERVAL_MS * 5);
    expect(api.nowMs.value).toBe(before);
    expect(api.deviceRows.value).toEqual([]);
  });

  it("preserves targetUsername on shareRows and assigns the current device without needing a row draft", async () => {
    responder = (url, method) => {
      if (url.endsWith("/_user/devices")) return { status: 200, body: [deviceRow(PHONE), deviceRow(LAPTOP)] };
      if (url.endsWith("/_user/location/shares") && method === "GET") {
        return {
          status: 200,
          body: {
            owned: [
              shareRow(SHARE_ONE, TARGET, { priorityDeviceId: LAPTOP, targetUsername: "sara" }),
              shareRow(SHARE_TWO, TARGET_TWO, { priorityDeviceId: PHONE, targetUsername: "hamid" })
            ],
            sharedWithMe: []
          }
        };
      }
      return {
        status: 200,
        body: {
          shares: [createdRow(SHARE_ONE, TARGET, { priorityDeviceId: PHONE })],
          createdShareIds: [],
          reusedShareIds: [SHARE_ONE]
        }
      };
    };

    const { api } = mount();
    await api.refresh();
    await settle();

    expect(api.shareRows.value.map((entry) => entry.share.targetUsername)).toEqual(["sara", "hamid"]);
    expect(api.currentDeviceId.value).toBe(PHONE);

    calls = [];
    await api.assignCurrentDevice();
    await settle();
    expect(posts()).toHaveLength(1);
    expect(posts()[0]!.body).toMatchObject({
      targetUserIds: [TARGET],
      priorityDeviceId: PHONE
    });

    const panelSource = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");
    expect(panelSource).toContain("share.targetUsername");
    expect(panelSource).toContain("api.currentDeviceId.value");
    expect(panelSource).toContain("api.assignEverywhere(");
    expect(panelSource).toContain("Boolean(api.busyShareId.value) || api.bulkRunning.value");
    expect(panelSource).toContain("props.api.busyShareId.value || props.api.bulkRunning.value");
  });
});
