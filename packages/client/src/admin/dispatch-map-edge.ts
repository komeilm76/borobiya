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
  if (width < 160 || height < 120) return [];
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
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
    const x = edge === "left" ? 72 : edge === "right" ? width - 72 : clamp(point.x, 72, width - 72);
    // The top inset clears the selected-SOS recenter button and map controls.
    const y = edge === "top" ? 80 : edge === "bottom" ? height - 30 : clamp(point.y, 80, height - 30);
    if (cues.some((cue) => Math.abs(cue.x - x) < 130 && Math.abs(cue.y - y) < 46)) continue;
    cues.push({ ...point, edge, x, y });
    if (cues.length === 3) break; // Avoid covering the map; the responder list remains complete.
  }
  return cues;
}
