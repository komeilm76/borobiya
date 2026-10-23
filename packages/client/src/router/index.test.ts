import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { routeRecords } from "./index";

function githubSlug(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
}

describe("client route records", () => {
  it("registers the auth, public, user, and admin route groups", () => {
    const paths = new Set(routeRecords.map((route) => route.path));

    expect(paths).toContain("/_public/landing");
    expect(paths).toContain("/_public/health");
    expect(paths).toContain("/_auth/login");
    expect(paths).toContain("/_auth/register");
    expect(paths).toContain("/_auth/forgot-password");
    expect(paths).toContain("/_user/dashboard");
    expect(paths).toContain("/_user/map");
    expect(paths).toContain("/_user/complete-security-questions");
    expect(paths).toContain("/_admin/dashboard");
    expect(paths).toContain("/_admin/users");
    expect(paths).toContain("/_admin/dispatch");
  });

  it("binds auth and onboarding routes to their functional form views", () => {
    for (const path of [
      "/_auth/login",
      "/_auth/register",
      "/_auth/forgot-password",
      "/_user/complete-security-questions"
    ]) {
      expect(routeRecords.find((route) => route.path === path)?.component).toEqual(expect.any(Function));
    }
  });

  it("binds the user dashboard and map routes to their functional views", () => {
    expect(routeRecords.find((route) => route.path === "/_user/dashboard")?.component).toEqual(expect.any(Function));
    expect(routeRecords.find((route) => route.path === "/_user/map")?.component).toEqual(expect.any(Function));
  });

  it("binds the admin users route to the functional user-management view", () => {
    expect(routeRecords.find((route) => route.path === "/_admin/users")?.component).toEqual(expect.any(Function));
  });

  it("uses unique route names and redirects the root to the public landing page", () => {
    const namedRoutes = routeRecords.flatMap((route) => route.name ? [route.name] : []);

    expect(new Set(namedRoutes).size).toBe(namedRoutes.length);
    expect(routeRecords.find((route) => route.path === "/")).toMatchObject({
      redirect: "/_public/landing"
    });
  });

  it("keeps docs/USER_MANUAL.md headings, TOC anchors, and Quick Reference aligned with client routes", () => {
    const manual = readFileSync(new URL("../../../../docs/USER_MANUAL.md", import.meta.url), "utf8");
    const lines = manual.split("\n");

    const headingSlugs = new Set(
      lines
        .filter((line) => /^#{2,3}\s+/.test(line))
        .map((line) => githubSlug(line.replace(/^#{2,3}\s+/, "")))
    );
    const tocAnchors = [...manual.matchAll(/^\d+\.\s+\[[^\]]+\]\(#([^)]+)\)/gm)].map((match) => match[1]!);
    expect(tocAnchors.length).toBeGreaterThanOrEqual(23);
    for (const anchor of tocAnchors) {
      expect(headingSlugs, `TOC anchor #${anchor}`).toContain(anchor);
    }

    for (const plannedSection of [9, 10, 14, 15, 16, 17, 18, 19]) {
      const heading = lines.find((line) => line.startsWith(`## ${plannedSection}. `));
      expect(heading, `section ${plannedSection}`).toMatch(/— Planned$/);
    }

    const byPath = new Map(routeRecords.map((route) => [route.path, route]));
    const quickRefSection = manual.split("## 23. Quick Reference")[1] ?? "";
    const tableRows = quickRefSection
      .split("\n")
      .filter((line) => line.startsWith("| ") && !line.startsWith("| Action ") && !line.startsWith("|---"));
    expect(tableRows.length).toBeGreaterThan(0);

    for (const row of tableRows) {
      const cells = row.split("|").map((cell) => cell.trim()).filter(Boolean);
      const label = cells[0] ?? "";
      const pathMatch = (cells[1] ?? "").match(/`(\/[^`]+)`/);
      expect(pathMatch, row).not.toBeNull();
      const route = byPath.get(pathMatch![1]!);
      expect(route, `Quick Reference path ${pathMatch![1]}`).toBeDefined();
      const isPlaceholder = String(route?.component ?? "").includes("PlaceholderView.vue");
      expect(/\bplanned\b/i.test(label), `Quick Reference planned label for ${pathMatch![1]}`).toBe(isPlaceholder);
    }
  });

  it("exposes desktop and mobile navigation links for user and admin views and allows multipart uploads in nginx", () => {
    const appVue = readFileSync(new URL("../App.vue", import.meta.url), "utf8");
    for (const target of [
      "/_admin/users",
      "/_admin/categories",
      "/_admin/incidents",
      "/_user/dashboard",
      "/_user/map",
      "/_user/location-shares",
      "/_user/devices",
      "d-sm-none"
    ]) {
      expect(appVue).toContain(target);
    }

    const nginx = readFileSync(new URL("../../../../nginx.conf", import.meta.url), "utf8");
    expect(nginx).toContain("client_max_body_size 10m;");
  });
});
