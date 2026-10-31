import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auth = readFileSync(new URL("./auth.css", import.meta.url), "utf8");
const publicCss = readFileSync(new URL("./public.css", import.meta.url), "utf8");

// Source-level styles only: docs/TASKS.md prohibits mounting Vue SFCs in unit tests.
describe("guest and account page typography", () => {
  it("bounds every explicit font size on these pages, without shrinking captions or form help below 0.8rem", () => {
    for (const [name, css] of [["auth", auth], ["public", publicCss]] as const) {
      const declarations = [...css.matchAll(/font-size:\s*([^;]+);/g)];
      expect(declarations.length, name).toBeGreaterThan(20);
      for (const declaration of declarations) {
        const rems = [...declaration[1]!.matchAll(/([\d.]+)rem/g)].map((match) => Number(match[1]));
        expect(rems.length, `${name}: ${declaration[0]}`).toBeGreaterThan(0);
        expect(Math.min(...rems), `${name}: ${declaration[0]}`).toBeGreaterThanOrEqual(0.8);
        expect(Math.max(...rems), `${name}: ${declaration[0]}`).toBeLessThanOrEqual(2.85);
      }
      expect(css).not.toContain("letter-spacing: -0.05em"); // Avoid squeezing joined Persian letters.
    }
  });

  it("keeps all auth display titles, including onboarding, smaller at desktop, tablet and phone widths", () => {
    expect(auth).toContain("font-size: clamp(2rem, 3vw, 2.85rem)");
    expect(auth).toContain("font-size: clamp(1.9rem, 3.8vw, 2.5rem)");
    expect(auth).toContain("font-size: clamp(1.75rem, 5vw, 1.95rem)");
    expect(auth).toContain(".auth-card-heading h2,\n.auth-success-state h2");
    expect(auth).toContain("font-size: 1.2rem;");
    expect(auth).toContain(".auth-form .v-input__details {\n  padding-inline: 0.8rem;\n  font-size: 0.82rem;");
    for (const view of ["LoginView.vue", "RegisterView.vue", "ForgotPasswordView.vue", "../_user/CompleteSecurityQuestionsView.vue"]) {
      expect(readFileSync(new URL(`../views/_auth/${view}`, import.meta.url), "utf8")).toContain('class="auth-hero-title"');
    }
  });

  it("scales the public hero, sections and status headings without losing mobile legibility", () => {
    expect(publicCss).toContain("font-size: clamp(2rem, 3vw, 2.85rem)");
    expect(publicCss).not.toContain("max-width: 13ch"); // Let Persian lines wrap to the actual column width.
    expect(publicCss).toContain("font-size: clamp(1.9rem, 6.5vw, 2.15rem)");
    expect(publicCss).toContain("font-size: clamp(1.55rem, 2.15vw, 2.1rem)");
    expect(publicCss).toContain("font-size: clamp(1.7rem, 2.3vw, 2.25rem)");
    expect(publicCss).toContain(".public-value p, .public-steps li p { margin: 0; color: #556e68; font-size: 0.94rem;");
    expect(publicCss).toContain(".public-health__body small { display: block; margin-top: 0.7rem; color: #4c6962; font-size: 0.84rem; }");
  });
});
