import { describe, expect, it } from "vitest";
import { MAX_USER_DEVICE_NAME_LENGTH } from "@borobiya/shared";
import { describeUserAgent, normalizeDeviceName, resolveLoginDeviceName } from "./device-label";

const UA = {
  chromeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.54 Mobile Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.71 Mobile/15E148 Safari/604.1",
  firefoxLinux: "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  safariMacos:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
};

describe("describeUserAgent", () => {
  it("summarizes the browser and platform a rescuer recognizes", () => {
    expect(describeUserAgent(UA.chromeWindows)).toBe("Chrome on Windows");
    expect(describeUserAgent(UA.firefoxLinux)).toBe("Firefox on Linux");
    expect(describeUserAgent(UA.safariMacos)).toBe("Safari on macOS");
  });

  it("reports the most specific browser, because Edge and iOS Chrome also claim Chrome", () => {
    expect(describeUserAgent(UA.edgeWindows)).toBe("Microsoft Edge on Windows");
    expect(describeUserAgent(UA.chromeIos)).toBe("Chrome on iPhone");
    expect(describeUserAgent(UA.samsungInternet)).toBe("Samsung Internet on Android");
  });

  it("names mobile device families the way the settings table expects", () => {
    expect(describeUserAgent(UA.chromeAndroid)).toBe("Chrome on Android");
    expect(describeUserAgent(UA.safariIphone)).toBe("Safari on iPhone");
  });

  it("labels automated clients and keeps a recognized half when the other is missing", () => {
    expect(describeUserAgent("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe("Automated client");
    expect(describeUserAgent("curl/8.5.0")).toBe("Automated client");
    expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
    // Nothing recognized means nothing stored: an unrecognized UA is client detail, not a label.
    expect(describeUserAgent("SomeBrowser/1.0")).toBeNull();
  });

  it("returns null instead of storing arbitrary client detail", () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent(undefined)).toBeNull();
    expect(describeUserAgent("   ")).toBeNull();
    expect(describeUserAgent("totally unknown client")).toBeNull();
  });

  it("strips control characters and bounds the label", () => {
    const noisy = `  ${UA.chromeWindows}\u0000\u0007\u001B  `;
    const label = describeUserAgent(noisy);
    expect(label).toBe("Chrome on Windows");

    const huge = `${"x".repeat(400)} Chrome/129.0.0.0 Windows NT 10.0`;
    const bounded = describeUserAgent(huge);
    expect(bounded).not.toBeNull();
    expect(bounded!.length).toBeLessThanOrEqual(MAX_USER_DEVICE_NAME_LENGTH);
  });
});

describe("normalizeDeviceName", () => {
  it("trims, collapses whitespace, and truncates a client-supplied name", () => {
    expect(normalizeDeviceName("  Pixel\u0007\u0007 8\u0009 ")).toBe("Pixel 8");
    expect(normalizeDeviceName("d".repeat(140))!.length).toBe(MAX_USER_DEVICE_NAME_LENGTH);
  });

  it("rejects empty and non-string input", () => {
    expect(normalizeDeviceName("")).toBeNull();
    expect(normalizeDeviceName(" \n\t ")).toBeNull();
    expect(normalizeDeviceName(null)).toBeNull();
    expect(normalizeDeviceName(undefined)).toBeNull();
  });
});

describe("resolveLoginDeviceName", () => {
  it("prefers the platform-reported name over the User-Agent", () => {
    expect(resolveLoginDeviceName({ deviceName: " Samsung S23 ", userAgent: UA.chromeAndroid }))
      .toBe("Samsung S23");
  });

  it("falls back to the User-Agent label when the client sent nothing usable", () => {
    expect(resolveLoginDeviceName({ deviceName: "   ", userAgent: UA.chromeWindows })).toBe("Chrome on Windows");
    expect(resolveLoginDeviceName({ userAgent: UA.safariIphone })).toBe("Safari on iPhone");
  });

  it("yields null when neither source is usable", () => {
    expect(resolveLoginDeviceName({})).toBeNull();
    expect(resolveLoginDeviceName({ deviceName: null, userAgent: "unknown" })).toBeNull();
  });
});
