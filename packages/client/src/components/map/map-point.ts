import type { Map as MapLibreMap, Marker as MapLibreMarker } from "maplibre-gl";

// Semantic map vocabulary for the user workspaces. Dispatch has separate
// cluster-aware labels beside its WebGL pins. Color and the key are secondary.
export type MapPointKind = "sos" | "start" | "end" | "helper" | "nearby" | "stop" | "requester" | "director";

// Glyphs remain a font-independent fallback and the MapLibre WebGL symbol vocabulary
// on Dispatch. DOM markers use the matching pictograms for fast recognition.
export const MAP_POINT_META: Record<MapPointKind, { label: string; glyph: string; icon?: string }> = {
  sos: { label: "حادثه SOS", glyph: "!", icon: "mdi-alert" },
  start: { label: "مبدأ مسیر", glyph: "A", icon: "mdi-navigation-variant" },
  end: { label: "مقصد مسیر", glyph: "B", icon: "mdi-flag-checkered" },
  helper: { label: "عضو امدادرسان", glyph: "✚", icon: "mdi-lifebuoy" },
  nearby: { label: "امدادگر نزدیک", glyph: "+", icon: "mdi-account-search" },
  stop: { label: "ایستگاه میانی", glyph: "1" },
  requester: { label: "درخواست‌کننده", glyph: "د", icon: "mdi-account" },
  director: { label: "مدیر مرکز", glyph: "م", icon: "mdi-office-building" }
};

/** MapLibre owns the marker DOM. Never mount a second Vue app/canvas per pin. */
export function createMapPointElement(kind: MapPointKind, detail: string, options: {
  number?: number;
  /** Short visible name; never place verbose details or status on the map. */
  caption?: string;
  /** A received fix that is no longer fresh. Never fade the text or sign. */
  stale?: boolean;
  onActivate?: () => void;
} = {}): HTMLElement {
  const interactive = Boolean(options.onActivate);
  const element = document.createElement(interactive ? "button" : "div");
  if (interactive) (element as HTMLButtonElement).type = "button";
  element.className = `bb-map-point bb-map-point--${kind}${options.stale ? " bb-map-point--stale" : ""}`;
  const name = kind === "stop" && options.number
    ? `${MAP_POINT_META.stop.label} ${options.number.toLocaleString("fa-IR")}` : MAP_POINT_META[kind].label;
  element.setAttribute("aria-label", `${name}${options.caption ? `، ${options.caption}` : ""}${detail ? `؛ ${detail}` : ""}`);
  if (!interactive) element.setAttribute("role", "img");
  const sign = document.createElement("span");
  sign.className = "bb-map-point__sign";
  sign.setAttribute("aria-hidden", "true");
  const icon = MAP_POINT_META[kind].icon;
  if (icon) {
    // A hidden fallback text node becomes a second CSS-grid item and pushes
    // the visible pictogram toward the tip of the pin. Use exactly one glyph.
    sign.classList.add("bb-map-point__sign--icon");
    const pictogram = document.createElement("span");
    pictogram.className = `mdi ${icon} bb-map-point__icon`;
    pictogram.setAttribute("aria-hidden", "true");
    sign.append(pictogram);
  } else {
    sign.textContent = kind === "stop" && options.number ? options.number.toLocaleString("fa-IR") : MAP_POINT_META[kind].glyph;
  }
  element.append(sign);
  if (options.caption) {
    const caption = document.createElement("span");
    caption.className = "bb-map-point__caption";
    caption.dir = "auto";
    const nameText = document.createElement("span");
    nameText.className = "bb-map-point__caption-name";
    nameText.textContent = options.caption; // Never interpret a username as HTML.
    caption.append(nameText);
    if (options.stale) {
      const age = document.createElement("span");
      age.className = "bb-map-point__age";
      age.textContent = "قدیمی";
      caption.append(age);
    }
    caption.setAttribute("aria-hidden", "true"); // The marker's accessible name is complete above.
    element.append(caption);
  }
  if (interactive) {
    // A caption already sits above/below the pin. Adding a hover/focus tooltip
    // at the same position hides that caption (and selected-place callouts).
    if (!options.caption) {
      const tooltip = document.createElement("span");
      tooltip.className = "bb-map-point__tooltip";
      tooltip.textContent = detail || name;
      tooltip.setAttribute("aria-hidden", "true");
      element.append(tooltip);
    }
    element.addEventListener("click", (event) => { event.stopPropagation(); options.onActivate?.(); });
  }
  return element;
}

type PointRect = Pick<DOMRect, "left" | "right" | "top" | "bottom">;

/** The glyph stays on its real coordinate. Only the caption becomes a screen-edge
 * direction cue when its point leaves the viewport (including above/below). */
export function pointLabelPlacement(viewport: PointRect, anchor: PointRect, label: PointRect): {
  x: number; y: number; edge: "top" | "bottom" | "left" | "right" | null;
} {
  const margin = 8;
  const centerX = (anchor.left + anchor.right) / 2;
  const centerY = (anchor.top + anchor.bottom) / 2;
  const vertical = centerY < viewport.top ? viewport.top - centerY : centerY > viewport.bottom ? centerY - viewport.bottom : 0;
  const horizontal = centerX < viewport.left ? viewport.left - centerX : centerX > viewport.right ? centerX - viewport.right : 0;
  const edge = vertical && vertical / Math.max(1, viewport.bottom - viewport.top) >=
    horizontal / Math.max(1, viewport.right - viewport.left)
    ? centerY < viewport.top ? "top" : "bottom"
    : horizontal ? centerX < viewport.left ? "left" : "right" : null;
  return {
    x: Math.min(viewport.right - margin - label.right, Math.max(viewport.left + margin - label.left, 0)),
    y: Math.min(viewport.bottom - margin - label.bottom, Math.max(viewport.top + margin - label.top, 0)),
    edge
  };
}

type EdgeCueMap = Pick<MapLibreMap, "getCanvas" | "getZoom" | "flyTo">;
type EdgeCueMarker = Pick<MapLibreMarker, "getElement" | "getLngLat">;
type Edge = "top" | "bottom" | "left" | "right";
const edgeNames: Record<Edge, string> = { top: "بالا", bottom: "پایین", left: "چپ", right: "راست" };
const edgeCueStates = new WeakMap<HTMLElement, {
  map: EdgeCueMap; marker: EdgeCueMarker; element: HTMLElement; interactive: boolean;
  originalAriaLabel: string | null; originalRole: string | null;
  originalLabelHidden: string | null; edgeAriaLabel: string | null; active: boolean;
}>();

/** An offscreen caption in the user map is a real camera action, not a dead
 * decorative chip. Keep marker-button semantics when present; for noninteractive
 * image markers expose just the caption as a keyboard button. */
export function syncUserMapEdgeCue(map: EdgeCueMap, marker: EdgeCueMarker, label: HTMLElement, edge: Edge | null): void {
  // A shared MapCanvas can also be used by mission/inbox previews elsewhere.
  // Only the user workspace opts its edge labels into camera actions.
  if (!map.getCanvas().closest?.(".user-map-view")) return;
  const element = marker.getElement();
  let state = edgeCueStates.get(label);
  if (!state) {
    state = { map, marker, element, interactive: element.tagName === "BUTTON" || element.getAttribute("role") === "button",
      originalAriaLabel: element.getAttribute("aria-label"), originalRole: element.getAttribute("role"),
      originalLabelHidden: label.getAttribute("aria-hidden"), edgeAriaLabel: null, active: false };
    edgeCueStates.set(label, state);
    const activate = (event: Event, keyboard: boolean) => {
      if (!state!.element.hasAttribute("data-bb-point-edge")) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const { lng, lat } = state!.marker.getLngLat();
      state!.map.flyTo({ center: [lng, lat], zoom: Math.max(state!.map.getZoom(), 14),
        duration: typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 650 });
      if (keyboard) state!.map.getCanvas().focus({ preventScroll: true });
    };
    element.addEventListener("click", (event) => {
      if (event.target === label || label.contains(event.target as Node) || (state!.interactive && event.detail === 0))
        activate(event, event.detail === 0);
    }, true);
    element.addEventListener("keydown", (event) => {
      if (state!.interactive && event.target === element && (event.key === "Enter" || event.key === " "))
        activate(event, true);
    }, true);
    label.addEventListener("keydown", (event) => {
      if (!state!.interactive && (event.key === "Enter" || event.key === " ")) activate(event, true);
    });
    // A chip gesture should not start a MapLibre drag or map-tap action.
    for (const type of ["pointerdown", "mousedown", "touchstart"])
      label.addEventListener(type, (event) => {
        if (state!.element.hasAttribute("data-bb-point-edge")) event.stopPropagation();
      });
  }
  state.map = map; state.marker = marker;
  if (edge) {
    if (!state.active || !state.interactive || element.getAttribute("aria-label") !== state.edgeAriaLabel)
      state.originalAriaLabel = element.getAttribute("aria-label"); // Names can update while offscreen.
    const actionLabel = `${state.originalAriaLabel || label.querySelector(".bb-map-point__caption-name")?.textContent?.trim() || label.textContent?.trim() || "نقطه"}، بیرون از قاب نقشه در سمت ${edgeNames[edge]}، نمایش روی نقشه`;
    if (state.interactive) {
      element.setAttribute("aria-label", actionLabel);
      state.edgeAriaLabel = actionLabel;
    } else {
      element.setAttribute("role", "group");
      label.setAttribute("role", "button"); label.setAttribute("tabindex", "0");
      label.removeAttribute("aria-hidden"); label.setAttribute("aria-label", actionLabel);
    }
    state.active = true;
  } else if (state.active) {
    if (state.interactive) {
      // A reactive marker update may already have replaced the cue name.
      if (element.getAttribute("aria-label") === state.edgeAriaLabel) {
        if (state.originalAriaLabel === null) element.removeAttribute("aria-label");
        else element.setAttribute("aria-label", state.originalAriaLabel);
      }
    } else {
      if (state.originalRole === null) element.removeAttribute("role");
      else element.setAttribute("role", state.originalRole);
      label.removeAttribute("role"); label.removeAttribute("tabindex"); label.removeAttribute("aria-label");
      if (state.originalLabelHidden === null) label.removeAttribute("aria-hidden");
      else label.setAttribute("aria-hidden", state.originalLabelHidden);
    }
    state.active = false; state.edgeAriaLabel = null;
  }
}

/** Keep labels within the map frame even when the icon is offscreen. Never move
 * the MapLibre marker or change its coordinates. */
export function positionMapPointLabels(map: EdgeCueMap, markers: readonly (EdgeCueMarker | null)[]): void {
  const viewport = map.getCanvas().getBoundingClientRect();
  const verticalOverflow = (rect: PointRect) =>
    Math.max(0, viewport.top + 8 - rect.top) + Math.max(0, rect.bottom - viewport.bottom + 8);
  for (const marker of markers) {
    const element = marker?.getElement();
    const label = element?.querySelector<HTMLElement>(".bb-map-point__caption");
    if (!marker || !element || !label) continue;
    if (label.offsetParent === null) {
      // A named destination hides the generic caption; it owns a single
      // separate callout, which is positioned by the user map instead.
      if (map.getCanvas().closest?.(".user-map-view")) {
        element.removeAttribute("data-bb-point-edge");
        syncUserMapEdgeCue(map, marker, label, null);
      }
      continue;
    }
    element.classList.remove("bb-map-point--label-flipped");
    element.removeAttribute("data-bb-point-edge"); // Measure the on-map caption before trying its edge variant.
    element.style.removeProperty("--bb-point-label-shift");
    element.style.removeProperty("--bb-point-label-y");
    element.style.setProperty("--bb-point-edge-map-width", `${Math.max(44, viewport.right - viewport.left - 24)}px`);
    let rect = label.getBoundingClientRect();
    if (verticalOverflow(rect)) {
      element.classList.add("bb-map-point--label-flipped");
      const alternative = label.getBoundingClientRect();
      if (verticalOverflow(alternative) < verticalOverflow(rect)) rect = alternative;
      else element.classList.remove("bb-map-point--label-flipped");
    }
    const anchor = element.getBoundingClientRect();
    let { x, y, edge } = pointLabelPlacement(viewport, anchor, rect);
    if (edge) {
      element.setAttribute("data-bb-point-edge", edge);
      // The edge chip has a different size from the attached on-map caption.
      // Recheck its real box before clamping; never displace the geographic pin.
      ({ x, y } = pointLabelPlacement(viewport, anchor, label.getBoundingClientRect()));
    }
    element.style.setProperty("--bb-point-label-shift", `${Math.round(x)}px`);
    element.style.setProperty("--bb-point-label-y", `${Math.round(y)}px`);
    syncUserMapEdgeCue(map, marker, label, edge);
  }
}
