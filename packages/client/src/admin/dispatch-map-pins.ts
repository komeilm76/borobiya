import type { Map as MapLibreMap } from "maplibre-gl";
import { SOS_MAP_MARKER_COLORS } from "./sos-alerts";

/** Selection identifies the incident in red; severity remains in the queue,
 * unselected pins, legend and selected label accent instead of turning a fire pin blue. */
export const SELECTED_SOS_COLOR = SOS_MAP_MARKER_COLORS.high;
export function isFireIncidentLabel(label: string): boolean {
  return /آتش|حریق|fire/iu.test(label);
}

/** Real on-map MapLibre image assets, not legend-only swatches. The bottom tip is
 * the geographic anchor; generated locally so no network image or sprite is needed. */
export const DISPATCH_PIN_IMAGES = {
  high: "bb-dispatch-sos-high",
  medium: "bb-dispatch-sos-medium",
  low: "bb-dispatch-sos-low",
  selectedHigh: "bb-dispatch-sos-selected-high",
  selectedMedium: "bb-dispatch-sos-selected-medium",
  selectedLow: "bb-dispatch-sos-selected-low",
  selectedFire: "bb-dispatch-sos-selected-fire",
  helper: "bb-dispatch-responder",
  selectedHelper: "bb-dispatch-responder-selected"
} as const;

export function sosPinImage(status: string, severity: "high" | "medium" | "low", selected: boolean,
  fireIncident = false): string {
  const level = status === "cancelled_by_rescuer" ? "high" : severity;
  if (selected && fireIncident) return DISPATCH_PIN_IMAGES.selectedFire;
  return selected ? DISPATCH_PIN_IMAGES[({ high: "selectedHigh", medium: "selectedMedium", low: "selectedLow" } as const)[level]]
    : DISPATCH_PIN_IMAGES[level];
}

export class DispatchPinCanvasUnavailable extends Error {}

export function drawDispatchPin(color: string, kind: "sos" | "helper", selected = false,
  canvas: HTMLCanvasElement = document.createElement("canvas"), pictogram: "alert" | "flame" = "alert"): ImageData {
  canvas.width = 64;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new DispatchPinCanvasUnavailable("2D canvas is required for dispatch map pins.");
  // A substantial, outlined teardrop: the thin rim and distinct interior pictogram
  // remain recognizable on both light and dark raster tiles at zoom 10–18.
  ctx.beginPath();
  ctx.moveTo(32, 68);
  ctx.bezierCurveTo(22, 56, 9, 43, 9, 26);
  ctx.bezierCurveTo(9, 12, 19, 4, 32, 4);
  ctx.bezierCurveTo(45, 4, 55, 12, 55, 26);
  ctx.bezierCurveTo(55, 43, 42, 56, 32, 68);
  ctx.closePath();
  ctx.shadowColor = "rgba(8, 21, 38, .42)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = selected && kind === "helper" ? 5 : 3;
  ctx.strokeStyle = selected && kind === "helper" ? "#f7b632" : "#ffffff";
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  if (kind === "sos") {
    // Paths render reliably without a map glyph font. Fire gets a flame only
    // when the incident category says fire; other SOS incidents keep an alert.
    if (pictogram === "flame") {
      ctx.beginPath();
      ctx.moveTo(33, 13);
      ctx.bezierCurveTo(35, 19, 38, 21, 37, 26);
      ctx.bezierCurveTo(40, 24, 41, 21, 41, 19);
      ctx.bezierCurveTo(47, 28, 47, 35, 42, 39);
      ctx.bezierCurveTo(37, 43, 27, 43, 22, 39);
      ctx.bezierCurveTo(16, 33, 20, 25, 26, 19);
      ctx.bezierCurveTo(25, 25, 30, 26, 33, 13);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(33, 29);
      ctx.bezierCurveTo(36, 33, 37, 37, 33, 39);
      ctx.bezierCurveTo(28, 40, 27, 36, 33, 29);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(32, 14); ctx.lineTo(44, 37); ctx.lineTo(20, 37);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(30.5, 22, 3, 8);
      ctx.beginPath(); ctx.arc(32, 33, 1.8, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.beginPath(); ctx.arc(32, 22, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(32, 41, 12, Math.PI, 0); ctx.closePath(); ctx.fill();
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/** Map style swaps discard runtime images. Re-register *before* adding symbol
 * layers, including when MapLibre preserves old GeoJSON sources across a diff. */
export function ensureDispatchPinImages(map: Pick<MapLibreMap, "hasImage" | "addImage">, dark: boolean): void {
  const responderColor = dark ? "#205fd1" : "#0868c8";
  const specs = [
    [DISPATCH_PIN_IMAGES.high, SOS_MAP_MARKER_COLORS.high, "sos", false, "alert"],
    [DISPATCH_PIN_IMAGES.medium, SOS_MAP_MARKER_COLORS.medium, "sos", false, "alert"],
    [DISPATCH_PIN_IMAGES.low, SOS_MAP_MARKER_COLORS.low, "sos", false, "alert"],
    [DISPATCH_PIN_IMAGES.selectedHigh, SELECTED_SOS_COLOR, "sos", true, "alert"],
    [DISPATCH_PIN_IMAGES.selectedMedium, SELECTED_SOS_COLOR, "sos", true, "alert"],
    [DISPATCH_PIN_IMAGES.selectedLow, SELECTED_SOS_COLOR, "sos", true, "alert"],
    [DISPATCH_PIN_IMAGES.selectedFire, SELECTED_SOS_COLOR, "sos", true, "flame"],
    [DISPATCH_PIN_IMAGES.helper, responderColor, "helper", false, "alert"],
    [DISPATCH_PIN_IMAGES.selectedHelper, responderColor, "helper", true, "alert"]
  ] as const;
  for (const [id, color, kind, selected, pictogram] of specs) {
    if (!map.hasImage(id)) map.addImage(id, drawDispatchPin(color, kind, selected, undefined, pictogram), { pixelRatio: 1 });
  }
}

/** The basemap can change palette without replacing the style (and therefore
 * without discarding images). Keep the real responder pins in sync too. */
export function refreshResponderPinImages(map: Pick<MapLibreMap, "hasImage" | "updateImage">, dark: boolean): void {
  const color = dark ? "#205fd1" : "#0868c8";
  for (const [id, selected] of [[DISPATCH_PIN_IMAGES.helper, false], [DISPATCH_PIN_IMAGES.selectedHelper, true]] as const) {
    if (map.hasImage(id)) map.updateImage(id, drawDispatchPin(color, "helper", selected));
  }
}
