import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// The router test resolves the lazy route but does not mount Vue components.
vi.mock("@client/views/_user/UserMapView.vue", () => ({ default: {} }));
vi.mock("@client/views/_auth/LoginView.vue", () => ({ default: {} }));
vi.mock("@client/views/_user/CompleteSecurityQuestionsView.vue", () => ({ default: {} }));
import { createMemoryHistory } from "vue-router";
import { createAppRouter, routeRecords } from "./index";
import { resolvePostLoginDestination } from "./guards";

const app = readFileSync(new URL("../App.vue", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../components/shell/MapProposalSidebar.vue", import.meta.url), "utf8");

describe("map as the rescuer's home and proposal workspace", () => {
  it("makes the map the post-login/onboarding default without changing the admin destination or explicit safe returns", () => {
    expect(resolvePostLoginDestination(undefined, { user: { role: "user" }, mustCompleteSecurityQuestions: false })).toBe("/_user/map");
    expect(resolvePostLoginDestination(undefined, { user: { role: "admin" }, mustCompleteSecurityQuestions: false })).toBe("/_admin/users");
    expect(resolvePostLoginDestination("/_user/mission", { user: { role: "user" }, mustCompleteSecurityQuestions: false })).toBe("/_user/mission");
  });

  it("retains old bookmarks as guarded redirects instead of serving unwanted pages", async () => {
    expect(routeRecords.find((route) => route.path === "/_user/dashboard")?.component).toBeUndefined();
    expect(routeRecords.find((route) => route.path === "/_user/proposals")?.component).toBeUndefined();
    const auth = { isAuthenticated: true, mustCompleteSecurityQuestions: false,
      user: { role: "user" as const }, ensureSession: async () => {} };
    const router = createAppRouter(createMemoryHistory(), auth);
    await router.push("/_user/dashboard");
    expect(router.currentRoute.value.path).toBe("/_user/map");
    await router.push("/_user/proposals?offer=22222222-2222-4222-8222-000000000001");
    expect(router.currentRoute.value.fullPath).toBe("/_user/map?offer=22222222-2222-4222-8222-000000000001");
  });

  it("keeps legacy offer bookmarks behind auth and onboarding", async () => {
    const auth = { isAuthenticated: false, mustCompleteSecurityQuestions: false,
      user: null as { role: "user" } | null, ensureSession: async () => {} };
    const router = createAppRouter(createMemoryHistory(), auth);
    await router.push("/_user/proposals?offer=22222222-2222-4222-8222-000000000001");
    expect(router.currentRoute.value.path).toBe("/_auth/login");
    expect(router.currentRoute.value.query.redirect).toBe("/_user/map?offer=22222222-2222-4222-8222-000000000001");
    auth.isAuthenticated = true;
    auth.mustCompleteSecurityQuestions = true;
    auth.user = { role: "user" };
    await router.push("/_user/proposals?offer=22222222-2222-4222-8222-000000000001");
    expect(router.currentRoute.value.path).toBe("/_user/complete-security-questions");
  });

  it("does not link to either retired page and keeps decisions reachable from the map bell", () => {
    expect(app).not.toContain('to: "/_user/dashboard"');
    expect(app).not.toContain('to: "/_user/proposals"');
    expect(app).not.toContain("path: '/_user/proposals'");
    expect(sidebar).toContain("<ProposalInboxContent");
    expect(sidebar).toContain("openOffer(offer.id)");
  });
});
