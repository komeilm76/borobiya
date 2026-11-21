export type DispatchSosLabelPlacement = {
  side: "right" | "left" | "below" | "above";
  belowPin: boolean;
  visible: boolean;
};

/** The selected SOS and visible responder names share one attached DOM chip.
 * Keep it next to the real MapLibre pin head (or circle fallback), flip at map
 * edges, and never show an offscreen point's chip detached inside the map. */
export function dispatchSosLabelPlacement(
  x: number, y: number, width: number, height: number, labelWidth: number, labelHeight: number,
  pinHeadOffset = -35
): DispatchSosLabelPlacement {
  const gap = 16; // The label border touches the painted head (~17px from center).
  const belowOffset = pinHeadOffset === 0 ? 18 : 0; // Circle fallback is centered on the coordinate.
  const belowCrown = y + pinHeadOffset - labelHeight / 2 < 8;
  const fitsRight = x + gap + labelWidth <= width - 8;
  const fitsLeft = x - gap - labelWidth >= 8;
  const side = belowCrown && y + belowOffset + labelHeight <= height - 8 ? "below" :
    fitsRight ? "right" : fitsLeft ? "left" :
      y + belowOffset + labelHeight <= height - 8 ? "below" : "above";
  return {
    side,
    belowPin: side === "below",
    visible: width > 0 && height > 0 && x >= 0 && x <= width && y >= 0 && y <= height
  };
}
