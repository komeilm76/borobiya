"""Vector map renderer for the mockups.

The map is a hand-authored, deterministic city in a rotated street grid. Every screen
samples the same city with a different camera, so the whole set of images reads as one
place: the same avenues, river, park and landmarks appear consistently.

Coordinate spaces:
  * grid  (u, v)  – metres in the rotated street grid; streets are axis-aligned here.
  * world (x, y)  – metres after the grid rotation.
  * screen        – logical pixels inside the 393x852 viewport.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from PIL import Image, ImageFilter

from .prims import Screen
from .text import fa_digits, solid
from .theme import C, VIEW_H, VIEW_W

GRID_ANGLE = -13.0
_ROT = math.radians(GRID_ANGLE)
_COS, _SIN = math.cos(_ROT), math.sin(_ROT)


def to_world(u: float, v: float) -> tuple[float, float]:
    return (u * _COS - v * _SIN, u * _SIN + v * _COS)


@dataclass
class Camera:
    center: tuple[float, float]  # world metres
    ppu: float                   # screen px per metre (logical)
    angle: float = 0.0           # map rotation in degrees (heading-up navigation)

    def project(self, x: float, y: float, screen: Screen | None = None) -> tuple[float, float]:
        w = screen.w if screen is not None else 393
        h = screen.h if screen is not None else 852
        dx, dy = x - self.center[0], y - self.center[1]
        if self.angle:
            rad = math.radians(self.angle)
            cos_a, sin_a = math.cos(rad), math.sin(rad)
            dx, dy = dx * cos_a - dy * sin_a, dx * sin_a + dy * cos_a
        return (dx * self.ppu + w / 2, -dy * self.ppu + h / 2)

    def heading_up(self, bearing_deg: float) -> "Camera":
        """Rotate the map so a world bearing (0 = north) points to the top of the screen."""
        return Camera(self.center, self.ppu, self.angle - bearing_deg)

    def project_grid(self, u: float, v: float, screen: Screen | None = None) -> tuple[float, float]:
        return self.project(*to_world(u, v), screen)

    def aim_at(self, u: float, v: float, screen_x: float, screen_y: float,
               screen: Screen | None = None) -> "Camera":
        """Return a camera with the same zoom that puts grid point (u, v) on screen_xy."""
        w = screen.w if screen is not None else 393
        h = screen.h if screen is not None else 852
        wx, wy = to_world(u, v)
        dx, dy = (screen_x - w / 2) / self.ppu, -(screen_y - h / 2) / self.ppu
        if self.angle:
            rad = math.radians(-self.angle)
            dx, dy = dx * math.cos(rad) - dy * math.sin(rad), dx * math.sin(rad) + dy * math.cos(rad)
        return Camera((wx - dx, wy - dy), self.ppu, self.angle)

    def visible(self, x: float, y: float, margin: float = 0, screen: Screen | None = None) -> bool:
        w = screen.w if screen is not None else 393
        h = screen.h if screen is not None else 852
        sx, sy = self.project(x, y, screen)
        return -margin <= sx <= w + margin and -margin <= sy <= h + margin


def fit_camera(points: Sequence[tuple[float, float]], box: tuple[float, float, float, float],
               padding: float = 0.88, max_ppu: float = 0.55) -> Camera:
    """Camera that frames a world polyline inside a screen box (x0, y0, x1, y1).

    Used when a route must stay clear of fixed chrome: the header control and the
    bottom sheet define a band, and the route is fitted to that band instead of
    being drawn from a hand-tuned camera that can drift under the header.
    """
    x0, y0, x1, y1 = box
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    span_x = max(1e-6, max(xs) - min(xs))
    span_y = max(1e-6, max(ys) - min(ys))
    ppu = min((x1 - x0) / span_x, (y1 - y0) / span_y) * padding
    ppu = min(ppu, max_ppu)
    centre_x = (min(xs) + max(xs)) / 2
    centre_y = (min(ys) + max(ys)) / 2
    target_x = (x0 + x1) / 2
    target_y = (y0 + y1) / 2
    return Camera((centre_x - (target_x - VIEW_W / 2) / ppu,
                   centre_y + (target_y - VIEW_H / 2) / ppu), ppu)


def fit_camera_rotated(points: Sequence[tuple[float, float]], box: tuple[float, float, float, float],
                       angle: float, padding: float = 0.88, max_ppu: float = 0.55) -> Camera:
    """Fit a polyline to a box with the map rotated, for wide, short bands.

    A status sheet takes the bottom half of the plate, so the strip above it is wide and
    not tall. Rotating the map lets a north-south approach run across that strip instead
    of being shrunk to fit its height.
    """
    rad = math.radians(angle)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    rotated = [(x * cos_a - y * sin_a, x * sin_a + y * cos_a) for x, y in points]
    cam = fit_camera(rotated, box, padding=padding, max_ppu=max_ppu)
    rx, ry = cam.center
    return Camera((rx * cos_a + ry * sin_a, -rx * sin_a + ry * cos_a), cam.ppu, angle)


@dataclass
class Road:
    kind: str                 # motorway | primary | secondary | residential | service
    points: list[tuple[float, float]] = field(default_factory=list)  # grid coords
    name: str = ""
    label_at: float | None = None  # fraction along the road


@dataclass
class Poi:
    u: float
    v: float
    label: str
    icon: str
    tone: str = "neutral"
    pinned: bool = False


ROAD_STYLE = {
    # kind: (casing_m, fill_m, fill_color, casing_color)
    "motorway": (30, 22, C.map_road_motorway, C.map_road_motorway_casing),
    "primary": (24, 17, C.map_road_primary, C.map_road_primary_casing),
    "secondary": (18, 12.5, C.map_road_secondary, C.map_road_secondary_casing),
    "residential": (13, 8.5, C.map_road, C.map_road_casing),
    "service": (9, 5.5, C.map_road_minor, C.map_road_casing),
}


def build_city() -> dict:
    vertical = [
        (-1040, "motorway", "بزرگراه شهید سلیمانی", 0.30),
        (-390, "primary", "خیابان دانشگاه", 0.42),
        (0, "primary", "خیابان ولیعصر", 0.58),
        (420, "secondary", "خیابان شریعتی", 0.36),
        (860, "secondary", "بلوار فردوس", 0.62),
    ]
    horizontal = [
        (-780, "motorway", "بزرگراه امام علی", 0.34),
        (-260, "primary", "خیابان آزادی", 0.56),
        (120, "primary", "خیابان انقلاب", 0.44),
        (480, "secondary", "بلوار کشاورز", 0.66),
        (900, "secondary", "بلوار معلم", 0.40),
    ]
    roads: list[Road] = []
    for u, kind, name, label_at in vertical:
        roads.append(Road(kind, [(u, -2440), (u, 2440)], name, label_at))
    for v, kind, name, label_at in horizontal:
        roads.append(Road(kind, [(-2640, v), (2640, v)], name, label_at))
    # Diagonal boulevard crossing the river on a bridge.
    roads.append(Road("primary", [(-1400, 1150), (-700, 640), (120, 220), (900, -260), (1400, -520)],
                      "بلوار چمران", 0.52))
    # Waterfront promenade.
    roads.append(Road("residential", [(-980, -470), (-380, -300), (250, -60), (900, 120)],
                      "بلوار ساحلی", 0.55))

    # Residential grid between the avenues.
    minor_names_v = ["خیابان شهید رجایی", "خیابان طالقانی", "کوچهٔ یاس", "", "خیابان ۱۲ فروردین"]
    minor_names_h = ["کوچهٔ مدرس", "کوچهٔ بهار", "", "کوچهٔ لاله", "خیابان شهید صدوقی"]
    us = list(range(-2600, 2601, 130))
    vs = list(range(-2400, 2401, 120))
    vertical_avenues = {road.points[0][0] for road in roads if road.points[0][0] == road.points[-1][0]}
    horizontal_avenues = {road.points[0][1] for road in roads if road.points[0][1] == road.points[-1][1]}
    for index, u in enumerate(us):
        if any(abs(u - avenue) < 40 for avenue in vertical_avenues):
            continue
        name = minor_names_v[index % len(minor_names_v)]
        roads.append(Road("residential", [(u, -2380), (u, 2380)], name, 0.5 if name else None))
    for index, v in enumerate(vs):
        if any(abs(v - avenue) < 40 for avenue in horizontal_avenues):
            continue
        name = minor_names_h[index % len(minor_names_h)]
        roads.append(Road("residential", [(-2580, v), (2580, v)], name, 0.5 if name else None))

    water = [(-2900, -2400), (-2100, -1700), (-1500, -1150), (-900, -540), (-640, -240), (-300, 40),
             (60, 330), (330, 640), (620, 980), (900, 1300), (1180, 1600), (1500, 2000), (1800, 2400)]
    park = [(-760, 700), (-300, 690), (-250, 420), (-400, 300), (-740, 330)]
    park_2 = [(560, -700), (980, -690), (1010, -420), (700, -390)]
    park_3 = [(-1420, -180), (-1180, -140), (-1160, 60), (-1400, 40)]
    park_4 = [(1500, 900), (1880, 940), (1900, 1240), (1520, 1180)]
    stadium = [(-1900, 1500), (-1500, 1520), (-1480, 1880), (-1880, 1860)]
    hospital = [(-620, -960), (-360, -940), (-350, -760), (-610, -780)]
    diagonal = [(-1400, 1150), (-700, 640), (120, 220), (900, -260), (1400, -520)]
    square = (-250, 200)

    blocks = []
    rng = random.Random(20261102)
    for i in range(len(us) - 1):
        for j in range(len(vs) - 1):
            u0, u1 = us[i] + 9, us[i + 1] - 9
            v0, v1 = vs[j] + 9, vs[j + 1] - 9
            cx, cy = (u0 + u1) / 2, (v0 + v1) / 2
            if any(_point_in_poly(cx, cy, poly) for poly in (park, park_2, park_3, park_4,
                                                             stadium, hospital)):
                continue
            if _distance_to_polyline(cx, cy, water) < 78:
                continue
            if _distance_to_polyline(cx, cy, diagonal) < 44:
                continue
            if math.hypot(cx - square[0], cy - square[1]) < 92:
                continue
            bw, bh = u1 - u0, v1 - v0
            if bw < 40 or bh < 40:
                continue
            plots: list[list[tuple[float, float]]] = []
            depth = rng.uniform(17, 22)
            # Perimeter plots: north & south rows, then east & west columns.
            for edge in range(4):
                if edge < 2:
                    length, span = bw, depth
                else:
                    length, span = bh - depth * 2 - 6, depth
                if length <= 16:
                    continue
                cursor = 0.0
                while cursor < length - 12:
                    seg = min(rng.uniform(24, 40), length - cursor)
                    if seg < 12:
                        break
                    if edge == 0:      # north
                        poly = [(u0 + cursor, v1 - span), (u0 + cursor + seg, v1 - span),
                                (u0 + cursor + seg, v1), (u0 + cursor, v1)]
                    elif edge == 1:    # south
                        poly = [(u0 + cursor, v0), (u0 + cursor + seg, v0),
                                (u0 + cursor + seg, v0 + span), (u0 + cursor, v0 + span)]
                    elif edge == 2:    # east
                        poly = [(u1 - span, v0 + depth + 4 + cursor), (u1, v0 + depth + 4 + cursor),
                                (u1, v0 + depth + 4 + cursor + seg), (u1 - span, v0 + depth + 4 + cursor + seg)]
                    else:              # west
                        poly = [(u0, v0 + depth + 4 + cursor), (u0 + span, v0 + depth + 4 + cursor),
                                (u0 + span, v0 + depth + 4 + cursor + seg), (u0, v0 + depth + 4 + cursor + seg)]
                    inset = rng.uniform(1.1, 2.6)
                    poly = _inset_rect(poly, inset)
                    plots.append(poly)
                    cursor += seg + rng.uniform(3.5, 7)
            if not plots:
                continue
            world_pts = [to_world(u, v) for u, v in [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]]
            blocks.append({
                "grid": (u0, v0, u1, v1),
                "bbox": (min(p[0] for p in world_pts), min(p[1] for p in world_pts),
                         max(p[0] for p in world_pts), max(p[1] for p in world_pts)),
                "plots": plots,
            })
    buildings = []
    for block in blocks:
        for poly in block["plots"]:
            buildings.append([to_world(u, v) for u, v in poly])

    pois = [
        Poi(150, -330, "بیمارستان امید", "hospital-marker", "danger", pinned=True),
        Poi(-250, 200, "میدان انقلاب", "circle-double", "neutral"),
        Poi(-560, 520, "پارک ملت", "tree", "neutral"),
        Poi(660, -520, "بوستان شریعتی", "tree", "neutral"),
        Poi(300, 250, "آتش‌نشانی مرکزی", "fire-truck", "danger"),
        Poi(-120, -120, "مسجد جامع", "mosque", "neutral"),
        Poi(600, 120, "دبیرستان بهشتی", "school", "neutral"),
        Poi(-760, 180, "پمپ‌بنزین", "gas-station", "neutral"),
        Poi(950, 620, "فروشگاه بزرگ", "shopping", "neutral"),
        Poi(80, 780, "کلانتری ۱۲", "police-badge", "info"),
        Poi(-330, -640, "کلینیک ولیعصر", "medical-bag", "info"),
        Poi(380, 560, "ورزشگاه آزادی", "stadium", "neutral"),
    ]

    rail = [(-1400, -520), (-900, -470), (-420, -430), (60, -470), (520, -500), (960, -430), (1400, -400)]
    square = (-250, 200)
    labels = [
        (-640, 420, "پارک ملت", "park"),
        (760, -560, "بوستان شریعتی", "park"),
        (-980, -820, "رودخانهٔ شهر", "water"),
        (300, 760, "محلهٔ کشاورز", "district"),
        (-520, -560, "محلهٔ دانشگاه", "district"),
        (820, 320, "محلهٔ فردوس", "district"),
        (-1080, 320, "محلهٔ چمران", "district"),
    ]
    return {"roads": roads, "water": water, "park": park, "park2": park_2, "park3": park_3,
            "park4": park_4, "stadium": stadium, "hospital": hospital,
            "blocks": blocks, "buildings": buildings, "pois": pois, "labels": labels,
            "rail": rail, "square": square}


def _inset_rect(poly: Sequence[tuple[float, float]], inset: float) -> list[tuple[float, float]]:
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    out = []
    for x, y in poly:
        dx = (cx - x)
        dy = (cy - y)
        length = math.hypot(dx, dy) or 1
        out.append((x + dx / length * inset, y + dy / length * inset))
    return out


def _point_in_poly(x: float, y: float, poly: Sequence[tuple[float, float]]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _distance_to_polyline(x: float, y: float, points: Sequence[tuple[float, float]]) -> float:
    best = float("inf")
    for i in range(len(points) - 1):
        x1, y1 = points[i]
        x2, y2 = points[i + 1]
        dx, dy = x2 - x1, y2 - y1
        length_sq = dx * dx + dy * dy or 1e-9
        t = max(0.0, min(1.0, ((x - x1) * dx + (y - y1) * dy) / length_sq))
        px, py = x1 + t * dx, y1 + t * dy
        best = min(best, math.hypot(x - px, y - py))
    return best


CITY = build_city()


def _road_width(road: Road, cam: Camera) -> tuple[float, float]:
    casing_m, fill_m, fill, casing = ROAD_STYLE[road.kind]
    return max(2.2, casing_m * cam.ppu), max(1.4, fill_m * cam.ppu), fill, casing


def draw_base(screen: Screen, cam: Camera, detail: float = 1.0):
    """Paints land, water, greenery, buildings and the street network."""
    screen.rect(0, 0, screen.w, screen.h, fill=C.map_land)

    # Soft land patches give the base map some variety without adding noise.
    for u0, v0, size, tone in ((-900, -900, 620, C.map_land_2), (500, 140, 700, "#ECF1EC"),
                               (-300, 600, 520, C.map_land_2), (900, -900, 600, "#ECF1EC")):
        x, y = cam.project_grid(u0, v0, screen)
        screen.circle(x, y, size * cam.ppu / 2, fill=tone)

    # River: casing then water, drawn as a wide polyline.
    water_pts = [cam.project_grid(u, v, screen) for u, v in CITY["water"]]
    width = max(8, 74 * cam.ppu)
    screen.line(water_pts, C.map_water_edge, width + max(2.4, 5 * cam.ppu), caps=True)
    screen.line(water_pts, C.map_water, width, caps=True)
    if cam.ppu > 0.16:
        with screen.alpha_layer():
            screen.line(water_pts, (255, 255, 255, 34), max(2, width * 0.30))

    # Parks.
    for poly, edge in ((CITY["park4"], C.map_park_edge), (CITY["park"], C.map_park_edge),
                       (CITY["park2"], C.map_park_edge), (CITY["park3"], C.map_park_edge)):
        pts = [cam.project_grid(u, v, screen) for u, v in poly]
        if min(p[0] for p in pts) > screen.w + 40 or max(p[0] for p in pts) < -40:
            continue
        if min(p[1] for p in pts) > screen.h + 40 or max(p[1] for p in pts) < -40:
            continue
        screen.polygon(pts, fill=C.map_park, outline=edge, outline_w=max(1, 1.5 * cam.ppu * 4))

    # Buildings: block-level culling first, then per-plot projection.
    if cam.ppu > 0.075:
        for block in CITY["blocks"]:
            bx0, by0, bx1, by1 = block["bbox"]
            sx0, sy0 = cam.project(bx0, by0, screen)
            sx1, sy1 = cam.project(bx1, by1, screen)
            if min(sx0, sx1) > screen.w + 24 or max(sx0, sx1) < -24:
                continue
            if min(sy0, sy1) > screen.h + 24 or max(sy0, sy1) < -24:
                continue
            for poly in block["plots"]:
                pts = [cam.project(*point, screen) for point in poly]
                screen.polygon(pts, fill=C.map_building,
                               outline=C.map_building_edge if cam.ppu > 0.24 else None,
                               outline_w=max(1, 1.1 * cam.ppu * 4))

    # Street network: casings first, fills second, so intersections stay clean.
    visible_roads = []
    for road in CITY["roads"]:
        pts = [cam.project_grid(u, v, screen) for u, v in road.points]
        if min(p[0] for p in pts) > screen.w + 60 and min(p[1] for p in pts) > screen.h + 60:
            continue
        if max(p[0] for p in pts) < -60 and max(p[1] for p in pts) < -60:
            continue
        visible_roads.append((road, pts))
    for road, pts in visible_roads:
        _, _, _, casing = _road_width(road, cam)
        width = max(2.2, (ROAD_STYLE[road.kind][0]) * cam.ppu)
        screen.line(pts, casing, width, caps=False)
    for road, pts in visible_roads:
        fill = ROAD_STYLE[road.kind][2]
        width = max(1.6, ROAD_STYLE[road.kind][1] * cam.ppu)
        screen.line(pts, fill, width, caps=False)

    # A roundabout square and its radial approaches give the grid a landmark.
    sx, sy = cam.project_grid(*CITY["square"], screen)
    radius = max(10.0, 62 * cam.ppu)
    if -80 < sx < screen.w + 80 and -80 < sy < screen.h + 80 and cam.ppu > 0.10:
        screen.circle(sx, sy, radius + max(2.6, 6 * cam.ppu), fill=C.map_road_primary_casing)
        screen.circle(sx, sy, radius, fill=C.map_road)
        screen.circle(sx, sy, radius * 0.52, fill=C.map_park, outline=C.map_park_edge, outline_w=1.4)
        if cam.ppu > 0.16:
            screen.circle(sx, sy, radius * 0.24, fill=C.map_road_primary)


def draw_labels(screen: Screen, cam: Camera, level: str = "auto", max_minor: int = 5,
                exclude: Sequence[tuple[float, float, float, float]] = ()):
    """Street/neighbourhood labels with halo + collision culling, so the map stays legible."""
    if cam.ppu < 0.085:
        return
    placed: list[tuple[float, float, float, float]] = list(exclude)
    # POI pins are drawn after the labels, so reserve their boxes up front:
    # otherwise a street name slides under a pin and reads as its caption.
    if cam.ppu >= 0.11:
        for poi in CITY["pois"]:
            px, py = cam.project_grid(poi.u, poi.v, screen)
            if -20 < px < screen.w + 20 and 40 < py < screen.h - 40:
                placed.append((px - 13, py - 13, px + 13, py + 13))
    seen: set[str] = set()
    priority = {"motorway": 0, "primary": 1, "secondary": 2, "residential": 3}
    ordered = sorted(enumerate(CITY["roads"]), key=lambda pair: priority[pair[1].kind])
    minor_drawn = 0
    for _, road in ordered:
        if not road.name or road.label_at is None or road.name in seen:
            continue
        if road.kind == "residential" and (cam.ppu < 0.155 or minor_drawn >= max_minor):
            continue
        if road.kind == "secondary" and cam.ppu < 0.12:
            continue
        points = road.points
        total = sum(math.dist(points[i], points[i + 1]) for i in range(len(points) - 1))
        target = total * road.label_at
        walked = 0.0
        anchor = None
        for i in range(len(points) - 1):
            seg = math.dist(points[i], points[i + 1])
            if walked + seg >= target:
                t = (target - walked) / (seg or 1)
                anchor = (points[i][0] + (points[i + 1][0] - points[i][0]) * t,
                          points[i][1] + (points[i + 1][1] - points[i][1]) * t)
                break
            walked += seg
        if anchor is None:
            continue
        x, y = cam.project_grid(*anchor, screen)
        if not (24 < x < screen.w - 24 and 40 < y < screen.h - 40):
            continue
        style = "caption-bold" if road.kind in ("motorway", "primary") else "caption"
        color = "#5F6E66" if road.kind in ("motorway", "primary", "secondary") else "#7C8B84"
        box = _label_box(screen, x, y, road.name, style)
        # A pin or another name in the way? Slide the caption along the road before
        # giving up — losing the street name entirely leaves a blank patch of map.
        span = (box[2] - box[0]) * 0.62 + 18
        for shift in (0.0, span, -span):
            cand = (box[0] + shift, box[1], box[2] + shift, box[3] + shift - shift)
            if not (8 < cand[0] and cand[2] < screen.w - 8):
                continue
            if not _collides(cand, placed):
                box, x = cand, x + shift
                break
        else:
            continue
        placed.append(box)
        seen.add(road.name)
        if road.kind == "residential":
            minor_drawn += 1
        screen.t.line(x, y, road.name, style, color, "center", halo="#FFFFFF", halo_width=2.2)

    for u, v, text, kind in CITY["labels"]:
        if kind == "district" and cam.ppu > 0.15:
            continue
        if kind == "park" and cam.ppu < 0.10:
            continue
        x, y = cam.project_grid(u, v, screen)
        if not (30 < x < screen.w - 30 and 40 < y < screen.h - 40):
            continue
        style = "caption-bold" if kind != "water" else "caption"
        box = _label_box(screen, x, y, text, style, padding=4)
        if _collides(box, placed):
            continue
        placed.append(box)
        if kind == "district":
            screen.t.line(x, y, text, style, "#8A978F", "center", halo="#FFFFFF", halo_width=2.4)
        elif kind == "water":
            screen.t.line(x, y, text, style, C.map_label_water, "center", halo="#DCEBF1", halo_width=2.2)
        else:
            screen.t.line(x, y, text, style, "#5C7A55", "center", halo="#E7F1E0", halo_width=2.2)


def _label_box(screen: Screen, x: float, y: float, text: str, style: str, padding: float = 3.0):
    w = screen.tw(text, style)
    h = 16
    return (x - w / 2 - padding, y - h / 2 - padding, x + w / 2 + padding, y + h / 2 + padding)


def _collides(box, placed) -> bool:
    for other in placed:
        if box[0] < other[2] and box[2] > other[0] and box[1] < other[3] and box[3] > other[1]:
            return True
    return False


def draw_pois(screen: Screen, cam: Camera, icons: bool = True, only: Iterable[str] | None = None):
    if cam.ppu < 0.11:
        return
    for poi in CITY["pois"]:
        if only is not None and poi.label not in only:
            continue
        x, y = cam.project_grid(poi.u, poi.v, screen)
        if not (-20 < x < screen.w + 20 and 40 < y < screen.h - 40):
            continue
        if icons:
            fill = {"danger": C.danger_soft, "info": C.info_soft, "neutral": "#FFFFFF"}[poi.tone]
            stroke = {"danger": C.danger, "info": C.info, "neutral": C.outline_strong}[poi.tone]
            screen.circle(x, y, 9.5, fill=fill, outline=stroke, outline_w=1.4)
            screen.i.draw_icon(x, y, poi.icon, 11.5,
                               {"danger": C.danger, "info": C.info, "neutral": C.text_2}[poi.tone])


# --- routes -----------------------------------------------------------------

def grid_path(points: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    """Grid-coordinate waypoints -> world-coordinate polyline with chamfered corners."""
    out: list[tuple[float, float]] = []
    for index, point in enumerate(points):
        world = to_world(*point)
        if 0 < index < len(points) - 1:
            out.append(world)
        else:
            out.append(world)
    return out


def route_points(points: Sequence[tuple[float, float]]) -> list[tuple[float, float]]:
    """Smooth a grid polyline so corners look like a routed street path, not a zig-zag."""
    world = [to_world(u, v) for u, v in points]
    if len(world) < 3:
        return world
    smoothed: list[tuple[float, float]] = [world[0]]
    for index in range(1, len(world) - 1):
        prev, cur, nxt = world[index - 1], world[index], world[index + 1]
        for t in (0.22, 0.5, 0.78):
            smoothed.append((cur[0] + (prev[0] - cur[0]) * (1 - t) * 0.35 + (nxt[0] - cur[0]) * t * 0.35,
                             cur[1] + (prev[1] - cur[1]) * (1 - t) * 0.35 + (nxt[1] - cur[1]) * t * 0.35))
    smoothed.append(world[-1])
    return smoothed


def draw_route(screen: Screen, cam: Camera, points: Sequence[tuple[float, float]], color: str = C.route,
               width_m: float = 12, opacity: int | None = None, dashed: bool = False, mute: float = 0.0):
    screen_pts = [cam.project(x, y, screen) for x, y in points]
    w = max(4.5, width_m * cam.ppu)
    if mute:
        color = _blend(color, C.map_road_casing, mute)
    casing = w + max(3.0, w * 0.42)
    screen.line(screen_pts, "#FFFFFF", casing)
    # PIL draws butt-ended strokes, so a route that stops in the middle of a street ends in a
    # square. Two discs make the ends round, like every map that draws a path.
    if dashed:
        _dashed_line(screen, screen_pts, color, w, dash=max(6, w * 1.4), gap=max(5, w * 1.1))
    else:
        screen.circle(*screen_pts[0], casing / 2, fill="#FFFFFF")
        screen.circle(*screen_pts[-1], casing / 2, fill="#FFFFFF")
        screen.line(screen_pts, color, w)
        for point in (screen_pts[0], screen_pts[-1]):
            screen.circle(*point, w / 2, fill=color)


def _blend(a: str, b: str, t: float) -> tuple[int, int, int]:
    ca, cb = solid(a), solid(b)
    return tuple(int(round(ca[i] + (cb[i] - ca[i]) * t)) for i in range(3))


def _dashed_line(screen: Screen, pts: Sequence[tuple[float, float]], color, width: float,
                 dash: float = 12, gap: float = 9):
    carry = 0.0
    drawing = True
    for i in range(len(pts) - 1):
        x1, y1 = pts[i]
        x2, y2 = pts[i + 1]
        seg = math.dist((x1, y1), (x2, y2))
        if seg == 0:
            continue
        ux, uy = (x2 - x1) / seg, (y2 - y1) / seg
        travelled = 0.0
        while travelled < seg:
            step = (dash if drawing else gap) - carry
            if travelled + step >= seg:
                if drawing:
                    screen.line([(x1 + ux * travelled, y1 + uy * travelled), (x2, y2)], color, width, caps=False)
                carry += seg - travelled
                break
            end = travelled + step
            if drawing:
                screen.line([(x1 + ux * travelled, y1 + uy * travelled),
                             (x1 + ux * end, y1 + uy * end)], color, width, caps=False)
            travelled = end
            carry = 0.0
            drawing = not drawing


# --- markers ----------------------------------------------------------------

def destination_pin(screen: Screen, cam: Camera, u: float, v: float, label: str | None = None,
                    color: str = C.destination, icon: str = "flag-variant", pulse: bool = False):
    x, y = cam.project_grid(u, v, screen)
    if pulse:
        with screen.alpha_layer():
            screen.circle(x, y - 9, 30, fill=(175, 52, 56, 34))
            screen.circle(x, y - 9, 21, fill=(175, 52, 56, 48))
    h = 34
    screen.shadow(x - 16, y - 44, 32, 44, radius=16, blur=9, dy=5, color="#3A1416", alpha=52)
    # Teardrop: circle head + tapered tail.
    screen.circle(x, y - h + 15, 15, fill=color, outline="#FFFFFF", outline_w=2.4)
    screen.polygon([(x - 6.4, y - h + 25), (x + 6.4, y - h + 25), (x, y - 1)], fill=color)
    screen.i.draw_icon(x, y - h + 15, icon, 15, "#FFFFFF")
    if label:
        text_w = screen.tw(label, "caption-bold") + 20
        screen.rect(x - text_w / 2, y + 4, text_w, 24, fill="#FFFFFF", radius=8, outline=C.outline,
                    outline_w=1)
        screen.text(x, y + 8, label, "caption-bold", C.text, align="center", max_width=text_w - 8)


def origin_marker(screen: Screen, cam: Camera, u: float, v: float, label: str | None = None):
    x, y = cam.project_grid(u, v, screen)
    screen.circle(x, y, 9, fill="#FFFFFF")
    screen.circle(x, y, 6, fill=C.origin)
    if label:
        text_w = screen.tw(label, "caption-bold") + 18
        screen.rect(x - text_w / 2, y + 12, text_w, 23, fill="#FFFFFF", radius=8, outline=C.outline, outline_w=1)
        screen.text(x, y + 15.5, label, "caption-bold", C.text, align="center", max_width=text_w - 6)


def user_cone(screen: Screen, cam: Camera, u: float, v: float, bearing: float = 20,
              color: str = C.live_user, halo: bool = True):
    """Live position: accuracy halo, white ring, heading cone."""
    x, y = cam.project_grid(u, v, screen)
    with screen.alpha_layer():
        if halo:
            screen.circle(x, y, 42, fill=(14, 102, 102, 30))
            screen.circle(x, y, 27, fill=(14, 102, 102, 44))
        # heading cone
        rad = math.radians(bearing)
        spread = math.radians(25)
        r = 38
        pts = [(x, y)]
        for step in range(9):
            a = rad - spread + (2 * spread) * step / 8
            pts.append((x + math.sin(a) * r, y - math.cos(a) * r))
        screen.polygon(pts, fill=(14, 102, 102, 72))
    screen.circle(x, y, 10.5, fill="#FFFFFF")
    screen.circle(x, y, 7.5, fill=color)


def incident_marker(screen: Screen, cam: Camera, u: float, v: float, label: str | None = None,
                    icon: str = "fire", rings: bool = True):
    x, y = cam.project_grid(u, v, screen)
    if rings:
        with screen.alpha_layer():
            screen.circle(x, y, 44, fill=(175, 52, 56, 34))
            screen.circle(x, y, 30, fill=(175, 52, 56, 46))
            screen.circle(x, y, 19, fill=(175, 52, 56, 58))
    screen.circle(x, y, 15, fill=C.incident, outline="#FFFFFF", outline_w=2.6)
    screen.i.draw_icon(x, y, icon, 16, "#FFFFFF")
    if label:
        text_w = screen.tw(label, "caption-bold") + 22
        screen.rect(x - text_w / 2, y + 20, text_w, 25, fill=C.incident, radius=8)
        screen.text(x, y + 24, label, "caption-bold", "#FFFFFF", align="center", max_width=text_w - 6)


def team_marker(screen: Screen, cam: Camera, u: float, v: float, initial: str, tone: str = "success",
                label: str | None = None):
    x, y = cam.project_grid(u, v, screen)
    fill = {"success": C.success, "warning": C.warning, "muted": C.muted_2}[tone]
    screen.rect(x - 13, y - 13, 26, 26, fill="#FFFFFF", radius=9)
    screen.rect(x - 10.5, y - 10.5, 21, 21, fill=fill, radius=7)
    screen.text(x, y - 8.5, initial, "caption-bold", "#FFFFFF", align="center")
    if label:
        text_w = screen.tw(label, "caption-bold") + 16
        screen.rect(x - text_w / 2, y + 15, text_w, 21, fill="#FFFFFF", radius=7, outline=C.outline, outline_w=1)
        screen.text(x, y + 18, label, "caption-bold", C.text_2, align="center", max_width=text_w - 6)


# --- map chrome -------------------------------------------------------------

def map_controls(screen: Screen, top: float, layers: bool = True, compass: bool = True, angle: float = 18):
    """Left-side (RTL: physical left) stack of low-noise map controls."""
    x = 14
    y = top
    if layers:
        screen.icon_button(x, y, 42, "mdi-layers-outline", 19, C.text_2, radius=14)
        y += 50
    if compass:
        screen.icon_button(x, y, 42, "", 19, C.text_2, radius=14, outline=C.outline)
        _compass_needle(screen, x + 21, y + 21, angle)


def _compass_needle(screen: Screen, cx: float, cy: float, angle: float):
    rad = math.radians(angle)
    dx, dy = math.sin(rad), -math.cos(rad)
    tip = (cx + dx * 10, cy + dy * 10)
    left = (cx - dy * 6, cy + dx * 6)
    right = (cx + dy * 6, cy - dx * 6)
    screen.polygon([tip, left, (cx - dx * 2, cy - dy * 2)], fill=C.danger)
    screen.polygon([tip, right, (cx - dx * 2, cy - dy * 2)], fill=C.outline_strong)
    screen.text(cx, cy - 15, "N", "caption-bold", C.muted, align="center")


def scale_bar(screen: Screen, cam: Camera, x: float, y: float, width_px: float = 64):
    metres = width_px / cam.ppu
    nice = _nice_distance(metres)
    px = nice * cam.ppu
    screen.rect(x, y, px, 3, fill="#5E6E69", radius=2)
    screen.rect(x, y - 3, 2, 6, fill="#5E6E69")
    screen.rect(x + px - 2, y - 3, 2, 6, fill="#5E6E69")
    label = f"{fa_digits(int(nice))} متر" if nice < 1000 else f"{fa_digits(round(nice / 1000, 1))} کیلومتر"
    screen.text(x + px / 2, y + 3, label, "caption", "#5E6E69", align="center", halo="#EEF2ED", halo_width=1.6)


def _nice_distance(metres: float) -> float:
    targets = (25, 50, 100, 200, 250, 500, 1000, 2000, 5000)
    return min(targets, key=lambda t: abs(t - metres))


# --- companions --------------------------------------------------------------
#
# A fellow traveller is a different animal from a team member: nothing about them is dispatched, they
# joined a trip by invitation, and the thing they need to see is *each other* moving. So their marker is
# round, carries the freshness of its last fix in the ring, and can say "talking" without a badge.


def draw_trace(screen: Screen, cam: Camera, points: Sequence[tuple[float, float]],
               color: str = C.route, width_px: float = 5.0, opacity: int = 150,
               dashed: bool = False, casing: bool = True):
    """A travelled path: thinner and softer than a planned route, and it is the *only* thing
    on the live map that is translucent — two traces crossing must stay readable."""
    from PIL import ImageColor
    pts = [cam.project(x, y, screen) for x, y in points]
    if len(pts) < 2:
        return
    rgb = ImageColor.getrgb(color)[:3]
    with screen.alpha_layer():
        if casing:
            screen.line(pts, (255, 255, 255, min(255, opacity + 40)), width_px + 3.2)
        if dashed:
            _dashed_line(screen, pts, rgb + (opacity,), width_px, dash=7, gap=5)
        else:
            screen.line(pts, rgb + (opacity,), width_px)
            for point in (pts[0], pts[-1]):
                screen.circle(*point, width_px / 2, fill=rgb + (opacity,))


def label_fits(screen: Screen, label: str, cx: float, top: float, placed: list,
               style: str = "caption-bold") -> bool:
    """True when a caption drawn under (or over) a marker overlaps nothing already placed."""
    w = screen.tw(label, style) + 18
    box = (cx - w / 2, top, cx + w / 2, top + 21)
    for other in placed:
        if not (box[2] < other[0] or box[0] > other[2] or box[3] < other[1] or box[1] > other[3]):
            return False
    return 0 <= box[0] and box[2] <= screen.w


def companion_marker(screen: Screen, cam: Camera, u: float, v: float, initial: str,
                     label: str | None = None, tone: str = "live", talking: bool = False,
                     accuracy_m: float | None = None, label_side: str = "below"):
    """Live fellow traveller. `tone`: live | stale | waiting | me.

    The ring is the freshness — teal for a fix from the last 45s, amber for an old one, dashed grey
    while we have never received a position — so the label never has to spell "probably stale" out.
    """
    x, y = cam.project_grid(u, v, screen)
    edge = {"live": C.primary, "stale": C.warning, "waiting": C.muted_2, "me": C.origin}[tone]
    fill = {"live": C.primary_deep, "stale": "#5C6B68", "waiting": C.surface_3, "me": C.origin}[tone]
    ink = "#FFFFFF" if tone != "waiting" else C.muted
    if accuracy_m:
        radius = max(18, accuracy_m * cam.ppu)
        with screen.alpha_layer():
            screen.circle(x, y, radius, fill=(14, 102, 102, 22), outline=(14, 102, 102, 46),
                          outline_w=1)
    if talking:
        with screen.alpha_layer():
            screen.circle(x, y, 26, fill=(233, 179, 90, 40))
            screen.circle(x, y, 21, fill=(233, 179, 90, 64))
    screen.circle(x, y, 15.5, fill="#FFFFFF", outline=edge, outline_w=2.6)
    screen.circle(x, y, 12.4, fill=fill)
    screen.text(x, y - 7, initial, "caption-bold", ink, align="center")
    if talking:
        screen.arc_badge(x + 12, y - 12, "#E9B35A", "mdi-microphone", 11)
    if label:
        text_w = screen.tw(label, "caption-bold") + 18
        ly = y - 42 if label_side == "above" else y + 19
        # a marker near the edge pushes its own name off the plate; clamp the pill, not the marker
        x = min(max(x, text_w / 2 + 6), screen.w - text_w / 2 - 6)
        screen.rect(x - text_w / 2, ly, text_w, 21, fill="#FFFFFF", radius=7,
                    outline=C.outline, outline_w=1)
        screen.text(x, ly + 3, label, "caption-bold", C.text_2, align="center",
                    max_width=text_w - 6)


def deviation_marker(screen: Screen, cam: Camera, u: float, v: float, label: str | None = None,
                     label_side: str = "below"):
    """Where the driver left the plan. A ring, not a pin: the point is the road, not a place."""
    x, y = cam.project_grid(u, v, screen)
    with screen.alpha_layer():
        screen.circle(x, y, 17, fill=(169, 105, 11, 30), outline=(169, 105, 11, 170), outline_w=2)
    screen.circle(x, y, 3.6, fill=C.warning)
    if label:
        text_w = screen.tw(label, "caption-bold") + 18
        ly = y - 42 if label_side == "above" else y + 22
        screen.rect(x - text_w / 2, ly, text_w, 21, fill="#FFF7E8", radius=7,
                    outline="#E8D3AC", outline_w=1)
        screen.text(x, ly + 3, label, "caption-bold", C.warning, align="center",
                    max_width=text_w - 6)


def team_cluster(screen: Screen, cam: Camera, u: float, v: float, initials: Sequence[str],
                 caption: str | None = None, extra: int = 0,
                 offset: tuple[float, float] = (0.0, 0.0)):
    """Several responders standing in the same square metre, as one marker.

    A scene-level map is zoomed to the building, so three rescuers are 15px apart and three square
    markers become a blob. The cluster keeps the map honest — one dot where the people are — and the
    sheet carries their individual states. `extra` counts members whose initials are not drawn.
    """
    gx, gy = cam.project_grid(u, v, screen)
    x, y = gx + offset[0], gy + offset[1]
    d, step = 21, 17
    if offset != (0.0, 0.0):
        # a leader line, not a nudge: the pill is *pinned* to this square metre, and the line says so
        screen.line([(gx, gy), (x, y)], "#FFFFFF", 3.4)
        for k in range(2, 9):
            t0, t1 = (k - 0.4) / 9, k / 9
            screen.line([(gx + (x - gx) * t0, gy + (y - gy) * t0),
                         (gx + (x - gx) * t1, gy + (y - gy) * t1)], C.primary, 1.6)
    shown = list(initials)[:3]
    width = 24 + (len(shown) - 1) * step + d + (24 if extra else 0)
    h = 38
    screen.shadow(x - width / 2, y - h / 2, width, h, radius=h / 2, blur=10, dy=3, alpha=38)
    screen.rect(x - width / 2, y - h / 2, width, h, fill="#FFFFFF", radius=h / 2,
                outline=C.outline, outline_w=1)
    # RTL stack: the first responder sits rightmost, and is painted last so it laps over the rest
    right = x + width / 2 - 12 - d / 2
    for index, initial in reversed(list(enumerate(shown))):
        cursor = right - index * step
        screen.circle(cursor, y, d / 2 + 1.5, fill="#FFFFFF")
        screen.circle(cursor, y, d / 2, fill=[C.primary, C.success, C.mission][index % 3])
        screen.text(cursor, y - 8, initial, "caption-bold", "#FFFFFF", align="center")
    if extra:
        screen.circle(x - width / 2 + 14, y, 9, fill=C.surface_3, outline="#FFFFFF", outline_w=1.4)
        screen.text(x - width / 2 + 14, y - 6, f"+{fa_digits(extra)}", "caption-bold", C.text_2,
                    align="center")
    if caption:
        text_w = screen.tw(caption, "caption-bold") + 16
        screen.rect(x - text_w / 2, y + h / 2 + 4, text_w, 20, fill="#FFFFFF", radius=7,
                    outline=C.outline, outline_w=1)
        screen.text(x, y + h / 2 + 7, caption, "caption-bold", C.text_2, align="center",
                    max_width=text_w - 6)
    return x, y
