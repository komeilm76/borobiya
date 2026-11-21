import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapPointElement, MAP_POINT_META, pointLabelPlacement, positionMapPointLabels } from "./map-point";

afterEach(() => vi.unstubAllGlobals());

describe("shared semantic map points", () => {
  it("gives each role a visible mark rather than relying on a color key", () => {
    expect(new Set(Object.values(MAP_POINT_META).map((item) => item.glyph)).size).toBeGreaterThan(5);
    expect(MAP_POINT_META).toMatchObject({ sos: { glyph: "!", icon: "mdi-alert" },
      start: { glyph: "A", icon: "mdi-navigation-variant" },
      end: { glyph: "B", icon: "mdi-flag-checkered" }, helper: { glyph: "✚", icon: "mdi-lifebuoy" },
      stop: { glyph: "1" } });
  });

  it("creates a keyboard-native point button without unsafe HTML and stops map-click propagation", () => {
    type FakeElement = { tag: string; type?: string; className: string; textContent: string;
      attrs: Record<string, string>; children: FakeElement[]; classList: { add(name: string): void };
      listener?: (event: { stopPropagation: () => void }) => void;
      setAttribute(name: string, value: string): void; append(node: FakeElement): void;
      addEventListener(name: string, listener: FakeElement["listener"]): void };
    const createElement = (tag: string): FakeElement => ({ tag, className: "", textContent: "", attrs: {}, children: [],
      classList: { add() {} }, setAttribute(name, value) { this.attrs[name] = value; }, append(node) { this.children.push(node); },
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
    expect(origin.children[0]?.children[0]?.className).toContain("mdi-navigation-variant");
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
      setAttribute: vi.fn(), removeAttribute: vi.fn(),
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
    expect(properties.get("--bb-point-label-y")).toBe("0px");
    expect(element.removeAttribute).toHaveBeenCalledWith("data-bb-point-edge");
  });

  it("clamps a vertically offscreen caption while leaving its glyph at the real point", () => {
    const properties = new Map<string, string>();
    const attrs = new Map<string, string>();
    const classes = new Set<string>();
    const label = { offsetParent: {}, getBoundingClientRect: () => ({
      left: 100, right: 200, top: classes.has("bb-map-point--label-flipped") ? -140 : -90,
      bottom: classes.has("bb-map-point--label-flipped") ? -115 : -65
    }) };
    const element = {
      getBoundingClientRect: () => ({ left: 128, right: 172, top: -130, bottom: -86 }),
      querySelector: () => label,
      classList: { add: (name: string) => classes.add(name), remove: (name: string) => classes.delete(name) },
      style: { setProperty: (name: string, value: string) => properties.set(name, value),
        removeProperty: (name: string) => properties.delete(name) },
      setAttribute: (name: string, value: string) => attrs.set(name, value),
      removeAttribute: (name: string) => attrs.delete(name)
    };
    const canvas = { getBoundingClientRect: () => ({ left: 0, right: 300, top: 0, bottom: 200 }) };
    positionMapPointLabels({ getCanvas: () => canvas } as never, [{ getElement: () => element } as never]);
    expect(properties.get("--bb-point-label-shift")).toBe("0px");
    expect(properties.get("--bb-point-label-y")).toBe("98px");
    expect(attrs.get("data-bb-point-edge")).toBe("top");
    expect(classes.has("bb-map-point--label-flipped")).toBe(false);
  });

  it("shows top and bottom edge cues for offscreen points without moving their coordinates", () => {
    const viewport = { left: 0, right: 300, top: 0, bottom: 200 };
    expect(pointLabelPlacement(viewport, { left: 120, right: 164, top: -130, bottom: -86 },
      { left: 95, right: 189, top: -115, bottom: -90 }))
      .toEqual({ x: 0, y: 123, edge: "top" });
    expect(pointLabelPlacement(viewport, { left: 120, right: 164, top: 275, bottom: 319 },
      { left: 95, right: 189, top: 310, bottom: 335 }))
      .toEqual({ x: 0, y: -143, edge: "bottom" });
    expect(pointLabelPlacement(viewport, { left: -80, right: -36, top: 100, bottom: 144 },
      { left: -55, right: 39, top: 145, bottom: 170 }))
      .toEqual({ x: 63, y: 0, edge: "left" });
    expect(pointLabelPlacement(viewport, { left: -80, right: -36, top: -5, bottom: 39 },
      { left: -55, right: 39, top: -30, bottom: -5 }).edge).toBe("left");
  });
});
