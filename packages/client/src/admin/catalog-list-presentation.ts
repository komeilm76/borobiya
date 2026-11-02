/** Keep a known catalog visible during refresh; never call a failed first read "empty". */
export type CatalogListPresentation = "loading" | "refreshing" | "rows" | "offline" | "error" | "empty";

/**
 * `offline` is passed in rather than inferred from the message: a dead connection and a 500 arrive at the caller as
 * the same rejection, and only the caller knows whether the browser thinks the network is up.
 */
export function catalogListPresentation(
  loading: boolean,
  rowCount: number,
  errorMessage: string,
  offline = false
): CatalogListPresentation {
  if (rowCount > 0) return loading ? "refreshing" : "rows";
  if (loading) return "loading";
  if (offline && errorMessage) return "offline";
  if (errorMessage) return "error";
  return "empty";
}
