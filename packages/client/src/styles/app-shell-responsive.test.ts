import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned layout checks; repo convention forbids mounting Vue SFCs in unit tests.
const app = readFileSync(new URL("../App.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");

describe("global shell at narrow widths", () => {
  it("keeps theme, proposal inbox, sections and logout reachable while collapsing the redundant brand text", () => {
    expect(app).toContain('class="brand-link" to="/_public/landing" aria-label="بازگشت به صفحهٔ اصلی بوروبیا"');
    expect(app).toContain('class="theme-toggle"');
    expect(app).toContain('aria-label="پیشنهادهای مأموریت"');
    expect(app).toContain('aria-label="باز کردن فهرست بخش‌ها"');
    expect(app).toContain('class="login-button" color="primary" variant="tonal"');
    const phone = shell.split("@media (max-width: 420px) {")[1]?.split("\n}")[0];
    expect(phone).toBeDefined();
    expect(phone).toContain(".brand-copy { display: none; }");
    expect(phone).toContain(".login-button { margin-inline-start: 0;");
    expect(phone).toContain(".app-topbar .v-toolbar__content { padding-inline:");
  });

  it("keeps the logout action reachable on short, narrow screens without changing the confirmation lock", () => {
    expect(app).toMatch(/<v-dialog[\s\S]*?:model-value="logoutConfirmation\.open\.value"[\s\S]*?scrollable[\s\S]*?:persistent="logoutConfirmation\.submitting\.value"/);
    expect(app).toContain('<v-card-actions class="logout-confirm-actions">');
    expect(app).toContain(':disabled="logoutConfirmation.submitting.value" @click="logoutConfirmation.cancel()"');
    expect(app).toContain('@click="logoutConfirmation.confirm()"');
    const phone = app.split("@media (max-width: 599px) {")[1]?.split("\n}")[0];
    expect(phone).toBeDefined();
    expect(phone).toContain(".logout-confirm-actions { flex-direction: column; align-items: stretch;");
    expect(phone).toContain(".logout-confirm-actions :deep(.v-spacer) { display: none; }");
    expect(phone).toContain(".logout-confirm-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px;");
    expect(phone).toContain(".logout-confirm-actions :deep(.v-btn__content) { white-space: normal;");
  });
});
