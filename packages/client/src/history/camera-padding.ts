/** Reserve space for the controls that actually cover each map layout. */
export function historyCameraPadding(compact: boolean, phoneHeight?: number): { top: number; bottom: number; left: number; right: number } {
  if (phoneHeight !== undefined) {
    // A full-screen phone map has an app rail and dock/SOS over its edges. Scale the
    // clearance on short/landscape viewports so the track retains a useful center.
    return {
      top: Math.min(128, Math.floor(phoneHeight * 0.28)),
      bottom: Math.min(152, Math.floor(phoneHeight * 0.32)),
      left: 24,
      right: 24
    };
  }
  return compact
    ? { top: 24, bottom: 24, left: 24, right: 24 }
    : { top: 96, bottom: 168, left: 72, right: 72 };
}
