import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileTemplate, parse } from "vue/compiler-sfc";

// Source-level: docs/TASKS.md prohibits mounting Vue SFCs in unit tests.
const css = readFileSync(new URL("../../styles/auth.css", import.meta.url), "utf8");
const login = readFileSync(new URL("./LoginView.vue", import.meta.url), "utf8");
const register = readFileSync(new URL("./RegisterView.vue", import.meta.url), "utf8");
const recovery = readFileSync(new URL("./ForgotPasswordView.vue", import.meta.url), "utf8");

describe("auth actions and password direction", () => {
  it("keeps the Persian form RTL but makes only password values LTR, even when revealed", () => {
    for (const [view, names] of [[login, ["password"]], [register, ["password", "confirmPassword"]],
      [recovery, ["newPassword", "confirmPassword"]]] as const) {
      for (const name of names) {
        const fieldStart = view.lastIndexOf("<v-text-field", view.indexOf(`v-model="${name}"`));
        const field = view.slice(fieldStart, view.indexOf("/>", fieldStart));
        expect(field).toContain('<v-text-field class="auth-password-field"');
        expect(field).toContain(':type="showPassword ? \'text\' : \'password\'"');
        expect(field).not.toContain('dir="ltr"'); // Don't reverse Persian labels or icons.
      }
    }
    expect(css).toContain('.auth-password-field .v-field__input {\n  direction: ltr;\n  text-align: left;');
    expect(login).toContain('dir="ltr"'); // Existing username direction stays unchanged.
  });

  it("makes Login's password reveal a labeled keyboard button with a 44px touch target", () => {
    expect(login).toContain('<template #append-inner>');
    expect(login).toContain('class="auth-password-reveal" type="button" variant="text"');
    expect(login).toContain(":aria-label=\"showPassword ? 'پنهان کردن گذرواژه' : 'نمایش گذرواژه'\"");
    expect(login).toContain(':aria-pressed="showPassword" :disabled="submitting"');
    expect(login).not.toContain('@click:append-inner');
    expect(css).toContain('.auth-password-reveal.v-btn { min-width: 44px; width: 44px; height: 44px; }');
    expect(css).toContain('.auth-password-reveal.v-btn:focus-visible');
    expect(compileTemplate({ filename: 'LoginView.vue', id: 'auth-reveal',
      source: parse(login).descriptor.template!.content }).errors).toEqual([]);
  });

  it("balances Back and Restart with the submit action in both recovery steps", () => {
    expect(recovery).toContain('class="auth-back" variant="tonal" size="large" rounded="lg" :disabled="submitting" @click="step = 1"');
    expect(recovery).toContain('class="auth-back" variant="tonal" size="large" rounded="lg" :disabled="submitting" @click="restartRecovery"');
    expect(recovery.match(/class="auth-submit auth-submit-inline"/g)).toHaveLength(2);
    expect(css).toContain('.auth-button-row .auth-back,\n.auth-button-row .auth-submit-inline {\n  flex: 1 1 0;\n  min-width: 0;\n  min-height: 52px;\n  height: auto;');
    expect(css).toContain('.auth-button-row .auth-submit { margin-top: 0; }');
    expect(css).toContain('.auth-button-row .v-btn__content { white-space: normal; text-align: center; }');
  });
});
