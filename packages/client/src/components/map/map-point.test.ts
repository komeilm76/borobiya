import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapPointElement, MAP_POINT_META } from "./map-point";

afterEach(() => vi.unstubAllGlobals());

describe("shared semantic map points", () => {
  it("gives each role a visible mark rather than relying on a color key", () => {
    expect(new Set(Object.values(MAP_POINT_META).map((item) => item.glyph)).size).toBeGreaterThan(5);
    expect(MAP_POINT_META).toMatchObject({ sos: { glyph: "!" }, start: { glyph: "A" },
      end: { glyph: "B" }, helper: { glyph: "✚" }, stop: { glyph: "1" } });
  });

  it("creates a keyboard-native point button without unsafe HTML and stops map-click propagation", () => {
    type FakeElement = { tag: string; type?: string; className: string; textContent: string;
      attrs: Record<string, string>; children: FakeElement[];
      listener?: (event: { stopPropagation: () => void }) => void;
      setAttribute(name: string, value: string): void; append(node: FakeElement): void;
      addEventListener(name: string, listener: FakeElement["listener"]): void };
    const createElement = (tag: string): FakeElement => ({ tag, className: "", textContent: "", attrs: {}, children: [],
      setAttribute(name, value) { this.attrs[name] = value; }, append(node) { this.children.push(node); },
      addEventListener(name, listener) { if (name === "click") this.listener = listener; } });
    vi.stubGlobal("document", { createElement });
    const activated = vi.fn();
    const point = createMapPointElement("stop", "<img src=x onerror=alert(1)>",
      { number: 2, onActivate: activated }) as unknown as FakeElement;
    expect(point.tag).toBe("button");
    expect(point.type).toBe("button");
    expect(point.attrs["aria-label"]).toContain("ایستگاه میانی ۲");
    expect(point.children[0]?.textContent).toBe("۲");
    expect(point.children[1]?.textContent).toBe("<img src=x onerror=alert(1)>");
    const stopPropagation = vi.fn();
    point.listener?.({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(activated).toHaveBeenCalledOnce();
    const origin = createMapPointElement("start", "نه موقعیت زنده") as unknown as FakeElement;
    expect(origin.tag).toBe("div");
    expect(origin.attrs.role).toBe("img");
  });
});
