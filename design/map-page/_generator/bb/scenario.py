"""Shared scenario data for the navigation screens (one city, one consistent trip)."""
from __future__ import annotations

import math
from dataclasses import dataclass

from bb.map import Camera, to_world

USER = (-180, -120)          # live GPS position, near خیابان دانشگاه
INCIDENT = (300, 250)        # آتش‌نشانی مرکزی / محل حادثه
HOME = (-620, 640)
WORK = (860, 120)

# Street-following routes in grid coordinates (see bb/map.py street grid).
ROUTE_MAIN = [USER, (260, -120), (260, 240), (300, 240), INCIDENT]
ROUTE_ALT = [USER, (0, -120), (0, 120), (260, 120), (260, 240), INCIDENT]
ROUTE_STEP = [USER, (-130, -120), (-130, 240), (260, 240), INCIDENT]


def length_m(points) -> float:
    total = 0.0
    world = [to_world(u, v) for u, v in points]
    for i in range(len(world) - 1):
        total += math.dist(world[i], world[i + 1])
    return total


def route_world(points) -> list[tuple[float, float]]:
    """Grid waypoints -> world polyline, with corner smoothing for a routed look."""
    world = [to_world(u, v) for u, v in points]
    if len(world) < 3:
        return world
    out = [world[0]]
    for index in range(1, len(world) - 1):
        prev, cur, nxt = world[index - 1], world[index], world[index + 1]
        for t in (0.18, 0.5, 0.82):
            out.append((cur[0] * 0.72 + (prev[0] * (1 - t) + nxt[0] * t) * 0.28,
                        cur[1] * 0.72 + (prev[1] * (1 - t) + nxt[1] * t) * 0.28))
    out.append(world[-1])
    return out


def camera(u: float, v: float, ppu: float = 0.2) -> Camera:
    return Camera(to_world(u, v), ppu)


@dataclass(frozen=True)
class RouteOption:
    key: str
    points: list
    distance_km: float
    minutes: int
    traffic: str
    note: str


MAIN = RouteOption("main", ROUTE_MAIN, round(length_m(ROUTE_MAIN) / 1000, 1), 9, "روان", "سریع‌ترین")
ALT = RouteOption("alt", ROUTE_ALT, round(length_m(ROUTE_ALT) / 1000, 1), 13, "نیمه‌سنگین", "بدون ترافیک")
STEP = RouteOption("step", ROUTE_STEP, round(length_m(ROUTE_STEP) / 1000, 1), 12, "سنگین", "کوتاه‌ترین")

# Persian names used across screens.
DEST_NAME = "آتش‌نشانی مرکزی"
DEST_ADDRESS = "خیابان شریعتی، نبش کوچهٔ بهار، پلاک ۱۲"
DEST_KIND = "ایستگاه آتش‌نشانی"
USER_ADDRESS = "خیابان دانشگاه، بین ولیعصر و طالقانی"


# --- companion trips ---------------------------------------------------------
#
# One shared trip, four people on it, each at a different point of the same plan. Positions are given
# as a fraction of `ROUTE_MAIN` rather than as coordinates: a companion who is "42% along the route" is
# what the map actually knows, and hand-picked coordinates drift off the street as soon as the plan
# changes.

COMPANIONS = [
    {"name": "مریم رضایی", "initial": "م", "t": 0.84, "tone": "live", "talking": False},
    {"name": "سعید کریمی", "initial": "س", "t": 0.745, "tone": "live", "talking": True},
    {"name": "زهرا احمدی", "initial": "ز", "t": 0.37, "tone": "stale", "talking": False},
    {"name": "علی موسوی", "initial": "ع", "t": 0.0, "tone": "waiting", "talking": False},
]

ME_T = 0.62


def grid_length(a, b) -> float:
    (au, av), (bu, bv) = a, b
    return math.hypot(to_world(bu, bv)[0] - to_world(au, av)[0],
                      to_world(bu, bv)[1] - to_world(au, av)[1])


def along(points, t: float):
    """(grid point, travelled prefix) at fraction `t` of a grid polyline."""
    total = sum(grid_length(points[i], points[i + 1]) for i in range(len(points) - 1))
    want = max(0.0, min(1.0, t)) * total
    prefix = [points[0]]
    for i in range(len(points) - 1):
        a, b = points[i], points[i + 1]
        seg = grid_length(a, b)
        if want <= seg or i == len(points) - 2:
            k = 0.0 if seg == 0 else min(1.0, want / seg)
            head = (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)
            prefix.append(head)
            return head, prefix
        want -= seg
        prefix.append(b)
    return points[-1], prefix


# --- one recorded trip, and what came back from the road ---------------------
#
# The history detail has to answer three questions in one picture, because the driver's memory of a
# detour is "I went wrong somewhere near the light": where was I *told* to go, where did I *actually*
# go, and what was I told after it noticed. The three are separate polylines — never one line drawn
# twice — so the off-route stretch can be coloured on its own.
TRIP_PLAN = ROUTE_MAIN
TRIP_ACTUAL = [USER, (390, -120), (390, 240), (300, 240), INCIDENT]
TRIP_DEVIATION_AT = (260, -120)         # where the plan wanted a left turn
TRIP_REALISED_AT = (390, -120)          # where the app noticed and re-planned
TRIP_OFFROUTE = [(260, -120), (390, -120), (390, 240), (300, 240)]
TRIP_REROUTE = [(390, -120), (390, 240), (300, 240), INCIDENT]
TRIP_REJOIN_AT = (300, 240)
TRIP_STOP = {"at": (130, -120), "label": "توقف ۲ دقیقه‌ای"}


def slice_world(points, lo: float, hi: float):
    """The stretch of a grid polyline between two fractions, as world points.

    `along()` answers "where am I at t" for one person; a camera that has to frame a *segment* needs
    both ends of it, and building that from two prefixes silently returns the whole route.
    """
    _, head = along(points, lo)
    _, tail = along(points, hi)
    cut = head + [p for p in tail[len(head):]]
    return route_world(cut)
