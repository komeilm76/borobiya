import type { Map as MapLibreMap } from 'maplibre-gl';

type ScreenMap = Pick<MapLibreMap, 'getContainer' | 'project' | 'on' | 'off'>;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Keep both endpoints and cap screen projection work for long OSRM routes. */
export function sampledOfferRoute(points: readonly [number, number][], limit = 1200): [number, number][] {
  if (points.length <= limit) return [...points];
  return Array.from({ length: limit }, (_, index) => points[Math.round(index * (points.length - 1) / (limit - 1))]!);
}

/** Paint a route above the shared map canvas, independently of its tile/style
 * lifecycle. MapLibre's source/layer remains underneath for exact geometry;
 * this projected path prevents a pending or reloading basemap from hiding the
 * review route. It is not another map or a GPS/navigation session. */
export function attachOfferRouteScreen(map: ScreenMap, coordinates: readonly [number, number][],
  onPaint: (painted: boolean) => void, dashed = false): () => void {
  const points = sampledOfferRoute(coordinates);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:2;overflow:hidden;pointer-events:none';
  const casing = document.createElementNS(SVG_NS, 'path');
  const line = document.createElementNS(SVG_NS, 'path');
  for (const [path, color, width] of [[casing, '#ffffff', dashed ? '7' : '10'],
    [line, dashed ? '#aa5a13' : '#087f75', dashed ? '4' : '6']] as const) {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', width);
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    if (dashed) path.setAttribute('stroke-dasharray', '8 8');
    svg.append(path);
  }
  map.getContainer().append(svg);
  let disposed = false;
  let frame = 0;
  const draw = () => {
    frame = 0;
    if (disposed) return;
    try {
      const projected = points.map(([lon, lat]) => map.project([lon, lat]));
      const valid = projected.length >= 2 && projected.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
      const d = valid ? projected.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ') : '';
      casing.setAttribute('d', d);
      line.setAttribute('d', d);
      const { clientWidth: width, clientHeight: height } = map.getContainer();
      const onScreen = valid && width > 0 && height > 0 &&
        Math.min(...projected.map((point) => point.x)) <= width && Math.max(...projected.map((point) => point.x)) >= 0 &&
        Math.min(...projected.map((point) => point.y)) <= height && Math.max(...projected.map((point) => point.y)) >= 0;
      onPaint(onScreen);
    } catch { onPaint(false); }
  };
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(draw); };
  map.on('move', schedule);
  map.on('resize', schedule);
  draw();
  return () => {
    disposed = true;
    map.off('move', schedule);
    map.off('resize', schedule);
    if (frame) cancelAnimationFrame(frame);
    svg.remove();
  };
}
