import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { audienceContentType, audienceDetails, audienceTypography, typography } from "./tokens";

const auth = readFileSync(new URL("./auth.css", import.meta.url), "utf8");
const publicCss = readFileSync(new URL("./public.css", import.meta.url), "utf8");

// Source-level styles only: docs/TASKS.md prohibits mounting Vue SFCs in unit tests.
describe("guest and account page typography", () => {
  it("bounds every explicit font size on these pages, without shrinking captions or form help below 0.8rem", () => {
    for (const [name, css] of [["auth", auth], ["public", publicCss]] as const) {
      const declarations = [...css.matchAll(/font-size:\s*([^;]+);/g)];
      expect(declarations.length, name).toBeGreaterThan(20);
      for (const declaration of declarations) {
        const audienceRole = declaration[1]!.match(/var\(--bb-audience-font-([a-zA-Z]+)\)/)?.[1] as keyof typeof audienceTypography | undefined;
        const contentRole = declaration[1]!.match(/var\(--bb-content-font-([a-zA-Z]+)\)/)?.[1] as keyof typeof audienceContentType.sizes | undefined;
        const value = audienceRole ? audienceTypography[audienceRole]
          : contentRole ? audienceContentType.sizes[contentRole]
          : declaration[1] === "var(--bb-font-body)" ? typography.sizes.body : declaration[1]!;
        const rems = [...value.matchAll(/([\d.]+)rem/g)].map((match) => Number(match[1]));
        expect(rems.length, `${name}: ${declaration[0]}`).toBeGreaterThan(0);
        expect(Math.min(...rems), `${name}: ${declaration[0]}`).toBeGreaterThanOrEqual(0.8);
        expect(Math.max(...rems), `${name}: ${declaration[0]}`).toBeLessThanOrEqual(2.85);
      }
      expect(css).not.toContain("letter-spacing: -0.05em"); // Avoid squeezing joined Persian letters.
    }
  });

  it("keeps all auth display titles, including onboarding, smaller at desktop, tablet and phone widths", () => {
    expect(audienceContentType.sizes.hero).toBe("clamp(2rem, 3vw, 2.85rem)");
    expect(auth).toContain("font-size: var(--bb-content-font-hero)");
    expect(auth).toContain("font-size: var(--bb-content-font-heroTablet)");
    expect(auth).toContain("font-size: var(--bb-content-font-heroPhone)");
    expect(auth).toContain(".auth-card-heading h2,\n.auth-success-state h2");
    expect(auth).toContain("font-size: var(--bb-content-font-formHeading);");
    expect(auth).toContain(".auth-form .v-input__details {\n  padding-inline: var(--bb-rhythm-r080);\n  font-size: var(--bb-content-font-caption);");
    for (const view of ["LoginView.vue", "RegisterView.vue", "ForgotPasswordView.vue", "../_user/CompleteSecurityQuestionsView.vue"]) {
      expect(readFileSync(new URL(`../views/_auth/${view}`, import.meta.url), "utf8")).toContain('class="auth-hero-title"');
    }
  });

  it("scales the public hero, sections and status headings without losing mobile legibility", () => {
    expect(publicCss).toContain("font-size: var(--bb-content-font-hero)");
    expect(publicCss).not.toContain("max-width: 13ch"); // Let Persian lines wrap to the actual column width.
    expect(publicCss).toContain("font-size: var(--bb-content-font-publicHeroPhone)");
    expect(publicCss).toContain("font-size: var(--bb-content-font-section)");
    expect(publicCss).toContain("font-size: var(--bb-content-font-notFound)");
    expect(audienceDetails.light.publicValueCopy).toBe("#556e68");
    expect(audienceDetails.light.publicHealthSmall).toBe("#4c6962");
    expect(publicCss).toContain(".public-value p, .public-steps li p { margin: 0; color: var(--bb-detail-publicValueCopy); font-size: var(--bb-content-font-lead);");
    expect(publicCss).toContain(".public-health__body small { display: block; margin-top: var(--bb-rhythm-r070); color: var(--bb-detail-publicHealthSmall); font-size: var(--bb-content-font-supporting); }");
  });
});
