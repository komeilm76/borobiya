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
    own.stop();
    expect(clear).toHaveBeenCalledOnce();
    expect(own.position.value).toBeNull();
    fixes[0]!({ lat: 35.8, lon: 51.5 });
    expect(own.position.value).toBeNull();
    scope.stop();
    expect(clear).toHaveBeenCalledOnce();
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
