/** Do not steal a manually explored mission map when a participant begins sharing.
 * A route closing explicitly replaces the private incident view with the room overview.
 */
export function createLiveCameraIntent() {
  let userMoved = false;
  return {
    noteGesture() { userMoved = true; },
    reset() { userMoved = false; },
    shouldAutoFrame(routeActive: boolean) { return !routeActive && !userMoved; }
  };
}
