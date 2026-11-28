// Compact dispatch keeps map search available until a selected incident
// needs that space. An open incident takes the search slot even at sheet peek.
export function dispatchMapPanelState(compact: boolean, hasIncident: boolean,
  sheetExpanded: boolean, sheetDragging: boolean, incidentExpanded: boolean):
  { incidentAtTop: boolean; hideSearch: boolean } {
  const incidentAtTop = compact && hasIncident && (sheetExpanded || incidentExpanded);
  return { incidentAtTop, hideSearch: incidentAtTop || (compact && hasIncident && sheetDragging) };
}
