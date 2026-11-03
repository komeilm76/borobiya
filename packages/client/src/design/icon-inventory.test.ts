import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The design folder owns the icon catalogue (`design/icons`), and this test is what keeps it from going stale.
 *
 * An `mdi-*` name is a string with no compile step: a new icon in a component is invisible in the design folder
 * unless the catalogue is regenerated, and a misspelled name renders as a blank box in every browser. Both were
 * true here — `mdi-sparkles` in the placeholder page does not exist in the shipped webfont — so the catalogue is
 * compared with the code, and the code is compared with the font.
 */

const CLIENT = new URL("../../", import.meta.url);
const REPO = new URL("../../../../", import.meta.url);
const catalogue = JSON.parse(readFileSync(new URL("design/icons/icons.json", REPO), "utf8")) as {
  icons: Array<{ name: string; role: string; roles: string[]; files: string[] }>;
  totals: { icons: number; usages: number; files: number };
};
const fontCss = readFileSync(
  new URL("design/map-page/_generator/assets/materialdesignicons.css", REPO),
  "utf8"
);

function fontNames(): Set<string> {
  return new Set([...fontCss.matchAll(/\.mdi-([a-z0-9-]+)::before/g)].map((match) => match[1]!));
}

const SRC = fileURLToPath(CLIENT);

/** Every `.vue` / `.ts` file under `src`, skipping tests — a name in a test is not a rendered icon. */
function walk(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(path);
    return /\.(vue|ts)$/.test(entry.name) && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

/** Every icon name the client's non-test sources mention, by file. */
function clientIcons(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const path of walk(SRC)) {
    const text = readFileSync(path, "utf8");
    const file = relative(SRC, path).split(/[\\/]/).join("/");
    for (const match of text.matchAll(/mdi-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
      const set = found.get(match[0]) ?? new Set<string>();
      set.add(file);
      found.set(match[0], set);
    }
  }
  return found;
}

describe("icon catalogue", () => {
  const inCode = clientIcons();
  const catalogued = new Set(catalogue.icons.map((icon) => icon.name));

  it("lists every icon the client renders", () => {
    const missing = [...inCode.keys()].filter((name) => !catalogued.has(name)).sort();
    // A miss means someone added an icon and did not run `python render.py` in design/icons/_generator.
    expect(missing, "run `python render.py` in design/icons/_generator").toEqual([]);
  });

  it("does not keep icons the client no longer uses", () => {
    const stale = catalogue.icons.filter((icon) => !inCode.has(icon.name)).map((icon) => icon.name);
    expect(stale, "regenerate the catalogue; it still lists removed icons").toEqual([]);
  });

  it("only uses names the shipped Material Design Icons webfont carries", () => {
    const known = fontNames();
    expect(known.size).toBeGreaterThan(7000);
    // A name that is not here draws as a blank box at runtime: no build step catches it.
    const unknown = [...inCode.keys()].filter((name) => !known.has(name.replace(/^mdi-/, ""))).sort();
    expect(unknown).toEqual([]);
  });

  it("records every catalogue icon with a role and at least one file", () => {
    for (const icon of catalogue.icons) {
      expect(icon.role, icon.name).toBeTruthy();
      expect(icon.roles.length, icon.name).toBeGreaterThan(0);
      expect(icon.roles, icon.name).toContain(icon.role);
      expect(icon.files.length, icon.name).toBeGreaterThan(0);
      // Files are recorded client-relative so the catalogue can be read next to the component.
      expect(icon.files[0]).not.toContain("/src/");
    }
    expect(catalogue.totals.icons).toBe(catalogue.icons.length);
  });
});
