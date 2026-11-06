"""Navigation section screens: map, search, trip setup, routing and live guidance."""
from __future__ import annotations

from typing import Callable

from bb import scenario as sc
from bb.map import Camera, draw_route, fit_camera, scale_bar
from bb.prims import Screen, scrim
from bb.text import fa_digits
from bb.theme import C, R, TYPE
from bb.ui import (bottom_panel, chrome, card_title_row, fab, home_bar, map_avatar_button, map_tools, metric_tiles,
                   nav_banner, notice, quick_chips, search_pill, sheet_header, sos_button,
                   sos_dock, telemetry_strip)

from ._base import (box, destination_pin, incident_marker, keepout, map_view, origin_marker,
                    user_cone)

ROUTE_MAIN = sc.route_world(sc.ROUTE_MAIN)
ROUTE_ALT = sc.route_world(sc.ROUTE_ALT)


# --------------------------------------------------------------------------- #
# 01 — idle map
# --------------------------------------------------------------------------- #
def map_idle() -> Screen:
    cam = sc.camera(sc.USER[0] + 90, sc.USER[1] - 130, 0.185)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 126), box(0, 690, 393, 162),
                                      box(0, 594, 132, 80), box(258, 646, 135, 40)))
    s.top_scrim(128)
    chrome(s, tab=1)
    # the account owns the map's trailing corner, opposite the tools: top-left is where a thumb
    # reaches the layers control, and the avatar sitting above it read as a fifth map tool
    map_avatar_button(s, 128, x=335)
    map_tools(s, 128, angle=22)

    user_cone(s, cam, *sc.USER, bearing=28)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire", rings=False)

    fab(s, 327, 552, 44, "mdi-crosshairs-gps")
    fab(s, 327, 604, 44, "mdi-broadcast", C.success)

    # SOS is docked to the map's trailing edge, in line with the sheet's 16px inset, never
    # floating over the streets where the eye has to hunt for it
    sos_box = sos_dock(s, 606)

    quick_chips(s, 700, [("خانه", "mdi-home-outline"), ("محل کار", "mdi-briefcase-outline"),
                         ("آخرین مقصد", "mdi-history")])
    search_pill(s, 14, 752, 365, h=58, placeholder="کجا می‌روی؟")
    # the scale bar moved off the corner the SOS pill now owns: single line, under the fabs
    scale_bar(s, cam, 268, 660)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 02 — search open
# --------------------------------------------------------------------------- #
def search_open() -> Screen:
    cam = sc.camera(sc.USER[0] + 40, sc.USER[1] + 40, 0.185)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 108, 393, 744)))
    scrim(s, 62, top=0, height=852)
    chrome(s, tab=1)

    top = 116
    s.shadow(0, top - 8, 393, 852 - top, radius=28, blur=24, dy=-2, alpha=54)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=28)
    s.rect(0, top + 28, 393, 852 - top - 28, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    fy = top + 26
    s.rect(16, fy, 361, 54, fill=C.surface_2, radius=18, outline=C.primary, outline_w=1.6)
    s.i.draw_icon(357, fy + 27, "mdi-magnify", 22, C.primary)
    # RTL caret: it sits immediately left of the typed run, not on top of it
    query = "آتش"
    s.text(335, fy + 12, query, "title-sm", C.text, align="right")
    s.rect(335 - s.tw(query, "title-sm") - 4, fy + 15, 1.6, 24, fill=C.primary)
    s.icon_button(24, fy + 9, 36, "mdi-close", 18, C.muted_2, fill="#FFFFFF", outline=None,
                  radius=12, shadow=False)

    y = fy + 68
    s.text(377, y, "نتایج جستجو", "caption-bold", C.muted, align="right")
    s.text(300, y, "۴ نتیجه", "caption", C.muted_2, align="right")
    y += 22

    results = [
        ("آتش‌نشانی مرکزی", "ایستگاه آتش‌نشانی · خیابان شریعتی", "۱٫۲ کیلومتر", "fire-truck", True),
        ("آتش‌نشانی منطقه ۳", "ایستگاه آتش‌نشانی · بلوار فردوس", "۳٫۴ کیلومتر", "fire-truck", False),
        ("بوستان آتش‌نشان", "بوستان · محلهٔ کشاورز", "۲٫۱ کیلومتر", "tree", False),
        ("کلینیک آتش‌نشان", "مرکز درمانی · خیابان انقلاب", "۴٫۸ کیلومتر", "hospital-building", False),
    ]
    for index, (name, kind, distance, icon, active) in enumerate(results):
        ry = y + index * 72
        if active:
            s.rect(12, ry - 4, 369, 66, fill=C.primary_soft, radius=16)
        s.circle(357, ry + 29, 20, fill="#FFFFFF" if not active else C.surface)
        s.i.draw_icon(357, ry + 29, icon, 20, C.primary if active else C.muted)
        s.text(327, ry + 6, name, "label-lg", C.text, align="right", max_width=252)
        s.text(327, ry + 30, kind, "caption", C.muted, align="right", max_width=252)
        s.text(327, ry + 45, distance, "caption-bold", C.primary if active else C.muted_2,
               align="right")
        if index < len(results) - 1:
            s.divider(16, ry + 68, 377)
    y += len(results) * 72 + 8

    s.rect(16, y, 361, 46, fill=C.surface_2, radius=14)
    s.i.draw_icon(357, y + 23, "mdi-map-search-outline", 20, C.text_2)
    s.text(335, y + 11, "جستجو در محدودهٔ نقشه", "label", C.text_2, align="right")
    s.i.draw_icon(32, y + 23, "mdi-chevron-left", 20, C.muted_2)
    y += 62

    s.text(377, y, "جستجوهای اخیر", "caption-bold", C.muted, align="right")
    y += 22
    for index, label in enumerate(["بیمارستان امید", "میدان انقلاب"]):
        cy = y + index * 40
        s.i.draw_icon(357, cy + 14, "mdi-history", 18, C.muted_2)
        s.text(335, cy + 3, label, "body-sm", C.text_2, align="right")
        s.i.draw_icon(26, cy + 14, "mdi-arrow-top-left", 16, C.muted_2)
    y += 92

    # offline / weak-connection state, inline so search stays usable
    s.rect(16, y, 361, 44, fill=C.warning_soft, radius=14)
    s.i.draw_icon(357, y + 22, "mdi-wifi-off", 18, C.warning)
    s.text(335, y + 5, "اتصال قطع است · نتایج ذخیره‌شده", "caption-bold", C.warning, align="right")
    s.text(335, y + 23, "پس از برقراری اتصال، فهرست کامل نمایش داده می‌شود.", "caption", C.muted,
           align="right", max_width=290)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 03 — destination selected on map
# --------------------------------------------------------------------------- #
def destination_selected() -> Screen:
    cam = sc.camera(150, 140, 0.20).aim_at(*sc.INCIDENT, 200, 300)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 560, 393, 292)))
    s.top_scrim(120)
    chrome(s, tab=1)
    map_tools(s, 122, angle=18)

    draw_route(s, cam, ROUTE_MAIN, width_m=11, dashed=True, mute=0.62)
    destination_pin(s, cam, *sc.INCIDENT, None, pulse=True)
    user_cone(s, cam, *sc.USER, bearing=28)

    card_y = 560
    s.shadow(12, card_y, 369, 262, radius=26, blur=24, dy=8, alpha=48)
    s.rect(12, card_y, 369, 262, fill="#FFFFFF", radius=26, outline=C.outline, outline_w=1)
    s.rect(188, card_y + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    card_title_row(s, 12, card_y + 22, 369, sc.DEST_NAME, sc.DEST_ADDRESS, "fire-truck", "danger")

    # metric chips, right to left
    chips = [("۱٫۲ کیلومتر", "mdi-map-marker-distance", "neutral"),
             ("۴ دقیقه", "mdi-car-clock", "neutral"),
             ("ترافیک روان", "mdi-traffic-light", "success")]
    widths = [s.tw(label, "caption-bold") + 35 for label, _, _ in chips]
    cx = 357 - (sum(widths) + 8 * (len(chips) - 1))
    for (label, icon, tone), width in zip(chips, widths):
        s.chip(cx, card_y + 84, label, icon, tone, h=30)
        cx += width + 8

    s.divider(30, card_y + 128, 363)
    s.button(201, card_y + 142, 168, 50, "سفر", icon="mdi-navigation-variant", variant="filled",
             shadow=True)
    s.button(24, card_y + 142, 168, 50, "ارسال موقعیت", icon="mdi-share-variant", variant="tonal")
    s.text(196.5, card_y + 210, "برای انتخاب نقطهٔ دیگر، نقشه را جابه‌جا کنید",
           "caption", C.muted_2, align="center", max_width=330)
    s.text(196.5, card_y + 228, "یا از نوار جستجو استفاده کنید", "caption", C.muted_2,
           align="center", max_width=330)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 04 — destination details sheet
# --------------------------------------------------------------------------- #
def destination_details() -> Screen:
    cam = sc.camera(120, 120, 0.185).aim_at(*sc.INCIDENT, 200, 190)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 250, 393, 602)))
    s.top_scrim(120)
    chrome(s, tab=1)
    destination_pin(s, cam, *sc.INCIDENT, None)
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 252
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    # The kind already has its own row below, and the full "kind · address" string
    # ellipsized between the close button and the icon: keep the address only.
    y = sheet_header(s, top + 22, sc.DEST_NAME, sc.DEST_ADDRESS,
                     icon="fire-truck", tone="danger", title_style="title-lg")

    # metric strip
    metric_tiles(s, 16, y, 361, [("فاصله", "۱٫۲ کیلومتر", "mdi-map-marker-distance"),
                                 ("با خودرو", "۴ دقیقه", "mdi-car"),
                                 ("با دوچرخه", "۹ دقیقه", "mdi-bicycle")], h=64)
    y += 78

    s.rect(16, y, 361, 96, fill=C.surface_2, radius=18)
    rows = [("نوع مکان", "ایستگاه آتش‌نشانی"), ("ساعت کاری", "۲۴ ساعته"),
            ("شمارهٔ تماس", "۱۲۵")]
    for index, (label, value) in enumerate(rows):
        ry = y + 12 + index * 26
        s.text(357 - 10, ry, label, "caption", C.muted, align="right")
        s.text(200, ry, value, "caption-bold", C.text_2, align="right")
        if index < len(rows) - 1:
            s.divider(30, ry + 21, 340)
    y += 110

    s.button(16, y, 361, 54, "سفر به این مقصد", icon="mdi-navigation-variant", variant="filled",
             shadow=True)
    y += 66
    s.button(201, y, 176, 48, "ارسال موقعیت", icon="mdi-share-variant", variant="tonal")
    s.button(16, y, 176, 48, "افزودن به مسیر", icon="mdi-plus-circle-outline", variant="tonal")
    y += 62

    s.rect(16, y, 361, 96, fill="#FFFFFF", radius=18, outline=C.outline, outline_w=1)
    actions = [("کپی مختصات", "mdi-content-copy", C.text_2), ("مسیریابی چندمقصدی", "mdi-map-marker-path", C.text_2)]
    for index, (label, icon, color) in enumerate(actions):
        ry = y + 12 + index * 38
        s.i.draw_icon(357, ry + 12, icon, 19, color)
        s.text(335, ry + 2, label, "body-sm", color, align="right")
        s.i.draw_icon(30, ry + 12, "mdi-chevron-left", 18, C.muted_2)
    y += 110

    s.i.draw_icon(357, y + 16, "mdi-flag-remove-outline", 19, C.danger)
    s.text(335, y + 5, "پاک‌کردن مقصد", "body-sm", C.danger, align="right")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 05 — trip setup / transport selection
# --------------------------------------------------------------------------- #
def trip_transport() -> Screen:
    cam = sc.camera(60, 90, 0.21).aim_at(*sc.INCIDENT, 230, 250)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 366, 393, 486)))
    s.top_scrim(120)
    chrome(s, tab=1)
    draw_route(s, cam, ROUTE_MAIN, width_m=11, dashed=True, mute=0.55)
    destination_pin(s, cam, *sc.INCIDENT, None)
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 360
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 24
    s.text(377, y, "تنظیم سفر", "title", C.text, align="right")
    s.text(300, y + 4, "مبدأ، مقصد و وسیله", "caption", C.muted, align="right")
    s.icon_button(16, y, 36, "mdi-close", 18, C.muted_2, fill=C.surface_2, outline=None,
                  radius=12, shadow=False)

    y += 44
    s.rect(16, y, 361, 132, fill=C.surface_2, radius=18)
    # origin
    s.circle(349, y + 26, 6, fill=C.origin)
    s.text(334, y + 12, "مبدأ · موقعیت فعلی من", "caption", C.text_2, align="right")
    s.text(334, y + 32, sc.USER_ADDRESS, "body-sm", C.muted, align="right", max_width=250)
    s.text(70, y + 22, "تغییر", "caption-bold", C.primary, align="right")
    s.divider(46, y + 62, 340)
    # destination
    s.circle(349, y + 90, 6, fill=C.destination)
    s.text(334, y + 76, "مقصد", "caption", C.text_2, align="right")
    s.text(334, y + 96, sc.DEST_NAME, "body-sm", C.ink if hasattr(C, "ink") else C.text,
           align="right", max_width=250)
    s.text(70, y + 86, "تغییر", "caption-bold", C.primary, align="right")
    y += 146

    s.text(377, y, "وسیلهٔ حرکت", "caption-bold", C.muted, align="right")
    y += 20
    modes = [("خودرو", "mdi-car", "۴ دقیقه", True), ("دوچرخه", "mdi-bicycle", "۹ دقیقه", False),
             ("پیاده", "mdi-walk", "۲۳ دقیقه", False)]
    tile_w = (361 - 16) / 3
    for index, (label, icon, eta, active) in enumerate(modes):
        tx = 16 + index * (tile_w + 8)
        s.rect(tx, y, tile_w, 82, fill=C.primary_soft if active else C.surface_2, radius=R.md,
               outline=C.primary if active else None, outline_w=1.8 if active else 0)
        s.i.draw_icon(tx + tile_w / 2, y + 26, icon, 26, C.primary if active else C.muted)
        s.text(tx + tile_w / 2, y + 46, label, "label", C.primary if active else C.text_2,
               align="center")
        s.text(tx + tile_w / 2, y + 62, eta, "caption", C.muted_2, align="center")
        if active:
            s.circle(tx + tile_w - 13, y + 13, 8.5, fill=C.primary)
            s.i.draw_icon(tx + tile_w - 13, y + 13, "mdi-check", 11, "#FFFFFF")
    y += 96

    s.button(16, y, 361, 54, "مسیریابی", icon="mdi-routes", variant="filled", shadow=True)
    y += 64
    s.i.draw_icon(357, y + 8, "mdi-information-outline", 15, C.muted_2)
    s.text(342, y, "زمان‌ها برآوردی است؛ ترافیک زنده در این نسخه محاسبه نمی‌شود.",
           "caption", C.muted_2, align="right", max_width=300)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 06 — manual origin selection
# --------------------------------------------------------------------------- #
def manual_origin() -> Screen:
    cam = sc.camera(-40, 40, 0.30).aim_at(-40, 60, 196, 470)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 226), box(0, 676, 393, 176)))
    s.top_scrim(120)
    chrome(s, tab=1)

    draw_route(s, cam, ROUTE_MAIN, width_m=9, dashed=True, mute=0.45)
    origin_marker(s, cam, *sc.USER, "مبدأ فعلی")
    destination_pin(s, cam, *sc.INCIDENT, None, icon="flag-variant")

    # fixed centre pin: the map moves under it, so it is the only marker with a shadow
    cx, cy = 196, 470
    with s.alpha_layer():
        s.circle(cx, cy + 24, 17, fill=(15, 40, 40, 34))
    s.i.draw_icon(cx, cy, "mdi-map-marker", 54, C.primary)

    s.shadow(12, 136, 369, 84, radius=22, blur=20, dy=6, alpha=46)
    s.rect(12, 136, 369, 84, fill="#FFFFFF", radius=22, outline=C.outline, outline_w=1)
    s.circle(357 - 20, 136 + 30, 19, fill=C.primary_soft)
    s.i.draw_icon(357 - 20, 136 + 30, "mdi-crosshairs-gps", 20, C.primary)
    s.text(357 - 50, 136 + 14, "انتخاب مبدأ سفر", "title-sm", C.text, align="right", max_width=270)
    s.text(357 - 50, 136 + 40, "نشانگر را روی نقطهٔ شروع جابه‌جا کنید", "caption", C.muted,
           align="right", max_width=270)
    s.text(357 - 50, 136 + 58, "GPS فعلی: " + sc.USER_ADDRESS, "caption", C.muted_2,
           align="right", max_width=290)

    top = 668
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=28, blur=24, dy=-2, alpha=48)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=28)
    s.rect(0, top + 28, 393, 852 - top - 28, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)
    s.text(377, top + 26, "خیابان ولیعصر، نبش کوچهٔ یاس", "label-lg", C.text, align="right",
           max_width=300)
    s.text(377, top + 50, "مبدأ دستی · دقت تقریبی ۲۵ متر", "caption", C.muted, align="right")
    s.button(201, top + 76, 176, 50, "تأیید مبدأ", icon="mdi-check", variant="filled")
    s.button(16, top + 76, 176, 50, "استفاده از GPS", icon="mdi-crosshairs-gps", variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 07 — route options
# --------------------------------------------------------------------------- #
def route_options() -> Screen:
    cam = sc.camera(20, 60, 0.145).aim_at(120, 60, 196, 300)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 356, 393, 496)))
    s.top_scrim(120)
    chrome(s, tab=1)

    # alternatives first (muted), selected route on top
    draw_route(s, cam, sc.route_world(sc.ROUTE_STEP), width_m=13, mute=0.72)
    draw_route(s, cam, sc.route_world(sc.ROUTE_ALT), width_m=13, mute=0.52)
    draw_route(s, cam, ROUTE_MAIN, width_m=15)
    destination_pin(s, cam, *sc.INCIDENT, None, pulse=True)
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 352
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=54)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 22
    s.text(377, y, "مسیرهای پیشنهادی", "title", C.text, align="right")
    s.text(377, y + 26, "۳ مسیر · زمان بدون ترافیک", "caption", C.muted, align="right")
    s.icon_button(16, y, 36, "mdi-close", 18, C.muted_2, fill=C.surface_2, outline=None,
                  radius=12, shadow=False)
    y += 54

    options = [
        ("مسیر ۱", "سریع‌ترین", "۹ دقیقه", "۱٫۲ کیلومتر", "ترافیک روان", True),
        ("مسیر ۲", "بدون ترافیک", "۱۲ دقیقه", "۱٫۵ کیلومتر", "نیمه‌سنگین", False),
        ("مسیر ۳", "کوتاه‌ترین", "۱۳ دقیقه", "۱٫۱ کیلومتر", "سنگین", False),
    ]
    for index, (name, tag, minutes, distance, traffic, selected) in enumerate(options):
        ry = y + index * 86
        s.rect(16, ry, 361, 78, fill=C.primary_soft if selected else C.surface_2, radius=16,
               outline=C.primary if selected else None, outline_w=1.8 if selected else 0)
        # right block: route name + character
        s.text(357 - 16, ry + 12, name, "caption", C.muted, align="right")
        s.text(357 - 16, ry + 28, tag, "label-lg", C.text, align="right", max_width=140)
        # left block: time + distance, then the traffic chip underneath
        s.text(150, ry + 10, minutes, "title-sm", C.primary if selected else C.text, align="right")
        s.text(150, ry + 34, distance, "caption", C.muted, align="right")
        s.chip(24, ry + 50, traffic, None,
               "success" if "روان" in traffic else ("warning" if "نیمه" in traffic else "danger"),
               h=22)
        if selected:
            # tick sits on the card's leading top corner, not on the route-name line
            s.circle(16 + 20, ry + 19, 10, fill=C.primary)
            s.i.draw_icon(16 + 20, ry + 19, "mdi-check", 13, "#FFFFFF")
        s.dividers_vertical(190, ry + 12, ry + 66, C.outline)
    y += len(options) * 86 + 4

    s.button(16, y, 176, 52, "شروع سفر", icon="mdi-navigation-variant", variant="filled", shadow=True)
    s.button(201, y, 176, 52, "نمایش کامل", icon="mdi-map-outline", variant="tonal")
    y += 66
    s.rect(16, y, 361, 44, fill=C.surface_2, radius=12)
    s.i.draw_icon(357 - 18, y + 22, "mdi-information-outline", 15, C.muted_2)
    s.text(357 - 36, y + 12, "زمان‌ها برآوردی و بدون ترافیک زنده‌اند", "caption", C.muted,
           align="right", max_width=300)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 08 — route selected
# --------------------------------------------------------------------------- #
def route_selected() -> Screen:
    cam = sc.camera(20, 40, 0.155).aim_at(100, 40, 196, 380)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 618, 393, 234)))
    s.top_scrim(120)
    chrome(s, tab=1)
    draw_route(s, cam, ROUTE_MAIN, width_m=14)
    destination_pin(s, cam, *sc.INCIDENT, None, pulse=True)
    user_cone(s, cam, *sc.USER, bearing=28)

    # small top hint
    s.shadow(96, 122, 196, 34, radius=17, blur=12, dy=4, alpha=36)
    s.rect(96, 122, 196, 34, fill="#FFFFFF", radius=17, outline=C.outline, outline_w=1)
    s.i.draw_icon(276, 139, "mdi-routes", 16, C.primary)
    s.text(262, 130, "مسیر ۱ از ۳ · سریع‌ترین", "caption-bold", C.text_2, align="right")

    card_y = 612
    s.shadow(12, card_y, 369, 216, radius=26, blur=24, dy=8, alpha=48)
    s.rect(12, card_y, 369, 216, fill="#FFFFFF", radius=26, outline=C.outline, outline_w=1)
    s.rect(188, card_y + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    s.text(377 - 14, card_y + 22, "۹ دقیقه", "metric", C.text, align="right")
    s.text(377 - 96, card_y + 30, "رسیدن حدود ۹:۵۰", "caption", C.muted, align="right")
    s.chip(16 + 12, card_y + 24, "ترافیک روان", "mdi-traffic-light", "success", h=26)

    s.text(377 - 14, card_y + 66, "۱٫۲ کیلومتر · مسیر ۱", "body-sm", C.muted, align="right")
    s.divider(28, card_y + 96, 365)

    # steps preview
    steps = [("mdi-arrow-up", "۲۵۰ متر", "خیابان دانشگاه"), ("mdi-arrow-left", "۶۰۰ متر", "خیابان شریعتی")]
    for index, (icon, dist, street) in enumerate(steps):
        ry = card_y + 104 + index * 30
        s.i.draw_icon(377 - 12, ry + 11, icon, 18, C.text_2)
        s.text(377 - 32, ry + 2, dist, "caption-bold", C.text, align="right")
        s.text(300, ry + 2, street, "caption", C.muted, align="right", max_width=150)

    s.button(201, card_y + 158, 168, 50, "شروع سفر", icon="mdi-navigation-variant",
             variant="filled", shadow=True)
    s.button(24, card_y + 158, 168, 50, "مسیر جایگزین", icon="mdi-routes", variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 09 — navigation active
# --------------------------------------------------------------------------- #
def navigation_active() -> Screen:
    # Heading-up: the road ahead points to the top of the screen, like a real navigator.
    cam = sc.camera(*sc.USER, 0.46).heading_up(28).aim_at(*sc.USER, 196, 520)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 240), box(0, 664, 393, 188),
                                      box(0, 574, 140, 84)), pois=False)
    s.top_scrim(200, start=240)
    chrome(s, tab=1)

    draw_route(s, cam, ROUTE_MAIN, width_m=14)
    user_cone(s, cam, *sc.USER, bearing=0)
    nav_banner(s, "mdi-arrow-left", "۲۵۰ متر", "به خیابان شریعتی بپیچید", "سپس ۶۰۰ متر مستقیم",
               top=116)

    # low-noise side controls, thumb-free zone
    s.icon_button(14, 246, 44, "mdi-volume-high", 20, C.primary, radius=15)
    s.icon_button(14, 298, 44, "mdi-routes", 20, C.text_2, radius=15)
    s.icon_button(14, 350, 44, "mdi-map-outline", 20, C.text_2, radius=15)

    # the same dock as every other map page: trailing edge, just above the sheet. The old round
    # disc hung in the middle of the map, over a street label and inside the thumb's reach
    sos_dock(s, 584)

    top = 656
    s.shadow(0, top - 8, 393, 852 - top + 16, radius=26, blur=24, dy=-2, alpha=48)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=26)
    s.rect(0, top + 26, 393, 852 - top - 26, fill="#FFFFFF")
    telemetry_strip(s, top + 10, [("۹:۵۰", "رسیدن", "mdi-clock-check-outline"),
                                  ("۴ دقیقه", "زمان مانده", "mdi-timer-sand"),
                                  ("۸۵۰ متر", "مسافت مانده", "mdi-map-marker-distance"),
                                  ("۴۲", "km/h", "mdi-speedometer")], h=58)
    s.button(16, top + 76, 361, 50, "پایان سفر", icon="mdi-stop-circle-outline", variant="tonal",
             color=C.danger)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 10 — alternatives while navigating
# --------------------------------------------------------------------------- #
def navigation_alternatives() -> Screen:
    cam = sc.camera(*sc.USER, 0.42).heading_up(28).aim_at(*sc.USER, 196, 380)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 240), box(0, 462, 393, 390)), pois=False)
    s.top_scrim(200, start=240)
    chrome(s, tab=1)
    draw_route(s, cam, sc.route_world(sc.ROUTE_ALT), width_m=12, mute=0.30)
    draw_route(s, cam, ROUTE_MAIN, width_m=13)
    user_cone(s, cam, *sc.USER, bearing=28)
    nav_banner(s, "mdi-arrow-left", "۲۵۰ متر", "به خیابان شریعتی بپیچید", None, top=116)
    scrim(s, 60, top=470, height=382)

    top = 462
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=28, blur=26, dy=-2, alpha=56)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=28)
    s.rect(0, top + 28, 393, 852 - top - 28, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 24
    s.text(377, y, "مسیر جایگزین", "title", C.text, align="right")
    s.text(377, y + 26, "راهنمای زنده تا انتخاب شما ادامه دارد", "caption", C.muted, align="right")
    s.icon_button(16, y, 36, "mdi-close", 18, C.muted_2, fill=C.surface_2, outline=None,
                  radius=12, shadow=False)
    y += 58

    options = [
        ("مسیر فعلی", "۹ دقیقه", "۸۵۰ متر مانده", "روان", True),
        ("از خیابان انقلاب", "+۳ دقیقه", "۱٫۱ کیلومتر مانده", "نیمه‌سنگین", False),
    ]
    for index, (name, time, distance, traffic, active) in enumerate(options):
        ry = y + index * 88
        s.rect(16, ry, 361, 80, fill=C.primary_soft if active else C.surface_2, radius=16,
               outline=C.primary if active else None, outline_w=1.6 if active else 0)
        # RTL card: selection disc on the left, name + meta on the right,
        # traffic chip on its own line so nothing overlaps the border
        if active:
            s.circle(16 + 30, ry + 40, 13, fill=C.primary)
            s.i.draw_icon(16 + 30, ry + 40, "mdi-check", 16, "#FFFFFF")
        else:
            s.circle(16 + 30, ry + 40, 13, fill=None, outline=C.outline_strong, outline_w=1.6)
        s.text(357 - 14, ry + 12, name, "label-lg", C.text, align="right", max_width=250)
        s.text(357 - 14, ry + 33, f"{time} · {distance}", "caption", C.muted, align="right",
               max_width=250)
        chip_w = s.chip(0, -100, traffic, None, "success" if traffic == "روان" else "warning",
                        h=22)  # measure only, drawn below
        s.chip(357 - 14 - chip_w, ry + 48, traffic, None,
               "success" if traffic == "روان" else "warning", h=22)
    y += len(options) * 88

    s.button(16, y, 361, 50, "بازگشت به مسیر فعلی", icon="mdi-arrow-u-right-bottom",
             variant="tonal")
    y += 60
    s.text(196.5, y, "با انتخاب مسیر جدید، راهنمای زنده از موقعیت فعلی بازمحاسبه می‌شود.",
           "caption", C.muted_2, align="center", max_width=350)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 11 — full route overview
# --------------------------------------------------------------------------- #
def navigation_full_route() -> Screen:
    cam = sc.camera(20, 40, 0.135).aim_at(120, 40, 196, 440)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 200), box(0, 668, 393, 184)))
    s.top_scrim(190, start=240)
    chrome(s, tab=1)
    draw_route(s, cam, ROUTE_MAIN, width_m=17)
    destination_pin(s, cam, *sc.INCIDENT, None, pulse=True)
    user_cone(s, cam, *sc.USER, bearing=28)

    s.shadow(12, 122, 369, 72, radius=20, blur=18, dy=6, alpha=44)
    s.rect(12, 122, 369, 72, fill="#FFFFFF", radius=20, outline=C.outline, outline_w=1)
    s.text(357 - 14, 134, "نمای کامل مسیر", "title-sm", C.text, align="right")
    s.text(357 - 14, 160, "مبدأ: موقعیت فعلی · مقصد: آتش‌نشانی مرکزی", "caption", C.muted,
           align="right", max_width=300)
    s.icon_button(24, 136, 40, "mdi-arrow-collapse", 19, C.primary, fill=C.primary_soft, outline=None,
                  shadow=False, radius=13)

    # route summary panel along the bottom
    top = 660
    s.shadow(0, top - 8, 393, 852 - top + 16, radius=26, blur=24, dy=-2, alpha=48)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=26)
    s.rect(0, top + 26, 393, 852 - top - 26, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)
    s.text(377 - 14, top + 22, "۹ دقیقه · ۱٫۲ کیلومتر", "title", C.text, align="right")
    s.text(377 - 14, top + 52, "رسیدن ۹:۵۰ · ترافیک روان · ۲ مانور", "caption", C.muted,
           align="right")
    s.divider(30, top + 76, 363)
    s.button(16, top + 88, 176, 50, "راهنمای زنده", icon="mdi-navigation-variant",
             variant="filled", shadow=True)
    s.button(201, top + 88, 176, 50, "مسیر جایگزین", icon="mdi-source-branch",
             variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 12 — off route
# --------------------------------------------------------------------------- #
def navigation_off_route() -> Screen:
    cam = sc.camera(*sc.USER, 0.40).heading_up(28).aim_at(*sc.USER, 196, 470)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 300), box(0, 646, 393, 206)), pois=False)
    s.top_scrim(250, start=250)
    chrome(s, tab=1)

    draw_route(s, cam, ROUTE_MAIN, width_m=12, mute=0.58)
    user_cone(s, cam, *sc.USER, bearing=0, color=C.warning)
    # Dashed line back to the closest point of the active route.
    rejoin = sc.to_world(sc.USER[0] + 210, sc.USER[1] + 40)
    draw_route(s, cam, [sc.to_world(*sc.USER), rejoin], color=C.warning, width_m=8, dashed=True)

    s.shadow(12, 116, 369, 158, radius=24, blur=22, dy=8, color="#5A3B08", alpha=76)
    s.rect(12, 116, 369, 158, fill="#8A5A10", radius=24)
    with s.alpha_layer():
        s.circle(321, 152, 24, fill=(255, 255, 255, 30))
    s.i.draw_icon(321, 152, "mdi-map-marker-off", 26, "#FFFFFF")
    s.text(287, 128, "از مسیر خارج شدید", "title-lg", "#FFFFFF", align="right")
    s.text(287, 158, "۱۸۰ متر تا بازگشت به مسیر", "label", "#FBE6C4", align="right")
    with s.alpha_layer():
        s.rect(28, 186, 337, 1, fill=(255, 255, 255, 46))
    s.text(361, 196, "در اسرع وقت به مسیر بازگردید یا مسیر را بازمحاسبه کنید.", "caption",
           "#F7E4C8", align="right", max_width=330)
    s.rect(24, 224, 168, 38, fill="#FFFFFF", radius=19)
    # RTL: icon leads from the right edge of each pill, label trails to its left
    _lbl = "بازگشت به مسیر"
    _tot = 17 + 6 + s.tw(_lbl, "caption-bold")
    _right = 24 + (168 + _tot) / 2
    s.i.draw_icon(_right - 8.5, 243, "mdi-arrow-u-right-bottom", 17, "#8A5A10")
    s.text(_right - 23, 233, _lbl, "caption-bold", "#8A5A10", align="right")
    s.rect(201, 224, 168, 38, fill=None, radius=19, outline="#F3D9A8", outline_w=1.4)
    _lbl = "بازمحاسبهٔ مسیر"
    _tot = 17 + 6 + s.tw(_lbl, "caption-bold")
    _right = 201 + (168 + _tot) / 2
    s.i.draw_icon(_right - 8.5, 243, "mdi-refresh", 17, "#FBEFD6")
    s.text(_right - 23, 233, _lbl, "caption-bold", "#FBEFD6", align="right")

    s.icon_button(14, 290, 44, "mdi-volume-off", 20, C.muted, radius=15)
    s.shadow(96, 292, 200, 32, radius=16, blur=10, dy=3, alpha=30)
    s.rect(96, 292, 200, 32, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
    s.i.draw_icon(276, 308, "mdi-signal-cellular-1", 15, C.warning)
    s.text(262, 300, "GPS ضعیف · دقت ۳۸ متر", "caption-bold", C.warning, align="right")

    top = 616
    s.shadow(0, top - 8, 393, 852 - top + 16, radius=26, blur=24, dy=-2, alpha=48)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=26)
    s.rect(0, top + 26, 393, 852 - top - 26, fill="#FFFFFF")
    s.text(377 - 14, top + 12, "مسیر بازمحاسبه شد", "title-sm", C.text, align="right")
    s.text(377 - 14, top + 38, "۱۱ دقیقه · ۱٫۴ کیلومتر · رسیدن ۹:۵۲", "caption", C.muted,
           align="right")
    s.button(16, top + 66, 150, 50, "توقف", icon="mdi-stop-circle-outline", variant="tonal",
             color=C.danger)
    s.button(178, top + 66, 199, 50, "ادامهٔ راهنمایی", icon="mdi-navigation", variant="filled")
    s.rect(16, top + 128, 361, 40, fill=C.surface_2, radius=12)
    s.i.draw_icon(357 - 18, top + 148, "mdi-map-marker-distance", 15, C.muted_2)
    s.text(357 - 36, top + 138, "مسیر جدید از موقعیت فعلی شما محاسبه شده است", "caption",
           C.muted, align="right", max_width=300)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 13 — multi destination
# --------------------------------------------------------------------------- #
STOPS = [("۱", "آتش‌نشانی مرکزی", "شریعتی، نبش کوچهٔ بهار", "۴ دقیقه", True),
         ("۲", "میدان انقلاب", "خیابان انقلاب، میدان", "۳ دقیقه", False),
         ("۳", "بیمارستان امید", "خیابان دانشگاه، پلاک ۸", "۵ دقیقه", False)]
MULTI_ROUTE = [sc.USER, (260, -120), (260, 240), sc.INCIDENT, (-250, 200), (-250, -160),
               (-620, -160), sc.HOME]


def multi_destination() -> Screen:
    # The route must sit *between* the section control (y=118) and the sheet (y=286),
    # so the camera is solved from the polyline instead of hand-tuned: a hand-tuned
    # camera let the last leg run under the segmented control.
    route_pts = sc.route_world(MULTI_ROUTE)
    cam = fit_camera(route_pts, (30, 168, 363, 274), padding=1.0)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 128), box(0, 286, 393, 566)))
    s.top_scrim(120)
    chrome(s, tab=1)

    draw_route(s, cam, route_pts, width_m=13)
    for index, (u, v) in enumerate([sc.INCIDENT, (-250, 200), sc.HOME], start=1):
        x, y = cam.project_grid(u, v, s)
        if index == 3:
            destination_pin(s, cam, u, v, None, icon="flag-checkered")
        else:
            s.circle(x, y, 14, fill=C.primary, outline="#FFFFFF", outline_w=2.4)
            s.text(x, y - 8, fa_digits(index), "label", "#FFFFFF", align="center")
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 286
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=54)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 22
    s.text(377, y, "مسیر چندمقصدی", "title", C.text, align="right")
    s.text(377, y + 26, "۴٫۲ کیلومتر · ۱۸ دقیقه · ۳ مقصد", "caption", C.muted, align="right")
    s.icon_button(16, y, 36, "mdi-close", 18, C.muted_2, fill=C.surface_2, outline=None,
                  radius=12, shadow=False)
    y += 58

    s.text(377, y, "مقصدها به ترتیب حرکت", "caption-bold", C.muted, align="right")
    y += 22
    for index, (num, name, address, eta, first) in enumerate(STOPS):
        ry = y + index * 66
        s.rect(16, ry - 4, 361, 60, fill=C.primary_soft if first else C.surface_2, radius=16)
        s.circle(357 - 22, ry + 26, 15, fill=C.primary if first else "#FFFFFF",
                 outline=None if first else C.outline_strong, outline_w=0 if first else 1.2)
        s.text(357 - 22, ry + 18, num, "label", "#FFFFFF" if first else C.text_2, align="center")
        s.text(357 - 46, ry + 6, name, "label-lg", C.text, align="right", max_width=210)
        s.text(357 - 46, ry + 28, address, "caption", C.muted, align="right", max_width=210)
        s.text(80, ry + 14, eta, "label", C.primary if first else C.text_2, align="right")
        s.i.draw_icon(28, ry + 26, "mdi-drag-vertical", 20, C.muted_2)
    y += len(STOPS) * 66 + 8

    s.rect(16, y, 176, 46, fill=C.surface_2, radius=14)
    s.i.draw_icon(176, y + 23, "mdi-plus", 19, C.primary)
    s.text(168, y + 12, "افزودن مقصد", "label", C.primary, align="right")
    s.rect(201, y, 176, 46, fill=C.surface_2, radius=14)
    s.i.draw_icon(361, y + 23, "mdi-sort-variant", 19, C.text_2)
    s.text(345, y + 12, "سریع‌ترین ترتیب", "label", C.text_2, align="right")
    y += 62

    # totals row fills the panel and answers "how long will this take?"
    s.rect(16, y, 361, 58, fill=C.surface_2, radius=16)
    s.text(357 - 12, y + 8, "مجموع سفر", "caption", C.muted, align="right")
    s.text(357 - 12, y + 28, "۴٫۲ کیلومتر · ۱۸ دقیقه · رسیدن ۱۰:۰۲", "label", C.text,
           align="right")
    y += 74

    s.button(16, y, 361, 52, "شروع سفر", icon="mdi-navigation-variant", variant="filled",
             shadow=True)
    y += 52
    s.rect(16, y, 361, 1, fill=C.outline)
    s.i.draw_icon(357, y + 14, "mdi-timer-sand", 15, C.muted_2)
    s.text(340, y + 4, "ترتیب مقصدها را می‌توانید هنگام سفر نیز تغییر دهید.", "caption",
           C.muted_2, align="right", max_width=300)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 14 — destination reordering
# --------------------------------------------------------------------------- #
def destination_reordering() -> Screen:
    # Same trip as screen 13 (before/after of a reorder), fitted to the map band so
    # the line never runs under the section control or off into empty canvas.
    reorder_pts = sc.route_world(MULTI_ROUTE)
    cam = fit_camera(reorder_pts, (30, 168, 363, 274), padding=1.0)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 124), box(0, 286, 393, 566)))
    s.top_scrim(120)
    chrome(s, tab=1)
    draw_route(s, cam, reorder_pts, width_m=13)
    for index, (u, v) in enumerate([sc.INCIDENT, (-250, 200), sc.HOME], start=1):
        x, y = cam.project_grid(u, v, s)
        if index == 3:
            destination_pin(s, cam, u, v, None, icon="flag-checkered")
        else:
            s.circle(x, y, 14, fill=C.primary, outline="#FFFFFF", outline_w=2.4)
            s.text(x, y - 8, fa_digits(index), "label", "#FFFFFF", align="center")
    user_cone(s, cam, *sc.USER, bearing=28)
    scrim(s, 40, top=290, height=562)

    top = 292
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=54)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 22
    s.text(377, y, "مرتب‌سازی مقصدها", "title", C.text, align="right")
    s.text(377, y + 26, "برای جابه‌جایی، دستهٔ کنار هر مقصد را بکشید", "caption", C.muted,
           align="right", max_width=300)
    s.icon_button(16, y, 36, "mdi-close", 18, C.muted_2, fill=C.surface_2, outline=None,
                  radius=12, shadow=False)
    y += 58

    rows = [("بیمارستان امید", "خیابان دانشگاه، پلاک ۸", "۱", False),
            ("آتش‌نشانی مرکزی", "شریعتی، نبش کوچهٔ بهار", "۲", True),
            ("میدان انقلاب", "خیابان انقلاب", "۳", False)]
    for index, (name, address, num, dragging) in enumerate(rows):
        ry = y + index * 62
        if dragging:
            s.shadow(12, ry - 4, 369, 64, radius=18, blur=20, dy=8, alpha=60)
            s.rect(12, ry - 4, 369, 64, fill="#FFFFFF", radius=18, outline=C.primary, outline_w=1.6)
        s.circle(357 - 16, ry + 22, 14, fill=C.primary if num == "۱" else C.surface_3)
        s.text(357 - 16, ry + 14, num, "label", "#FFFFFF" if num == "۱" else C.text_2,
               align="center")
        s.text(357 - 40, ry + 8, name, "label-lg", C.text, align="right", max_width=210)
        s.text(357 - 40, ry + 30, address, "caption", C.muted, align="right", max_width=210)
        if dragging:
            s.rect(24, ry + 4, 32, 48, fill=C.primary_soft, radius=12)
            s.i.draw_icon(40, ry + 16, "mdi-chevron-up", 18, C.primary)
            s.i.draw_icon(40, ry + 38, "mdi-chevron-down", 18, C.primary)
        else:
            s.i.draw_icon(24, ry + 22, "mdi-drag-vertical", 20, C.muted_2)
        if index < len(rows) - 1 and not dragging:
            s.divider(46, ry + 56, 336)

    y += len(rows) * 62 + 4
    s.rect(16, y, 361, 46, fill=C.surface_2, radius=14)
    s.i.draw_icon(357, y + 23, "mdi-sort-variant", 19, C.primary)
    s.text(341, y + 12, "مرتب‌سازی خودکار بر اساس سریع‌ترین مسیر", "label", C.primary,
           align="right")
    y += 60

    s.rect(16, y, 361, 84, fill=C.warning_soft, radius=16)
    s.i.draw_icon(357, y + 19, "mdi-alert-outline", 18, C.warning)
    s.text(335, y + 9, "مسیر بازمحاسبه می‌شود", "caption-bold", C.warning, align="right")
    s.para(39, y + 32, "با تغییر ترتیب، مسیر از موقعیت فعلی شما دوباره محاسبه و زمان‌ها "
           "به‌روزرسانی می‌شوند.", "caption", C.muted, align="right", max_width=296,
           line_height=18)
    y += 98

    s.button(201, y, 176, 50, "ذخیرهٔ ترتیب", icon="mdi-check", variant="filled")
    s.button(16, y, 176, 50, "انصراف", variant="outline")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 15 — SOS confirmation
# --------------------------------------------------------------------------- #
def sos_confirmation() -> Screen:
    cam = Camera(sc.to_world(*sc.USER), 0.36).aim_at(*sc.USER, 196, 520)
    s = map_view(cam, pois=False)
    scrim(s, 150)
    chrome(s, tab=1)
    nav_banner(s, "mdi-arrow-left", "۲۵۰ متر", "به خیابان شریعتی بپیچید", None, top=116)
    scrim(s, 160)

    top = 268
    s.shadow(16, top, 361, 470, radius=28, blur=26, dy=10, alpha=70)
    s.rect(16, top, 361, 470, fill="#FFFFFF", radius=28)
    s.circle(196, top + 46, 30, fill=C.danger_soft)
    s.i.draw_icon(196, top + 46, "alarm-light", 32, C.danger)
    s.text(196, top + 86, "درخواست امداد اضطراری", "title-lg", C.text, align="center")
    s.para(36, top + 118, "با تأیید، موقعیت شما و جزئیات سفر برای مرکز امداد ارسال می‌شود.",
           "body-sm", C.muted, align="center", max_width=320)

    info_y = top + 176
    s.rect(32, info_y, 329, 88, fill=C.surface_2, radius=16)
    s.text(347, info_y + 12, "موقعیت ارسالی", "caption", C.muted, align="right")
    s.text(347, info_y + 32, "خیابان شریعتی، بین بهار و معلم", "body-sm", C.text_2,
           align="right", max_width=280)
    s.text(347, info_y + 56, "دقت GPS: ۱۲ متر", "caption", C.muted_2, align="right")
    s.chip(44, info_y + 56, "در حال حرکت", "mdi-car", "info", h=24)

    # type selector
    s.text(347, info_y + 102, "نوع حادثه", "caption-bold", C.muted, align="right")
    types_y = info_y + 124
    for index, (label, icon, active) in enumerate([("آتش‌سوزی", "fire", True),
                                                   ("حادثه", "car-emergency", False),
                                                   ("پزشکی", "medical-bag", False)]):
        tw = 100
        tx = 347 - (index + 1) * (tw + 8) + 8
        s.rect(tx, types_y, tw, 46, fill=C.danger_soft if active else C.surface_2, radius=14,
               outline=C.danger if active else None, outline_w=1.6 if active else 0)
        # RTL tile: icon leads from the right edge, label sits to its left
        s.i.draw_icon(tx + tw - 20, types_y + 23, icon, 18, C.danger if active else C.muted)
        s.text(tx + tw - 36, types_y + 14, label, "caption-bold",
               C.danger if active else C.text_2, align="right", max_width=tw - 46)

    # hold to send
    btn_y = top + 376
    s.shadow(32, btn_y, 329, 54, radius=27, blur=18, dy=6, color=C.danger, alpha=100)
    s.rect(32, btn_y, 329, 54, fill=C.danger, radius=27)
    s.i.draw_icon(347 - 28, btn_y + 27, "mdi-gesture-tap-hold", 22, "#FFFFFF")
    s.text(347 - 48, btn_y + 15, "برای ارسال نگه دارید", "label-lg", "#FFFFFF", align="right")
    s.text(196, btn_y + 64, "انصراف", "label", C.muted, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 16 — cancel trip
# --------------------------------------------------------------------------- #
def trip_cancel() -> Screen:
    cam = Camera(sc.to_world(*sc.USER), 0.36).aim_at(*sc.USER, 196, 300)
    s = map_view(cam, pois=False)
    s.top_scrim(150)
    scrim(s, 120)
    chrome(s, tab=1)
    draw_route(s, cam, ROUTE_MAIN, width_m=12)
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 330
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=60)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 24
    s.circle(377 - 20, y + 20, 20, fill=C.danger_soft)
    s.i.draw_icon(377 - 20, y + 20, "mdi-close-octagon-outline", 22, C.danger)
    s.text(377 - 50, y + 6, "پایان دادن به سفر؟", "title", C.text, align="right")
    s.text(377 - 50, y + 32, "با پایان سفر، راهنمای زنده متوقف می‌شود.", "caption", C.muted,
           align="right", max_width=280)
    y += 62

    s.text(377, y, "دلیل پایان", "caption-bold", C.muted, align="right")
    y += 22
    reasons = ["به مقصد رسیدم", "تغییر برنامه", "مسیر اشتباه بود", "سایر دلایل"]
    for index, reason in enumerate(reasons):
        ry = y + index * 50
        active = index == 0
        s.rect(16, ry, 361, 44, fill=C.primary_soft if active else C.surface_2, radius=14,
               outline=C.primary if active else None, outline_w=1.4 if active else 0)
        s.circle(347, ry + 22, 9, fill=C.primary if active else "#FFFFFF",
                 outline=None if active else C.outline_strong, outline_w=0 if active else 1.4)
        if active:
            s.i.draw_icon(347, ry + 22, "mdi-check", 12, "#FFFFFF")
        s.text(325, ry + 11, reason, "body-sm", C.text if active else C.text_2, align="right")
    y += len(reasons) * 50 + 6

    s.button(201, y, 176, 52, "پایان سفر", variant="filled", color=C.danger)
    s.button(16, y, 176, 52, "ادامهٔ سفر", variant="tonal", color=C.primary)
    y += 64
    s.rect(16, y, 361, 1, fill=C.outline)
    s.text(196.5, y + 12, "پایان سفر در سوابق شما ثبت می‌شود و قابل بازبینی است.", "caption",
           C.muted_2, align="center", max_width=340)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 17 — trip completed
# --------------------------------------------------------------------------- #
def trip_completed() -> Screen:
    cam = sc.camera(150, 150, 0.17).aim_at(*sc.INCIDENT, 196, 216)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 300, 393, 552)))
    s.top_scrim(120)
    chrome(s, tab=1)
    draw_route(s, cam, ROUTE_MAIN, width_m=11, mute=0.55)
    destination_pin(s, cam, *sc.INCIDENT, None, icon="flag-checkered")

    top = 292
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=54)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    s.circle(196, top + 44, 26, fill=C.success_soft)
    s.i.draw_icon(196, top + 44, "mdi-check-bold", 26, C.success)
    s.text(196, top + 78, "به مقصد رسیدید", "title-lg", C.text, align="center")
    s.text(196, top + 106, sc.DEST_NAME, "body-sm", C.muted, align="center")

    metric_tiles(s, 16, top + 138, 361, [("مسافت", "۱٫۳ کیلومتر", "mdi-map-marker-distance"),
                                         ("مدت", "۱۱ دقیقه", "mdi-clock-outline"),
                                         ("میانگین", "۱۹ km/h", "mdi-speedometer")], h=72)
    y = top + 226
    s.rect(16, y, 361, 66, fill=C.surface_2, radius=16)
    s.text(357, y + 12, "خروج ۹:۴۱ · رسیدن ۹:۵۲", "caption", C.muted, align="right")
    s.text(357, y + 32, "ترافیک روان · بدون انحراف از مسیر", "caption-bold", C.text_2,
           align="right")

    y += 80
    # the trip ends with a decision: an ordinary trip is only kept if the driver says so
    with s.alpha_layer():
        s.rect(28, y - 8, 337, 1, fill=(14, 102, 102, 24))
    s.text(357, y + 4, "این سفر در تاریخچه ذخیره شود؟", "label-lg", C.text, align="right")
    s.text(357, y + 30, "اگر ذخیره نکنید، مسیر، آمار و همراهان این سفر از بین می‌رود.",
           "caption", C.muted, align="right", max_width=330)
    y += 60
    s.button(201, y, 176, 48, "ذخیره در تاریخچه", icon="mdi-content-save-outline", variant="filled")
    s.button(16, y, 176, 48, "بدون ذخیره", variant="surface", color=C.text_2)
    y += 62
    s.button(16, y, 361, 46, "اشتراک‌گذاری این مسیر", icon="mdi-share-variant", variant="tonal")
    y += 60
    with s.alpha_layer():
        s.rect(28, y, 337, 1, fill=(14, 102, 102, 24))
    s.text(196.5, y + 12, "مأموریت‌های امداد همیشه ثبت می‌شوند و انتخاب ذخیره ندارند.", "caption",
           C.muted_2, align="center")
    assert y + 26 < 838, f"trip-completed sheet overflows (ends at {y + 26:.0f})"
    home_bar(s)
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "01-map-idle": ("navigation/01-map-idle.png", map_idle),
    "02-search-open": ("navigation/02-search-open.png", search_open),
    "03-destination-selected": ("navigation/03-destination-selected.png", destination_selected),
    "04-destination-details": ("navigation/04-destination-details.png", destination_details),
    "05-trip-transport": ("navigation/05-trip-transport-selection.png", trip_transport),
    "06-manual-origin": ("navigation/06-manual-origin-selection.png", manual_origin),
    "07-route-options": ("navigation/07-route-options.png", route_options),
    "08-route-selected": ("navigation/08-route-selected.png", route_selected),
    "09-navigation-active": ("navigation/09-navigation-active.png", navigation_active),
    "10-navigation-alternatives": ("navigation/10-navigation-alternatives.png",
                                   navigation_alternatives),
    "11-navigation-full-route": ("navigation/11-navigation-full-route.png", navigation_full_route),
    "12-navigation-off-route": ("navigation/12-navigation-off-route.png", navigation_off_route),
    "13-multi-destination": ("navigation/13-multi-destination.png", multi_destination),
    "14-destination-reordering": ("navigation/14-destination-reordering.png",
                                  destination_reordering),
    "15-sos-confirmation": ("navigation/15-sos-confirmation.png", sos_confirmation),
    "16-trip-cancel": ("navigation/16-trip-cancel.png", trip_cancel),
    "17-trip-completed": ("navigation/17-trip-completed.png", trip_completed),
}
