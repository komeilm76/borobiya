import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { detectNativeDeviceFacts, loginDeviceName } from "./capacitor";

/**
 * The Capacitor probe is only its failure behavior here: the real bridge cannot exist in a Node test, and
 * the whole point of the wrapper is that a missing bridge costs nothing.
 */

describe("detectNativeDeviceFacts", () => {
  it("passes the plugin's facts through", async () => {
    const facts = { manufacturer: "Samsung", model: "Galaxy S23", platform: "android" };
    await expect(detectNativeDeviceFacts(async () => facts)).resolves.toEqual(facts);
  });

  it("treats a web run as no facts at all", async () => {
    await expect(detectNativeDeviceFacts(async () => null)).resolves.toBeNull();
  });

  it("swallows a rejected probe instead of failing the caller", async () => {
    // `Device.getInfo()` can reject when a plugin is not registered in this build; that must not turn a
    // login attempt into an error screen.
    const reader = vi.fn(async () => {
      throw new Error("not implemented");
    });
    await expect(detectNativeDeviceFacts(reader)).resolves.toBeNull();
    expect(reader).toHaveBeenCalledTimes(1);
  });
});

describe("loginDeviceName", () => {
  it("maps the facts through the label rule", async () => {
    await expect(loginDeviceName(async () => ({ manufacturer: "Apple", model: "iPhone14,5", name: "Sara's phone" }))).resolves.toBe(
      "Apple iPhone14,5"
    );
  });

  it("is undefined, not an empty field, on web", async () => {
    await expect(loginDeviceName(async () => null)).resolves.toBeUndefined();
    await expect(loginDeviceName(async () => ({ operatingSystem: "unknown" }))).resolves.toBeUndefined();
  });
});

/**
 * `LoginView` is not mounted in tests (repo convention), so the two wiring rules that only exist in that
 * file are pinned against its source: the label is sent, and it is sent in a way that cannot break a login.
 */
describe("the login form", () => {
  const loginView = readFileSync(new URL("../views/_auth/LoginView.vue", import.meta.url), "utf8");

  it("sends the native label once, and only when there is one", () => {
    // One call site (the prose in the comment above it is not one), and it is awaited inside the try so a
    // rejected probe is already handled by the wrapper's own catch.
    expect(loginView.match(/await loginDeviceName\(\)/g)?.length).toBe(1);
    expect(loginView).toContain("deviceName ? { ...parsed.data, deviceName } : parsed.data");
  });
});
