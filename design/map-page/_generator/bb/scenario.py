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
