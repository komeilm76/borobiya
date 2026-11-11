import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useOwnMapPosition } from "./use-own-map-position";

describe("private on-map GPS display", () => {
  it("watches only after a signed-in user opts in; ignores bad fixes, and clears on stop", () => {
    const owner = ref<string | null>(null);
    const fixes: Array<(fix: { lat: number; lon: number; accuracy?: number }) => void> = [];
    const clear = vi.fn();
    const subscribe = vi.fn((onFix: (typeof fixes)[number]) => { fixes.push(onFix); return clear; });
    const scope = effectScope();
    const own = scope.run(() => useOwnMapPosition(owner, { subscribe }))!;
    expect(own.start()).toBe(false);
    expect(subscribe).not.toHaveBeenCalled();
    owner.value = "user-1";
    expect(own.start()).toBe(true);
    expect(own.start()).toBe(false);
    fixes[0]!({ lat: 91, lon: 51 });
    fixes[0]!({ lat: 35.7, lon: 51.4, accuracy: -2 });
    expect(own.position.value).toBeNull();
    fixes[0]!({ lat: 35.7, lon: 51.4, accuracy: 12 });
    expect(own.position.value).toEqual({ lat: 35.7, lon: 51.4, accuracy: 12 });
    expect(own.lastFixAt.value).toBeGreaterThan(0);
    own.stop();
    expect(own.lastFixAt.value).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
    expect(own.position.value).toBeNull();
    fixes[0]!({ lat: 35.8, lon: 51.5 });
    expect(own.position.value).toBeNull();
    scope.stop();
    expect(clear).toHaveBeenCalledOnce();
  });

  it("retains valid movement heading without trusting invalid or stationary compass data", () => {
    let emit!: (fix: { lat: number; lon: number; accuracy?: number; heading?: number | null; speed?: number | null }) => void;
    const scope = effectScope();
    const own = scope.run(() => useOwnMapPosition(ref("owner"), {
      subscribe: (onFix) => { emit = onFix; return () => {}; }
    }))!;
    own.start();
    emit({ lat: 35.7, lon: 51.4, accuracy: 8, heading: 90, speed: 4 });
    expect(own.position.value).toMatchObject({ heading: 90, speed: 4 });
    emit({ lat: 35.7, lon: 51.4, accuracy: 8, heading: 400, speed: -1 });
    expect(own.position.value?.heading).toBeUndefined();
    expect(own.position.value?.speed).toBeUndefined();
    scope.stop();
  });
  it("invalidates queued GPS callbacks synchronously on account switch and scope disposal", () => {
    const owner = ref<string | null>("user-1");
    const fixes: Array<(fix: { lat: number; lon: number }) => void> = [];
    const clear = vi.fn();
    const scope = effectScope();
    const own = scope.run(() => useOwnMapPosition(owner, {
      subscribe: (onFix) => { fixes.push(onFix); return clear; }
    }))!;
    own.start();
    fixes[0]!({ lat: 35.7, lon: 51.4 });
    owner.value = "user-2";
    expect(own.active.value).toBe(false);
    expect(own.position.value).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
    own.start();
    fixes[0]!({ lat: 35.8, lon: 51.5 });
    expect(own.position.value).toBeNull();
    fixes[1]!({ lat: 35.9, lon: 51.6 });
    expect(own.position.value?.lat).toBe(35.9);
    scope.stop();
    expect(own.position.value).toBeNull();
    expect(clear).toHaveBeenCalledTimes(2);
    fixes[1]!({ lat: 36, lon: 52 });
    expect(own.position.value).toBeNull();
  });

  it("expires a silently stale fix without stopping GPS, then accepts recovery and clears its timer on stop", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    let emit!: (fix: { lat: number; lon: number; accuracy?: number }) => void;
    const clear = vi.fn();
    const scope = effectScope();
    try {
      const own = scope.run(() => useOwnMapPosition(ref("owner"), {
        subscribe: (onFix) => { emit = onFix; return clear; }
      }))!;
      expect(own.start()).toBe(true);
      emit({ lat: 35.7, lon: 51.4, accuracy: 8 });
      vi.advanceTimersByTime(19_999);
      expect(own.position.value?.lat).toBe(35.7);
      vi.advanceTimersByTime(1);
      expect(own.position.value).toBeNull();
      expect(own.lastFixAt.value).toBeNull();
      expect(own.error.value).toContain("GPS");
      expect(own.active.value).toBe(true); // Keep the watch so the next fix can recover.
      expect(clear).not.toHaveBeenCalled();
      emit({ lat: 35.8, lon: 51.5, accuracy: 8 });
      expect(own.position.value?.lat).toBe(35.8);
      expect(own.error.value).toBeNull();
      own.stop();
      vi.advanceTimersByTime(21_000);
      expect(own.error.value).toBeNull();
      expect(clear).toHaveBeenCalledOnce();
    } finally { scope.stop(); vi.useRealTimers(); }
  });

  it("passes GeolocationPosition.timestamp from the browser watcher into the private GPS fix", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const clearWatch = vi.fn();
    const watchPosition = vi.fn((onFix: (position: unknown) => void) => {
      onFix({ timestamp: 95_000, coords: { latitude: 35.7, longitude: 51.4,
        accuracy: 12, heading: null, speed: null } });
      return 17;
    });
    vi.stubGlobal("navigator", { geolocation: { watchPosition, clearWatch } });
    const scope = effectScope();
    try {
      const own = scope.run(() => useOwnMapPosition(ref("owner")))!;
      expect(own.start()).toBe(true);
      expect(own.lastFixAt.value).toBe(95_000);
      expect(own.position.value?.lat).toBe(35.7);
    } finally { scope.stop(); vi.unstubAllGlobals(); vi.useRealTimers(); }
    expect(clearWatch).toHaveBeenCalledWith(17);
  });

  it("uses the browser's observation time, not callback time, to expire cached fixes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    let emit!: (fix: { lat: number; lon: number; timestamp?: number }) => void;
    const scope = effectScope();
    try {
      const own = scope.run(() => useOwnMapPosition(ref("owner"), {
        subscribe: (onFix) => { emit = onFix; return () => {}; }
      }))!;
      own.start();
      emit({ lat: 35.7, lon: 51.4, timestamp: 75_000 }); // Old cached callback must not look live.
      expect(own.position.value).toBeNull();
      emit({ lat: 35.8, lon: 51.5, timestamp: 95_000 });
      expect(own.position.value?.lat).toBe(35.8);
      expect(own.lastFixAt.value).toBe(95_000);
      emit({ lat: 35.6, lon: 51.3, timestamp: 94_000 }); // Out-of-order fix cannot rewind the map.
      emit({ lat: 35.6, lon: 51.3, timestamp: Number.NaN });
      emit({ lat: 35.6, lon: 51.3, timestamp: 102_000 }); // Implausible future timestamp.
      expect(own.position.value?.lat).toBe(35.8);
      vi.advanceTimersByTime(14_999);
      expect(own.position.value?.lat).toBe(35.8);
      vi.advanceTimersByTime(1);
      expect(own.position.value).toBeNull();
      expect(own.lastFixAt.value).toBeNull();
      emit({ lat: 35.9, lon: 51.6, timestamp: 115_000 });
      expect(own.position.value?.lat).toBe(35.9); // The same watch can recover.
    } finally { scope.stop(); vi.useRealTimers(); }
  });

  it("renews GPS freshness only for valid fixes and revokes the timer on account change", () => {
    vi.useFakeTimers();
    vi.setSystemTime(200_000);
    const owner = ref<string | null>("user-1");
    let emit!: (fix: { lat: number; lon: number; accuracy?: number }) => void;
    const scope = effectScope();
    try {
      const own = scope.run(() => useOwnMapPosition(owner, {
        subscribe: (onFix) => { emit = onFix; return () => {}; }
      }))!;
      own.start();
      emit({ lat: 35.7, lon: 51.4, accuracy: 8 });
      vi.advanceTimersByTime(10_000);
      emit({ lat: 35.8, lon: 51.5, accuracy: -1 }); // Rejected samples cannot extend stale GPS.
      vi.advanceTimersByTime(5_000);
      emit({ lat: 35.9, lon: 51.6, accuracy: 8 });
      vi.advanceTimersByTime(5_000);
      expect(own.position.value?.lat).toBe(35.9); // First fix's timeout was canceled.
      owner.value = null;
      vi.advanceTimersByTime(21_000);
      expect(own.position.value).toBeNull();
      expect(own.error.value).toBeNull(); // Never emit a stale warning for a signed-out account.
    } finally { scope.stop(); vi.useRealTimers(); }
  });

  it("clears a transient GPS error when the user explicitly stops watching", () => {
    let fail!: (denied: boolean) => void;
    const scope = effectScope();
    const own = scope.run(() => useOwnMapPosition(ref("user-1"), {
      subscribe: (_fix, onError) => { fail = onError; return () => {}; }
    }))!;
    own.start();
    fail(false);
    expect(own.lastFixAt.value).toBeNull();
    expect(own.error.value).toContain("GPS");
    own.stop();
    expect(own.active.value).toBe(false);
    expect(own.error.value).toBeNull();
    scope.stop();
  });

  it("clears a stale fix on transient failure and stops entirely on permission denial", () => {
    let fix!: (fix: { lat: number; lon: number }) => void;
    let fail!: (denied: boolean) => void;
    const clear = vi.fn();
    const scope = effectScope();
    const own = scope.run(() => useOwnMapPosition(ref("user-1"), {
      subscribe: (onFix, onError) => { fix = onFix; fail = onError; return clear; }
    }))!;
    own.start();
    fix({ lat: 35.7, lon: 51.4 });
    fail(false);
    expect(own.active.value).toBe(true);
    expect(own.position.value).toBeNull();
    expect(own.error.value).toContain("GPS");
    fix({ lat: 35.8, lon: 51.5 });
    expect(own.error.value).toBeNull();
    fail(true);
    expect(own.active.value).toBe(false);
    expect(own.position.value).toBeNull();
    expect(clear).toHaveBeenCalledOnce();
    scope.stop();
  });

  it("cleans up a synchronous denial or unavailable GPS and never pretends it started", () => {
    const clear = vi.fn();
    const scope = effectScope();
    const denied = scope.run(() => useOwnMapPosition(ref("user-1"), {
      subscribe: (_fix, fail) => { fail(true); return clear; }
    }))!;
    expect(denied.start()).toBe(false);
    expect(clear).toHaveBeenCalledOnce();
    expect(denied.error.value).toContain("متوقف");
    const missing = scope.run(() => useOwnMapPosition(ref("user-1"), {
      subscribe: () => { throw new Error("GEOLOCATION_UNAVAILABLE"); }
    }))!;
    expect(missing.start()).toBe(false);
    expect(missing.error.value).toContain("HTTPS");
    scope.stop();
  });
});
