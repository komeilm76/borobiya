import { readFileSync } from "node:fs";
import { compileStyle, parse } from "vue/compiler-sfc";
import { describe, expect, it } from "vitest";

const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const file = new URL("./AccountProfileMenu.vue", import.meta.url);

// Source/compiled-style checks only: the repo convention forbids mounting Vue SFCs in unit tests.
describe("shell profile and appearance menu", () => {
  it("moves theme and sign-out below the authenticated profile, without losing guest appearance and login", () => {
    const source = readFileSync(file, "utf8");
    expect(app).toContain("<AccountProfileMenu");
    expect(app).not.toContain('class="theme-toggle"');
    expect(app).not.toContain('class="login-button" color="primary" variant="tonal"');
    expect(app).toContain('@request-logout="logoutConfirmation.request()"');
    expect(app).toContain(':is-dark="appTheme.isDark"');
    expect(app).toContain(':model-value="logoutConfirmation.open.value"');
    expect(source).toContain('aria-label="انتخاب پوسته"');
    expect(source).toContain("اکنون {{ isDark ? 'تیره' : 'روشن' }}");
    expect(source).toContain(':aria-pressed="preference === option.value"');
    expect(source).toContain("emit('change-theme', option.value)");
    expect(source).toContain("emit('request-logout')");
    expect(source).toContain('to="/_auth/login"');
    expect(source).toContain("{{ user.username }}");
    expect(source).toContain("{{ roleLabel }}");
    expect(source).toContain("v-if=\"authenticated\"");
    expect(source).toContain(":close-on-content-click=\"false\"");
    expect(source).toContain('watch([() => props.authenticated, () => props.user?.id]');
    expect(source).not.toContain('watch(() => [props.authenticated, props.user?.id]');
    expect(source).toContain("max-height: calc(100dvh");
  });

  it("keeps the avatar and every popover action usable on narrow and short screens", () => {
    const source = readFileSync(file, "utf8");
    const { descriptor } = parse(source, { filename: file.pathname });
    const compiled = compileStyle({ source: descriptor.styles[0]!.content, id: "data-v-account-audit", scoped: true, filename: file.pathname });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain("min-width: 44px");
    expect(compiled.code).toContain("min-height: 44px");
    expect(compiled.code).toContain("max-width: calc(100vw - 16px)");
    expect(compiled.code).toContain("overflow-y: auto");
    expect(compiled.code).toContain(".account-profile__name[data-v-account-audit]");
  });
});
