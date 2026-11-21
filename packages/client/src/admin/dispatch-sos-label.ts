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
  const margin = 8;
  const gap = 16; // The label border touches the painted head (~17px from center).
  const circle = pinHeadOffset === 0;
  const belowOffset = circle ? 18 : 0;
  const aboveOffset = circle ? 18 : 51; // Circle rim or painted teardrop crown.
  const sideTop = y + pinHeadOffset - labelHeight / 2;
  const sideFitsVertically = sideTop >= margin && sideTop + labelHeight <= height - margin;
  const fitsBelow = y + belowOffset + labelHeight <= height - margin;
  const fitsAbove = y - aboveOffset - labelHeight >= margin;
  const fitsRight = x + gap + labelWidth <= width - margin;
  const fitsLeft = x - gap - labelWidth >= margin;
  // Top edge: tuck below the tip. Bottom edge: put the title above the crown
  // even when a horizontal side would fit; otherwise it never selects above
  // on a normal-width map. The side positions must also fit vertically.
  const side = sideTop < margin && fitsBelow ? "below" :
    !fitsBelow && fitsAbove ? "above" :
      sideFitsVertically && fitsRight ? "right" :
        sideFitsVertically && fitsLeft ? "left" :
          fitsBelow ? "below" : fitsAbove ? "above" :
            fitsRight ? "right" : fitsLeft ? "left" : "above";
  return {
    side,
    belowPin: side === "below",
    visible: width > 0 && height > 0 && x >= 0 && x <= width && y >= 0 && y <= height
  };
}
