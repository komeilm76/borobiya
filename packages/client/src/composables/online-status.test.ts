import { effectScope } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOnlineStatus } from "./online-status";

type Listener = () => void;

function stubBrowser(online: boolean) {
  const listeners = new Map<string, Set<Listener>>();
  const target = {
    addEventListener(type: string, listener: Listener) {
      const bucket = listeners.get(type) ?? new Set<Listener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    }
  };
  const navigatorStub = { onLine: online };
  vi.stubGlobal("window", target);
  vi.stubGlobal("navigator", navigatorStub);
  return {
    navigatorStub,
    fire(type: string) {
      for (const listener of listeners.get(type) ?? []) listener();
    },
    listenerCount(type: string) {
      return listeners.get(type)?.size ?? 0;
    }
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useOnlineStatus", () => {
  it("starts from the browser's own answer", () => {
    stubBrowser(false);
    const scope = effectScope();
    const state = scope.run(() => useOnlineStatus())!;
    expect(state.isOnline.value).toBe(false);
    scope.stop();
  });

  it("follows both events, in both directions", () => {
    const browser = stubBrowser(true);
    const scope = effectScope();
    const state = scope.run(() => useOnlineStatus())!;
    expect(state.isOnline.value).toBe(true);

    browser.navigatorStub.onLine = false;
    browser.fire("offline");
    expect(state.isOnline.value).toBe(false);

    browser.navigatorStub.onLine = true;
    browser.fire("online");
    expect(state.isOnline.value).toBe(true);
    scope.stop();
  });

  it("drops its listeners when the view that asked goes away", () => {
    const browser = stubBrowser(true);
    const scope = effectScope();
    scope.run(() => useOnlineStatus())!;
    expect(browser.listenerCount("online")).toBe(1);
    expect(browser.listenerCount("offline")).toBe(1);

    scope.stop();
    expect(browser.listenerCount("online")).toBe(0);
    expect(browser.listenerCount("offline")).toBe(0);
  });
});
