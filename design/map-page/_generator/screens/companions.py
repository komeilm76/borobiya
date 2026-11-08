"""Companions: fellow travellers on a trip, and location/history sharing with people.

This section exists because two different relationships had been sharing one tab:

* **a fellow traveller (همسفر)** joins *one trip*. They see everybody's live position, everybody's
  travelled trace and every status while the trip is open, and they can talk to any one of them by
  holding their finger on that person's marker.
* **sharing a location** is not about a trip at all. One user grants another a position (forever, or
  for a limited window) and, separately, a slice of their recorded history for a date range. It works
  with or without a trip, with or without a crew.

Mixing them inside "history" is why the old folder had a `همراهان` sub-tab that lists nothing but
names: a record archive is not the place to invite somebody. So the top control is four sections now,
and this module owns the third one.
"""
from __future__ import annotations

from typing import Callable

from bb import scenario as sc
from bb.map import (Camera, companion_marker, draw_route, draw_trace, fit_camera, label_fits,
                    scale_bar)
from bb.prims import Screen, scrim
from bb.text import fa_digits
from bb.theme import C, R, TYPE, VIEW_H, VIEW_W
from bb.ui import (chrome, empty_state, home_bar, metric_tiles, notice, segmented_small,
                   sheet_header, telemetry_strip)

from ._base import box, keepout, map_view


# --------------------------------------------------------------------------- #
# small kit
# --------------------------------------------------------------------------- #
def _page() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=2, map_mode=False)
    return s


def _title(s: Screen, title: str, subtitle: str, y: float = 122) -> float:
    s.text(377, y, title, "display", C.text, align="right")
    s.text(377, y + 38, subtitle, "caption", C.muted, align="right")
    return y + 62


def avatar_stack(s: Screen, x: float, y: float, initials, d: float = 26, ring: str = "#FFFFFF"):
    """Overlapping avatars, RTL: first person at the physical right."""
    for index, initial in enumerate(initials):
        cx = x - index * (d * 0.66)
        s.circle(cx, y, d / 2 + 2, fill=ring)
        s.circle(cx, y, d / 2, fill=C.primary_soft)
        s.text(cx, y - TYPE["caption-bold"][2] / 2, initial, "caption-bold", C.primary,
               align="center")
    return x - (len(initials) - 1) * (d * 0.66) - d / 2


def radio_wave(s: Screen, x: float, y: float, w: float, h: float, bars: int = 18,
               color: str = "#FFFFFF", seed: int = 7):
    """A voice level meter. Deterministic heights: a random waveform would differ between renders."""
    import math
    gap = w / bars
    for index in range(bars):
        phase = math.sin((index + seed) * 1.7) * math.sin(index * 0.6 + 1.1)
        bar_h = h * (0.28 + 0.72 * abs(phase))
        cx = x + index * gap + gap / 2
        s.rect(cx - gap * 0.28, y + (h - bar_h) / 2, max(2.0, gap * 0.56), bar_h, fill=color,
               radius=2)


def person_row(s: Screen, y: float, name: str, initial: str, detail: str, meta: str,
               tone: str = "live", talking: bool = False, selected: bool = False,
               trailing: str | None = "mdi-chevron-left", w: float = 361, x: float = 16) -> float:
    """One companion in a list: avatar, name, what they are doing, and how fresh it is."""
    h = 66
    s.rect(x, y, w, h, fill="#FFFFFF", radius=R.md,
           outline=C.primary if selected else C.outline, outline_w=1.6 if selected else 1)
    edge = {"live": C.primary, "stale": C.warning, "waiting": C.muted_2}[tone]
    s.circle(x + w - 36, y + h / 2, 19, fill="#FFFFFF", outline=edge, outline_w=2.2)
    s.circle(x + w - 36, y + h / 2, 15.5, fill={"live": C.primary_deep, "stale": "#5C6B68",
                                                "waiting": C.surface_3}[tone])
    s.text(x + w - 36, y + h / 2 - 8, initial, "label", 
           "#FFFFFF" if tone != "waiting" else C.muted, align="center")
    if talking:
        s.arc_badge(x + w - 24, y + h / 2 - 15, "#E9B35A", "mdi-microphone", 12)
    right = x + w - 64
    s.text(right, y + 12, name, "label-lg", C.text, align="right", max_width=w - 150)
    s.text(right, y + 34, detail, "caption", C.muted, align="right", max_width=w - 162)
    # the freshness stamp shares the second line with the status and starts clear of the
    # chevron: at x+16 it was printed straight through the arrow's head
    s.text(x + 34, y + 34, meta, "caption-bold", edge, align="left", max_width=76)
    if trailing:
        s.i.draw_icon(x + 14, y + h / 2, trailing, 18, C.muted_2)
    return y + h + 8


def legend_row(s: Screen, x: float, y: float, items) -> float:
    cursor = x
    for color, label in items:
        s.circle(cursor + 5, y + 5, 4.5, fill=color)
        cursor += 16
        cursor += s.text(cursor, y - 4, label, "caption", C.muted, align="left")
        cursor += 16
    return y + 18


# --------------------------------------------------------------------------- #
# 01 — the hub
# --------------------------------------------------------------------------- #
def companions_hub() -> Screen:
    s = _page()
    # the subtitle names the three subjects. Its old tail, «— جدا از سوابق», was a note about a
    # *different* section printed on this one.
    y = _title(s, "همراهان", "سفر مشترک، موقعیت زنده و اشتراک‌گذاری")
    y += 6

    # live card: who is on the road with me right now
    s.shadow(16, y, 361, 132, radius=22, blur=18, dy=6, alpha=32)
    s.rect(16, y, 361, 132, fill=C.primary, radius=22)
    s.text(357, y + 16, "همین حالا در سفر", "caption", "#BFE0DC", align="right")
    s.text(357, y + 34, "۳ همسفر آنلاین", "title", "#FFFFFF", align="right")
    avatar_stack(s, 197, y + 44, ["م", "س", "ز"], d=26)
    s.chip(24, y + 32, "در حال حرکت", "mdi-access-point", "success", h=24,
           fill="#2C7C7C", color="#FFFFFF")
    s.text(357, y + 76, "مسیر: خیابان دانشگاه، آتش‌نشانی مرکزی", "caption", "#D6EDE9",
           align="right")
    s.rect(28, y + 92, 337, 1, fill="#2C7C7C")
    # the row under the divider is the door. Its right half used to read «موقعیت همه روی نقشه
    # زنده است», which is the card's own lead-in said a second time.
    s.text(357, y + 102, "باز کردن نقشه ‹", "caption-bold", "#F4D796", align="right")
    y += 154

    # the three doors, with no label above them: «کارهای این بخش» named the container, and the
    # three rows already say what they are. Each second line is a fact, not an invitation.
    actions = [
        ("mdi-account-plus-outline", "افزودن همسفر", "با نام کاربری", C.primary),
        ("mdi-map-marker-radius-outline", "اشتراک موقعیت", "نامحدود یا محدود به زمان", C.info),
        ("mdi-history", "اشتراک تاریخچه", "یک بازه از مسیرها", C.mission),
    ]
    for icon, head, body, tone in actions:
        s.rect(16, y, 361, 64, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
        with s.alpha_layer():
            s.rect(16 + 361 - 52, y + 12, 40, 40, fill=(*_rgb(tone), 26), radius=13)
        s.i.draw_icon(16 + 361 - 32, y + 32, icon, 21, tone)
        s.text(16 + 361 - 62, y + 11, head, "label-lg", C.text, align="right", max_width=250)
        s.text(16 + 361 - 62, y + 33, body, "caption", C.muted, align="right", max_width=250)
        s.i.draw_icon(30, y + 32, "mdi-chevron-left", 18, C.muted_2)
        y += 72

    # my current grants
    y += 4
    s.text(377, y, "اشتراک‌های فعال من", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(16, y, 361, 96, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
    s.chip(24, y + 14, "نامحدود", "mdi-infinity", "success", h=24)
    s.text(357, y + 12, "موقعیت من — برای ۲ نفر", "label", C.text, align="right", max_width=230)
    s.text(357, y + 34, "مریم رضایی · سعید کریمی", "caption", C.muted, align="right", max_width=280)
    s.text(357, y + 56, "از امروز ۹:۳۰ · دقت حدود ۱۲ متر", "caption", C.muted_2, align="right")
    s.i.draw_icon(32, y + 78, "mdi-close-circle-outline", 18, C.muted_2)
    y += 104
    s.rect(16, y, 361, 76, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
    s.chip(24, y + 14, "۲۴ ساعت", "mdi-timer-sand", "warning", h=24)
    s.text(357, y + 12, "تاریخچهٔ ۷ تا ۳۰ آبان", "label", C.text, align="right", max_width=230)
    s.text(357, y + 34, "برای زهرا احمدی · ۱۸ نقطهٔ ثبت‌شده", "caption", C.muted, align="right",
           max_width=280)
    s.text(357, y + 54, "پیوند تا فردا ۹:۳۰ معتبر است", "caption", C.muted_2, align="right")
    y += 84
    s.button(16, y, 361, 46, "مدیریت همهٔ اشتراک‌ها", icon="mdi-tune", variant="tonal")
    home_bar(s)
    return s

def _rgb(color: str):
    color = color.lstrip("#")
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


# --------------------------------------------------------------------------- #
# 02 — add a fellow traveller
# --------------------------------------------------------------------------- #
SEARCH_RESULTS = [
    ("مریم رضایی", "م", "maria.rezaei", "همین حالا آنلاین", "live", True),
    ("سعید کریمی", "س", "saeed.karimi", "۲ دقیقه پیش", "live", False),
    ("زهرا احمدی", "ز", "zahra.ahmadi", "دیروز", "stale", False),
    ("علی موسوی", "ع", "ali.mousavi", "بدون موقعیت", "waiting", False),
]


def companion_add() -> Screen:
    s = _page()
    # search field, immediately under the control: the only thing this page does
    s.rect(16, 112, 361, 52, fill="#FFFFFF", radius=R.md, outline=C.primary, outline_w=1.8)
    s.i.draw_icon(16 + 361 - 30, 138, "mdi-magnify", 20, C.primary)
    s.text(16 + 361 - 50, 124, "جستجوی نام کاربری", "body", C.text, align="right")
    s.rect(16 + 361 - 50 + 8, 132, 1.6, 16, fill=C.primary)
    s.icon_button(24, 115, 46, "mdi-account-plus-outline", 20, C.primary, fill=C.primary_soft,
                  outline=None, shadow=False, radius=15)

    y = 180
    s.text(377, y, "۴ نتیجه برای «رضا»", "caption", C.muted, align="right")
    y += 20

    # invitation card: the person, what they would get, and the single decision
    name, initial, username, freshness, _, _ = SEARCH_RESULTS[0]
    s.shadow(16, y, 361, 178, radius=20, blur=16, dy=5, alpha=30)
    s.rect(16, y, 361, 178, fill="#FFFFFF", radius=20, outline=C.primary, outline_w=1.6)
    s.circle(357 - 26, y + 28, 20, fill=C.primary_deep)
    s.text(357 - 26, y + 19, initial, "label-lg", "#FFFFFF", align="center")
    s.text(357 - 58, y + 12, name, "label-lg", C.text, align="right", max_width=230)
    s.text(357 - 58, y + 34, f"{username} · {freshness}", "caption", C.muted,
           align="right", max_width=250)
    s.rect(28, y + 62, 337, 1, fill=C.outline)

    s.text(357, y + 72, "با پذیرش دعوت، این‌ها را با شما شریک می‌شود", "caption", C.muted,
           align="right", max_width=320)
    right = 365
    for label, icon in (("موقعیت زنده", "mdi-crosshairs-gps"),
                        ("ردّ طی‌شده", "mdi-map-marker-path"),
                        ("ارتباط بی‌سیم", "mdi-microphone")):
        w = s._content_width(label, icon, "caption", 15, 5) + 20
        s.chip(right - w, y + 94, label, icon, "neutral", h=26, style="caption",
               fill=C.primary_soft, color=C.primary)
        right -= w + 7

    s.button(16 + 12, y + 130, 337, 44, "دعوت به سفر جاری", icon="mdi-send", variant="filled",
             style="label", icon_size=17, radius=14)
    y += 194

    s.text(377, y, "سایر نتایج", "caption-bold", C.muted, align="right")
    y += 20
    for name, initial, username, freshness, tone, added in SEARCH_RESULTS[1:]:
        s.rect(16, y, 361, 60, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
        s.circle(357 - 22, y + 30, 17, fill=C.primary_soft if tone != "waiting" else C.surface_3)
        s.text(357 - 22, y + 23, initial, "label", C.primary if tone != "waiting" else C.muted,
               align="center")
        s.text(357 - 48, y + 11, name, "label", C.text, align="right", max_width=180)
        s.text(357 - 48, y + 31, f"{username} · {freshness}", "caption", C.muted, align="right",
               max_width=210)
        s.i.draw_icon(32, y + 30, "mdi-plus-circle-outline", 22, C.primary)
        y += 68

    # an invitation that has been sent but not accepted: it has to be visible and cancellable,
    # otherwise the sender has no way to know why nobody appeared on the map
    y += 4
    s.text(377, y, "دعوت در انتظار پاسخ", "caption-bold", C.muted, align="right")
    y += 20
    s.rect(16, y, 361, 64, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
    s.circle(357 - 22, y + 32, 17, fill=C.surface_3)
    s.text(357 - 22, y + 25, "ح", "label", C.muted, align="center")
    s.text(357 - 48, y + 12, "حسین نوری", "label", C.text, align="right", max_width=150)
    s.text(357 - 48, y + 32, "دعوت ۳ دقیقه پیش فرستاده شد", "caption", C.muted,
           align="right", max_width=230)
    s.chip(28, y + 19, "لغو", "mdi-close", "neutral", h=26, style="caption",
           fill=C.danger_soft, color=C.danger)
    y += 76

    s.rect(16, y, 361, 66, fill=C.info_soft, radius=R.md)
    s.i.draw_icon(16 + 361 - 22, y + 22, "mdi-shield-account-outline", 19, C.info)
    s.para(16 + 40, y + 10, "همسفر فقط وقتی دعوت را بپذیرد به سفر اضافه می‌شود و تا پایان سفر "
           "به موقعیت، مسیر و ارتباط دسترسی دارد.", "caption", C.text_2, align="right",
           max_width=270, max_lines=3)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 03 — the live trip map with fellow travellers
# --------------------------------------------------------------------------- #
def _trip_camera(lo: float, hi: float, box_, padding: float = 0.90) -> Camera:
    """Frame the stretch of the plan between two fractions, `heading_up` like the navigation screens.

    A live map is read at the scale of "who is near me". This route is an L: ۳۰۰ m east, then south, and
    the crew is spread over both legs, so fitting the whole ۱٫۳ km squeezes three people into a band in
    one corner (that was the first draft). Cropping is not enough either — the first leg runs almost
    horizontally on screen, and its two riders then sit side by side with overlapping labels.

    So: the camera is rotated to *my* direction of travel at `ME_T` (up = forward, exactly like a
    navigator), the zoom is solved from the slice's bounding box, and the centre is solved from the
    projection instead of being nudged by eye. Two assertions keep it honest — every marker lands inside
    the safe box, and no two markers are closer than a marker's width.
    """
    import math
    # markers are 34px discs with a name under them, so the usable box is inset from the plate's box
    x0, y0, x1, y1 = box_[0] + 22, box_[1] + 44, box_[2] - 22, box_[3] - 44
    slice_pts = sc.slice_world(sc.ROUTE_MAIN, lo, hi)

    # forward direction where I am, in world space
    a_pt = sc.route_world([sc.along(sc.ROUTE_MAIN, max(0.0, sc.ME_T - 0.02))[0]])[0]
    b_pt = sc.route_world([sc.along(sc.ROUTE_MAIN, min(1.0, sc.ME_T + 0.02))[0]])[0]
    angle = math.degrees(math.atan2(b_pt[0] - a_pt[0], b_pt[1] - a_pt[1]))

    probe = Camera((0.0, 0.0), 1.0, angle)
    ps = [probe.project(wx, wy) for wx, wy in slice_pts]
    span_x = max(p[0] for p in ps) - min(p[0] for p in ps)
    span_y = max(p[1] for p in ps) - min(p[1] for p in ps)
    ppu = min((x1 - x0) / span_x, (y1 - y0) / span_y) * padding

    # the projected slice, at ppu=1 around origin, has extent mid ± span/2; solve the centre from that
    mid_x = (min(p[0] for p in ps) + max(p[0] for p in ps)) / 2
    mid_y = (min(p[1] for p in ps) + max(p[1] for p in ps)) / 2
    cos_a, sin_a = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    px, py = mid_x - VIEW_W / 2, mid_y - VIEW_H / 2
    world = (px * cos_a - py * sin_a, -px * sin_a - py * cos_a)
    want_x, want_y = (x0 + x1) / 2, (y0 + y1) / 2
    a = (want_x - VIEW_W / 2) / ppu
    b = -(want_y - VIEW_H / 2) / ppu
    cam = Camera((world[0] - (a * cos_a + b * sin_a), world[1] - (-a * sin_a + b * cos_a)),
                 ppu, angle)

    crew = sc.COMPANIONS + [{"t": sc.ME_T, "name": "شما"}]
    spots = []
    for person in crew:
        gx, gy = cam.project_grid(*sc.along(sc.ROUTE_MAIN, person["t"])[0])
        assert x0 - 2 <= gx <= x1 + 2 and y0 - 2 <= gy <= y1 + 2, (
            f"{person['name']} at t={person['t']} lands at ({gx:.0f},{gy:.0f}), outside {box_}")
        spots.append((person["name"], gx, gy))
    for i, (n1, x1_, y1_) in enumerate(spots):
        for n2, x2_, y2_ in spots[i + 1:]:
            assert math.hypot(x1_ - x2_, y1_ - y2_) >= 46, (
                f"{n1} and {n2} are only {math.hypot(x1_ - x2_, y1_ - y2_):.0f}px apart")
    return cam


def _place(s: Screen, cam: Camera, u: float, v: float, name: str, initial: str,
           placed: list, tone: str = "live", talking: bool = False, label: str | None = None):
    """Marker + a name label that is only drawn where it does not overlap one already placed."""
    x, y = cam.project_grid(u, v, s)
    side = "below"
    top = y + 19
    if not label_fits(s, label or name, x, top, placed):
        side = "above"
        top = y - 42
        if not label_fits(s, label or name, x, top, placed):
            label = None
    if label is None:
        companion_marker(s, cam, u, v, initial, None, tone=tone, talking=talking)
    else:
        companion_marker(s, cam, u, v, initial, label, tone=tone, talking=talking,
                         label_side=side)
        w = s.tw(label, "caption-bold") + 18
        placed.append((x - w / 2, top, x + w / 2, top + 21))


def companions_live() -> Screen:
    """Everyone on one route, each with the trace behind them, one of them talking."""
    cam = _trip_camera(0.10, 0.82, box(16, 176, 370, 336))
    # the legend prints on bare map, so the map's own street labels must keep that band free
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 164, 393, 46),
                                     box(0, 542, 393, 310)))
    s.top_scrim(120)
    chrome(s, tab=2)

    # the plan everybody follows, quietly under the traces
    draw_route(s, cam, sc.route_world(sc.ROUTE_MAIN), color=C.route_alt, width_m=9,
               opacity=90, dashed=True)

    me, me_prefix = sc.along(sc.ROUTE_MAIN, sc.ME_T)
    draw_trace(s, cam, sc.route_world(me_prefix), width_px=5, opacity=130)
    for person in sc.COMPANIONS:
        if person["tone"] == "waiting":
            continue
        _, prefix = sc.along(sc.ROUTE_MAIN, person["t"])
        draw_trace(s, cam, sc.route_world(prefix),
                   color=C.warning if person["tone"] == "stale" else C.primary,
                   width_px=3.6, opacity=105)

    placed: list = []
    # every marker reserves its own disc, so a name never lands on top of a face
    for person in sc.COMPANIONS + [{"t": sc.ME_T, "tone": "me"}]:
        mx, my = cam.project_grid(*sc.along(sc.ROUTE_MAIN, person["t"])[0], s)
        placed.append((mx - 18, my - 18, mx + 18, my + 18))
    # companions first, me last so I am never buried under somebody else
    for person in sc.COMPANIONS:
        u, v = sc.along(sc.ROUTE_MAIN, person["t"])[0]
        first = person["name"].split()[0]
        _place(s, cam, u, v, person["name"], person["initial"], placed,
               tone=person["tone"], talking=person["talking"], label=first)
    _place(s, cam, *me, "شما", "ش", placed, tone="me", label="شما")
    scale_bar(s, cam, 30, 500)

    # top strip: who is on the trip
    s.rect(12, 118, 369, 44, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    avatar_stack(s, 357, 140, ["م", "س", "ز"], d=24)
    s.text(357 - 60, 132, "۳ همسفر در حرکت", "label", C.text, align="right")
    s.text(357 - 60, 150, "یکی در حال صحبت", "caption", C.primary, align="right")
    s.chip(24, 128, "زنده", "mdi-access-point", "success", h=24)
    y = 172
    legend_row(s, 26, y, [(C.primary, "تازه"), (C.warning, "قدیمی"), (C.muted_2, "بدون موقعیت")])

    # bottom sheet: three crew rows + the home bar have to fit above the system bar
    top = 540
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=28, blur=26, dy=-2, alpha=54)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=28)
    s.rect(0, top + 28, 393, 852 - top - 28, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    s.text(357, top + 20, "سفر جاری · ۳ همسفر", "title", C.text, align="right")
    s.text(357, top + 48, "برای صحبت، انگشت را روی هر همسفر نگه دارید", "caption", C.muted,
           align="right")
    s.chip(24, top + 18, "۵۳۰ متر رفته", "mdi-map-marker-path", "neutral", h=24)

    rows = [("مریم رضایی", "م", "۱۹۰ متر جلوتر", "۸ ثانیه پیش", "live", False),
            ("سعید کریمی", "س", "در حال صحبت با شما", "همین حالا", "live", True),
            ("زهرا احمدی", "ز", "۲۱۰ متر عقب‌تر", "۴ دقیقه پیش", "stale", False)]
    y = top + 72
    for name, initial, detail, meta, tone, talking in rows:
        person_row(s, y, name, initial, detail, meta, tone=tone, talking=talking)
        y += 72
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 04 — hold to talk
# --------------------------------------------------------------------------- #
def companion_talk() -> Screen:
    """The push-to-talk moment: held on Saeed, the screen says who and for how long."""
    cam = _trip_camera(0.30, 0.86, box(16, 176, 370, 300))
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 496, 393, 356)))
    s.top_scrim(120)
    chrome(s, tab=2)
    draw_route(s, cam, sc.route_world(sc.ROUTE_MAIN), color=C.route_alt, width_m=9,
               opacity=90, dashed=True)

    me, me_prefix = sc.along(sc.ROUTE_MAIN, sc.ME_T)
    draw_trace(s, cam, sc.route_world(me_prefix), width_px=5, opacity=130)

    target = sc.COMPANIONS[1]
    tu, tv = sc.along(sc.ROUTE_MAIN, target["t"])[0]
    # the two who are not on this call stay as bare discs — except Maryam, who is close enough that an
    # unlabelled disc would read as part of the pair; her name sits *above* her, away from the pair
    for person in sc.COMPANIONS:
        if person is target or person["tone"] == "waiting":
            continue
        u, v = sc.along(sc.ROUTE_MAIN, person["t"])[0]
        label = person["name"].split()[0] if person["tone"] == "live" else None
        companion_marker(s, cam, u, v, person["initial"], label, tone=person["tone"],
                         label_side="above" if label else "below")

    # the radio link between the two markers, drawn as a pulse along the line
    tx, ty = cam.project_grid(tu, tv, s)
    mx, my = cam.project_grid(*me, s)
    with s.alpha_layer():
        for step in range(1, 14):
            k = step / 14
            s.circle(mx + (tx - mx) * k, my + (ty - my) * k, 3.4,
                     fill=(233, 179, 90, int(150 - step * 9)))
    # short labels, fanning away from the linked pair: the sheet already names who is on the line
    companion_marker(s, cam, tu, tv, "س", "سعید", tone="live", talking=True, label_side="above")
    companion_marker(s, cam, *me, "ش", "شما", tone="me")

    # the talk panel: one gesture, one state, no modal
    top = 500
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=28, dy=-2, alpha=64)
    s.rect(0, top, 393, 852 - top + 2, fill=C.primary_deep, radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill=C.primary_deep)
    s.rect(170, top + 8, 53, 4.5, fill="#3F7B79", radius=3)

    s.circle(357 - 26, top + 42, 24, fill="#E9B35A")
    s.text(357 - 26, top + 32, "س", "title-sm", C.primary_deep, align="center")
    s.text(357 - 60, top + 24, "در ارتباط با سعید کریمی", "title", "#FFFFFF", align="right",
           max_width=230)
    s.text(357 - 60, top + 52, "۰۰:۰۷ — انگشت خود را نگه دارید", "caption", "#A9CFCB",
           align="right")

    with s.alpha_layer():
        s.rect(28, top + 84, 337, 46, fill=(255, 255, 255, 20), radius=14)
    radio_wave(s, 44, top + 94, 305, 26, bars=26, color="#F4D796")
    s.text(196.5, top + 136, "صدای شما به سعید می‌رسد", "caption", "#CDE6E2", align="center")

    s.circle(196.5, top + 194, 44, fill="#E9B35A")
    s.circle(196.5, top + 194, 36, fill="#F4D796")
    s.i.draw_icon(196.5, top + 194, "mdi-microphone", 32, C.primary_deep)
    s.text(196.5, top + 250, "نگه داشته‌اید — برای پایان رها کنید", "caption-bold", "#F4D796",
           align="center")
    s.text(196.5, top + 274, "ارتباط دو‌نفره است؛ همسفر سوم صدای شما را نمی‌شنود", "caption",
           "#8FB8B4", align="center")
    # 8FB8B4, not 6E9C99: on the deep sheet the old grey-green was 3.2:1 — the footnote simply
    # disappeared at a glance
    s.text(196.5, top + 300, "ضبط نمی‌شود و جایی ذخیره نمی‌ماند", "caption", "#8FB8B4",
           align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 05 — companion status sheet
# --------------------------------------------------------------------------- #
def companion_status() -> Screen:
    target = sc.COMPANIONS[2]          # the stale one: the sheet has to be honest about it
    u, v = sc.along(sc.ROUTE_MAIN, target["t"])[0]
    # the sheet covers the bottom third, so the marker is aimed at the middle of the *visible* band,
    # not at the middle of the screen (that put her behind the sheet on the first two drafts)
    cam = sc.camera(u, v, 0.34).aim_at(u, v, 196, 258)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 350, 393, 502)))
    s.top_scrim(120)
    chrome(s, tab=2)
    _, prefix = sc.along(sc.ROUTE_MAIN, target["t"])
    draw_trace(s, cam, sc.route_world(prefix), color=C.warning, width_px=4.6, opacity=135)
    companion_marker(s, cam, u, v, "ز", "زهرا", tone="stale")

    top = 348
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=28, dy=-2, alpha=62)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    s.circle(357 - 26, top + 30, 23, fill="#5C6B68")
    s.text(357 - 26, top + 21, "ز", "title-sm", "#FFFFFF", align="center")
    s.text(357 - 58, top + 12, "زهرا احمدی", "title", C.text, align="right", max_width=210)
    s.text(357 - 58, top + 40, "zahra.ahmadi · همسفر این سفر", "caption", C.muted,
           align="right", max_width=240)
    s.chip(24, top + 16, "موقعیت قدیمی", "mdi-clock-alert-outline", "warning", h=26)

    # honesty first: an old fix is the most important fact on this sheet
    s.rect(16, top + 64, 361, 50, fill=C.warning_soft, radius=R.sm)
    s.i.draw_icon(357 - 12, top + 82, "mdi-access-point-off", 19, C.warning)
    s.text(357 - 34, top + 70, "۴ دقیقه است موقعیت تازه نرسیده", "label", C.text, align="right",
           max_width=300)
    s.text(357 - 34, top + 90, "نقطهٔ روی نقشه و مسیر طی‌شده معتبرند، لحظهٔ حال نه.",
           "caption", C.text_2, align="right", max_width=300)

    metric_tiles(s, 16, top + 122, 361, [("آخرین به‌روزرسانی", "۱۰:۰۵", "mdi-clock-outline"),
                                         ("دقت GPS", "حدود ۱۴ متر", "mdi-crosshairs-gps"),
                                         ("فاصله تا شما", "۲۱۰ متر", "mdi-map-marker-distance")],
                 h=62)

    y = top + 196
    rows = [("مسیر طی‌شده", "۳۱۵ متر از ۸۵۰", "mdi-map-marker-path", C.primary),
            ("آخرین توقف", "بلوار کشاورز · ۳ دقیقه", "mdi-pause-circle-outline", C.text_2),
            ("باتری دستگاه", "۴۱٪ — حالت ذخیره", "mdi-battery-40", C.warning)]
    for label, value, icon, tone in rows:
        s.rect(16, y, 361, 44, fill=C.surface_2, radius=12)
        s.i.draw_icon(16 + 361 - 18, y + 22, icon, 18, tone)
        s.text(16 + 361 - 38, y + 12, label, "body-sm", C.muted, align="right")
        s.text(16 + 18, y + 12, value, "label", C.text, align="left")
        y += 50

    y += 8
    s.rect(16, y, 361, 68, fill=C.primary_soft, radius=R.md)
    s.circle(16 + 361 - 38, y + 34, 22, fill=C.primary)
    s.i.draw_icon(16 + 361 - 38, y + 34, "mdi-microphone", 20, "#FFFFFF")
    s.text(16 + 361 - 70, y + 13, "نگه دارید تا صحبت کنید", "label-lg", C.primary,
           align="right", max_width=230)
    s.text(16 + 361 - 70, y + 34, "ارتباط بی‌سیم دو‌نفره با زهرا", "caption", C.text_2,
           align="right", max_width=230)
    y += 78
    s.button(16, y, 361, 44, "نمایش مسیر کامل زهرا", icon="mdi-map-outline", variant="surface",
             color=C.text)
    y += 54
    assert y < 838, f"status sheet overflows the system bar (ends at {y:.0f})"
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 06 — share my location (unlimited / limited)
# --------------------------------------------------------------------------- #
def share_location() -> Screen:
    s = _page()
    y = _title(s, "اشتراک موقعیت", "مستقل از سفر؛ نامحدود یا محدود به زمان", 116)
    y += 2

    # who
    s.text(377, y, "برای چه کسی؟", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(16, y, 361, 44, fill="#FFFFFF", radius=12, outline=C.outline, outline_w=1)
    s.i.draw_icon(16 + 361 - 22, y + 22, "mdi-account-search-outline", 18, C.muted_2)
    s.text(16 + 361 - 42, y + 12, "جستجوی نام کاربری یا انتخاب از همسفران", "caption",
           C.muted_2, align="right")
    y += 52
    chosen = [("مریم رضایی", "م"), ("سعید کریمی", "س")]
    cx = 357
    for name, initial in chosen:
        w = s.tw(name, "caption-bold") + 62
        cx -= w + 8
        s.rect(cx, y, w, 34, fill=C.primary_soft, radius=17)
        s.circle(cx + w - 17, y + 17, 11, fill=C.primary)
        s.text(cx + w - 17, y + 10, initial, "caption-bold", "#FFFFFF", align="center")
        s.text(cx + w - 38, y + 8, name, "caption-bold", C.primary, align="right")
        s.i.draw_icon(cx + 12, y + 17, "mdi-close", 13, C.primary)
    s.rect(cx - 42, y, 34, 34, fill=C.surface_2, radius=17, outline=C.outline, outline_w=1)
    s.i.draw_icon(cx - 25, y + 17, "mdi-plus", 16, C.muted)
    y += 46

    # duration: the decision the prompt names explicitly
    s.text(377, y, "مدت اشتراک", "caption-bold", C.muted, align="right")
    y += 22
    options = [("نامحدود", "تا وقتی خودتان قطع کنید", "mdi-infinity", True, None),
               ("محدود", "شمارش معکوس، پایان خودکار", "mdi-timer-sand", False,
                ["۱ ساعت", "۸ ساعت", "۲۴ ساعت", "۷ روز"])]
    for label, note, icon, active, durations in options:
        h = 100 if durations else 74
        s.rect(16, y, 361, h, fill="#FFFFFF" if not active else C.primary_soft, radius=R.md,
               outline=C.primary if active else C.outline, outline_w=1.8 if active else 1)
        s.circle(357 - 26, y + 22, 10, fill=C.primary if active else "#FFFFFF",
                 outline=None if active else C.outline_strong, outline_w=1.4)
        if active:
            s.circle(357 - 26, y + 22, 4.5, fill="#FFFFFF")
        s.i.draw_icon(357 - 56, y + 22, icon, 19, C.primary if active else C.muted_2)
        s.text(357 - 78, y + 10, label, "label-lg", C.text, align="right")
        s.text(357 - 78, y + 32, note, "caption", C.muted, align="right")
        if durations:
            # a real duration picker, not a placeholder: chips measured and laid out right-to-left,
            # so the Persian reading order is the order they are drawn in
            right = 16 + 361 - 12
            for value in durations:
                on = value == "۸ ساعت"
                cw = s.tw(value, "caption-bold") + 26
                cxp = right - cw
                s.rect(cxp, y + 56, cw, 30, fill="#FFFFFF" if on else C.surface_2, radius=15,
                       outline=C.primary if on else None, outline_w=1.4 if on else 0)
                s.text(cxp + cw / 2, y + 63, value, "caption-bold", C.primary if on else C.muted,
                       align="center")
                right = cxp - 8
        y += h + 10
    y += 4

    # accuracy: full or approximate
    s.text(377, y, "دقت نمایش", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(16, y, 361, 66, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
    s.text(357, y + 12, "موقعیت دقیق", "label", C.text, align="right")
    s.text(357, y + 34, "نقطهٔ شما و حلقهٔ دقت ۱۴ متری دیده می‌شود.", "caption", C.muted,
           align="right", max_width=280)
    s.toggle(26, y + 21, 44, 26, on=True)
    y += 76

    s.rect(16, y, 361, 62, fill=C.info_soft, radius=R.md)
    s.i.draw_icon(357 - 12, y + 20, "mdi-information-outline", 18, C.info)
    s.para(16 + 30, y + 10, "اشتراک موقعیت به معنی اشتراک تاریخچه نیست. تاریخچه را جداگانه و برای "
           "یک بازهٔ مشخص می‌فرستید.", "caption", C.text_2, align="right", max_width=290,
           max_lines=3)
    y += 74
    s.button(16, y, 361, 50, "شروع اشتراک", icon="mdi-broadcast", variant="filled", shadow=True)
    s.text(196.5, y + 60, "می‌توانید هر لحظه از همین صفحه قطع کنید", "caption", C.muted_2,
           align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 07 — share a slice of my history
# --------------------------------------------------------------------------- #
def share_history() -> Screen:
    s = _page()
    y = _title(s, "اشتراک تاریخچه", "یک بازهٔ زمانی مشخص از مسیرهای طی‌شده", 116)
    y += 2

    # range
    s.text(377, y, "بازهٔ زمانی", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(201, y, 176, 56, fill="#FFFFFF", radius=14, outline=C.primary, outline_w=1.4)
    s.text(201 + 176 - 14, y + 8, "از تاریخ", "caption", C.muted, align="right")
    s.text(201 + 176 - 14, y + 26, "۷ آبان ۱۴۰۵", "label", C.text, align="right")
    s.rect(16, y, 176, 56, fill="#FFFFFF", radius=14, outline=C.primary, outline_w=1.4)
    s.text(16 + 176 - 14, y + 8, "تا تاریخ", "caption", C.muted, align="right")
    s.text(16 + 176 - 14, y + 26, "۳۰ آبان ۱۴۰۵", "label", C.text, align="right")
    y += 66

    # presets
    for index, (label, on) in enumerate([("۷ روز", False), ("۳۰ روز", False), ("۳ ماه", False),
                                         ("سفارشی", True)]):
        cw = (361 - 3 * 8) / 4
        cxp = 16 + (3 - index) * (cw + 8)
        s.rect(cxp, y, cw, 34, fill=C.primary if on else C.surface_2, radius=12)
        s.text(cxp + cw / 2, y + 8, label, "caption-bold", "#FFFFFF" if on else C.text_2,
               align="center")
    y += 46

    # what will be sent — the honest preview
    s.text(377, y, "چه چیزی فرستاده می‌شود؟", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(16, y, 361, 132, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
    s.text(357, y + 12, "۹ سفر · ۲۸٫۴ کیلومتر", "label-lg", C.text, align="right")
    s.text(357, y + 36, "۱۸۰ نقطهٔ ثبت‌شده بین ۷ تا ۳۰ آبان", "caption", C.muted, align="right")
    with s.alpha_layer():
        s.rect(28, y + 58, 337, 1, fill=(14, 102, 102, 26))
    # tiny schematic of the range: three trips per week, drawn to scale
    for index in range(18):
        bx = 28 + index * 18.6
        h = 8 + (index * 7 % 17)
        s.rect(bx, y + 104 - h, 11, h, fill=C.primary_soft_2 if index % 4 else C.primary,
               radius=3)
    s.text(357, y + 110, "شدت حرکت در بازه", "caption", C.muted_2, align="right")
    y += 142

    # recipients
    s.text(377, y, "برای چه کسی؟", "caption-bold", C.muted, align="right")
    y += 22
    for name, initial, note in [("زهرا احمدی", "ز", "همسفر پیشین"),
                                ("علی موسوی", "ع", "امدادگر هم‌تیم")]:
        s.rect(16, y, 361, 56, fill="#FFFFFF", radius=12, outline=C.outline, outline_w=1)
        s.circle(357 - 22, y + 28, 16, fill=C.primary_soft)
        s.text(357 - 22, y + 21, initial, "label", C.primary, align="center")
        s.text(357 - 46, y + 10, name, "label", C.text, align="right")
        s.text(357 - 46, y + 30, note, "caption", C.muted, align="right")
        s.rect(28, y + 19, 20, 20, fill=C.primary, radius=6)
        s.i.draw_icon(38, y + 29, "mdi-check", 14, "#FFFFFF")
        y += 62
    y += 2
    s.rect(16, y, 361, 44, fill="#FFFFFF", radius=12, outline=C.primary, outline_w=1.4)
    s.i.draw_icon(357 - 22, y + 22, "mdi-account-plus-outline", 18, C.primary)
    s.text(357 - 44, y + 12, "افزودن گیرندهٔ دیگر", "label", C.primary, align="right")
    y += 56

    s.rect(16, y, 361, 58, fill=C.warning_soft, radius=12)
    s.i.draw_icon(357 - 12, y + 20, "mdi-lock-clock", 18, C.warning)
    s.para(16 + 30, y + 8, "پیوند در پایان بازه خودبه‌خود باطل می‌شود؛ دسترسی گیرنده هم "
           "برداشته می‌شود.", "caption", C.text_2, align="right", max_width=290, max_lines=2)
    y += 70
    s.button(16, y, 361, 50, "ارسال تاریخچه", icon="mdi-share-variant", variant="filled",
             shadow=True)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 08 — the receiving side
# --------------------------------------------------------------------------- #
def shared_with_me() -> Screen:
    """I am the one being watched: someone shared a position with me, and a range of history."""
    target = (-40, -120)
    # aimed at the visible band above the sheet, not at the sheet-covered middle of the screen
    cam = sc.camera(*target, 0.34).aim_at(*target, 196, 208)
    # the marker and the name pill under it are drawn after the map; without a reservation
    # «بلوار ساحلی» printed behind the pill and read as «مریم بلوار ساحلی»
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 298, 393, 554),
                                      box(152, 176, 88, 78)))
    s.top_scrim(120)
    chrome(s, tab=2)

    # the live position of the person who shared
    u, v = target
    companion_marker(s, cam, u, v, "م", "مریم", tone="live", accuracy_m=22)
    _, prefix = sc.along(sc.ROUTE_MAIN, 0.34)
    draw_trace(s, cam, sc.route_world(prefix), width_px=4.4, opacity=120)

    top = 296
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=28, dy=-2, alpha=62)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    s.text(377, top + 22, "با من به اشتراک گذاشته شده", "title", C.text, align="right")
    s.text(377, top + 50, "موقعیت زنده و تاریخچه‌های دریافتی، جدا از سفرهای خودم", "caption",
           C.muted, align="right")
    y = top + 76

    segmented_small(s, 16, y, 361, ["موقعیت زنده", "تاریخچه‌ها"], active=0, h=38,
                    counts=["۲", "۲"])
    y += 48

    # live: who and how fresh
    for name, initial, detail, meta, tone in [
            ("مریم رضایی", "م", "خیابان دانشگاه، در حال حرکت", "۸ ثانیه پیش", "live"),
            ("علی موسوی", "ع", "آخرین موقعیت ثبت‌شده", "زمان نامشخص", "stale")]:
        y = person_row(s, y, name, initial, detail, meta, tone=tone, w=361)

    y += 6
    s.text(377, y, "تاریخچهٔ دریافتی", "caption-bold", C.muted, align="right")
    y += 22
    for chip_label, chip_icon, tone, head, sub, foot in [
            ("فعال", "mdi-check", "success", "۷ تا ۳۰ آبان · ۹ سفر", "از مریم رضایی · ۱۸۰ نقطه",
             "پایان اعتبار: ۳۰ آبان ۲۳:۵۹"),
            ("فعال", "mdi-check", "success", "۱ تا ۳۰ مهر · ۴ سفر", "از سعید کریمی · ۵۲ نقطه",
             "پایان اعتبار: ۳ آبان ۲۳:۵۹")]:
        s.rect(16, y, 361, 78, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
        s.chip(24, y + 12, chip_label, chip_icon, tone, h=24)
        s.text(357, y + 10, head, "label", C.text, align="right", max_width=240)
        s.text(357, y + 32, sub, "caption", C.muted, align="right", max_width=260)
        s.text(357, y + 52, foot, "caption", C.muted_2, align="right")
        s.i.draw_icon(30, y + 26, "mdi-chevron-left", 18, C.muted_2)
        y += 86

    s.rect(16, y, 361, 56, fill=C.surface_2, radius=12)
    s.i.draw_icon(357 - 12, y + 18, "mdi-shield-lock-outline", 18, C.muted)
    s.text(357 - 34, y + 10, "دسترسی محدود و قابل لغو", "label", C.text_2, align="right")
    s.text(357 - 34, y + 30, "همیشه می‌توانید این اشتراک را از فهرست حذف کنید.", "caption",
           C.muted, align="right", max_width=290)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 09 — empty, and what happens when nobody answers
# --------------------------------------------------------------------------- #
def companions_empty() -> Screen:
    s = _page()
    y = _title(s, "همراهان", "هیچ‌کس هنوز با شما سفر نکرده است", 122)
    empty_state(s, y + 24, "mdi-account-multiple-plus-outline", "هنوز همسفری ندارید",
                "با افزودن همسفر، موقعیت زنده، مسیر طی‌شده و ارتباط بی‌سیم بین شما فعال می‌شود.")
    y += 236
    s.rect(16, y, 361, 172, fill="#FFFFFF", radius=R.lg, outline=C.outline, outline_w=1)
    s.text(357, y + 14, "همسفر چطور اضافه می‌شود؟", "label-lg", C.text, align="right")
    steps = [("۱", "نام کاربری او را جستجو کنید."), ("۲", "دعوت بفرستید؛ فقط با پذیرش اضافه می‌شود."),
             ("۳", "در طول سفر، موقعیت و صدای یکدیگر را می‌بینید.")]
    sy = y + 46
    for number, text in steps:
        s.circle(357 - 10, sy + 9, 10, fill=C.primary_soft)
        s.text(357 - 10, sy + 2, number, "caption-bold", C.primary, align="center")
        s.text(357 - 28, sy, text, "body-sm", C.text_2, align="right", max_width=300)
        sy += 34
    y += 184
    s.button(16, y, 361, 50, "افزودن همسفر", icon="mdi-account-plus-outline", variant="filled",
             shadow=True)
    y += 58
    s.button(16, y, 361, 46, "فقط اشتراک موقعیت", icon="mdi-map-marker-radius-outline",
             variant="tonal")
    home_bar(s)
    return s


def companions_offline() -> Screen:
    """Losing the socket does not erase the people; it changes what the app may claim."""
    s = _page()
    y = _title(s, "همراهان", "اتصال قطع شده — موقعیت‌ها ثابت مانده‌اند", 122)
    y += 4

    # the notice carries its own retry button, so it is 20px taller than a text-only notice
    s.rect(16, y, 361, 88, fill=C.danger_soft, radius=R.md)
    s.i.draw_icon(357 - 14, y + 24, "mdi-wifi-off", 20, C.danger)
    s.text(357 - 40, y + 12, "ارتباط زنده قطع است", "label-lg", C.danger, align="right")
    s.text(357 - 40, y + 36, "آخرین موقعیت‌ها نگه داشته می‌شوند تا دوباره وصل شوید.", "caption",
           C.text_2, align="right", max_width=300)
    s.button(24, y + 56, 104, 24, "تلاش دوباره", variant="filled", color=C.danger,
             style="caption-bold", radius=10)
    y += 100

    for name, initial, detail, meta, tone in [
            ("مریم رضایی", "م", "آخرین موقعیت: ۱ دقیقه پیش", "ثابت", "stale"),
            ("سعید کریمی", "س", "آخرین موقعیت: ۲ دقیقه پیش", "ثابت", "stale"),
            ("زهرا احمدی", "ز", "بدون موقعیت روی این دستگاه", "نامشخص", "waiting")]:
        y = person_row(s, y, name, initial, detail, meta, tone=tone, trailing=None, w=361)
        y += 4

    # offline is not empty: say precisely what is still on the phone
    y += 4
    s.text(377, y, "ذخیره‌شده در این دستگاه", "caption-bold", C.muted, align="right")
    y += 22
    for head, sub, icon in [("تاریخچهٔ دریافتی · ۲ بازه", "آخرین بازه: ۱ تا ۳۰ مهر", "mdi-history"),
                            ("مسیرهای ذخیره‌شده · ۲ مسیر", "۱۸ نقطه · آخرین همگام‌سازی ۱۰:۳۱",
                             "mdi-map-marker-path")]:
        s.rect(16, y, 361, 58, fill="#FFFFFF", radius=R.md, outline=C.outline, outline_w=1)
        s.rect(16 + 361 - 46, y + 11, 34, 34, fill=C.surface_2, radius=11)
        s.i.draw_icon(16 + 361 - 29, y + 29, icon, 18, C.text_2)
        s.text(16 + 361 - 58, y + 9, head, "label", C.text, align="right", max_width=250)
        s.text(16 + 361 - 58, y + 31, sub, "caption", C.muted, align="right", max_width=250)
        s.i.draw_icon(30, y + 29, "mdi-chevron-left", 18, C.muted_2)
        y += 66

    s.rect(16, y, 361, 78, fill=C.surface_2, radius=R.md)
    s.i.draw_icon(357 - 12, y + 18, "mdi-information-outline", 18, C.muted)
    s.para(16 + 30, y + 8, "در حالت آفلاین می‌توانید تاریخچه‌های ذخیره‌شده را ببینید؛ ارسال و "
           "دریافت تازه از سرور انجام نمی‌شود.", "caption", C.text_2, align="right",
           max_width=290, max_lines=3)

    # the two ways out of this state are pinned above the home bar, not floating mid-page
    s.button(16, 770, 176, 46, "تاریخچهٔ ذخیره‌شده", icon="mdi-history", variant="tonal")
    s.button(201, 770, 176, 46, "تنظیمات", icon="mdi-tune", variant="surface", color=C.text)
    assert y + 78 < 760, f"offline card stack runs into the action bar (ends at {y + 78:.0f})"
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "c01-companions-hub": ("companions/01-companions-hub.png", companions_hub),
    "c02-companion-add": ("companions/02-companion-add.png", companion_add),
    "c03-companions-live": ("companions/03-companions-live.png", companions_live),
    "c04-companion-talk": ("companions/04-companion-talk.png", companion_talk),
    "c05-companion-status": ("companions/05-companion-status.png", companion_status),
    "c06-share-location": ("companions/06-share-location.png", share_location),
    "c07-share-history": ("companions/07-share-history.png", share_history),
    "c08-shared-with-me": ("companions/08-shared-with-me.png", shared_with_me),
    "c09-companions-empty": ("companions/09-companions-empty.png", companions_empty),
    "c10-companions-offline": ("companions/10-companions-offline.png", companions_offline),
}
