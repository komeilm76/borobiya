import { worldCoordinate } from '../../shared/geo.ts';
import { validateTile, type TileCoordinate } from './geo.ts';

export const MAP_CENTER = Object.freeze({ latitude: 35.7219, longitude: 51.3347 });
export const MAP_ZOOM = 14;
export const MAP_BOUNDS = Object.freeze([51.20, 35.60, 51.48, 35.85] as const); // west, south, east, north

const WORLD_ORIGIN = worldCoordinate(MAP_CENTER.latitude, MAP_CENTER.longitude, MAP_ZOOM);
export const MAP_ORIGIN = Object.freeze({
  x: Math.floor(WORLD_ORIGIN.x / 4096) * 4096,
  y: Math.floor(WORLD_ORIGIN.y / 4096) * 4096
});

const LABELS: Array<{ x: number; y: number; text: string; rotate: number }> = [
  { x: 1780, y: 1540, text: 'بلوار ولیعصر', rotate: -34 },
  { x: 2280, y: 1160, text: 'خیابان شریعتی', rotate: 3 },
  { x: 1280, y: 1980, text: 'خیابان انقلاب', rotate: -2 },
  { x: 2630, y: 1840, text: 'بلوار چمران', rotate: -19 },
  { x: 2040, y: 2260, text: 'خیابان طالقانی', rotate: 4 },
  { x: 920, y: 2680, text: 'بلوار ساحلی', rotate: 5 },
  { x: 3040, y: 2420, text: 'خیابان آزادی', rotate: -4 },
  { x: 1460, y: 2860, text: 'خیابان دانشگاه', rotate: 2 },
  { x: 3400, y: 3020, text: 'خیابان شهید مصدق', rotate: -3 },
  { x: 700, y: 3260, text: 'کوچه لاله', rotate: 4 }
];

function noise(a: number, b: number, c: number): number {
  let value = Math.imul(a + 1, 73856093) ^ Math.imul(b + 1, 19349663) ^ Math.imul(c + 1, 83492791);
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function line(x1: number, y1: number, x2: number, y2: number, className: string): string {
  return `<path d="M ${x1} ${y1} L ${x2} ${y2}" class="${className}" vector-effect="non-scaling-stroke"/>`;
}

function renderBlocks(lx: number, ly: number, z: number, x: number, y: number): string {
  const step = 64;
  const output: string[] = [];
  for (let gx = Math.floor(lx / step) - 1; gx <= Math.ceil((lx + 256) / step); gx++) {
    for (let gy = Math.floor(ly / step) - 1; gy <= Math.ceil((ly + 256) / step); gy++) {
      const baseX = gx * step;
      const baseY = gy * step;
      for (let index = 0; index < 4; index++) {
        const seed = noise(gx * 17 + index, gy * 31 + index * 7, z + x + y);
        if (seed < 0.24) continue;
        const cellX = baseX + (index % 2) * 27 + 7 + seed * 3;
        const cellY = baseY + Math.floor(index / 2) * 27 + 7 + seed * 3;
        const width = 12 + seed * 9;
        const height = 10 + seed * 8;
        output.push(`<rect x="${cellX.toFixed(1)}" y="${cellY.toFixed(1)}" width="${width.toFixed(1)}" height="${height.toFixed(1)}" rx="2" class="bb-map-block" opacity="${(0.45 + seed * 0.35).toFixed(2)}"/>`);
      }
    }
  }
  return output.join('');
}

function renderParks(lx: number, ly: number, z: number, x: number, y: number): string {
  const output: string[] = [];
  for (let index = 0; index < 4; index++) {
    const seed = noise(x + index * 19, y - index * 23, z * 7 + index);
    if (seed < 0.72) continue;
    const px = Math.floor((lx + 256 * seed) / 128) * 128 + 12;
    const py = Math.floor((ly + 256 * noise(y, x, index)) / 128) * 128 + 18;
    output.push(`<rect x="${px}" y="${py}" width="${96 + Math.round(seed * 70)}" height="${72 + Math.round(seed * 50)}" rx="22" class="bb-map-park"/>`);
  }
  return output.join('');
}

function renderRoads(lx: number, ly: number): string {
  const step = 64;
  const casing: string[] = [];
  const minor: string[] = [];
  const major: string[] = [];
  for (let gx = Math.floor(lx / step) - 1; gx <= Math.ceil((lx + 256) / step); gx++) {
    const wx = gx * step;
    const majorRoad = ((gx % 5) + 5) % 5 === 0;
    casing.push(line(wx, ly - 80, wx, ly + 336, majorRoad ? 'bb-map-road-casing bb-map-road-casing--major' : 'bb-map-road-casing'));
    (majorRoad ? major : minor).push(line(wx, ly - 80, wx, ly + 336, majorRoad ? 'bb-map-road bb-map-road--major' : 'bb-map-road'));
  }
  for (let gy = Math.floor(ly / step) - 1; gy <= Math.ceil((ly + 256) / step); gy++) {
    const wy = gy * step;
    const majorRoad = ((gy % 5) + 5) % 5 === 0;
    casing.push(line(lx - 80, wy, lx + 336, wy, majorRoad ? 'bb-map-road-casing bb-map-road-casing--major' : 'bb-map-road-casing'));
    (majorRoad ? major : minor).push(line(lx - 80, wy, lx + 336, wy, majorRoad ? 'bb-map-road bb-map-road--major' : 'bb-map-road'));
  }
  casing.push('<path d="M -400 3550 C 580 2880, 1180 2520, 1780 1960 S 2900 1080, 4300 160" class="bb-map-road-casing bb-map-road-casing--major"/>');
  major.push('<path d="M -400 3550 C 580 2880, 1180 2520, 1780 1960 S 2900 1080, 4300 160" class="bb-map-road bb-map-road--major"/>');
  return `<g>${casing.join('')}</g><g>${minor.join('')}</g><g>${major.join('')}</g>`;
}

function renderWater(): string {
  return `<g><path d="M -500 3380 C 520 2940, 820 2680, 1440 2350 S 2380 1720, 2840 1320 S 3620 620, 4500 140" class="bb-map-water-edge"/><path d="M -500 3380 C 520 2940, 820 2680, 1440 2350 S 2380 1720, 2840 1320 S 3620 620, 4500 140" class="bb-map-water"/></g>`;
}

function renderLabels(lx: number, ly: number): string {
  return LABELS
    .filter((label) => label.x >= lx - 140 && label.x <= lx + 396 && label.y >= ly - 60 && label.y <= ly + 316)
    .map((label) => `<text x="${label.x}" y="${label.y}" class="bb-map-label" direction="rtl" text-anchor="middle" transform="rotate(${label.rotate} ${label.x} ${label.y})">${label.text}</text>`)
    .join('');
}

const MAP_STYLE = `<style>
.bb-map-land{fill:#F0F2EC}
.bb-map-block{fill:#E3E8DF;stroke:#D8E0D5;stroke-width:.45}
.bb-map-park{fill:#D3E6C6;opacity:.9}
.bb-map-water-edge{fill:none;stroke:#9FC8D8;stroke-width:32;stroke-linecap:round;opacity:.75}
.bb-map-water{fill:none;stroke:#B6D7E4;stroke-width:24;stroke-linecap:round}
.bb-map-road-casing{stroke:#E8D8B8;stroke-width:8;stroke-linecap:round;fill:none}
.bb-map-road-casing--major{stroke:#E3C68F;stroke-width:15}
.bb-map-road{stroke:#FFFCF3;stroke-width:5;stroke-linecap:round;fill:none}
.bb-map-road--major{stroke:#FFF8E6;stroke-width:11}
.bb-map-label{font-family:Vazirmatn,system-ui,sans-serif;font-size:12px;font-weight:500;fill:#4C5F60;paint-order:stroke;stroke:#F0F2EC;stroke-width:3px;stroke-linejoin:round}
</style>`;

export function renderMapTile(z: number, x: number, y: number): string | null {
  const tile: TileCoordinate | null = validateTile(z, x, y);
  if (!tile) return null;
  const lx = x * 256 - MAP_ORIGIN.x;
  const ly = y * 256 - MAP_ORIGIN.y;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="bb-map-tile" viewBox="${lx} ${ly} 256 256" width="256" height="256" preserveAspectRatio="none" aria-hidden="true">` +
    MAP_STYLE +
    `<rect x="${lx}" y="${ly}" width="256" height="256" class="bb-map-land"/>` +
    renderParks(lx, ly, tile.z, tile.x, tile.y) +
    renderWater() +
    `<g>${renderBlocks(lx, ly, tile.z, tile.x, tile.y)}</g>` +
    renderRoads(lx, ly) +
    renderLabels(lx, ly) +
    `</svg>`;
}

