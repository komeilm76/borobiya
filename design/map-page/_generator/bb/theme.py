"""Design tokens for the BoroBiya map page reference mockups.

Single source of truth for every PNG under design/map-page/. The values mirror the
client's existing tokens (packages/client/src/styles/tokens.ts) so the approved
mockups can be translated 1:1 into Vue components later.
"""
from __future__ import annotations

import os

# --- Canvas -----------------------------------------------------------------
# iPhone 15 logical viewport. Every screen is rendered at RENDER_SCALE for crisp text.
VIEW_W = 393
VIEW_H = 852
RENDER_SCALE = 2
SAFE_TOP = 54
SAFE_BOTTOM = 30

ASSETS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "assets")
FONT_DIR = os.path.join(ASSETS, "fonts")
MDI_FONT = os.path.join(ASSETS, "materialdesignicons-webfont.ttf")
MDI_CSS = os.path.join(ASSETS, "materialdesignicons.css")

# --- Color ------------------------------------------------------------------
class C:
    # brand / actions
    primary = "#0E6666"
    primary_deep = "#0A4B4B"
    primary_press = "#08403F"
    primary_soft = "#E4F0EE"
    primary_soft_2 = "#CEE4E1"
    on_primary = "#FFFFFF"

    # surfaces
    surface = "#FFFFFF"
    surface_2 = "#F6F9F8"
    surface_3 = "#EDF3F1"
    background = "#F1F5F4"
    overlay_scrim = "#0B2323"

    # lines
    outline = "#DCE5E2"
    outline_strong = "#C3D2CE"

    # text
    text = "#122A2A"
    text_2 = "#3E5754"
    muted = "#63797A"
    muted_2 = "#87999A"

    # semantic
    success = "#2C7A57"
    success_soft = "#E4F2EA"
    warning = "#A9690B"
    warning_soft = "#FCF0DC"
    danger = "#AF3438"
    danger_deep = "#8E2429"
    danger_soft = "#FBE9EA"
    info = "#316D86"
    info_soft = "#E6F1F5"
    amber = "#B57A12"

    # mission (rescue operations) accent
    mission = "#8A4B0F"
    mission_soft = "#FBEFE0"

    # map base
    map_land = "#F0F2EC"
    map_land_2 = "#EAEDE4"
    map_building = "#E0E3D8"
    map_building_edge = "#D2D6CB"
    map_park = "#D3E6C6"
    map_park_edge = "#BEDAAD"
    map_water = "#B6D7E4"
    map_water_edge = "#9AC4D4"
    map_road = "#FFFFFF"
    map_road_minor = "#FBFDFC"
    map_road_casing = "#DCDFD5"
    map_road_secondary = "#FDF7EA"
    map_road_secondary_casing = "#E8DCC0"
    map_road_primary = "#FBEBCB"
    map_road_primary_casing = "#E5CF9F"
    map_road_motorway = "#F8DEA6"
    map_road_motorway_casing = "#E4C68C"
    map_label = "#7C8B85"
    map_label_road = "#8A968F"
    map_label_water = "#6C93A3"

    # route / markers
    route = "#0E6666"
    route_alt = "#93A5A2"
    route_alt_2 = "#C0B18F"
    origin = "#1D6FB8"
    destination = "#B33338"
    incident = "#AF3438"
    live_user = "#0E6666"


# --- Typography -------------------------------------------------------------
FONTS = {
    "regular": "Vazirmatn-Regular.ttf",
    "medium": "Vazirmatn-Medium.ttf",
    "semibold": "Vazirmatn-SemiBold.ttf",
    "bold": "Vazirmatn-Bold.ttf",
    "black": "Vazirmatn-Black.ttf",
}

# name -> (weight, size_px, line_height_px)
TYPE = {
    "display": ("bold", 27, 36),
    "title-lg": ("bold", 21, 30),
    "title": ("semibold", 17, 26),
    "title-sm": ("semibold", 15, 22),
    "body": ("regular", 14.5, 24),
    "body-sm": ("regular", 12.5, 20),
    "label": ("semibold", 13, 18),
    "label-lg": ("semibold", 15, 20),
    "caption": ("regular", 11.5, 17),
    "caption-bold": ("semibold", 11, 16),
    "metric": ("bold", 26, 32),
    "metric-sm": ("bold", 19, 24),
    "mono": ("medium", 13, 20),
}

# --- Shape & spacing --------------------------------------------------------
class R:
    xs = 8
    sm = 12
    md = 16
    lg = 20
    xl = 26
    xxl = 32
    pill = 999


SPACE = {k: v for k, v in {"0": 0, "1": 4, "2": 8, "3": 12, "4": 16, "5": 20, "6": 24, "8": 32, "10": 40}.items()}

SHEET_HEADER_H = 44
SEGMENTED_H = 44
SEARCHBAR_H = 56
