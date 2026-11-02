import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { apiRoutes } from "@shared/api";
import { createNetworkStatusMonitor, NETWORK_STATUS_PRESENTATION } from "./network-status";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("network status indicator", () => {
  it("stays visible over the full-screen map and in the normal app bar without mounting SFCs", () => {
    const app = readFileSync(new URL("../App.vue", import.meta.url), "utf8");
    const icon = readFileSync(new URL("../components/shell/NetworkStatusIcon.vue", import.meta.url), "utf8");
    expect(app).toContain('<NetworkStatusIcon v-if="isMapRoute" floating />');
    expect(app).toContain('<nav class="top-nav" aria-label="پیمایش اصلی">\n        <NetworkStatusIcon />');
    expect(icon).toContain('right: calc(0.75rem + env(safe-area-inset-right, 0px))');
    expect(icon).toContain('role="status" aria-live="polite"');
    expect(icon).toContain('@click="monitor.check()"');
  });

  it("reports actual API reachability separately from the device's connection", async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    const probe = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new TypeError("network error"))
      .mockResolvedValueOnce(true);
    const monitor = createNetworkStatusMonitor({ events, isOnline: () => true, probe });
    monitor.start();
    await settle();
    expect(monitor.status.value).toBe("reachable");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(monitor.status.value).toBe("unavailable");
    expect(NETWORK_STATUS_PRESENTATION.unavailable.label).toContain("سرور");
    events.dispatchEvent(new Event("online"));
    await settle();
    expect(monitor.status.value).toBe("reachable");
    monitor.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("shows offline immediately and verifies the API when the device reconnects", async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    let online = false;
    const probe = vi.fn().mockResolvedValue(true);
    const monitor = createNetworkStatusMonitor({ events, isOnline: () => online, probe });
    monitor.start();
    expect(monitor.status.value).toBe("offline");
    expect(probe).not.toHaveBeenCalled();
    online = true;
    events.dispatchEvent(new Event("online"));
    await settle();
    expect(monitor.status.value).toBe("reachable");
    online = false;
    events.dispatchEvent(new Event("offline"));
    expect(monitor.status.value).toBe("offline");
    monitor.stop();
  });

  it("ignores late success from an aborted request after going offline or unmounting", async () => {
    vi.useFakeTimers();
    const events = new EventTarget();
    let online = true;
    let finish!: (ok: boolean) => void;
    const probe = vi.fn((_signal: AbortSignal) => new Promise<boolean>((resolve) => { finish = resolve; }));
    const monitor = createNetworkStatusMonitor({ events, isOnline: () => online, probe });
    monitor.start();
    expect(monitor.status.value).toBe("checking");
    online = false;
    events.dispatchEvent(new Event("offline"));
    finish(true);
    await settle();
    expect(monitor.status.value).toBe("offline");
    online = true;
    events.dispatchEvent(new Event("online"));
    expect(monitor.status.value).toBe("checking");
    monitor.stop();
    finish(true);
    await settle();
    expect(monitor.status.value).toBe("checking");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves checking after eight seconds even when a probe ignores abort", async () => {
    vi.useFakeTimers();
    let finish!: (ok: boolean) => void;
    const probe = vi.fn().mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = resolve; }))
      .mockResolvedValueOnce(true);
    const monitor = createNetworkStatusMonitor({ isOnline: () => true, probe });
    monitor.start();
    try {
      await vi.advanceTimersByTimeAsync(8_000);
      expect(monitor.status.value).toBe("unavailable");
      finish(true); // An old, non-cancellable result must not claim the API is reachable.
      await settle();
      expect(monitor.status.value).toBe("unavailable");
      await vi.advanceTimersByTimeAsync(22_000);
      expect(monitor.status.value).toBe("reachable");
    } finally { monitor.stop(); }
  });

  it("times out a stuck probe and checks again on the next interval", async () => {
    vi.useFakeTimers();
    const probe = vi.fn().mockImplementationOnce((signal: AbortSignal) => new Promise<boolean>((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("Timed out", "AbortError")));
    })).mockResolvedValueOnce(true);
    const monitor = createNetworkStatusMonitor({ isOnline: () => true, probe });
    monitor.start();
    await vi.advanceTimersByTimeAsync(8_000);
    expect(monitor.status.value).toBe("unavailable");
    await vi.advanceTimersByTimeAsync(22_000);
    expect(monitor.status.value).toBe("reachable");
    monitor.stop();
  });

  it("uses a no-cache public health request, not a privileged endpoint or Internet test", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const monitor = createNetworkStatusMonitor({ isOnline: () => true });
    monitor.start();
    try {
      await vi.waitFor(() => expect(monitor.status.value).toBe("reachable"));
      expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api${apiRoutes.public.health.url}`);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    } finally { monitor.stop(); }
  });
});
