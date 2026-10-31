import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../styles/auth.css", import.meta.url), "utf8");
const forgot = readFileSync(new URL("./ForgotPasswordView.vue", import.meta.url), "utf8");

// Source/style contracts only; repository policy prohibits mounting .vue components in unit tests.
describe("standalone auth experience", () => {
  it("isolates login, registration and recovery from the user/public chrome", () => {
    expect(app).toContain("route.name === \"auth-login\"");
    expect(app).toContain("route.name === \"auth-register\"");
    expect(app).toContain("route.name === \"auth-forgot-password\"");
    expect(app).toContain("'app-shell--auth': isAuthRoute");
    expect(app).toContain('v-if="!isMapRoute && !isAuthRoute" class="app-topbar');
    expect(app).toContain('<footer v-if="!isAuthRoute" class="app-footer">');
    expect(app).toContain('v-if="isAuthRoute" class="auth-chrome"');
    expect(app).toContain('to="/_public/landing"');
    expect(app).toContain('@click="appTheme.toggleTheme()"'); // No lost theme control after removing the app bar.
    expect(styles).toContain(".app-shell--auth .app-main");
    expect(styles).toContain("min-height: 100dvh");
    expect(styles).toContain(".auth-chrome");
    expect(styles).toContain(".auth-layout");
    expect(styles).toContain("@media (max-width: 900px)");
    expect(styles).toContain("@media (max-width: 560px)");
    expect(styles).toContain(":root.dark .app-shell--auth .app-main");
  });

  it("separates recovery's login return link from every step's submit action", () => {
    expect(forgot).toMatch(/<\/form>\s*<\/template>\s*<div v-else class="auth-success-state">/);
    expect(forgot).toContain('v-if="step < 4" class="auth-switch-copy auth-switch-copy--recovery"');
    expect(styles).toMatch(/\.auth-switch-copy--recovery\s*\{[^}]*margin-top: 1\.5rem;/);
    expect(forgot).toContain('to="/_auth/login"');
  });
});
