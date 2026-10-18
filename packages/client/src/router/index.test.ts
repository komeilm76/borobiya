import { describe, expect, it } from "vitest";
import { routeRecords } from "./index";

describe("client route placeholders", () => {
  it("registers the auth, public, user, and admin route groups", () => {
    const paths = new Set(routeRecords.map((route) => route.path));

    expect(paths).toContain("/_public/landing");
    expect(paths).toContain("/_public/health");
    expect(paths).toContain("/_auth/login");
    expect(paths).toContain("/_auth/register");
    expect(paths).toContain("/_user/dashboard");
    expect(paths).toContain("/_user/map");
    expect(paths).toContain("/_user/complete-security-questions");
    expect(paths).toContain("/_admin/dashboard");
    expect(paths).toContain("/_admin/dispatch");
  });

  it("uses unique route names and redirects the root to the public landing page", () => {
    const namedRoutes = routeRecords.flatMap((route) => route.name ? [route.name] : []);

    expect(new Set(namedRoutes).size).toBe(namedRoutes.length);
    expect(routeRecords.find((route) => route.path === "/")).toMatchObject({
      redirect: "/_public/landing"
    });
  });
});
