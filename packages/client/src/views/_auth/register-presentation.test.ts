import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./RegisterView.vue", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../styles/auth.css", import.meta.url), "utf8");

// Source-level checks: this project does not mount .vue components in unit tests.
describe("registration presentation", () => {
  it("separates the sign-in prompt from the submit button without changing other auth pages", () => {
    expect(view).toMatch(/<\/form>\s*<p class="auth-switch-copy">/);
    expect(styles).toMatch(/\.auth-card-register \.auth-form \+ \.auth-switch-copy\s*\{\s*margin-top: 1\.5rem;/);
  });

  it("renders the question-count chip with Persian digits at zero and five", () => {
    expect(new Intl.NumberFormat("fa-IR").format(0)).toBe("۰");
    expect(new Intl.NumberFormat("fa-IR").format(5)).toBe("۵");
    expect(view).toContain("{{ faNumber(selectedCount) }} از ۵");
  });
});
