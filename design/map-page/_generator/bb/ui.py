"""Page-level UI components shared by the reference screens."""
from __future__ import annotations

from typing import Iterable, Sequence

from .map import Camera
from .prims import Screen, _tint
from .text import fa_digits, shape, text_width
from .theme import C, R, SAFE_BOTTOM, SAFE_TOP, TYPE, VIEW_H, VIEW_W

# The four sections of /_user/map. Companions left the history tabs on 2026-11-04: sharing a
# position and travelling together are people problems, not records, and burying them inside
# "history" made both sections read as one long list.
SEGMENTS = [
    ("تاریخچه", "mdi-history"),
    ("مسیریابی", "mdi-map-marker-path"),
    ("همراهان", "mdi-account-multiple-outline"),
    ("مأموریت", "mdi-lifebuoy"),
]
MISSION_TAB = 3


def chrome(screen: Screen, tab: int = 1, locked: bool = False, map_mode: bool = True,
           mission_badge: str | None = None, show_menu: bool = True):
    """Status bar + the three-way section control that owns the top of the page."""
    screen.status_bar()
    top = 60
    x = 14
    w = screen.w - 28
    screen.segmented(x, top, w, SEGMENTS, active=tab, h=46,
                     locked=[0, 1] if locked else (), on_map=map_mode)
    if mission_badge:
        # Sections read right-to-left, so the active pill owns the physical left slot;
        # pin the count bubble to that pill's outer corner instead of the control edge.
        inner_pad, seg_w = 4, (w - 8) / len(SEGMENTS)
        pill_left = x + w - inner_pad - (tab + 1) * seg_w
        bx, by = pill_left + 3, top + 3
        screen.circle(bx, by, 10.5, fill=C.danger, outline="#FFFFFF", outline_w=2)
        screen.text(bx, by - 1, mission_badge, "caption-bold", "#FFFFFF", align="center")

def telemetry_strip(screen: Screen, top: float, items: Sequence[tuple[str, str, str]],
                    h: float = 62) -> None:
    """Evenly divided metric row (RTL order: first item sits at the physical right)."""
    width = (screen.w - 32) / len(items)
    for index, (value, label, icon) in enumerate(items):
        cx = screen.w - 16 - index * width - width / 2
        if index:
            screen.dividers_vertical(cx + width / 2, top + 8, top + h - 8)
        screen.text(cx, top + 6, value, "title", C.text, align="center")
        screen.text(cx, top + 34, label, "caption", C.muted, align="center", max_width=width - 6)
    return top + 46


def map_menu_button(screen: Screen, y: float):
    screen.icon_button(14, y, 44, "mdi-menu", 22, C.text_2, radius=15)


def map_tools(screen: Screen, y: float, layers=True, compass=True, angle=22):
    from .map import _compass_needle
    x = 14
    cursor = y
    if layers:
        screen.icon_button(x, cursor, 44, "mdi-layers-outline", 20, C.text_2, radius=15)
        cursor += 52
    if compass:
        screen.icon_button(x, cursor, 44, None, 20, C.text_2, radius=15)
        _compass_needle(screen, x + 22, cursor + 22, angle)


def search_pill(screen: Screen, x: float, y: float, w: float, h: float = 58,
                placeholder: str = "کجا می‌روی؟", tone: str = "idle", icon: str = "mdi-magnify",
                hint: str | None = None) -> None:
    screen.shadow(x, y, w, h, radius=h / 2, blur=20, dy=8, alpha=52)
    screen.rect(x, y, w, h, fill="#FFFFFF", radius=h / 2, outline=C.outline, outline_w=1)
    # search glyph in a soft teal disc (thumb-side, easy to see)
    screen.circle(x + w - 42, y + h / 2, 21, fill=C.primary_soft)
    screen.i.draw_icon(x + w - 42, y + h / 2, icon, 22, C.primary)
    if hint:
        screen.text(x + w - 74, y + 14, hint, "caption", C.muted)
        screen.text(x + w - 74, y + 32, placeholder, "label-lg", C.text_2, align="right")
    else:
        screen.text(x + w - 74, y + (h - TYPE["label-lg"][2]) / 2, placeholder, "label-lg",
                    C.muted, align="right", max_width=w - 96)


def quick_chips(screen: Screen, y: float, items: Sequence[tuple[str, str]], from_right: bool = True):
    """Row of shortcut chips anchored to the physical right edge (RTL reading start)."""
    cursor = screen.w - 16
    for label, icon in items:
        width = screen.tw(label, "caption-bold") + 46
        cursor -= width
        screen.shadow(cursor, y, width, 36, radius=18, blur=12, dy=4, alpha=34)
        screen.rect(cursor, y, width, 36, fill="#FFFFFF", radius=18, outline=C.outline, outline_w=1)
        screen.i.draw_icon(cursor + width - 18, y + 18, icon, 16, C.primary)
        screen.text(cursor + width - 32, y + 9, label, "caption-bold", C.text_2, align="right")
        cursor -= 8
    return cursor


def fab(screen: Screen, x: float, y: float, d: float, icon: str, color: str = C.primary,
        fill: str = "#FFFFFF", badge: str | None = None, label: str | None = None):
    screen.shadow(x, y, d, d, radius=d / 2, blur=16, dy=6, alpha=48)
    screen.rect(x, y, d, d, fill=fill, radius=d / 2, outline=C.outline, outline_w=1)
    screen.i.draw_icon(x + d / 2, y + d / 2, icon, 24, color)
    if badge:
        screen.circle(x + d - 6, y + 8, 10, fill=C.danger, outline="#FFFFFF", outline_w=2)
        screen.text(x + d - 6, y - 1, badge, "caption-bold", "#FFFFFF", align="center")
    if label:
        tw = screen.tw(label, "caption-bold") + 16
        screen.rect(x + d / 2 - tw / 2, y + d + 6, tw, 20, fill=C.text, radius=6)
        screen.text(x + d / 2, y + d + 9, label, "caption-bold", "#FFFFFF", align="center")


def sos_button(screen: Screen, cx: float, cy: float, r: float = 30, wide: bool = True):
    """Emergency control: a labelled alarm pill, never a bare red disc.

    Anatomy, and why:
      * a labelled pill (“SOS” + alarm-light glyph) is unmistakable next to the round
        map fabs, and the icon carries the meaning for colour-blind users;
      * a thin, dimmed halo ring separates it from the map without turning into a
        glowing blob over street labels;
      * a white rim keeps the shape crisp over roads;
      * it stays above the thumb zone and is confirmed in a second step.
    """
    h = r * 2
    w = h * 1.86 if wide else h
    with screen.alpha_layer():
        screen.rect(cx - w / 2 - 5, cy - h / 2 - 5, w + 10, h + 10, fill=(184, 63, 66, 30),
                    radius=(h + 10) / 2)
    screen.shadow(cx - w / 2, cy - h / 2 + 6, w, h, radius=h / 2, blur=18, dy=6,
                  color=C.danger, alpha=96)
    screen.rect(cx - w / 2, cy - h / 2, w, h, fill=C.danger, radius=h / 2,
                outline="#FFFFFF", outline_w=2.4)
    if wide:
        # RTL: glyph on the right, label to its left, measured so the pair is centred
        label = "SOS"
        label_w = screen.tw(label, "label-lg")
        glyph = r * 0.86
        gap = 9
        total = label_w + gap + glyph
        left = cx - total / 2
        screen.text(left, cy - 10, label, "label-lg", "#FFFFFF", align="left")
        screen.i.draw_icon(left + label_w + gap + glyph / 2, cy, "mdi-alarm-light", glyph,
                           "#FFFFFF")
    else:
        screen.i.draw_icon(cx, cy - h * 0.13, "mdi-alarm-light", r * 0.76, "#FFFFFF")
        screen.text(cx, cy + h * 0.10, "SOS", "caption-bold", "#FFFFFF", align="center")


def sheet_header(screen: Screen, top: float, title: str, subtitle: str | None = None,
                 icon: str | None = None, close: bool = True, trailing_icon: str | None = None,
                 tone: str = "primary", title_style: str = "title") -> float:
    """RTL header inside a sheet: leading icon + title at the right, close control at the left."""
    color = {"primary": C.primary, "danger": C.danger, "mission": C.mission,
             "success": C.success, "warning": C.warning}[tone]
    right = screen.w - 20
    if icon:
        screen.circle(right - 19, top + 19, 19, fill=_tint(color, 0.14))
        screen.i.draw_icon(right - 19, top + 19, icon, 20, color)
        right -= 50
    screen.text(right, top + 2, title, title_style, C.text, align="right",
                max_width=right - (56 if close else 18))
    if subtitle:
        screen.text(right, top + 30, subtitle, "caption", C.muted, align="right",
                    max_width=right - (56 if close else 18))
    if close:
        screen.icon_button(16, top + 2, 36, "mdi-close", 18, C.muted_2, fill=C.surface_2,
                           outline=None, shadow=False, radius=12)
    if trailing_icon:
        screen.icon_button(60, top + 2, 36, trailing_icon, 18, C.text_2, fill=C.surface_2,
                           outline=None, shadow=False, radius=12)
    return top + (60 if subtitle else 46)


def card_title_row(screen: Screen, x: float, y: float, w: float, title: str, subtitle: str,
                   icon: str, tone: str = "danger") -> float:
    """Icon + two-line title used by floating map cards (RTL: icon on the right)."""
    color = {"primary": C.primary, "danger": C.danger, "mission": C.mission,
             "success": C.success, "warning": C.warning}[tone]
    # 10px inset from the card edge and 6px from its top: at a 26px corner radius a
    # circle drawn closer than that visually collides with the rounded corner.
    cx, cy, r = x + w - 10 - 20, y + 6 + 20, 20
    screen.circle(cx, cy, r, fill=_tint(color, 0.14))
    screen.i.draw_icon(cx, cy, icon, 20, color)
    right = cx - r - 15
    screen.text(right, y + 4, title, "title", C.text, align="right", max_width=right - x - 8)
    screen.text(right, y + 32, subtitle, "caption", C.muted, align="right",
                max_width=right - x - 8)
    return y + 54


def segmented_small(screen: Screen, x: float, y: float, w: float, items: Sequence[str], active: int,
                    h: float = 38, counts: Sequence[str] | None = None) -> None:
    screen.rect(x, y, w, h, fill=C.surface_3, radius=h / 2)
    seg = w / len(items)
    # RTL: the first item of a Persian segment pair sits on the *right*. Laying them out left-to-right
    # put «مسیرهای من» on the left of «همراهان» on every history plate.
    for index, label in enumerate(items):
        sx = x + (len(items) - 1 - index) * seg
        if index == active:
            screen.shadow(sx + 3, y + 3, seg - 6, h - 6, radius=(h - 6) / 2, blur=8, dy=2, alpha=40)
            screen.rect(sx + 3, y + 3, seg - 6, h - 6, fill="#FFFFFF", radius=(h - 6) / 2)
            color = C.primary
        else:
            color = C.muted
        text = label
        if counts:
            text = f"{label} {counts[index]}"
        screen.text(sx + seg / 2, y + (h - TYPE["label"][2]) / 2, text, "label", color, align="center")


def metric_tiles(screen: Screen, x: float, y: float, w: float, items: Sequence[tuple[str, str, str]],
                 h: float = 62, gap: float = 8, surface: str = C.surface_2):
    """(label, value, icon) tiles in a row, right-to-left."""
    n = len(items)
    tw = (w - gap * (n - 1)) / n
    for index, (label, value, icon) in enumerate(items):
        tx = x + index * (tw + gap)
        screen.rect(tx, y, tw, h, fill=surface, radius=R.sm)
        # RTL: icon sits on the tile's right shoulder, caption ends just left of it
        label_right = tx + tw - 10
        if icon:
            screen.i.draw_icon(tx + tw - 17, y + 20, icon, 15, C.muted_2)
            label_right = tx + tw - 32
        screen.text(label_right, y + 8, label, "caption", C.muted, align="right",
                    max_width=tw - 20)
        # A metric that ends in "…" reads as a bug, so step the value down a size
        # instead of ellipsizing it inside a narrow tile.
        inner = tw - 20
        style = next((candidate for candidate in ("metric-sm", "title-sm", "title")
                      if screen.tw(value, candidate) <= inner), "title")
        offset = {"metric-sm": 26, "title-sm": 30, "title": 30}[style]
        screen.text(tx + tw - 10, y + offset, value, style, C.text, align="right",
                    max_width=inner)


def notice(screen: Screen, x: float, y: float, w: float, text: str, tone: str = "warning",
           icon: str | None = None, height: float | None = None, action: str | None = None) -> float:
    palette = {
        "warning": (C.warning_soft, C.warning, "mdi-alert-outline"),
        "danger": (C.danger_soft, C.danger, "mdi-alert-circle-outline"),
        "info": (C.info_soft, C.info, "mdi-information-outline"),
        "success": (C.success_soft, C.success, "mdi-check-circle-outline"),
        "neutral": (C.surface_2, C.muted, "mdi-information-outline"),
    }[tone]
    fill, color, default_icon = palette
    lines = screen.t.paragraph(x + 14, y + 10, text, "body-sm", C.text_2, align="right",
                              max_width=w - 28 - (44 if action else 0))
    h = height or max(48, lines + 20)
    screen.rect(x, y, w, h, fill=fill, radius=R.sm)
    screen.i.draw_icon(x + 22, y + 20, icon or default_icon, 18, color)
    screen.t.draw  # keep linters quiet
    if action:
        tw = screen.tw(action, "caption-bold") + 18
        screen.rect(x + 10, y + h - 34, tw, 24, fill="#FFFFFF", radius=8, outline=color, outline_w=1)
        screen.text(x + 10 + tw / 2, y + h - 30, action, "caption-bold", color, align="center")
    return y + h


def empty_state(screen: Screen, y: float, icon: str, title: str, body: str, cta: str | None = None):
    cx = screen.w / 2
    screen.circle(cx, y + 34, 34, fill=C.surface_2)
    screen.i.draw_icon(cx, y + 34, icon, 30, C.muted_2)
    screen.text(cx, y + 84, title, "title-sm", C.text, align="center")
    screen.para(cx - 120, y + 114, body, "body-sm", C.muted, align="center", max_width=240)
    if cta:
        screen.button(cx - 78, y + 172, 156, 44, cta, variant="tonal")


def key_row(screen: Screen, x: float, y: float, w: float, label: str, value: str,
            icon: str | None = None, value_color: str = C.text, hint: str | None = None) -> float:
    """Right-aligned label/value row used in detail sheets."""
    if icon:
        screen.i.draw_icon(x + w - 8, y + 10, icon, 17, C.muted_2)
        screen.text(x + w - 26, y, label, "body-sm", C.muted, align="right", max_width=w - 120)
    else:
        screen.text(x + w, y, label, "body-sm", C.muted, align="right", max_width=w - 100)
    screen.text(x + w, y, value, "label", value_color, align="right", max_width=w * 0.56)
    if hint:
        screen.text(x + w, y + 20, hint, "caption", C.muted_2, align="right")
        return y + 40
    return y + 26


def divider_row(screen: Screen, x: float, y: float, w: float):
    screen.divider(x, y, x + w)


def nav_banner(screen: Screen, maneuver_icon: str, distance: str, street: str, then: str | None,
               danger: bool = False, top: float = 0) -> float:
    """Turn-by-turn instruction card pinned to the top of an active navigation screen."""
    h = 116 if then else 92
    x = 12
    w = screen.w - 24
    fill = C.primary_deep
    screen.shadow(x, top, w, h, radius=24, blur=22, dy=8, color=C.primary_deep, alpha=86)
    screen.rect(x, top, w, h, fill=fill, radius=24)
    screen.rect(x, top, w, 4, fill=C.primary_soft_2, radius=2)
    arrow_size = 52
    with screen.alpha_layer():
        screen.circle(x + w - 52, top + 16 + arrow_size / 2, arrow_size / 2 + 4,
                      fill=(255, 255, 255, 30))
    screen.i.draw_icon(x + w - 52, top + 16 + arrow_size / 2, maneuver_icon, 34, "#FFFFFF")
    screen.text(x + w - 94, top + 10, distance, "display", "#FFFFFF", align="right")
    screen.text(x + w - 94, top + 44, street, "label-lg", "#E8F3F1", align="right",
                max_width=w - 140)
    if then:
        with screen.alpha_layer():
            screen.rect(x + 16, top + 82, w - 32, 1, fill=(255, 255, 255, 40))
        screen.i.draw_icon(x + w - 34, top + 96, "mdi-arrow-u-left-top", 16, "#A9CFCB")
        screen.text(x + w - 52, top + 86, then, "caption", "#C9E2DE", align="right",
                    max_width=w - 84)
    return top + h


def bottom_panel(screen: Screen, top: float, radius: float = 28, fill: str = "#FFFFFF") -> float:
    screen.shadow(0, top - 10, screen.w, screen.h - top + 20, radius=radius, blur=26, dy=-2, alpha=42)
    screen.rect(0, top, screen.w, screen.h - top + 2, fill=fill, radius=radius)
    screen.rect(0, top + radius, screen.w, screen.h - top - radius + 2, fill=fill)
    return top + 18


def home_bar(screen: Screen):
    screen.home_indicator()


def status_clock(screen: Screen, minutes_away: int, base_hour: int, base_minute: int) -> str:
    total = base_hour * 60 + base_minute + minutes_away
    hour = (total // 60) % 24
    minute = total % 60
    return fa_digits(f"{hour}:{minute:02d}")


def presence_dots(screen: Screen, x: float, y: float, n: int = 3, colors: Sequence[str] = ()):
    for index in range(n):
        color = colors[index] if index < len(colors) else C.outline_strong
        screen.circle(x + index * 9, y, 3.2, fill=color)
