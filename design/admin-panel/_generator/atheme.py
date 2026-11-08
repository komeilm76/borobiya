"""Admin-panel design tokens and desktop canvas geometry.

Reuses the shared design system from design/map-page/_generator/bb (same palette,
fonts, icon font and text shaping) so the admin mockups and the map mockups read as
one product. Only the *desktop* type ramp and layout metrics are added here.
"""
from __future__ import annotations

import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SHARED = os.path.abspath(os.path.join(HERE, "..", "..", "map-page", "_generator"))
if SHARED not in sys.path:
    sys.path.insert(0, SHARED)

from bb.theme import TYPE, C, R  # noqa: E402

# --- desktop type ramp -------------------------------------------------------
# name -> (weight, size_px, line_height_px); 14px body, 12.5px secondary.
TYPE.update({
    "d-display": ("bold", 30, 42),
    "d-h1": ("bold", 24, 34),
    "d-h2": ("semibold", 19, 28),
    "d-title": ("semibold", 15.5, 24),
    "d-body": ("regular", 14, 22),
    "d-sm": ("regular", 12.5, 19),
    "d-label": ("semibold", 13, 20),
    "d-label-lg": ("semibold", 14.5, 22),
    "d-caption": ("regular", 11.5, 17),
    "d-caption-bold": ("semibold", 11.5, 17),
    "d-metric": ("bold", 30, 38),
    "d-metric-sm": ("bold", 21, 28),
    "d-mono": ("medium", 12, 18),
})

# --- canvas ------------------------------------------------------------------
W, H = 1440, 900
SIDEBAR = 264
TOPBAR = 68
PAD = 28
CONTENT_W = W - SIDEBAR
RAIL = CONTENT_W - PAD  # right edge of the content column

# --- extra admin tokens ------------------------------------------------------
class A:
    card_edge = "#E3EAE8"
    table_head = "#F7FAF9"
    row_line = "#EFF4F2"
    rail_bg = "#FBFDFC"
    nav_active = C.primary_soft
    shadow_soft = ("#193536", 20)     # (color, alpha)
    chart_grid = "#E8EEEC"
    series = ("#0E6666", "#B57A12", "#316D86", "#8A4B0F", "#2C7A57")


__all__ = ["C", "R", "TYPE", "W", "H", "SIDEBAR", "TOPBAR", "PAD", "CONTENT_W", "RAIL", "A"]
