"""History section screens (own trips, companions, filters, record details, states)."""
from __future__ import annotations

from typing import Callable

from bb.prims import Screen, scrim
from bb.text import fa_digits
from bb.theme import C, R, TYPE
from bb.ui import (chrome, empty_state, home_bar, metric_tiles, notice, segmented_small,
                   sheet_header, telemetry_strip)

from ._base import box, map_view
from bb import scenario as sc
from bb.map import draw_route


def _page(top: float) -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    return s


def _summary_card(s: Screen, y: float, headline: str, metrics):
    s.shadow(16, y, 361, 100, radius=20, blur=18, dy=6, alpha=26)
    s.rect(16, y, 361, 100, fill=C.primary, radius=20)
    s.text(357, y + 14, headline, "caption", "#BFE0DC", align="right")
    s.text(357, y + 32, "آبان ۱۴۰۵", "title-sm", "#FFFFFF", align="right")
    s.text(40, y + 20, "۱۲ سفر ثبت‌شده", "caption", "#A9D2CD", align="left")
    with s.alpha_layer():
        s.rect(28, y + 56, 345, 1, fill=(255, 255, 255, 42))
    for index, (value, label) in enumerate(metrics):
        # RTL: the first metric sits at the physical right edge and the row runs leftwards
        cx = 16 + 361 - (361 / 3) * (index + 0.5)
        s.text(cx, y + 64, value, "title-sm", "#FFFFFF", align="center")
        s.text(cx, y + 82, label, "caption", "#A9D2CD", align="center")
    return y + 112


def _trip_card(s: Screen, y: float, item: dict, selected: bool = False) -> float:
    # 4 text lines (14 + 58 + 18) + rule + meta row need ~146px, else the divider
    # cuts through the "to" address line.
    h = item.get("height", 146)
    s.shadow(16, y, 361, h, radius=18, blur=14, dy=4, alpha=20)
    s.rect(16, y, 361, h, fill="#FFFFFF", radius=18,
           outline=C.primary if selected else C.outline, outline_w=1.6 if selected else 1)

    # route spine: origin dot, dotted line, destination flag
    x = 357 - 20
    s.circle(x, y + 26, 5.5, fill=C.origin)
    s.dashed_vertical(x, y + 36, y + 62, C.outline_strong)
    s.i.draw_icon(x, y + 70, "mdi-flag-variant", 15, C.destination)

    s.text(357 - 34, y + 14, item["from"], "label-lg", C.text, align="right", max_width=200)
    s.text(357 - 34, y + 36, item["from_detail"], "caption", C.muted, align="right", max_width=210)
    s.text(357 - 34, y + 58, item["to"], "label-lg", C.text, align="right", max_width=200)
    s.text(357 - 34, y + 80, item["to_detail"], "caption", C.muted, align="right", max_width=210)

    # status chip (top-left) + date
    tone = {"completed": "success", "cancelled": "danger", "active": "info"}[item["status"]]
    label = {"completed": "تکمیل‌شده", "cancelled": "لغوشده", "active": "در جریان"}[item["status"]]
    s.chip(24, y + 12, label, None, tone, h=24)
    s.text(24, y + 40, item["date"], "caption", C.muted_2, align="left", max_width=110)
    s.divider(30, y + h - 40, 363)
    s.text(357 - 6, y + h - 32, f"{item['distance']} · {item['duration']} · {item['mode']}",
           "caption-bold", C.text_2, align="right")
    # companions
    if item.get("companions"):
        cx = 30
        for initial in item["companions"]:
            s.avatar(cx, y + h - 32, 21, initial, C.primary_soft, C.primary, "caption-bold")
            cx += 24
    else:
        s.i.draw_icon(30, y + h - 24, "mdi-account-outline", 15, C.muted_2)
    return y + h + 12


# --------------------------------------------------------------------------- #
# 01 — my trips
# --------------------------------------------------------------------------- #
TRIPS = [
    {"from": "خیابان دانشگاه", "from_detail": "موقعیت فعلی من", "to": "آتش‌نشانی مرکزی",
     "to_detail": "خیابان شریعتی، نبش کوچهٔ بهار", "date": "امروز · ۹:۴۱",
     "distance": "۱٫۳ کیلومتر", "duration": "۱۱ دقیقه", "mode": "خودرو",
     "status": "completed", "companions": ["م", "س"]},
    {"from": "منزل", "from_detail": "خیابان فردوس، پلاک ۲۴", "to": "بیمارستان امید",
     "to_detail": "خیابان دانشگاه", "date": "دیروز · ۱۸:۰۵",
     "distance": "۴٫۸ کیلومتر", "duration": "۱۷ دقیقه", "mode": "خودرو",
     "status": "completed", "companions": ["م", "ع"]},
    {"from": "محل کار", "from_detail": "بلوار کشاورز", "to": "میدان انقلاب",
     "to_detail": "خیابان انقلاب", "date": "۲۹ آبان · ۱۳:۲۰",
     "distance": "۲٫۱ کیلومتر", "duration": "۸ دقیقه", "mode": "دوچرخه",
     "status": "cancelled", "companions": []},
    {"from": "خیابان طالقانی", "from_detail": "کوچهٔ یاس", "to": "بوستان شریعتی",
     "to_detail": "بلوار فردوس", "date": "۲۷ آبان · ۰۷:۵۹",
     "distance": "۳٫۴ کیلومتر", "duration": "۴۲ دقیقه", "mode": "پیاده",
     "status": "completed", "companions": ["س"]},
]


def history_user() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62

    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0,
                    counts=["۱۲", "۳۴"])
    y += 50

    # search + filter row
    s.rect(16, y, 265, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.i.draw_icon(16 + 265 - 22, y + 22, "mdi-magnify", 18, C.muted_2)
    s.text(16 + 265 - 40, y + 10, "جستجو در سوابق", "body-sm", C.muted_2, align="right")
    s.rect(289, y, 88, 44, fill=C.primary_soft, radius=14)
    s.i.draw_icon(289 + 88 - 20, y + 22, "mdi-tune-variant", 18, C.primary)
    s.text(289 + 88 - 36, y + 10, "فیلتر", "body-sm", C.primary, align="right")
    y += 58

    y = _summary_card(s, y, "خلاصهٔ سفرهای این ماه", [("۱۲", "سفر"), ("۴۸٫۲", "کیلومتر"),
                                                     ("۳٫۵", "ساعت")])
    for item in TRIPS[:2]:
        y = _trip_card(s, y, item)
    s.rect(16, y + 2, 361, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.text(196.5, y + 12, "نمایش ۱۰ سفر دیگر", "label", C.primary, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 02 — companions history
# --------------------------------------------------------------------------- #
def history_companions() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=1,
                    counts=["۱۲", "۳۴"])
    y += 50

    s.rect(16, y, 265, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.i.draw_icon(16 + 265 - 22, y + 22, "mdi-magnify", 18, C.muted_2)
    s.text(16 + 265 - 40, y + 10, "جستجوی همراه", "body-sm", C.muted_2, align="right")
    s.rect(289, y, 88, 44, fill=C.primary_soft, radius=14)
    s.i.draw_icon(289 + 88 - 20, y + 22, "mdi-tune-variant", 18, C.primary)
    s.text(289 + 88 - 36, y + 10, "فیلتر", "body-sm", C.primary, align="right")
    y += 58

    s.text(377, y, "افراد همراه شما", "caption-bold", C.muted, align="right")
    s.text(300, y, "۶ نفر", "caption", C.muted_2, align="right")
    y += 22

    people = [("مریم رضایی", "۶ سفر مشترک", "آخرین سفر: دیروز", "م", C.primary),
              ("سعید کریمی", "۴ سفر مشترک", "آخرین سفر: ۲۹ آبان", "س", C.info),
              ("زهرا احمدی", "۳ سفر مشترک", "آخرین سفر: ۲۴ آبان", "ز", C.success),
              ("علی موسوی", "۲ سفر مشترک", "آخرین سفر: ۱۹ آبان", "ع", C.mission)]
    for name, count, last, initial, color in people:
        # three stacked lines need 72px: at 68 the last line's descenders were clipped
        s.shadow(16, y, 361, 72, radius=16, blur=12, dy=3, alpha=16)
        s.rect(16, y, 361, 72, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
        s.circle(357 - 34, y + 36, 22, fill=C.primary_soft)
        s.text(357 - 34, y + 27, initial, "title-sm", C.primary, align="center")
        s.text(357 - 66, y + 7, name, "label-lg", C.text, align="right")
        s.text(357 - 66, y + 28, count, "caption", C.muted, align="right")
        s.text(357 - 66, y + 45, last, "caption-bold", C.muted_2, align="right")
        s.i.draw_icon(22, y + 36, "mdi-chevron-left", 18, C.muted_2)
        y += 81

    s.rect(16, y, 361, 96, fill=C.surface_2, radius=16)
    s.i.draw_icon(357, y + 20, "mdi-shield-account-outline", 18, C.muted)
    s.text(335, y + 10, "حریم خصوصی همراهان", "caption-bold", C.text_2, align="right")
    # paragraph() takes the block's LEFT edge, so a right-aligned block ends at 35 + 300.
    s.para(35, y + 30, "فقط سفرهای مشترک با شما نمایش داده می‌شود؛ موقعیت زندهٔ آن‌ها در دسترس نیست.",
           "caption", C.muted, align="right", max_width=300, line_height=17)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 03 — filter
# --------------------------------------------------------------------------- #
def history_filter() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0,
                    counts=["۱۲", "۳۴"])
    y += 50
    s.rect(16, y, 265, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.i.draw_icon(24, y + 22, "mdi-magnify", 18, C.muted_2)
    y += 58
    for item in TRIPS[:1]:
        _trip_card(s, y, item)
    scrim(s, 120, top=0, height=852)

    top = 236
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=60)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = sheet_header(s, top + 22, "فیلتر سوابق", "۱۲ سفر در بازهٔ فعلی",
                     icon="mdi-tune-variant", title_style="title")

    # period
    s.text(377, y, "بازهٔ زمانی", "caption-bold", C.muted, align="right")
    y += 22
    periods = ["امروز", "۷ روز", "۳۰ روز", "سفارشی"]
    tile_w = (361 - 24) / 4
    for index, label in enumerate(periods):
        tx = 16 + index * (tile_w + 8)
        active = index == 2
        s.rect(tx, y, tile_w, 40, fill=C.primary if active else C.surface_2, radius=12)
        s.text(tx + tile_w / 2, y + 10, label, "label", "#FFFFFF" if active else C.text_2,
               align="center")
    y += 52

    # date inputs
    s.rect(16, y, 176, 52, fill=C.surface_2, radius=14)
    s.text(357 - 6, y + 8, "از تاریخ", "caption", C.muted, align="right")
    s.text(357 - 6, y + 26, "۲ آبان ۱۴۰۵", "label", C.text, align="right")
    s.rect(201, y, 176, 52, fill=C.surface_2, radius=14)
    s.text(196 - 6, y + 8, "تا تاریخ", "caption", C.muted, align="right")
    s.text(196 - 6, y + 26, "۲ آذر ۱۴۰۵", "label", C.text, align="right")
    y += 68

    s.text(377, y, "وضعیت سفر", "caption-bold", C.muted, align="right")
    y += 22
    for index, (label, count, active) in enumerate([("تکمیل‌شده", "۹", True), ("لغوشده", "۲", False),
                                                    ("در جریان", "۱", False)]):
        ry = y + index * 44
        s.rect(16, ry, 361, 38, fill=C.primary_soft if active else C.surface_2, radius=12)
        s.circle(347, ry + 19, 9, fill=C.primary if active else "#FFFFFF",
                 outline=None if active else C.outline_strong, outline_w=0 if active else 1.2)
        if active:
            s.i.draw_icon(347, ry + 19, "mdi-check", 11, "#FFFFFF")
        s.text(325, ry + 9, label, "body-sm", C.text if active else C.text_2, align="right")
        s.text(60, ry + 9, count, "caption-bold", C.muted, align="right")
    y += 3 * 44 + 8

    s.text(377, y, "وسیلهٔ حرکت", "caption-bold", C.muted, align="right")
    y += 22
    for index, (label, icon, active) in enumerate([("خودرو", "mdi-car", True),
                                                   ("دوچرخه", "mdi-bicycle", False),
                                                   ("پیاده", "mdi-walk", False)]):
        tw = (361 - 16) / 3
        tx = 16 + index * (tw + 8)
        s.rect(tx, y, tw, 44, fill=C.primary_soft if active else C.surface_2, radius=12,
               outline=C.primary if active else None, outline_w=1.4 if active else 0)
        s.i.draw_icon(tx + tw - 20, y + 22, icon, 18, C.primary if active else C.muted)
        s.text(tx + tw - 34, y + 12, label, "body-sm", C.primary if active else C.text_2,
               align="right")
    y += 58

    s.text(377, y, "همراه", "caption-bold", C.muted, align="right")
    y += 22
    cx = 357
    for initial in ["م", "س", "ز", "ع"]:
        cx -= 34
        s.circle(cx + 13, y + 14, 14, fill=C.surface_3)
        s.text(cx + 13, y + 6, initial, "caption-bold", C.text_2, align="center")
    s.rect(cx - 32, y, 30, 28, fill=C.surface_2, radius=14)
    s.i.draw_icon(cx - 17, y + 14, "mdi-plus", 15, C.muted_2)

    s.shadow(16, 742, 176, 50, radius=16, blur=14, dy=5, color=C.primary, alpha=70)
    s.button(201, 742, 176, 50, "اعمال فیلتر", icon="mdi-check", variant="filled")
    s.button(16, 742, 176, 50, "پاک‌کردن", icon="mdi-filter-remove-outline", variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 04 — record details
# --------------------------------------------------------------------------- #
def _fit_preview(points, box_, height: float, padding: float = 0.84) -> "Camera":
    """`fit_camera` for a short preview strip: it assumes the full 393×852 viewport, this one doesn't."""
    from bb.map import Camera
    x0, y0, x1, y1 = box_
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    ppu = min((x1 - x0) / max(1e-6, max(xs) - min(xs)),
              (y1 - y0) / max(1e-6, max(ys) - min(ys))) * padding
    centre = ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)
    return Camera((centre[0] - ((x0 + x1) / 2 - 393 / 2) / ppu,
                   centre[1] + ((y0 + y1) / 2 - height / 2) / ppu), ppu)


def _legend(screen: Screen, x: float, y: float, w: float,
            items: list[tuple[str, str, bool]]) -> float:
    """(label, colour, dashed) keys on a white card: a recorded trip needs four line meanings."""
    rows = (len(items) + 1) // 2
    h = 12 + rows * 22
    screen.rect(x, y, w, h, fill="#FFFFFF", radius=12, outline=C.outline, outline_w=1)
    for index, (label, color, dashed) in enumerate(items):
        row, col = divmod(index, 2)
        # RTL: first key top-right; the swatch sits at the *end* of each cell, the label left of it
        right = x + w - 12 - col * (w / 2)
        cy = y + 19 + row * 22
        if dashed:
            for k in range(3):
                screen.rect(right - 26 + k * 10, cy - 1.5, 6, 3, fill=color, radius=1.5)
        else:
            screen.rect(right - 26, cy - 1.5, 26, 3, fill=color, radius=1.5)
        screen.text(right - 34, cy - 8, label, "caption", C.text_2, align="right")
    return y + h


def history_details() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)

    # the record is a *comparison*: what was suggested, where I left it, what was suggested next
    from bb.map import Camera, draw_base, draw_labels, draw_trace, deviation_marker, \
        destination_pin, origin_marker, to_world
    preview_h = 300
    pts = sc.route_world(sc.TRIP_PLAN) + sc.route_world(sc.TRIP_ACTUAL)
    cam = _fit_preview(pts, (26, 12, 367, 224), preview_h)
    preview = Screen(background=C.map_land, width=393, height=preview_h)
    draw_base(preview, cam)
    draw_labels(preview, cam)

    draw_route(preview, cam, sc.route_world(sc.TRIP_PLAN), color=C.route_alt, width_m=9,
               opacity=120, dashed=True)
    draw_route(preview, cam, sc.route_world(sc.TRIP_ACTUAL), color=C.primary, width_m=11)
    draw_trace(preview, cam, sc.route_world(sc.TRIP_OFFROUTE), color=C.warning, width_px=4.2,
               opacity=210, dashed=True)
    reroute = sc.route_world([sc.TRIP_REALISED_AT, (390, 240), sc.TRIP_REJOIN_AT])
    draw_route(preview, cam, reroute, color=C.info, width_m=5, opacity=230, dashed=True)

    origin_marker(preview, cam, *sc.USER)
    destination_pin(preview, cam, *sc.INCIDENT, label=None)
    deviation_marker(preview, cam, *sc.TRIP_DEVIATION_AT, label="انحراف", label_side="above")
    _legend(preview, 16, preview_h - 54, 361,
            [("مسیر شما", C.primary, False), ("مسیر پیشنهادی", C.route_alt, True),
             ("اشتباه در مسیر", C.warning, True), ("مسیر جدید", C.info, True)])

    s.img.paste(preview.img, (0, 118 * s.s))
    s.rect(0, 118 + preview_h, 393, 1, fill=C.outline)

    s.shadow(14, 136, 44, 44, radius=15, blur=12, dy=4, alpha=40)
    s.rect(14, 136, 44, 44, fill="#FFFFFF", radius=15, outline=C.outline, outline_w=1)
    s.i.draw_icon(36, 158, "mdi-arrow-right", 20, C.text_2)

    top = 428
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=44)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 18
    s.text(357, y, "سفر به آتش‌نشانی مرکزی", "title", C.text, align="right", max_width=250)
    s.text(357, y + 28, "امروز · ۹:۴۱ تا ۹:۵۲ · ۱٫۴ کیلومتر", "caption", C.muted, align="right")
    s.chip(24, y + 2, "تکمیل‌شده", "mdi-check", "success", h=24)
    y += 54

    metric_tiles(s, 16, y, 361, [("مدت", "۱۱ دقیقه", "mdi-clock-outline"),
                                 ("توقف", "۲ دقیقه", "mdi-pause-circle-outline"),
                                 ("انحراف", "۱ بار", "mdi-map-marker-alert")], h=58)
    y += 70

    s.text(377, y, "سیر سفر", "caption-bold", C.muted, align="right")
    y += 24
    steps = [("شروع سفر", "خیابان دانشگاه · مسیر پیشنهادی پذیرفته شد", "۹:۴۱", "mdi-play",
              C.primary, C.primary_soft),
             ("انحراف از مسیر", "پیچ اشتباه؛ مسیر پیشنهادی رد شد", "۹:۴۶", "mdi-alert-outline",
              C.warning, C.warning_soft),
             ("مسیر جدید پیشنهاد شد", "۱٫۱ کیلومتر دوباره محاسبه شد", "۹:۴۷", "mdi-routes",
              C.info, C.info_soft),
             ("رسیدن به مقصد", "آتش‌نشانی مرکزی · خیابان شریعتی", "۹:۵۲", "mdi-flag-checkered",
              C.success, C.success_soft)]
    for index, (head, detail, when, icon, tone, soft) in enumerate(steps):
        ry = y + index * 46
        line_bottom = ry + 46 if index < len(steps) - 1 else ry + 16
        s.dividers_vertical(357 - 12, ry + 17, line_bottom, C.outline)
        s.circle(357 - 12, ry + 12, 9, fill=soft, outline=tone, outline_w=1.4)
        s.i.draw_icon(357 - 12, ry + 12, icon, 11, tone)
        s.text(357 - 32, ry + 1, head, "label", C.text, align="right")
        s.text(357 - 32, ry + 21, detail, "caption", C.muted, align="right", max_width=250)
        s.text(16, ry + 2, when, "caption-bold", C.muted_2, align="left")
    y += len(steps) * 46 + 6

    s.button(201, y, 176, 46, "تکرار این سفر", icon="mdi-restore", variant="filled")
    s.button(16, y, 176, 46, "اشتراک‌گذاری", icon="mdi-share-variant", variant="tonal")
    assert y + 46 < 838, f"detail sheet overflows (ends at {y + 46:.0f})"
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 05–07 — states
# --------------------------------------------------------------------------- #
def history_loading() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0)
    y += 54
    s.spinner(196.5, y + 26, 16, C.primary)
    s.text(196.5, y + 54, "در حال دریافت سوابق سفر…", "caption", C.muted, align="center")
    y += 84

    def skeleton(y0: float, h: float):
        s.rect(16, y0, 361, h, fill="#FFFFFF", radius=18, outline=C.outline, outline_w=1)
        for (bx, by, bw, bh, r) in [(357 - 34, y0 + 16, 150, 14, 7), (357 - 34, y0 + 38, 200, 10, 5),
                                    (357 - 34, y0 + 60, 140, 14, 7), (357 - 34, y0 + 82, 190, 10, 5),
                                    (24, y0 + 16, 64, 22, 11)]:
            s.rect(bx, by, bw, bh, fill=C.surface_3, radius=r)
        s.divider(30, y0 + h - 40, 363)
        s.rect(30, y0 + h - 30, 120, 10, fill=C.surface_3, radius=5)

    for index in range(3):
        skeleton(y + index * 152, 146)
    s.text(196.5, y + 3 * 152 + 8, "بارگذاری صفحهٔ ۱ از ۳", "caption", C.muted_2, align="center")
    home_bar(s)
    return s


def history_empty() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    # no counts here: a lone Persian zero renders as a dot and reads as a glitch
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0)
    # the whole empty block is short, so push it down to sit optically centred
    y += 130

    # illustrative empty card with a dashed route (compact, so it does not read as a blank panel)
    s.rect(16, y, 361, 104, fill="#FFFFFF", radius=20, outline=C.outline, outline_w=1)
    s.dashed_route_illustration(196.5, y + 52, 250)
    y += 126

    s.circle(196.5, y + 34, 32, fill=C.primary_soft)
    s.i.draw_icon(196.5, y + 34, "mdi-map-marker-path", 30, C.primary)
    s.text(196.5, y + 78, "هنوز سفری ثبت نشده است", "title", C.text, align="center")
    s.para(56, y + 108, "با انتخاب یک مقصد روی نقشه، اولین سفر شما شروع می‌شود و پس از پایان اینجا ذخیره می‌شود.",
           "body-sm", C.muted, align="center", max_width=280)
    s.button(96.5, y + 172, 200, 50, "شروع مسیریابی", icon="mdi-navigation-variant",
             variant="filled", shadow=True)
    home_bar(s)
    return s


def history_error() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    y = 124
    s.text(377, y, "تاریخچه", "display", C.text, align="right")
    s.text(377, y + 38, "سوابق سفرها و همراهان شما", "caption", C.muted, align="right")
    y += 62
    segmented_small(s, 16, y, 361, ["مسیرهای من", "همراهان"], active=0)
    y += 58

    s.rect(16, y, 361, 96, fill=C.danger_soft, radius=18)
    s.i.draw_icon(357 - 22, y + 28, "mdi-cloud-alert-outline", 22, C.danger)
    s.text(357 - 52, y + 14, "دریافت سوابق ناموفق بود", "label-lg", C.danger, align="right")
    s.text(357 - 52, y + 40, "بدون اتصال؛ سوابق ذخیره‌شده نمایش داده می‌شود.", "caption",
           C.muted, align="right", max_width=270)
    s.rect(24, y + 62, 96, 26, fill="#FFFFFF", radius=9)
    s.text(72, y + 66, "تلاش دوباره", "caption-bold", C.danger, align="center")
    y += 112

    s.chip(16, y, "نمایش آخرین نسخهٔ ذخیره‌شده", "mdi-database-outline", "neutral", h=28)
    y += 40
    for item in TRIPS[:2]:
        y = _trip_card(s, y, item)
    s.text(196.5, y + 2, "این فهرست ممکن است قدیمی باشد", "caption", C.muted_2, align="center")
    home_bar(s)
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "h-01-user": ("history/01-history-user.png", history_user),
    "h-02-companions": ("history/02-history-companions.png", history_companions),
    "h-03-filter": ("history/03-history-filter.png", history_filter),
    "h-04-details": ("history/04-history-details.png", history_details),
    "h-05-loading": ("history/05-history-loading.png", history_loading),
    "h-06-empty": ("history/06-history-empty.png", history_empty),
    "h-07-error": ("history/07-history-error.png", history_error),
}
