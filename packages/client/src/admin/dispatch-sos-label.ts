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
  const gap = 16; // The label border touches the painted head (~17px from center).
  const belowCrown = y - 35 - labelHeight / 2 < 8;
  const fitsRight = x + gap + labelWidth <= width - 8;
  const fitsLeft = x - gap - labelWidth >= 8;
  const side = belowCrown && y + labelHeight <= height - 8 ? "below" :
    fitsRight ? "right" : fitsLeft ? "left" :
      y + labelHeight <= height - 8 ? "below" : "above";
  return {
    side,
    belowPin: side === "below",
    visible: width > 0 && height > 0 && x >= 0 && x <= width && y >= 0 && y <= height
  };
}
