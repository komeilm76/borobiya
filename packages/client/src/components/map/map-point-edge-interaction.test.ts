import { afterEach, describe, expect, it, vi } from "vitest";
import { positionMapPointLabels, syncUserMapEdgeCue } from "./map-point";

// DOM-free event/attribute double: the map point is MapLibre-owned DOM, not a Vue component.
class ElementDouble {
  readonly attributes = new Map<string, string>();
  readonly listeners = new Map<string, ((event: any) => void)[]>();
  textContent = "";
  tabIndex = -1;
  constructor(readonly tagName = "DIV") {}
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  hasAttribute(name: string) { return this.attributes.has(name); }
  addEventListener(name: string, listener: (event: any) => void) {
    this.listeners.set(name, [...this.listeners.get(name) ?? [], listener]);
  }
  querySelector() { return null; }
  contains() { return false; }
  fire(name: string, event: unknown) { for (const listener of this.listeners.get(name) ?? []) listener(event); }
}

function fixture(tagName = "DIV", role = "img", userMap = true) {
  const element = new ElementDouble(tagName);
  element.setAttribute("role", role);
  element.setAttribute("aria-label", "مکان انتخاب‌شده: آزمایش؛ نمایش مسیر");
  const label = new ElementDouble("SPAN");
  label.textContent = "آزمایش";
  label.setAttribute("aria-hidden", "true");
  const focus = vi.fn();
  const canvas = { closest: () => userMap ? {} : null, focus };
  const flyTo = vi.fn();
  const map = { getCanvas: () => canvas, getZoom: () => 12, flyTo };
  const setLngLat = vi.fn();
  const marker = { getElement: () => element, getLngLat: () => ({ lng: 51.4, lat: 35.7 }), setLngLat };
  const sync = (edge: "left" | "right" | "top" | "bottom" | null) => {
    if (edge) element.setAttribute("data-bb-point-edge", edge);
    else element.removeAttribute("data-bb-point-edge");
    syncUserMapEdgeCue(map as never, marker as never, label as never, edge);
  };
  const event = (target: ElementDouble, key?: string, detail = 1) => ({
    target, key, detail, preventDefault: vi.fn(), stopImmediatePropagation: vi.fn(), stopPropagation: vi.fn()
  });
  return { element, label, canvas, map, marker, flyTo, focus, setLngLat, sync, event };
}

afterEach(() => vi.unstubAllGlobals());

describe("user-map offscreen camera cues", () => {
  it("centers a noninteractive origin/GPS caption via click, Enter and Space, then restores its image semantics", () => {
    const f = fixture();
    f.sync("top");
    expect(f.element.getAttribute("role")).toBe("group");
    expect(f.label.getAttribute("role")).toBe("button");
    expect(f.label.getAttribute("tabindex")).toBe("0");
    expect(f.label.getAttribute("aria-hidden")).toBeNull();
    expect(f.label.getAttribute("aria-label")).toContain("بیرون از قاب نقشه در سمت بالا، نمایش روی نقشه");
    const click = f.event(f.label);
    f.element.fire("click", click);
    expect(click.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(f.flyTo).toHaveBeenCalledWith(expect.objectContaining({ center: [51.4, 35.7], zoom: 14 }));
    for (const key of ["Enter", " "]) {
      const keyboard = f.event(f.label, key);
      f.label.fire("keydown", keyboard);
      expect(keyboard.preventDefault).toHaveBeenCalledOnce();
    }
    expect(f.flyTo).toHaveBeenCalledTimes(3);
    expect(f.focus).toHaveBeenCalledTimes(2); // Keyboard focus moves to the map when the chip disappears.
    expect(f.setLngLat).not.toHaveBeenCalled();
    f.sync(null);
    expect(f.element.getAttribute("role")).toBe("img");
    expect(f.label.getAttribute("role")).toBeNull();
    expect(f.label.getAttribute("tabindex")).toBeNull();
    expect(f.label.getAttribute("aria-hidden")).toBe("true");
    f.element.fire("click", f.event(f.label));
    expect(f.flyTo).toHaveBeenCalledTimes(3);
  });

  it("intercepts only the offscreen caption/keyboard activation of an existing pin button, not on-map actions", () => {
    const f = fixture("BUTTON", "button");
    f.sync("right");
    expect(f.element.getAttribute("aria-label")).toContain("مکان انتخاب‌شده: آزمایش؛ نمایش مسیر، بیرون از قاب نقشه در سمت راست");
    expect(f.label.getAttribute("aria-hidden")).toBe("true");
    const pinClick = f.event(f.element);
    f.element.fire("click", pinClick);
    expect(pinClick.stopImmediatePropagation).not.toHaveBeenCalled(); // Pin's normal action still owns the sign.
    const chipClick = f.event(f.label);
    f.element.fire("click", chipClick);
    expect(chipClick.stopImmediatePropagation).toHaveBeenCalledOnce();
    const keyboard = f.event(f.element, "Enter");
    f.element.fire("keydown", keyboard);
    expect(keyboard.stopImmediatePropagation).toHaveBeenCalledOnce();
    expect(f.flyTo).toHaveBeenCalledTimes(2);
    f.element.setAttribute("aria-label", "نام تازهٔ همراه؛ موقعیت تازه");
    f.sync("left");
    expect(f.element.getAttribute("aria-label")).toContain("نام تازهٔ همراه؛ موقعیت تازه");
    f.sync(null);
    expect(f.element.getAttribute("aria-label")).toBe("نام تازهٔ همراه؛ موقعیت تازه");
    const onMap = f.event(f.label);
    f.element.fire("click", onMap);
    expect(onMap.stopImmediatePropagation).not.toHaveBeenCalled();
    expect(f.flyTo).toHaveBeenCalledTimes(2);
  });

  it("does not undo a new marker name when the generic caption is hidden for a named POI", () => {
    const f = fixture("BUTTON", "button");
    f.sync("left");
    f.element.setAttribute("aria-label", "مقصد انتخاب‌شده: نام جدید؛ نمایش جزئیات مسیر");
    f.sync(null);
    expect(f.element.getAttribute("aria-label")).toBe("مقصد انتخاب‌شده: نام جدید؛ نمایش جزئیات مسیر");
  });

  it("gives selected-place role buttons the same camera action without replacing their normal action", () => {
    const f = fixture("DIV", "button");
    f.sync("bottom");
    const space = f.event(f.element, " ");
    f.element.fire("keydown", space);
    expect(space.preventDefault).toHaveBeenCalledOnce();
    expect(f.flyTo).toHaveBeenCalledOnce();
    f.sync(null);
    expect(f.element.getAttribute("role")).toBe("button");
    expect(f.element.getAttribute("aria-label")).toBe("مکان انتخاب‌شده: آزمایش؛ نمایش مسیر");
  });

  it("wires the real placement path on camera moves without adding duplicate handlers", () => {
    const f = fixture();
    let offscreen = true;
    Object.assign(f.canvas, { getBoundingClientRect: () => ({ left: 0, right: 300, top: 0, bottom: 200 }) });
    Object.assign(f.label, { offsetParent: {}, getBoundingClientRect: () => offscreen
      ? { left: 100, right: 200, top: -115, bottom: -90 }
      : { left: 100, right: 200, top: 85, bottom: 110 } });
    Object.assign(f.element, {
      getBoundingClientRect: () => offscreen
        ? { left: 128, right: 172, top: -130, bottom: -86 }
        : { left: 128, right: 172, top: 70, bottom: 114 },
      querySelector: () => f.label,
      classList: { add() {}, remove() {} },
      style: { setProperty() {}, removeProperty() {} }
    });
    for (let i = 0; i < 3; i++) positionMapPointLabels(f.map as never, [f.marker as never]);
    expect(f.element.getAttribute("data-bb-point-edge")).toBe("top");
    expect(f.element.listeners.get("click")).toHaveLength(1);
    const click = f.event(f.label);
    f.element.fire("click", click);
    expect(f.flyTo).toHaveBeenCalledOnce();
    offscreen = false;
    positionMapPointLabels(f.map as never, [f.marker as never]);
    expect(f.element.getAttribute("data-bb-point-edge")).toBeNull();
    expect(f.label.getAttribute("role")).toBeNull();
    expect(f.setLngLat).not.toHaveBeenCalled();
  });

  it("leaves shared map points in other map workspaces unchanged", () => {
    const f = fixture("DIV", "img", false);
    f.sync("top");
    expect(f.label.getAttribute("role")).toBeNull();
    expect(f.label.getAttribute("aria-hidden")).toBe("true");
    expect(f.element.getAttribute("aria-label")).toBe("مکان انتخاب‌شده: آزمایش؛ نمایش مسیر");
    f.element.fire("click", f.event(f.label));
    expect(f.flyTo).not.toHaveBeenCalled();
  });
});
