import { effectScope } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { ReverseGeocodeResult } from "@shared/index";
import { useReversePlace } from "./use-reverse-place";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const address = (formattedAddress: string): ReverseGeocodeResult => ({ formattedAddress });

function mount(options: Parameters<typeof useReversePlace>[0]) {
  const scope = effectScope();
  const api = scope.run(() => useReversePlace(options))!;
  return { api, scope };
}

describe("reverse map-point lookup", () => {
  it("replaces a pending lookup, ignores late replies, and closes without resurrecting the sheet", async () => {
    const first = deferred<ReverseGeocodeResult | null>();
    const second = deferred<ReverseGeocodeResult | null>();
    const reverse = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const { api, scope } = mount({ reverse });
    api.select(35, 51);
    const signal = reverse.mock.calls[0]?.[1] as AbortSignal;
    api.select(36, 52);
    expect(signal.aborted).toBe(true);
    first.resolve(address("old"));
    await Promise.resolve();
    expect(api.address.value).toBeNull();
    second.resolve(address("new"));
    await Promise.resolve();
    expect(api.address.value).toEqual(address("new"));
    api.close();
    expect(api.open.value).toBe(false);
    expect(api.address.value).toBeNull();
    api.select(91, 51);
    expect(reverse).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("separates an empty result from failure, retries, and reports clipboard failure", async () => {
    const reverse = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null)
      .mockResolvedValueOnce(address("Tehran"));
    const copy = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce(undefined);
    const { api, scope } = mount({ reverse, copy });
    api.select(35, 51);
    await Promise.resolve();
    expect(api.failed.value).toBe(true);
    await api.load();
    expect(api.failed.value).toBe(false);
    expect(api.address.value).toBeNull();
    await api.load();
    await api.copy();
    expect(copy).toHaveBeenCalledWith("Tehran");
    expect(api.copyFailed.value).toBe(true);
    await api.copy();
    expect(api.copied.value).toBe(true);
    expect(api.copyFailed.value).toBe(false);
    scope.stop();
  });

  it("lets only the latest clipboard attempt set feedback on the same address", async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const copy = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    const { api, scope } = mount({ reverse: async () => address("Azadi"), copy });
    api.select(35, 51);
    await Promise.resolve();
    const older = api.copy();
    const newer = api.copy();
    second.resolve();
    await newer;
    expect(api.copied.value).toBe(true);
    first.reject(new Error("old clipboard request was denied"));
    await older;
    expect(api.copied.value).toBe(true);
    expect(api.copyFailed.value).toBe(false);
    const third = deferred<void>();
    const fourth = deferred<void>();
    copy.mockImplementationOnce(() => third.promise).mockImplementationOnce(() => fourth.promise);
    const olderSuccess = api.copy();
    const newerFailure = api.copy();
    fourth.reject(new Error("latest copy denied"));
    await newerFailure;
    third.resolve();
    await olderSuccess;
    expect(api.copyFailed.value).toBe(true);
    expect(api.copied.value).toBe(false);
    scope.stop();
  });

  it("does not report a late clipboard success after changing the point", async () => {
    const pending = deferred<void>();
    const reverse = vi.fn().mockResolvedValue(address("Tehran"));
    const { api, scope } = mount({ reverse, copy: () => pending.promise });
    api.select(35, 51);
    await Promise.resolve();
    const copying = api.copy();
    api.select(36, 52);
    pending.resolve();
    await copying;
    expect(api.copied.value).toBe(false);
    scope.stop();
  });
});
