// Semantic map vocabulary for the user workspaces. Dispatch has a separate
// selected-incident-only WebGL label policy. Color and the key are secondary.
export type MapPointKind = "sos" | "start" | "end" | "helper" | "nearby" | "stop" | "requester" | "director";

export const MAP_POINT_META: Record<MapPointKind, { label: string; glyph: string }> = {
  sos: { label: "حادثه SOS", glyph: "!" },
  start: { label: "مبدأ مسیر", glyph: "A" },
  end: { label: "مقصد مسیر", glyph: "B" },
  helper: { label: "عضو امدادرسان", glyph: "✚" },
  nearby: { label: "امدادگر نزدیک", glyph: "+" },
  stop: { label: "ایستگاه میانی", glyph: "1" },
  requester: { label: "درخواست‌کننده", glyph: "د" },
  director: { label: "مدیر مرکز", glyph: "م" }
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

/** Keep short captions inside the actual map viewport during camera gestures.
 * The marker's geographical position and hit target remain unchanged. */
export function positionMapPointLabels(map: { getCanvas(): HTMLElement }, markers: readonly ({ getElement(): HTMLElement } | null)[]): void {
  const viewport = map.getCanvas().getBoundingClientRect();
  for (const marker of markers) {
    const element = marker?.getElement();
    const label = element?.querySelector<HTMLElement>(".bb-map-point__caption");
    if (!element || !label || label.offsetParent === null) continue;
    element.classList.remove("bb-map-point--label-flipped");
    element.style.removeProperty("--bb-point-label-shift");
    let rect = label.getBoundingClientRect();
    const roomAbove = element.getBoundingClientRect().top - viewport.top;
    const roomBelow = viewport.bottom - element.getBoundingClientRect().bottom;
    if (rect.top < viewport.top + 8 || rect.bottom > viewport.bottom - 8) {
      const currentlyAbove = rect.bottom <= element.getBoundingClientRect().top;
      if ((currentlyAbove && roomBelow > roomAbove) || (!currentlyAbove && roomAbove > roomBelow)) {
        element.classList.add("bb-map-point--label-flipped");
        rect = label.getBoundingClientRect();
      }
    }
    const shift = Math.min(viewport.right - 8 - rect.right, Math.max(viewport.left + 8 - rect.left, 0));
    element.style.setProperty("--bb-point-label-shift", `${Math.round(shift)}px`);
  }
}
