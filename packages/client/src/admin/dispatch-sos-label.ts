export type DispatchSosLabelPlacement = {
  side: "right" | "left" | "below" | "above";
  belowPin: boolean;
  visible: boolean;
};

/** The selected SOS's text is a DOM label beside its real MapLibre coordinate.
 * Keep the label next to the painted pin head, flip at the map edge, and never
 * let a label for an offscreen point appear detached inside the map. */
export function dispatchSosLabelPlacement(
  x: number, y: number, width: number, height: number, labelWidth: number, labelHeight: number
): DispatchSosLabelPlacement {
  const gap = 24; // Pin head reaches ~18px from its center; the pill tucks just beside it.
  const fitsRight = x + gap + labelWidth <= width - 8;
  const fitsLeft = x - gap - labelWidth >= 8;
  const side = fitsRight ? "right" : fitsLeft ? "left" :
    y + 16 + labelHeight <= height - 8 ? "below" : "above";
  return {
    side,
    belowPin: side === "below" || (side !== "above" && y - 35 - labelHeight / 2 < 8),
    visible: width > 0 && height > 0 && x >= 0 && x <= width && y >= 0 && y <= height
  };
}
