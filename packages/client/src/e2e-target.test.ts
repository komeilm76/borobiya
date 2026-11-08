import { describe, expect, it } from "vitest";
import { e2eTarget, e2eCredentials } from "../e2e/target";

const ack = "I_ACKNOWLEDGE_NONPRODUCTION";
const safe = { BOROBIYA_E2E_NONPRODUCTION: ack, BOROBIYA_E2E_BASE_URL: "https://192.0.2.10" };

describe("opt-in real-browser E2E target", () => {
  it("fails closed without an explicit nonproduction target and acknowledgement", () => {
    expect(() => e2eTarget({})).toThrow();
    expect(() => e2eTarget({ BOROBIYA_E2E_BASE_URL: safe.BOROBIYA_E2E_BASE_URL })).toThrow();
    expect(() => e2eTarget({ ...safe, BOROBIYA_E2E_NONPRODUCTION: "1" })).toThrow();
  });

  it("requires a single secure same-origin root, without URL credentials or leaked paths", () => {
    expect(e2eTarget(safe)).toEqual({ baseURL: "https://192.0.2.10", ignoreHTTPSErrors: false });
    expect(e2eTarget({ ...safe, BOROBIYA_E2E_BASE_URL: "http://localhost:5173/" }).baseURL)
      .toBe("http://localhost:5173");
    for (const bad of [
      "http://192.0.2.10", "https://example.test/api", "https://example.test/?token=secret",
      "https://user:pass@example.test", "https://example.test/#test", "https://example.test/?", "https://example.test/#", "file:///tmp/site.html",
      "https://example.test.evil.invalid/extra"
    ]) expect(() => e2eTarget({ ...safe, BOROBIYA_E2E_BASE_URL: bad })).toThrow();
  });

  it("makes bypassing a test VM's private CA an explicit, HTTPS-only choice", () => {
    expect(e2eTarget({ ...safe, BOROBIYA_E2E_INSECURE_CERT: "1" }).ignoreHTTPSErrors).toBe(true);
    expect(() => e2eTarget({ ...safe, BOROBIYA_E2E_BASE_URL: "http://localhost:5173",
      BOROBIYA_E2E_INSECURE_CERT: "1" })).toThrow();
    expect(() => e2eTarget({ ...safe, BOROBIYA_E2E_INSECURE_CERT: "true" })).toThrow();
  });

  it("requires dedicated test credentials without printing their values", () => {
    expect(() => e2eCredentials({})).toThrow("test credentials");
    expect(() => e2eCredentials({ BOROBIYA_E2E_USERNAME: "test_user" })).toThrow("test credentials");
    expect(e2eCredentials({ BOROBIYA_E2E_USERNAME: "test_user", BOROBIYA_E2E_PASSWORD: "private-secret" }))
      .toEqual({ username: "test_user", password: "private-secret" });
  });
});
