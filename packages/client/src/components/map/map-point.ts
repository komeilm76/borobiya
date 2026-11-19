// Semantic map vocabulary shared by the dispatch and user workspaces. The short
// mark is readable on the point itself; color and an optional key are secondary.
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
  onActivate?: () => void;
} = {}): HTMLElement {
  const interactive = Boolean(options.onActivate);
  const element = document.createElement(interactive ? "button" : "div");
  if (interactive) (element as HTMLButtonElement).type = "button";
  element.className = `bb-map-point bb-map-point--${kind}`;
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
    caption.textContent = options.caption; // Never interpret a username as HTML.
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
