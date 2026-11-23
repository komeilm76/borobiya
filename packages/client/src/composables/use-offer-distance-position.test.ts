import { readFileSync } from "node:fs";
import { effectScope } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OFFER_GPS_DEADLINE_MS, useOfferDistancePosition, type OfferPositionRuntime } from "./use-offer-distance-position";

afterEach(() => vi.useRealTimers());

describe("proposal distance position", () => {
  it("wires the offer detail to the bounded locator and clears it when the selection changes", () => {
    const source = readFileSync(new URL("../components/shell/ProposalInboxContent.vue", import.meta.url), "utf8");
    expect(source).toContain("locate: locateMe, reset: resetLocation } = useOfferDistancePosition()");
    expect(source.slice(source.indexOf("watch(() => selected.value?.id"), source.indexOf("watch(() => auth.user?.id")))
      .toContain("resetLocation()");
    expect(source).not.toContain("navigator.geolocation.getCurrentPosition(");
  });

  it("recovers from a silent GPS bridge and ignores its old callback after retry", async () => {
    vi.useFakeTimers();
    const callbacks: Array<(position: { lat: number; lon: number }) => void> = [];
    const runtime: OfferPositionRuntime = (ok) => { callbacks.push(ok); };
    const scope = effectScope();
    const position = scope.run(() => useOfferDistancePosition(runtime))!;
    try {
      position.locate();
      expect(position.locating.value).toBe(true);
      await vi.advanceTimersByTimeAsync(OFFER_GPS_DEADLINE_MS);
      expect(position.locating.value).toBe(false);
      expect(position.locationError.value).toContain("موقعیت");
      position.locate();
      callbacks[0]!({ lat: 35.7, lon: 51.4 });
      expect(position.myPosition.value).toBeNull();
      callbacks[1]!({ lat: 35.8, lon: 51.5 });
      expect(position.myPosition.value).toEqual({ lat: 35.8, lon: 51.5 });
      callbacks[1]!({ lat: 35.9, lon: 51.6 });
      expect(position.myPosition.value).toEqual({ lat: 35.8, lon: 51.5 });
      expect(vi.getTimerCount()).toBe(0);
    } finally { scope.stop(); }
  });

  it("handles synchronous permission/bridge failures and rejects invalid coordinates", () => {
    const scope = effectScope();
    const failed = scope.run(() => useOfferDistancePosition(() => { throw new Error("no permission"); }))!;
    try {
      expect(() => failed.locate()).not.toThrow();
      expect(failed.locating.value).toBe(false);
      expect(failed.locationError.value).toContain("موقعیت");
    } finally { scope.stop(); }

    const another = effectScope();
    const invalid = another.run(() => useOfferDistancePosition((ok) => ok({ lat: 999, lon: 51 })))!;
    try {
      invalid.locate();
      expect(invalid.myPosition.value).toBeNull();
      expect(invalid.locating.value).toBe(false);
      expect(invalid.locationError.value).toContain("موقعیت");
    } finally { another.stop(); }
  });

  it("clears the private fix and ignores pending callbacks on offer change or disposal", () => {
    vi.useFakeTimers();
    let callback!: (position: { lat: number; lon: number }) => void;
    const scope = effectScope();
    const position = scope.run(() => useOfferDistancePosition((ok) => { callback = ok; }))!;
    position.locate();
    position.reset();
    callback({ lat: 35.7, lon: 51.4 });
    expect(position.myPosition.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    position.locate();
    scope.stop();
    callback({ lat: 35.8, lon: 51.5 });
    expect(position.myPosition.value).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
