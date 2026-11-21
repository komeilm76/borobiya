export type DispatchEdge = "top" | "bottom" | "left" | "right";
export type DispatchEdgeCandidate = {
  kind: "sos" | "responder"; id: string; label: string;
  x: number; y: number; selected: boolean;
};
export type DispatchEdgeCue = DispatchEdgeCandidate & { edge: DispatchEdge; x: number; y: number };

/** Screen-space cues only; never fabricate a geographical position or expose
 * unselected incident titles. The caller supplies authorised map points only. */
export function dispatchMapEdgeCues(width: number, height: number,
  candidates: readonly DispatchEdgeCandidate[]): DispatchEdgeCue[] {
  if (width < 160 || height < 180) return [];
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  // Match the CSS cue's maximum 138px width and 30px height. Shorter names
  // render narrower; side cues anchor to the edge, not their variable center.
  const edgeGap = 12;
  const cueWidth = Math.min(138, width - 2 * edgeGap);
  const insetX = cueWidth / 2 + edgeGap;
  const bottomY = height - 27;
  const horizontalBounds = (edge: DispatchEdge, x: number): readonly [number, number] =>
    edge === "left" ? [x, x + cueWidth] : edge === "right" ? [x - cueWidth, x] :
      [x - cueWidth / 2, x + cueWidth / 2];
  const outside = candidates.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y) &&
    (point.x < 0 || point.x > width || point.y < 0 || point.y > height));
  // The selected incident always wins; selected responders precede nearby ones.
  outside.sort((a, b) => Number(b.kind === "sos") - Number(a.kind === "sos") ||
    Number(b.selected) - Number(a.selected) ||
    Math.hypot(Math.max(0, -a.x, a.x - width), Math.max(0, -a.y, a.y - height)) -
    Math.hypot(Math.max(0, -b.x, b.x - width), Math.max(0, -b.y, b.y - height)));
  const cues: DispatchEdgeCue[] = [];
  for (const point of outside) {
    // A point outside both axes belongs to the nearest edge. Vertical edges
    // are not silently treated like left/right simply because its name is wide.
    const distances = [
      { edge: "top" as const, distance: Math.max(0, -point.y) / height },
      { edge: "bottom" as const, distance: Math.max(0, point.y - height) / height },
      { edge: "left" as const, distance: Math.max(0, -point.x) / width },
      { edge: "right" as const, distance: Math.max(0, point.x - width) / width }
    ];
    const edge = distances.reduce((best, next) => next.distance > best.distance ? next : best).edge;
    const x = edge === "left" ? edgeGap : edge === "right" ? width - edgeGap :
      clamp(point.x, insetX, width - insetX);
    // Left/top clears the recenter button. Right/top also clears MapLibre's
    // zoom/compass controls (which occupy the map's upper-right corner).
    const topY = edge === "right" || (edge === "top" && x > width - 132) ? 126 : 86;
    const yMin = Math.min(topY, bottomY);
    const y = edge === "top" ? yMin : edge === "bottom" ? bottomY : clamp(point.y, yMin, bottomY);
    // Compare the *maximum* rectangles; short chips may leave more room, but
    // never let two long labels collide as the map moves or names change.
    const [left, right] = horizontalBounds(edge, x);
    if (cues.some((cue) => {
      const [usedLeft, usedRight] = horizontalBounds(cue.edge, cue.x);
      return usedLeft < right + 8 && left < usedRight + 8 && Math.abs(cue.y - y) < 34;
    })) continue;
    cues.push({ ...point, edge, x, y });
    if (cues.length === 3) break; // Avoid covering the map; the responder list remains complete.
  }
  return cues;
}
