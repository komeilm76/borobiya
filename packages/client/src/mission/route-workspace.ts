export type RouteWorkspaceSection = "plan" | "transport" | "alternatives";

/** Alternatives are previews: Back restores the previously committed route; Accept commits the preview. */
export function createMissionRouteWorkspace(select: (index: number) => void) {
  let section: RouteWorkspaceSection = "plan";
  let committedIndex: number | null = null;
  let previewIndex: number | null = null;

  function openTransport(): void { close(); section = "transport"; }
  function openAlternatives(index: number): void {
    close();
    committedIndex = index;
    previewIndex = index;
    section = "alternatives";
  }
  function preview(index: number, count: number): void {
    if (section !== "alternatives" || !Number.isInteger(index) || index < 0 || index >= count) return;
    previewIndex = index;
    select(index);
  }
  function accept(): void {
    if (section !== "alternatives" || previewIndex === null) return;
    committedIndex = null; previewIndex = null; section = "plan";
  }
  function close(): void {
    if (section === "alternatives" && committedIndex !== null) select(committedIndex);
    reset();
  }
  // A new mission/route array invalidates the snapshot; never apply its old index to new choices.
  function reset(): void { section = "plan"; committedIndex = null; previewIndex = null; }
  return {
    get section() { return section; },
    get previewIndex() { return previewIndex; },
    openTransport, openAlternatives, preview, accept, close, reset
  };
}
