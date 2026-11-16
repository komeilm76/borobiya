import type { LocationQuery } from "vue-router";
import type { MapMode } from "./map-mode-policy";

/** Offer links are one-time entry intents, not state to carry between map tabs. */
export function workspaceTabQuery(query: LocationQuery, tab: MapMode): LocationQuery {
  const next: LocationQuery = { ...query, tab };
  delete next.offer;
  delete next.inbox;
  return next;
}

/** Stable across tab changes: only a new offer/inbox link is a new open request. */
export function proposalEntryIntent(path: string, query: LocationQuery): string | null {
  if (path !== "/_user/map") return null;
  if (typeof query.offer === "string" && query.offer) return `offer:${query.offer}`;
  return query.inbox === "1" ? "inbox" : null;
}
