import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapPointElement, MAP_POINT_META, positionMapPointLabels } from "./map-point";

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
    const origin = createMapPointElement("start", "نه موقعیت زنده", { caption: "<مبدأ>" }) as unknown as FakeElement;
    expect(origin.tag).toBe("div");
    expect(origin.attrs.role).toBe("img");
    expect(origin.children[1]?.children[0]?.textContent).toBe("<مبدأ>");
    expect(origin.children[1]?.attrs["aria-hidden"]).toBe("true");
    const stale = createMapPointElement("requester", "موقعیت قدیمی", { caption: "درخواست‌کننده", stale: true }) as unknown as FakeElement;
    expect(stale.className).toContain("bb-map-point--stale");
    expect(stale.attrs["aria-label"]).toContain("موقعیت قدیمی");
    expect(stale.children[1]?.children.map((child) => child.textContent)).toEqual(["درخواست‌کننده", "قدیمی"]);
    expect(stale.children[1]?.attrs["aria-hidden"]).toBe("true");
  });

  it("keeps a caption on-screen without moving its marker or hit target", () => {
    const properties = new Map<string, string>();
    const classes = new Set<string>();
    const label = { offsetParent: {}, getBoundingClientRect: () => ({
      left: 260, right: 340, top: classes.has("bb-map-point--label-flipped") ? 44 : 100,
      bottom: classes.has("bb-map-point--label-flipped") ? 69 : 125
    }) };
    const element = {
      querySelector: (selector: string) => selector === ".bb-map-point__caption" ? label : null,
      classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
      style: { setProperty: (name: string, value: string) => properties.set(name, value),
        removeProperty: (name: string) => properties.delete(name) },
      getBoundingClientRect: () => ({ top: 75, bottom: 119 })
    };
    const map = { getCanvas: () => ({ getBoundingClientRect: () => ({ left: 0, right: 300, top: 0, bottom: 120 }) }) };
    positionMapPointLabels(map as never, [{ getElement: () => element } as never]);
    expect(classes.has("bb-map-point--label-flipped")).toBe(true);
    expect(properties.get("--bb-point-label-shift")).toBe("-48px");
  });
});
