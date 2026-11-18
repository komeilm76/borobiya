type Rectangle = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>;
type Padding = { top: number; bottom: number; left: number; right: number };

/** Fit the offer in the *actual canvas*, not the viewport. On tablet the map
 * can be only 55dvh tall; viewport-based bottom padding can exceed its height
 * and cause MapLibre.fitBounds to throw (leaving the route off-screen). */
export function offerCameraPadding(map: Rectangle, panel: Rectangle | null): Padding {
  const padding: Padding = { top: 48, bottom: 48, left: 40, right: 40 };
  if (panel && panel.left < map.right && panel.right > map.left &&
    panel.top < map.bottom && panel.bottom > map.top) {
    const centreX = (panel.left + panel.right) / 2;
    const centreY = (panel.top + panel.bottom) / 2;
    if (panel.width < map.width * .6 && (centreX < map.left + map.width * .4 || centreX > map.left + map.width * .6)) {
      if (centreX < map.left + map.width / 2) padding.left = panel.right - map.left + 16;
      else padding.right = map.right - panel.left + 16;
    } else if (centreY < map.top + map.height / 2) padding.top = panel.bottom - map.top + 16;
    else padding.bottom = map.bottom - panel.top + 16;
  }
  // Always leave a real drawable interior, even on landscape phones or when
  // the map's in-flow tablet layout only partly intersects the offer card.
  const cap = (axis: 'width' | 'height', leading: keyof Padding, trailing: keyof Padding) => {
    const size = map[axis];
    const inset = Math.max(8, Math.min(40, size / 8));
    padding[leading] = Math.max(inset, Math.min(padding[leading], size - 2 * inset));
    padding[trailing] = Math.max(inset, Math.min(padding[trailing], size - padding[leading] - inset));
  };
  cap('width', 'left', 'right');
  cap('height', 'top', 'bottom');
  return padding;
}
