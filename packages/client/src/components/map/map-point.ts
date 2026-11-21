// Semantic map vocabulary for the user workspaces. Dispatch has a separate
// selected-incident-only WebGL label policy. Color and the key are secondary.
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
  sign.textContent = kind === "stop" && options.number ? options.number.toLocaleString("fa-IR") : MAP_POINT_META[kind].glyph;
  sign.setAttribute("aria-hidden", "true");
  const icon = MAP_POINT_META[kind].icon;
  if (icon) {
    sign.classList.add("bb-map-point__sign--icon");
    const pictogram = document.createElement("span");
    pictogram.className = `mdi ${icon} bb-map-point__icon`;
    pictogram.setAttribute("aria-hidden", "true");
    sign.append(pictogram);
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
    const tooltip = document.createElement("span");
    tooltip.className = "bb-map-point__tooltip";
    tooltip.textContent = detail || name;
    tooltip.setAttribute("aria-hidden", "true");
    element.append(tooltip);
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

/** Keep labels within the map frame even when the icon is offscreen. Never move
 * the MapLibre marker, change its coordinates, or expand its tappable area. */
export function positionMapPointLabels(map: { getCanvas(): HTMLElement }, markers: readonly ({ getElement(): HTMLElement } | null)[]): void {
  const viewport = map.getCanvas().getBoundingClientRect();
  const verticalOverflow = (rect: PointRect) =>
    Math.max(0, viewport.top + 8 - rect.top) + Math.max(0, rect.bottom - viewport.bottom + 8);
  for (const marker of markers) {
    const element = marker?.getElement();
    const label = element?.querySelector<HTMLElement>(".bb-map-point__caption");
    if (!element || !label || label.offsetParent === null) continue;
    element.classList.remove("bb-map-point--label-flipped");
    element.style.removeProperty("--bb-point-label-shift");
    element.style.removeProperty("--bb-point-label-y");
    let rect = label.getBoundingClientRect();
    if (verticalOverflow(rect)) {
      element.classList.add("bb-map-point--label-flipped");
      const alternative = label.getBoundingClientRect();
      if (verticalOverflow(alternative) < verticalOverflow(rect)) rect = alternative;
      else element.classList.remove("bb-map-point--label-flipped");
    }
    const { x, y, edge } = pointLabelPlacement(viewport, element.getBoundingClientRect(), rect);
    element.style.setProperty("--bb-point-label-shift", `${Math.round(x)}px`);
    element.style.setProperty("--bb-point-label-y", `${Math.round(y)}px`);
    if (edge) element.setAttribute("data-bb-point-edge", edge);
    else element.removeAttribute("data-bb-point-edge");
  }
}
