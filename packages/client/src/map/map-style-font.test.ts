import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mapServer = new URL("../../../../map-server/", import.meta.url);
const fontStack = "Borobiya Vazirmatn";
const config = readFileSync(new URL("martin.yaml", mapServer), "utf8");
const readStyle = (theme: "light" | "dark") => JSON.parse(
  readFileSync(new URL(`styles/${theme}.json`, mapServer), "utf8")
) as { glyphs: string; layers: Array<{ id: string; layout?: { "text-field"?: unknown; "text-font"?: string[] } }> };

// Read the Windows Unicode BMP cmap (format 4) from the real TTF, not from a mock font.
// Only BMP characters are needed for these Persian/Latin regression samples.
function glyphIndex(font: Buffer, codepoint: number): number {
  const tableCount = font.readUInt16BE(4);
  let cmapOffset = -1;
  for (let index = 0; index < tableCount; index += 1) {
    const offset = 12 + index * 16;
    if (font.toString("ascii", offset, offset + 4) === "cmap") cmapOffset = font.readUInt32BE(offset + 8);
  }
  if (cmapOffset < 0) throw new Error("missing TrueType cmap table");
  for (let index = 0, count = font.readUInt16BE(cmapOffset + 2); index < count; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    if (font.readUInt16BE(record) !== 3 || font.readUInt16BE(record + 2) !== 1) continue;
    const subtable = cmapOffset + font.readUInt32BE(record + 4);
    if (font.readUInt16BE(subtable) !== 4) continue;
    const segments = font.readUInt16BE(subtable + 6) / 2;
    const ends = subtable + 14;
    const starts = ends + 2 * segments + 2;
    const deltas = starts + 2 * segments;
    const offsets = deltas + 2 * segments;
    for (let segment = 0; segment < segments; segment += 1) {
      const start = font.readUInt16BE(starts + 2 * segment);
      const end = font.readUInt16BE(ends + 2 * segment);
      if (codepoint < start || codepoint > end) continue;
      const delta = font.readInt16BE(deltas + 2 * segment);
      const rangeOffset = font.readUInt16BE(offsets + 2 * segment);
      const raw = rangeOffset === 0 ? codepoint : font.readUInt16BE(
        offsets + 2 * segment + rangeOffset + 2 * (codepoint - start)
      );
      return raw === 0 ? 0 : (raw + delta) & 0xffff;
    }
  }
  return 0;
}

// No mounted map/Vue instance; check the exact bundled face and every style layer.
describe("Persian and Latin map label font", () => {
  it("bundles the licensed Vazirmatn TTF used by Martin, with existing Noto fallbacks", () => {
    expect(config).toMatch(/Borobiya Vazirmatn:\s*\n\s+- Vazirmatn Regular\s*\n\s+- Noto Sans Regular\s*\n\s+- Noto Naskh Arabic Regular/);
    const font = readFileSync(new URL("fonts/Vazirmatn-Regular.ttf", mapServer));
    expect(font.subarray(0, 4).toString("hex")).toBe("00010000"); // TrueType/OpenType sfnt.
    expect(createHash("sha256").update(font).digest("hex"))
      .toBe("b69fd4c680b8f3f225feabcc655a2c585d97627b8f5f5c0f9985e894069f3a56");
    expect(readFileSync(new URL("fonts/Vazirmatn-OFL.txt", mapServer), "utf8"))
      .toContain("Copyright 2015 The Vazirmatn Project Authors");
  });

  it("contains Persian letters/digits and English map-name glyphs in the primary face", () => {
    const font = readFileSync(new URL("fonts/Vazirmatn-Regular.ttf", mapServer));
    for (const text of ["تهران", "خیابان", "۱۲۳", "Street", "Berlin", "Straße", "İstanbul"]) {
      for (const character of text) {
        expect(glyphIndex(font, character.codePointAt(0)!), `${text}: ${character}`).toBeGreaterThan(0);
      }
    }
    // Preserve coverage for names outside Vazirmatn's more compact repertoire.
    const notoSans = readFileSync(new URL("fonts/NotoSans-Regular.ttf", mapServer));
    const notoArabic = readFileSync(new URL("fonts/NotoNaskhArabic-Regular.ttf", mapServer));
    expect(glyphIndex(font, "ƀ".codePointAt(0)!)).toBe(0);
    expect(glyphIndex(notoSans, "ƀ".codePointAt(0)!)).toBeGreaterThan(0);
    expect(glyphIndex(font, "؋".codePointAt(0)!)).toBe(0);
    expect(glyphIndex(notoArabic, "؋".codePointAt(0)!)).toBeGreaterThan(0);
  });

  it.each(["light", "dark"] as const)("requests the new local glyph stack in %s map labels", (theme) => {
    const style = readStyle(theme);
    expect(style.glyphs).toBe("/font/{fontstack}/{range}");
    const labels = style.layers.filter(layer => layer.layout && "text-field" in layer.layout);
    expect(labels.length).toBeGreaterThanOrEqual(8);
    for (const layer of labels) expect(layer.layout?.["text-font"], layer.id).toEqual([fontStack]);
  });
});
