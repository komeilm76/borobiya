// Match the CSS sheet stops, including its short-phone clearance for the
// stacked SOS and incident-location controls. Evaluate once at drag start so
// browser toolbar changes cannot make the handle jump mid-gesture.
export function dispatchSheetBounds(viewportHeight: number, rootFontSize: number, safeAreaTop = 0): { peek: number; expanded: number } {
  const peek = Math.min(viewportHeight * .40, rootFontSize * 21);
  return {
    peek,
    expanded: Math.min(viewportHeight * .68, rootFontSize * 38,
      Math.max(peek, viewportHeight - rootFontSize * 12.5 - safeAreaTop))
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
