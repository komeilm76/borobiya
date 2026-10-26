/** Keep a known catalog visible during refresh; never call a failed first read "empty". */
export type CatalogListPresentation = "loading" | "refreshing" | "rows" | "error" | "empty";

export function catalogListPresentation(
  loading: boolean,
  rowCount: number,
  errorMessage: string
): CatalogListPresentation {
  if (rowCount > 0) return loading ? "refreshing" : "rows";
  if (loading) return "loading";
  if (errorMessage) return "error";
  return "empty";
}
