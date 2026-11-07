"""Shared helpers for the screen modules."""
from __future__ import annotations

from bb.map import (Camera, destination_pin, draw_base, draw_labels, draw_pois, draw_route,
                    incident_marker, map_controls, origin_marker, scale_bar, team_marker, user_cone)
from bb.prims import Screen
from bb.theme import C, VIEW_H, VIEW_W


def map_view(cam: Camera, exclude=None, pois: bool = True, labels: bool = True, detail: float = 1.0):
    screen = Screen(background=C.map_land)
    draw_base(screen, cam, detail=detail)
    if labels:
        draw_labels(screen, cam, exclude=exclude or ())
    if pois:
        draw_pois(screen, cam, exclude=exclude or ())
    screen.cam = cam  # type: ignore[attr-defined]
    return screen


def keepout(*boxes):
    return tuple(boxes)


def box(x, y, w, h):
    return (x, y, x + w, y + h)


__all__ = [
    "Screen", "Camera", "VIEW_W", "VIEW_H", "C",
    "map_view", "draw_base", "draw_labels", "draw_pois", "draw_route", "destination_pin",
    "origin_marker", "user_cone", "incident_marker", "team_marker", "map_controls", "scale_bar",
    "keepout", "box",
]
