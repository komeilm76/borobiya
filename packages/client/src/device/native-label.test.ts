import { describe, expect, it } from "vitest";
import { MAX_USER_DEVICE_NAME_LENGTH } from "@shared/index";
import { nativeDeviceLabel, type NativeDeviceFacts } from "./native-label";

/**
 * The label a native build sends at login ends up in `user_sessions.device_name`, in a table the account
 * owner shares with nobody else — so it is worth pinning what may and may not go in there.
 */

describe("nativeDeviceLabel", () => {
  it("names brand and model, the way spec §7.3 shows it", () => {
    expect(nativeDeviceLabel({ manufacturer: "Samsung", model: "Galaxy S23", platform: "android" })).toBe("Samsung Galaxy S23");
    expect(nativeDeviceLabel({ manufacturer: "Apple", model: "iPhone13,4", platform: "ios" })).toBe("Apple iPhone13,4");
  });

  it("does not repeat a brand the model already starts with", () => {
    expect(nativeDeviceLabel({ manufacturer: "Google", model: "Pixel 7" })).toBe("Google Pixel 7");
    expect(nativeDeviceLabel({ manufacturer: "OnePlus", model: "oneplus 9 pro" })).toBe("oneplus 9 pro");
  });

  it("ignores the user-assigned device name", () => {
    const facts: NativeDeviceFacts = { name: "John's iPhone", manufacturer: "Apple", model: "iPhone14,5" };
    expect(nativeDeviceLabel(facts)).toBe("Apple iPhone14,5");
    expect(nativeDeviceLabel(facts)).not.toContain("John");
  });

  it("falls back to the operating system when the hardware is unknown", () => {
    expect(nativeDeviceLabel({ operatingSystem: "ios", osVersion: "17.1.2" })).toBe("iOS 17");
    expect(nativeDeviceLabel({ operatingSystem: "android", osVersion: "13" })).toBe("Android 13");
    expect(nativeDeviceLabel({ operatingSystem: "mac", osVersion: "14.2" })).toBe("macOS 14");
  });

  it("says nothing rather than «unknown»", () => {
    expect(nativeDeviceLabel({ operatingSystem: "unknown" })).toBeUndefined();
    expect(nativeDeviceLabel({ manufacturer: "  ", model: "" })).toBeUndefined();
    expect(nativeDeviceLabel(null)).toBeUndefined();
    expect(nativeDeviceLabel(undefined)).toBeUndefined();
  });

  it("collapses the whitespace a device label arrives with", () => {
    expect(nativeDeviceLabel({ manufacturer: "  Samsung\n ", model: " SM-G991B  " })).toBe("Samsung SM-G991B");
  });

  it("clamps to the server's bound instead of making login fail", () => {
    // `loginSchema` would reject an over-long `deviceName` outright, so a weird ROM model string would
    // cost the user their own login. Truncation is the only safe direction for a display field.
    const long = "X".repeat(MAX_USER_DEVICE_NAME_LENGTH * 2);
    const label = nativeDeviceLabel({ manufacturer: "Vendor", model: long })!;
    expect(label.length).toBeLessThanOrEqual(MAX_USER_DEVICE_NAME_LENGTH);
    expect(label.startsWith("Vendor XXXX")).toBe(true);
  });

  it("never returns an empty string, which the schema would refuse as well", () => {
    for (const facts of [{ model: "   " }, { manufacturer: "\t" }, { model: "", manufacturer: "" }] as const) {
      expect(nativeDeviceLabel(facts)).toBeUndefined();
    }
  });
});
