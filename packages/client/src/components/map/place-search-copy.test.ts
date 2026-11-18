import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./PlaceSearchPanel.vue", import.meta.url), "utf8");

// Source/compiled-template contracts only: never mount Vue SFCs in unit tests.
describe("place search error guidance", () => {
  it("keeps technical diagnostics available for support without showing them as primary user advice", () => {
    const template = parse(source).descriptor.template!.content;
    expect(compileTemplate({ source: template, filename: "PlaceSearchPanel.vue", id: "search-copy" }).errors).toEqual([]);
    expect(template).toContain("جست‌وجو با تنظیمات فعلی کامل نشد؛ نتایج ناقص نمایش داده نمی‌شوند.");
    expect(template).toContain("محدوده یا واژهٔ جست‌وجو را تغییر دهید");
    expect(template).toContain("سرویس جست‌وجوی مکان فعلاً در دسترس نیست");
    expect(template).not.toMatch(/۵ و ۳۰ نتیجه|فتون|نسخهٔ درگاه نقشه را با برنامه به‌روزرسانی کنید/);
    const details = template.match(/<details class="place-search__diagnostic-details">([\s\S]*?)<\/details>/)?.[1];
    expect(details).toBeDefined();
    expect(details).toContain("جزئیات فنی برای پشتیبانی");
    expect(details).toContain("<code dir=\"ltr\">{{ api.diagnostic.value }}</code>");
    expect(details).toContain("@click=\"copyDiagnostic\"");
    expect(source).toContain(".place-search__diagnostic-details summary:focus-visible");
  });
});
