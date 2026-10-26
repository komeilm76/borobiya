/** An empty share list is a privacy claim: only the most recent successful read can support it. */
export type ShareSectionPresentation = "loading" | "rows" | "empty" | "unavailable";

export function shareSectionPresentation(
  loading: boolean,
  fresh: boolean,
  rowCount: number
): ShareSectionPresentation {
  if (rowCount > 0) return "rows";
  if (loading) return "loading";
  return fresh ? "empty" : "unavailable";
}
