import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchUserDevices, revokeUserDevice } from "./devices";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const row = {
  id: "11111111-1111-4111-8111-111111111111",
  deviceId: "22222222-2222-4222-8222-222222222222",
  deviceName: "Chrome on Android",
  ip: "10.0.0.7",
  isCurrentDevice: true,
  lastActiveAt: "2026-10-21T11:55:00.000Z",
  isOnline: true
};

function stubFetch(body: unknown, status = 200) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" }
      });
    })
  );
  return calls;
}

describe("fetchUserDevices", () => {
  it("reads the bare array the route answers, with the session token", async () => {
    const calls = stubFetch([row]);
    await expect(fetchUserDevices("access-token")).resolves.toEqual([row]);
    expect(calls[0]!.url).toBe("/api/_user/devices");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("rejects a wrapped or malformed payload at the boundary", async () => {
    // `{ devices: [...] }` is the shape a paginated endpoint would answer; this one does not paginate, so
    // the parse failing here is the contract check, not a bug.
    stubFetch({ devices: [row] });
    await expect(fetchUserDevices("access-token")).rejects.toThrow();
    stubFetch([{ ...row, deviceName: 12 }]);
    await expect(fetchUserDevices("access-token")).rejects.toThrow();
    stubFetch([{ ...row, deviceId: "chrome-windows" }]);
    await expect(fetchUserDevices("access-token")).rejects.toThrow();
  });

  it("keeps nullable fields nullable instead of substituting text", async () => {
    const bare = { ...row, deviceName: null, ip: null };
    stubFetch([bare]);
    const [device] = await fetchUserDevices("access-token");
    expect(device).toMatchObject({ deviceName: null, ip: null });
  });
});

describe("revokeUserDevice", () => {
  it("uses an authenticated same-origin DELETE for one session and validates confirmation", async () => {
    const calls = stubFetch({ ok: true });
    await revokeUserDevice(row.id, "access-token");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`/api/_user/devices/${row.id}`);
    expect(calls[0]!.init.method).toBe("DELETE");
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe("Bearer access-token");
  });

  it("does not present a malformed response as successful termination", async () => {
    stubFetch({ ok: false });
    await expect(revokeUserDevice(row.id, "access-token")).rejects.toThrow();
  });
});
