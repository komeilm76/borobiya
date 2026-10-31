import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = source("../../App.vue");
const router = source("../../router/index.ts");
const css = source("../../styles/public.css");
const landing = source("./PublicLandingView.vue");
const health = source("./PublicHealthView.vue");
const notFound = source("./PublicNotFoundView.vue");

// The repository deliberately doesn't mount .vue components in unit tests.
describe("guest-facing public experience", () => {
  it("uses a distinct public shell instead of the user app bar/footer, with reachable theme and account links", () => {
    expect(app).toContain("'app-shell--public': isPublicRoute");
    expect(app).toContain('v-if="!isMapRoute && !isAuthRoute && !isPublicRoute"');
    expect(app).toContain('v-if="isPublicRoute" class="public-chrome"');
    expect(app).toContain('v-if="isPublicRoute" class="public-footer"');
    expect(app).toContain('<footer v-if="!isAuthRoute && !isPublicRoute" class="app-footer">');
    expect(app).toContain('route.name === "public-landing"');
    expect(app).toContain('route.name === "public-health"');
    expect(app).toContain('route.name === "not-found"');
    expect(app).toContain('appTheme.toggleTheme()');
    expect(app).toContain('to="/_auth/login"');
    expect(app).toContain('to="/_auth/register"');
    expect(app).toContain('to="/_public/health"');
    expect(css).toContain('.app-shell--public .app-main');
    expect(css).toContain(':root.dark .app-shell--public .app-main');
    expect(css).toContain('@media (max-width: 760px)');
    expect(css).toContain(':focus-visible');
  });

  it("replaces the placeholder landing with honest, accessible content and clear next steps", () => {
    expect(router).toContain('import("@client/views/_public/PublicLandingView.vue")');
    expect(landing).toContain('<h1');
    expect(landing).toContain('to="/_auth/register"');
    expect(landing).toContain('to="/_auth/login"');
    expect(landing).toContain('aria-hidden="true"'); // Decorative network isn't an interactive map.
    expect(landing).not.toContain('به‌زودی آماده می‌شود');
    expect(landing).not.toContain('اسکلت رابط کاربری');
    expect(css).toContain('.public-hero');
    expect(css).toContain('.public-network');
  });

  it("keeps invalid URLs in the same guest shell with clear wayfinding", () => {
    expect(router).toContain('import("@client/views/_public/PublicNotFoundView.vue")');
    expect(notFound).toContain('صفحه را پیدا نکردیم');
    expect(notFound).toContain('to="/_public/landing"');
    expect(notFound).toContain('to="/_auth/login"');
  });

  it("makes health a genuine, bounded same-origin API probe without claiming other services are healthy", () => {
    expect(router).toContain('import("@client/views/_public/PublicHealthView.vue")');
    expect(health).toContain('apiRoutes.public.health.url');
    expect(health).toContain('requestJson');
    expect(health).toContain('cache: "no-store"');
    expect(health).toContain('AbortController');
    expect(health).toContain('onBeforeUnmount');
    expect(health).toContain('تلاش دوباره');
    expect(health).toContain('این بررسی فقط پاسخ‌گویی API');
    expect(health).not.toContain('همهٔ سرویس‌ها فعال');
  });
});
