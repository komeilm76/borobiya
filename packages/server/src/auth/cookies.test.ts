import { describe, expect, it } from "vitest";
import {
  expiredRefreshTokenCookie,
  refreshCookieOptionsForRequest,
  refreshTokenCookie
} from "./cookies";

describe("refresh token cookies", () => {
  it("requests the Secure attribute only for HTTPS requests", () => {
    // Regression: an unconditional Secure attribute made browsers drop the
    // cookie on the plain-HTTP LAN dev stack, so session restore always 401'd.
    expect(refreshCookieOptionsForRequest({ protocol: "https" })).toEqual({ secure: true });
    expect(refreshCookieOptionsForRequest({ protocol: "http" })).toEqual({ secure: false });
  });

  it("includes Secure in both cookies when requested", () => {
    expect(refreshTokenCookie("token", { secure: true })).toContain("Secure");
    expect(expiredRefreshTokenCookie({ secure: true })).toContain("Secure");
  });

  it("omits Secure but keeps HttpOnly/SameSite over plain HTTP", () => {
    const cookie = refreshTokenCookie("token", { secure: false });
    expect(cookie).not.toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");

    const expired = expiredRefreshTokenCookie({ secure: false });
    expect(expired).not.toContain("Secure");
    expect(expired).toContain("Max-Age=0");
    expect(expired).toContain("HttpOnly");
  });
});
