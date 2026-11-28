// Use the same dvh/rem stops as the CSS sheet and map clearance. These
// bounds are evaluated at gesture start so a browser toolbar resize cannot
// cause the handle to jump mid-drag.
export function dispatchSheetBounds(viewportHeight: number, rootFontSize: number): { peek: number; expanded: number } {
  return {
    peek: Math.min(viewportHeight * .40, rootFontSize * 21),
    expanded: Math.min(viewportHeight * .72, rootFontSize * 40)
  };
}

export function dispatchDraggedHeight(startHeight: number, startY: number, currentY: number,
  bounds: { peek: number; expanded: number }): number {
  return Math.max(bounds.peek, Math.min(bounds.expanded, startHeight + startY - currentY));
}

// A deliberate flick wins over the midpoint. Small accidental motions (or
// slow releases) choose the nearest stop, rather than surprising the user.
export function dispatchSheetShouldExpand(height: number, deltaY: number, velocityY: number,
  bounds: { peek: number; expanded: number }): boolean {
  if (Math.abs(deltaY) >= 24 && Math.abs(velocityY) >= .45) return velocityY < 0;
  return height >= (bounds.peek + bounds.expanded) / 2;
}
