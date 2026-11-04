"""Mission (rescue) section screens: availability, offers, dispatch, on-scene, team, reports."""
from __future__ import annotations

from typing import Callable

from bb import scenario as sc
from bb import ui
from bb.map import Camera, draw_route, team_cluster, team_marker
from bb.prims import Screen, scrim
from bb.text import fa_digits, fa_number
from bb.theme import C, R, TYPE
from bb.ui import (MISSION_TAB, bottom_panel, chrome, empty_state, home_bar, map_tools, metric_tiles,
                   mission_pill, mission_rail, mission_steps, nav_banner, notice, sheet_header,
                   telemetry_strip)

from ._base import (box, destination_pin, incident_marker, keepout, map_view, origin_marker,
                    user_cone)

INCIDENT_NAME = "حادثهٔ آتش‌سوزی · بازار قدیم"
INCIDENT_ADDRESS = "خیابان شریعتی، بازار قدیم، پلاک ۱۴"
SOS_TYPE = "آتش‌سوزی ساختمان"
REQUESTER = "رضا محمدی"
REQUESTER_ADDRESS = "خیابان شریعتی، بازار قدیم"

MISSION_ROUTE = [sc.USER, (260, -120), (260, 240), sc.INCIDENT]


def _mission_chip(s: Screen, x: float, y: float, label: str) -> float:
    return s.chip(x, y, label, "mdi-lifebuoy", "mission", h=26)


# --------------------------------------------------------------------------- #
# 01/02 — availability
# --------------------------------------------------------------------------- #
def _availability(on: bool) -> Screen:
    cam = sc.camera(sc.USER[0] + 40, sc.USER[1] - 90, 0.20)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 126), box(0, 508, 393, 344)))
    s.top_scrim(128)
    chrome(s, tab=MISSION_TAB)
    map_tools(s, 128, angle=22)

    user_cone(s, cam, *sc.USER, bearing=28, color=C.success if on else C.muted_2)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire", rings=on)

    top = 496
    s.shadow(12, top, 369, 250, radius=26, blur=24, dy=8, alpha=44)
    s.rect(12, top, 369, 250, fill="#FFFFFF", radius=26, outline=C.outline, outline_w=1)
    s.rect(188, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    color = C.success if on else C.muted_2
    # 22px badge, 14px gap to the text block: no longer touches the title
    s.circle(357 - 24, top + 44, 22, fill=C.success_soft if on else C.surface_3)
    s.i.draw_icon(357 - 24, top + 44, "mdi-shield-check-outline" if on else "mdi-shield-off-outline",
                  21, color)
    s.text(357 - 58, top + 24, "وضعیت امدادگری", "caption", C.muted, align="right")
    s.text(357 - 58, top + 40, "آمادهٔ دریافت مأموریت", "title-sm", C.text, align="right",
           max_width=215)

    # availability switch, full-width row (big touch target, unmistakable state)
    s.rect(24, top + 82, 345, 58, fill=C.success_soft if on else C.surface_2, radius=16)
    s.toggle(38, top + 96, 50, 30, on=on, on_color=C.success)
    s.text(357, top + 92, "آماده دریافت مأموریت هستم" if on else "دریافت پیشنهاد متوقف است",
           "label-lg", C.text if on else C.text_2, align="right", max_width=250)
    s.text(357, top + 116, "برای مرکز امداد قابل مشاهده است" if on else "می‌توانید هر زمان فعال کنید",
           "caption", C.muted, align="right", max_width=250)

    body = ("پیشنهاد مأموریت‌های نزدیک برای شما ارسال می‌شود تا مرکز امداد بداند کدام امدادگر"
            " آمادهٔ اعزام است." if on else
            "پیشنهاد جدیدی ارسال نمی‌شود. در شرایط اضطراری، مرکز امداد می‌تواند حتی در این"
            " وضعیت مأموریت ارسال کند.")
    s.para(26, top + 152, body, "caption", C.muted, align="right", max_width=340, line_height=18)

    # meta chips: icon on the leading (right) edge, label to its left — RTL order
    for bx, label, icon in ((24, "آتش‌نشانی", "mdi-account-group-outline"),
                            (203, "شعاع ۵ کیلومتر", "mdi-map-marker-radius-outline")):
        s.rect(bx, top + 202, 166, 38, fill=C.surface_2, radius=12)
        s.i.draw_icon(bx + 166 - 22, top + 221, icon, 16, C.text_2)
        s.text(bx + 166 - 40, top + 212, label, "caption-bold", C.text_2, align="right",
               max_width=104)
    home_bar(s)
    return s


def mission_ready_on() -> Screen:
    return _availability(True)


def mission_ready_off() -> Screen:
    return _availability(False)


# --------------------------------------------------------------------------- #
# 03 — mission offer card (first of three)
# --------------------------------------------------------------------------- #
def mission_offer() -> Screen:
    cam = sc.camera(120, 40, 0.155).aim_at(*sc.INCIDENT, 230, 300)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 400, 393, 452)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, mission_badge="۳")
    draw_route(s, cam, sc.route_world(MISSION_ROUTE), width_m=12)
    user_cone(s, cam, *sc.USER, bearing=28)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire")

    s.shadow(12, 122, 369, 46, radius=16, blur=12, dy=4, color=C.danger, alpha=60)
    s.rect(12, 122, 369, 46, fill=C.danger, radius=16)
    s.i.draw_icon(357 - 24, 145, "mdi-alarm-light", 20, "#FFFFFF")
    s.text(357 - 44, 133, "۳ پیشنهاد فعال · اولویت فوری", "label", "#FFFFFF", align="right")
    s.text(34, 136, "۰:۵۲", "title-sm", "#FFE0E0", align="left")

    top = 392
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    # header: status chips first, then the incident title
    _mission_chip(s, 16, top + 22, "آتش‌سوزی")
    s.chip(16 + 84, top + 22, "SOS فوری", None, "danger", h=26)
    # the mission has not been accepted yet: the stage strip says so instead of starting at پذیرش
    mission_steps(s, 16, top + 56, 361, -1, note="پیشنهاد ۱ از ۳")
    s.text(377, top + 88, INCIDENT_NAME, "title", C.text, align="right", max_width=330)
    s.text(377, top + 116, INCIDENT_ADDRESS, "caption", C.muted, align="right", max_width=330)

    # requester
    s.rect(16, top + 142, 361, 54, fill=C.surface_2, radius=14)
    s.circle(377 - 26, top + 169, 16, fill=C.primary_soft)
    s.text(377 - 26, top + 162, "ر", "label", C.primary, align="center")
    s.text(377 - 50, top + 151, REQUESTER, "label", C.text, align="right")
    s.text(377 - 50, top + 171, "درخواست‌کننده · ۱۲۵ متر از محل", "caption", C.muted,
           align="right")
    s.i.draw_icon(38, top + 169, "mdi-phone-outline", 18, C.primary)

    metric_tiles(s, 16, top + 206, 361, [("فاصله", "۱٫۲ کیلومتر", "mdi-map-marker-distance"),
                                         ("رسیدن", "۴ دقیقه", "mdi-clock-fast"),
                                         ("گروه لازم", "۲ نفر", "mdi-account-group")], h=58)
    # the countdown already runs in the banner above; this line only says when the offer was issued
    s.text(377, top + 272, f"ارسال‌شده {sc.MISSION_TIMES['offer']}", "caption", C.muted_2,
           align="right")

    s.button(16, top + 298, 176, 50, "رد مأموریت", icon="mdi-close", variant="tonal",
             color=C.muted)
    s.button(201, top + 298, 176, 50, "پذیرش مأموریت", icon="mdi-check", variant="filled")

    # pagination: three offers, this is the first
    for index in range(3):
        active = index == 0
        s.rect(196.5 - 19 + index * 16, top + 362, 14 if active else 7, 4.5,
               fill=C.primary if active else C.outline_strong, radius=2.5)
    s.text(196.5, top + 376, "برای پیشنهاد بعدی به چپ بکشید · برای جزئیات به بالا",
           "caption", C.muted_2, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 04 — offer details + swipe pagination (#2 of 3)
# --------------------------------------------------------------------------- #
def mission_offer_details() -> Screen:
    cam = sc.camera(140, 60, 0.165).aim_at(*sc.INCIDENT, 200, 240)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 300, 393, 552)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, mission_badge="۳")
    draw_route(s, cam, sc.route_world([sc.USER, (0, -120), (0, 120), (260, 120), (260, 240),
                                       sc.INCIDENT]), width_m=11, mute=0.4)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire")
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 310
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    # the subtitle used to repeat the incident type that the card below states in full; it carries
    # the offer's validity instead, which is the one thing that changes while the sheet is open
    y = sheet_header(s, top + 20, "جزئیات پیشنهاد", "پیشنهاد ۲ از ۳ · اعتبار تا ۰:۳۸",
                     icon="mdi-lifebuoy", tone="mission", title_style="title")

    # an offer is a mission that has not started: the strip says so before the user reads anything
    y = mission_steps(s, 16, y, 361, -1, note="هنوز پذیرفته نشده") + 14

    s.rect(16, y, 361, 88, fill=C.danger_soft, radius=18)
    s.text(357, y + 10, "نوع حادثه", "caption", C.danger, align="right")
    s.text(357, y + 28, "آتش‌سوزی انبار تجاری، طبقهٔ دوم", "title-sm", C.text, align="right",
           max_width=320)
    s.text(357, y + 56, "شدت بالا · نیاز به تیم دو نفره", "caption", C.muted, align="right",
           max_width=230)
    s.chip(30, y + 56, "SOS فوری", None, "danger", h=24)
    y += 100

    s.text(357, y, "اطلاعات محل", "caption-bold", C.muted, align="right")
    y += 22
    rows = [("نشانی", INCIDENT_ADDRESS), ("مسافت از موقعیت شما", "۱٫۲ کیلومتر"),
            ("زمان رسیدن تقریبی", "۴ دقیقه با خودرو"), ("درخواست‌کننده", REQUESTER),
            ("گروه امدادی", "آتش‌نشانی")]
    for index, (label, value) in enumerate(rows):
        ry = y + index * 30
        s.text(357, ry, label, "caption", C.muted, align="right", max_width=122)
        s.text(228, ry, value, "caption-bold", C.text_2, align="right", max_width=200)
        if index < len(rows) - 1:
            s.divider(30, ry + 24, 363)
    y += len(rows) * 30 + 8

    s.button(201, y, 176, 50, "پذیرش مأموریت", icon="mdi-check", variant="filled")
    s.button(16, y, 176, 50, "رد مأموریت", icon="mdi-close", variant="tonal", color=C.muted)
    y += 62

    for index in range(3):
        active = index == 1
        s.rect(196.5 - 19 + index * 16, y, 14 if active else 7, 4.5,
               fill=C.primary if active else C.outline_strong, radius=2.5)
    s.text(196.5, y + 14, "برای دیدن پیشنهاد بعدی، شیت را به چپ بکشید", "caption", C.muted_2,
           align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 05 — acceptance confirmation
# --------------------------------------------------------------------------- #
def mission_accept_confirm() -> Screen:
    cam = sc.camera(sc.USER[0] + 30, sc.USER[1] - 40, 0.20)
    s = map_view(cam, pois=False)
    scrim(s, 108)
    chrome(s, tab=MISSION_TAB, mission_badge="۳")
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire", rings=False)

    top = 224
    s.shadow(16, top, 361, 456, radius=28, blur=26, dy=10, alpha=64)
    s.rect(16, top, 361, 456, fill="#FFFFFF", radius=28)
    s.circle(196.5, top + 46, 28, fill=C.primary_soft)
    s.i.draw_icon(196.5, top + 46, "mdi-shield-check", 30, C.primary)
    s.text(196.5, top + 84, "پذیرش این مأموریت؟", "title-lg", C.text, align="center")

    # the decision is a stage change, so the dialog draws the stage strip it is about to move
    mission_steps(s, 32, top + 116, 329, -1, note="پیشنهاد ۱ از ۳")
    s.para(36, top + 148, "با پذیرش، این مأموریت به شما اختصاص می‌یابد و پیشنهادهای دیگر متوقف می‌شوند.",
           "body-sm", C.muted, align="center", max_width=320)

    s.rect(32, top + 200, 329, 82, fill=C.surface_2, radius=16)
    s.text(347, top + 212, INCIDENT_NAME, "label", C.text, align="right", max_width=300)
    s.text(347, top + 234, f"{INCIDENT_ADDRESS}", "caption", C.muted, align="right", max_width=300)
    s.text(347, top + 258, f"۱٫۲ کیلومتر · رسیدن تقریبی {sc.MISSION_ETA}", "caption-bold",
           C.primary, align="right")
    s.chip(44, top + 254, "SOS فوری", None, "danger", h=24)

    s.rect(32, top + 294, 329, 44, fill=C.warning_soft, radius=14)
    s.i.draw_icon(347, top + 316, "mdi-information-outline", 17, C.warning)
    s.text(329, top + 304, "پذیرش، سه بخش دیگر را تا پایان مأموریت قفل می‌کند.", "caption", C.warning,
           align="right", max_width=280)

    s.button(32, top + 352, 329, 52, "بله، مأموریت را می‌پذیرم", icon="mdi-check-bold",
             variant="filled", shadow=True)
    s.text(196.5, top + 418, "انصراف و بازگشت", "label", C.muted, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 06 — accepted, before dispatch
# --------------------------------------------------------------------------- #
def mission_accepted() -> Screen:
    cam = sc.camera(140, 40, 0.175).aim_at(*sc.INCIDENT, 230, 250)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 430, 393, 422)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, locked=True)
    draw_route(s, cam, sc.route_world(MISSION_ROUTE), width_m=13, dashed=True, mute=0.35)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire")
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 422
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 20
    s.chip(24, y + 2, "مأموریت فعال", "mdi-lifebuoy", "mission", h=26)
    s.text(357, y, "به محل حادثه اعزام شوید", "title", C.text, align="right", max_width=240)
    s.text(357, y + 28, "این مأموریت به شما اختصاص یافت. لیدر تیم: شما", "caption", C.muted,
           align="right", max_width=320)
    y += 66

    s.rect(16, y, 361, 92, fill=C.surface_2, radius=18)
    s.text(357, y + 10, INCIDENT_NAME, "label", C.text, align="right", max_width=320)
    s.text(357, y + 32, INCIDENT_ADDRESS, "caption", C.muted, align="right", max_width=320)
    s.divider(30, y + 56, 363)
    s.text(357, y + 62, "درخواست‌کننده: رضا محمدی", "caption", C.text_2, align="right")
    s.text(240, y + 62, f"{fa_digits(1)}٫{fa_digits(2)} کیلومتر · رسیدن {sc.MISSION_ETA}",
           "caption-bold", C.primary, align="right")
    y += 106

    # the same five-stage rail every mission plate uses, at the stage this plate shows
    y = mission_rail(s, 16, y, 361, 0, timestamps=sc.MISSION_STAGE_TIMES) + 6

    s.button(16, y, 361, 52, "شروع مسیر تا محل حادثه", icon="mdi-navigation-variant",
             variant="filled", shadow=True)
    y += 62
    s.button(201, y, 176, 44, "درخواست پشتیبانی", icon="mdi-account-plus-outline",
             variant="outline")
    s.button(16, y, 176, 44, "جزئیات مأموریت", icon="mdi-information-outline", variant="text")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 07 — mission navigation active
# --------------------------------------------------------------------------- #
def mission_navigation() -> Screen:
    cam = sc.camera(*sc.USER, 0.46).heading_up(28).aim_at(*sc.USER, 196, 540)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 240), box(0, 668, 393, 184)), pois=False)
    s.top_scrim(200, start=240)
    chrome(s, tab=MISSION_TAB, locked=True)

    draw_route(s, cam, sc.route_world(MISSION_ROUTE), width_m=14, color=C.primary)
    user_cone(s, cam, *sc.USER, bearing=0)
    nav_banner(s, "mdi-arrow-left", "۲۵۰ متر", "به خیابان شریعتی بپیچید", "سپس ۶۰۰ متر مستقیم",
               top=116)

    # the stage strip for a driver who is on the road: stage 2, and it says "در مسیر · مرحلهٔ ۲ از ۵"
    pill_w = mission_pill(s, None, 240, 1, label="در مسیر", h=32)
    # centre it under the maneuver banner instead of hanging it off the left edge
    s.shadow(196.5 - pill_w / 2 + 0.6, 240, pill_w - 1, 32, radius=16, blur=10, dy=3,
             color=C.mission, alpha=60)
    mission_pill(s, 196.5 - pill_w / 2, 240, 1, label="در مسیر", h=32)

    s.icon_button(14, 288, 44, "mdi-volume-high", 20, C.primary, radius=15)
    s.icon_button(14, 340, 44, "mdi-routes", 20, C.text_2, radius=15)
    s.icon_button(14, 392, 44, "mdi-map-outline", 20, C.text_2, radius=15)
    # no SOS button while navigating: the SOS belongs to the citizen in danger, and a rescuer who
    # is already on the way cannot raise one against their own mission

    top = 660
    s.shadow(0, top - 8, 393, 852 - top + 16, radius=26, blur=24, dy=-2, alpha=48)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=26)
    s.rect(0, top + 26, 393, 852 - top - 26, fill="#FFFFFF")
    telemetry_strip(s, top + 8, [(sc.MISSION_ETA, "رسیدن", ""), ("۳ دقیقه", "زمان مانده", ""),
                                 ("۸۵۰ متر", "مسافت مانده", ""), ("۴۲", "km/h", "")], h=54)
    s.button(16, top + 70, 176, 46, "رسیدم", icon="mdi-map-marker-check", variant="filled")
    s.button(201, top + 70, 176, 46, "پایان مأموریت", icon="mdi-stop-circle-outline",
             variant="tonal", color=C.danger)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 08 — mission route alternatives
# --------------------------------------------------------------------------- #
def mission_alternatives() -> Screen:
    cam = sc.camera(*sc.USER, 0.42).heading_up(28).aim_at(*sc.USER, 196, 330)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 240), box(0, 430, 393, 422)), pois=False)
    s.top_scrim(200, start=240)
    chrome(s, tab=MISSION_TAB, locked=True)
    draw_route(s, cam, sc.route_world([sc.USER, (0, -120), (0, 120), (260, 120), (260, 240),
                                       sc.INCIDENT]), width_m=12, mute=0.42)
    draw_route(s, cam, sc.route_world(MISSION_ROUTE), width_m=13)
    user_cone(s, cam, *sc.USER, bearing=0)
    nav_banner(s, "mdi-arrow-left", "۲۵۰ متر", "به خیابان شریعتی بپیچید", None, top=116)
    scrim(s, 70, top=430, height=422)

    top = 424
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=28, blur=26, dy=-2, alpha=56)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=28)
    s.rect(0, top + 28, 393, 852 - top - 28, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)
    y = sheet_header(s, top + 20, "مسیر جایگزین مأموریت", "پیشنهادها تا انتخاب شما معتبرند",
                     icon="mdi-routes", title_style="title")

    # choosing a route does not change *where* the mission stands — the strip says that, so the
    # driver keeps the mission in view while comparing options
    y = mission_steps(s, 16, y, 361, 1, note="همین مأموریت") + 12

    options = [("مسیر اصلی", "۴ دقیقه", "۸۵۰ متر", "روان", True),
               ("از خیابان انقلاب", "۶ دقیقه", "۱٫۱ کیلومتر", "نیمه‌سنگین", False),
               ("از بلوار چمران", "۷ دقیقه", "۱٫۴ کیلومتر", "روان", False)]
    for index, (name, mins, dist, traffic, active) in enumerate(options):
        ry = y + index * 72
        s.rect(16, ry, 361, 64, fill=C.primary_soft if active else C.surface_2, radius=16,
               outline=C.primary if active else None, outline_w=1.6 if active else 0)
        s.text(357 - 12, ry + 10, name, "label-lg", C.text, align="right")
        s.text(357 - 12, ry + 32, f"{mins} · {dist}", "caption", C.muted, align="right")
        s.chip(24, ry + 20, traffic, None, "success" if traffic == "روان" else "warning", h=24)
        if active:
            s.circle(52, ry + 20, 9, fill=C.primary)
            s.i.draw_icon(52, ry + 20, "mdi-check", 12, "#FFFFFF")
    y += len(options) * 72 + 2
    s.button(16, y, 361, 50, "ادامه با مسیر فعلی", icon="mdi-navigation", variant="filled")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 09 — arrived at incident
# --------------------------------------------------------------------------- #
def mission_arrived() -> Screen:
    cam = sc.camera(140, 60, 0.24).aim_at(*sc.INCIDENT, 196, 360)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 470, 393, 382)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, locked=True)
    draw_route(s, cam, sc.route_world(MISSION_ROUTE), width_m=12, mute=0.35)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire")
    user_cone(s, cam, *sc.USER, bearing=28)
    # arrival ping on the rescuer's own dot (the sheet covers the incident marker anyway)
    ux, uy = cam.project_grid(*sc.USER)
    s.circle(ux, uy, 13, fill=None, outline=C.success, outline_w=3)

    top = 462
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 22
    s.circle(357 - 22, y + 22, 22, fill=C.success_soft)
    s.i.draw_icon(357 - 22, y + 22, "mdi-map-marker-check", 24, C.success)
    s.text(357 - 52, y + 4, "به محل حادثه رسیدید", "title", C.text, align="right")
    s.text(357 - 52, y + 32, "رسیدن شما برای مرکز امداد ثبت شد.", "caption",
           C.muted, align="right", max_width=270)
    y += 64

    # the arrival is a mission stage, so the plate shows it on the same rail as every other plate;
    # the old "زمان رسیدن ثبت شد" box repeated the rail's own timestamp, so it is gone
    y = mission_rail(s, 16, y, 361, 2, timestamps=sc.MISSION_STAGE_TIMES, tone="mission") + 14

    s.rect(16, y, 361, 62, fill=C.danger_soft, radius=16)
    s.i.draw_icon(357 - 20, y + 20, "mdi-fire", 18, C.danger)
    s.text(357 - 42, y + 9, INCIDENT_NAME, "label", C.text, align="right", max_width=290)
    s.text(357 - 42, y + 32, "شدت بالا · درخواست‌کننده در محل حادثه است", "caption", C.muted,
           align="right", max_width=300)
    y += 76

    s.button(16, y, 361, 52, "شروع رسیدگی", icon="mdi-play-circle-outline", variant="filled",
             shadow=True)
    y += 62
    s.button(201, y, 176, 46, "درخواست پشتیبانی", icon="mdi-account-plus-outline", variant="tonal")
    s.button(16, y, 176, 46, "تماس با درخواست‌کننده", icon="mdi-phone", variant="outline")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 10 — in progress (on scene)
# --------------------------------------------------------------------------- #
def mission_in_progress() -> Screen:
    cam = sc.camera(140, 60, 0.235).aim_at(*sc.INCIDENT, 196, 300)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 372, 393, 480),
                                     box(20, 156, 200, 122)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, locked=True)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire")
    # three responders, one square metre of street: one cluster pinned to the scene by a leader line
    team_cluster(s, cam, *sc.INCIDENT, ["ز", "م"], offset=(-84, -66))
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 366
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 16
    s.text(357, y, "مأموریت در جریان", "title", C.text, align="right", max_width=240)
    # the stage line replaces the chip *and* the "۱۴ دقیقه از پذیرش" caption: the rail prints both
    mission_steps(s, 16, y + 32, 361, 3, note=f"شروع رسیدگی {sc.MISSION_TIMES['responding']}")
    y += 62

    statuses = [("م", "شما (لیدر)", "در محل حادثه", "success"),
                ("س", "سعید کریمی", "در راه است · ۳ دقیقه", "warning"),
                ("ز", "زهرا احمدی", "در محل حادثه", "success")]
    for initial, name, state, tone in statuses:
        s.rect(16, y, 361, 48, fill=C.surface_2, radius=14)
        s.circle(357 - 22, y + 24, 14, fill=C.primary_soft)
        s.text(357 - 22, y + 17, initial, "label", C.primary, align="center")
        s.text(357 - 44, y + 6, name, "label", C.text, align="right")
        s.text(357 - 44, y + 25, state, "caption",
               C.success if tone == "success" else C.warning, align="right")
        s.i.draw_icon(34, y + 24, "mdi-chevron-left", 18, C.muted_2)
        y += 52
    y += 2

    s.text(357, y, "گزارش لحظه‌ای", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(16, y, 361, 56, fill=C.surface_2, radius=14)
    s.text(357 - 12, y + 8, "آخرین به‌روزرسانی: ۱۰:۰۵", "caption", C.muted, align="right")
    s.text(357 - 12, y + 26, "تخلیهٔ طبقهٔ دوم انجام شد · در انتظار تیم پشتیبانی", "caption-bold",
           C.text_2, align="right", max_width=320)
    y += 70

    s.button(16, y, 176, 48, "درخواست پشتیبانی", icon="mdi-account-plus-outline",
             variant="tonal")
    s.button(201, y, 176, 48, "ثبت گزارش و پایان", icon="mdi-clipboard-check-outline",
             variant="filled")
    y += 62
    s.rect(16, y, 361, 44, fill=C.warning_soft, radius=12)
    s.i.draw_icon(357 - 18, y + 22, "mdi-shield-alert-outline", 15, C.warning)
    s.text(357 - 36, y + 12, "لغو مأموریت فقط از منوی «بیشتر» و با ثبت دلیل ممکن است", "caption",
           C.warning, align="right", max_width=300)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 11 — support request composer
# --------------------------------------------------------------------------- #
def support_request() -> Screen:
    cam = sc.camera(140, 60, 0.20).aim_at(*sc.INCIDENT, 196, 200)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 268, 393, 584)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, locked=True)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire", rings=False)
    scrim(s, 60, top=250, height=602)

    top = 258
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=56)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    # this is a form opened *from* a running mission: the subtitle says which stage that is, because
    # a modal has no room for the full rail and a rescuer must not lose the mission while typing
    y = sheet_header(s, top + 20, "درخواست نیروی پشتیبان", "مأموریت در رسیدگی · مرحلهٔ ۴ از ۵",
                     icon="mdi-account-plus-outline", tone="primary", title_style="title")

    s.text(357, y, "گروه امدادی", "caption-bold", C.muted, align="right")
    y += 22
    groups = [("آتش‌نشانی", "fire-truck", True), ("هلال‌احمر", "medical-bag", False),
              ("امداد شهری", "police-badge", False)]
    tile_w = (361 - 16) / 3
    for index, (label, icon, active) in enumerate(groups):
        tx = 16 + index * (tile_w + 8)
        s.rect(tx, y, tile_w, 78, fill=C.primary_soft if active else C.surface_2, radius=R.md,
               outline=C.primary if active else None, outline_w=1.6 if active else 0)
        s.i.draw_icon(tx + tile_w / 2, y + 26, icon, 24, C.primary if active else C.muted)
        s.text(tx + tile_w / 2, y + 48, label, "caption", C.primary if active else C.text_2,
               align="center", max_width=tile_w)
    y += 92

    s.text(357, y, "تعداد نیرو", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(16, y, 361, 56, fill=C.surface_2, radius=16)
    # RTL stepper: "+" on the leading (right) edge, "−" on the trailing edge
    s.circle(357 - 30, y + 28, 20, fill=C.primary)
    s.i.draw_icon(357 - 30, y + 28, "mdi-plus", 19, "#FFFFFF")
    s.text(357 - 108, y + 12, "۲", "metric-sm", C.text, align="center")
    s.text(357 - 108, y + 38, "نفر", "caption", C.muted, align="center")
    s.circle(357 - 188, y + 28, 20, fill="#FFFFFF", outline=C.outline_strong, outline_w=1.2)
    s.i.draw_icon(357 - 188, y + 28, "mdi-minus", 19, C.text_2)
    y += 70

    s.text(357, y, "یادداشت برای تیم پشتیبان", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(16, y, 361, 76, fill=C.surface_2, radius=16)
    s.para(25, y + 10, "آتش‌سوزی در طبقهٔ دوم انبار؛ نیاز به نردبان و دو نیروی آموزش‌دیده.",
           "body-sm", C.text_2, align="right", max_width=320)
    s.text(357 - 12, y + 54, f"{fa_digits(44)}/{fa_digits(120)}", "caption", C.muted_2, align="left")
    y += 90

    # summary
    s.rect(16, y, 361, 62, fill=C.info_soft, radius=16)
    s.i.draw_icon(357 - 20, y + 31, "mdi-information-outline", 18, C.info)
    s.text(357 - 42, y + 10, "خلاصهٔ درخواست", "caption-bold", C.info, align="right")
    s.text(357 - 42, y + 30, "۲ نفر آتش‌نشانی · محل حادثه · نیاز فوری", "caption", C.text_2,
           align="right", max_width=300)
    y += 76

    s.button(16, y, 361, 52, "ارسال درخواست پشتیبانی", icon="mdi-send-outline", variant="filled",
             shadow=True)
    y += 62
    s.text(196.5, y, "درخواست به مرکز امداد و تیم‌های آمادهٔ نزدیک ارسال می‌شود", "caption",
           C.muted_2, align="center", max_width=340)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 12 — support pending
# --------------------------------------------------------------------------- #
def support_pending() -> Screen:
    cam = sc.camera(140, 60, 0.20).aim_at(*sc.INCIDENT, 196, 260)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 336, 393, 516)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, locked=True)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire")
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 330
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 20
    s.chip(24, y + 6, "در انتظار پاسخ", None, "warning", h=26)
    s.text(357, y, "درخواست پشتیبانی ارسال شد", "title", C.text, align="right", max_width=250)
    s.text(357, y + 28, "۹:۵۵ · ۲ نیروی آتش‌نشانی · محل حادثه", "caption", C.muted, align="right")
    y += 58

    # animated pending indicator
    s.rect(16, y, 361, 86, fill=C.surface_2, radius=18)
    s.spinner(357 - 28, y + 43, 15, C.warning, 2.6)
    s.text(357 - 56, y + 16, "در حال یافتن نیروی آماده", "label", C.text, align="right")
    s.text(357 - 56, y + 38, "میانگین زمان پاسخ در این منطقه: ۲ دقیقه", "caption", C.muted,
           align="right")
    s.rect(357 - 56 - 260, y + 60, 260, 6, fill=C.surface_3, radius=3)
    s.rect(357 - 56 - 260, y + 60, 150, 6, fill=C.warning, radius=3)
    y += 100

    # the pending request is the *backup* request; the mission itself is still in رسیدگی
    y = mission_steps(s, 16, y, 361, 3, note=f"درخواست پشتیبانی {sc.MISSION_TIMES['backup']}") + 10

    s.text(357, y, "وضعیت نیروهای درخواستی", "caption-bold", C.muted, align="right")
    y += 22
    rows = [("نیروی ۱", "پاسخ داده نشده", "warning"), ("نیروی ۲", "پاسخ داده نشده", "warning")]
    for label, state, tone in rows:
        s.rect(16, y, 361, 48, fill=C.surface_2, radius=14)
        s.text(357 - 12, y + 14, label, "label", C.text_2, align="right")
        s.text(240, y + 14, state, "caption", C.warning, align="right")
        s.spinner(34, y + 24, 8, C.warning, 2)
        y += 54
    y += 2

    s.button(16, y, 176, 46, "لغو درخواست", icon="mdi-close", variant="tonal", color=C.danger)
    s.button(201, y, 176, 46, "ادامهٔ رسیدگی", icon="mdi-fire", variant="filled")
    y += 62

    # the note the leader wrote on the previous plate: the one piece of this request that exists
    # nowhere else on the sheet, so it earns the room the removed summary card used to take
    s.text(357, y, "یادداشت برای سرپرست", "caption-bold", C.muted, align="right")
    y += 22
    s.rect(16, y, 361, 58, fill=C.surface_2, radius=16)
    s.para(30, y + 8, "آتش‌سوزی در طبقهٔ دوم انبار؛ نیاز به نردبان و دو نیروی آموزش‌دیده.",
           "caption", C.text_2, align="right", max_width=320)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 13 — support accepted notification
# --------------------------------------------------------------------------- #
def support_accepted() -> Screen:
    cam = sc.camera(140, 60, 0.20).aim_at(*sc.INCIDENT, 196, 320)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 200), box(0, 430, 393, 422),
                                     box(20, 186, 214, 112)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, locked=True)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire")
    team_cluster(s, cam, *sc.INCIDENT, ["ع", "ز", "م"], offset=(-92, -72))
    user_cone(s, cam, *sc.USER, bearing=28)

    # live notification toast (non-blocking, below the segmented control)
    s.shadow(12, 122, 369, 86, radius=20, blur=18, dy=6, alpha=52)
    s.rect(12, 122, 369, 86, fill="#FFFFFF", radius=20, outline=C.success, outline_w=1.4)
    s.circle(357 - 26, 122 + 43, 21, fill=C.success_soft)
    s.i.draw_icon(357 - 26, 122 + 43, "mdi-check-circle", 22, C.success)
    s.text(357 - 56, 122 + 14, "یک نیروی آتش‌نشان درخواست را پذیرفت", "label", C.text,
           align="right", max_width=280)
    s.text(357 - 56, 122 + 38, "علی موسوی · در محل حادثه", "caption",
           C.muted, align="right", max_width=290)
    s.text(357 - 56, 122 + 62, "۱ دقیقه پیش · اعلان صوتی پخش شد", "caption", C.muted_2,
           align="right")
    s.i.draw_icon(34, 122 + 22, "mdi-volume-high", 16, C.success)

    top = 424
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 16
    s.text(357, y, "تیم پشتیبانی", "title", C.text, align="right")
    mission_steps(s, 16, y + 30, 361, 3, note="۱ از ۲ نیرو پذیرفت")
    y += 58

    members = [("ع", "علی موسوی", "پذیرفته · در محل حادثه", "success", True),
               ("ن", "نیروی دوم", "در انتظار پاسخ", "warning", False)]
    for initial, name, state, tone, accepted in members:
        s.rect(16, y, 361, 66, fill=C.success_soft if accepted else C.surface_2, radius=16)
        s.circle(357 - 26, y + 33, 18, fill=C.primary_soft if accepted else C.surface_3)
        s.text(357 - 26, y + 25, initial, "label", C.primary, align="center")
        s.text(357 - 54, y + 10, name, "label", C.text, align="right")
        s.text(357 - 54, y + 32, state, "caption", C.success if accepted else C.warning,
               align="right")
        s.i.draw_icon(34, y + 33, "mdi-check-circle" if accepted else "mdi-clock-outline", 18,
                      C.success if accepted else C.warning)
        y += 74

    s.rect(16, y, 361, 62, fill=C.info_soft, radius=16)
    s.i.draw_icon(357 - 20, y + 20, "mdi-information-outline", 17, C.info)
    s.text(357 - 42, y + 10, "لیدر تیم شما هستید", "caption-bold", C.info, align="right")
    s.text(357 - 42, y + 30, "می‌توانید وضعیت اعضای تیم را در داشبورد تیم ببینید.", "caption",
           C.muted, align="right", max_width=300)
    y += 66

    s.rect(16, 782, 361, 54, fill=C.surface_2, radius=14)
    s.i.draw_icon(357 - 20, 809, "mdi-bell-ring-outline", 17, C.primary)
    s.text(357 - 42, 790, "اعلان صوتی پذیرش نیرو", "label", C.text_2, align="right",
           max_width=190)
    s.text(357 - 42, 811, "اعلان سیستمی هم ارسال می‌شود", "caption", C.muted_2,
           align="right", max_width=200)
    s.toggle(30, 796, 44, 26, on=True)

    s.button(16, y, 176, 48, "داشبورد تیم", icon="mdi-account-group-outline", variant="tonal")
    s.button(201, y, 176, 48, "ادامهٔ رسیدگی", icon="mdi-fire", variant="filled")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 14 — team leader dashboard
# --------------------------------------------------------------------------- #
def team_leader() -> Screen:
    cam = sc.camera(140, 60, 0.21).aim_at(*sc.INCIDENT, 196, 272)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 300, 393, 552),
                                     box(20, 120, 218, 124)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, locked=True)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire")
    team_cluster(s, cam, *sc.INCIDENT, ["ع", "ز", "م"], offset=(-98, -92))
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 292
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = sheet_header(s, top + 22, "داشبورد تیم اعزامی", "مأموریت آتش‌سوزی · لیدر: شما",
                     icon="mdi-account-group-outline", tone="mission", title_style="title")

    s.rect(16, y, 361, 104, fill=C.mission_soft, radius=16)
    s.text(357, y + 9, "۳ نفر در محل حادثه · ۱ نفر در راه", "label", C.mission, align="right")
    s.text(357, y + 30, f"اعزام {sc.MISSION_TIMES['accepted']} · حضور تیم {sc.MISSION_TIMES['arrived']}", "caption", C.muted, align="right")
    # walkie-talkie status: the channel is open to the dispatched team only
    s.chip(24, y + 50, "کانال بی‌سیم باز", "mdi-access-point", "success", h=22)
    # the stage, in the same five dots as everywhere else: a leader should not count roster rows
    stage_text = "در حال رسیدگی · مرحلهٔ ۴ از ۵"
    s.text(357, y + 52, stage_text, "caption", C.mission, align="right")
    cursor = 357 - s.tw(stage_text, "caption") - 10
    for index in range(5):
        if index == 3:
            s.circle(cursor, y + 60, 5.0, fill=C.mission_soft)
            s.circle(cursor, y + 60, 2.9, fill=C.mission)
        else:
            s.circle(cursor, y + 60, 2.9, fill=C.mission if index < 3 else "#E3C9A6")
        cursor -= 10
    # the wall-clock pair already sits two lines up; this line says what operators actually ask
    s.text(26, y + 84, "مدت رسیدگی تا این لحظه: ۱۸ دقیقه", "caption", C.muted_2, align="left")
    y += 116

    # Section header doubles as the press-to-talk instruction, so no extra help card
    # is needed: the gesture is explained where the control lives.
    s.text(357, y, "اعضای تیم", "caption-bold", C.muted, align="right")
    s.text(300, y, "۴ عضو", "caption", C.muted_2, align="right")
    hint_w = s.tw("نگه دارید تا صحبت کنید", "caption")
    s.text(26, y, "نگه دارید تا صحبت کنید", "caption", C.mission, align="left")
    s.i.draw_icon(26 + hint_w + 11, y + 9, "mdi-gesture-tap-hold", 15, C.mission)
    y += 22

    # (initial, name, state, tone, role icon, transmitting, seconds)
    members = [("م", "شما", "در محل حادثه · لیدر", "success", "mdi-shield-star-outline", False, ""),
               ("س", "سعید کریمی", "در راه است · ۳ دقیقه", "warning", "mdi-car", True, "۰:۰۴"),
               ("ز", "زهرا احمدی", "در محل حادثه · در حال امداد", "success", "mdi-fire", False, ""),
               ("ع", "علی موسوی", "در محل حادثه · آماده", "success", "mdi-account-check", False, "")]
    for initial, name, state, tone, icon, talking, timer in members:
        h = 50
        if talking:
            # transmitting row: amber mission tone + waveform, never the red alert tone
            s.rect(16, y, 361, h, fill=C.mission_soft, radius=14, outline=C.mission,
                   outline_w=1.4)
        else:
            s.rect(16, y, 361, h, fill=C.surface_2, radius=14)
        s.circle(357 - 20, y + 25, 14, fill=C.primary_soft)
        s.text(357 - 20, y + 18, initial, "label", C.primary, align="center")
        s.text(357 - 42, y + 6, name, "label", C.text, align="right")
        state_color = C.success if tone == "success" else C.warning
        s.text(357 - 42, y + 26, ("در حال صحبت…" if talking else state), "caption",
               C.mission if talking else state_color, align="right")

        if name == "شما":
            # you are the sender's own row: no self-PTT, show the leader badge instead
            s.rect(16 + 10, y + 25 - 11, 52, 22, fill=C.mission_soft, radius=11)
            s.text(16 + 10 + 26, y + 19, "لیدر", "caption-bold", C.mission, align="center")
        elif talking:
            # live waveform + hold-to-talk button in its pressed state
            for index, bar in enumerate((6, 12, 18, 10, 15, 7)):
                s.rect(78 + index * 6, y + 25 - bar / 2, 3, bar,
                       fill=C.mission if index % 2 == 0 else "#C08A52", radius=1.5)
            s.text(120, y + 18, timer, "caption-bold", C.mission, align="left")
            s.circle(16 + 26, y + 25, 17, fill=C.mission, outline="#FFFFFF", outline_w=1.6)
            s.i.draw_icon(16 + 26, y + 25, "mdi-microphone", 18, "#FFFFFF")
        else:
            s.circle(16 + 26, y + 25, 17, fill="#FFFFFF", outline=C.outline, outline_w=1)
            s.i.draw_icon(16 + 26, y + 25, "mdi-microphone-outline", 17, C.text_2)
        y += h + 6
    y += 2

    s.button(16, y, 361, 44, "نمایش موقعیت تیم روی نقشه", icon="mdi-map-marker-path",
             variant="outline")
    y += 54

    s.button(16, y, 361, 48, "ثبت گزارش و پایان مأموریت", icon="mdi-clipboard-check-outline",
             variant="filled", shadow=True)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 15 — mission cancel
# --------------------------------------------------------------------------- #
def mission_cancel() -> Screen:
    cam = sc.camera(140, 60, 0.21).aim_at(*sc.INCIDENT, 196, 280)
    s = map_view(cam, pois=False)
    s.top_scrim(150)
    scrim(s, 130)
    chrome(s, tab=MISSION_TAB, locked=True)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire", rings=False)

    top = 300
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=64)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    y = top + 22
    s.circle(377 - 20, y + 20, 20, fill=C.danger_soft)
    s.i.draw_icon(377 - 20, y + 20, "mdi-alert-outline", 22, C.danger)
    s.text(377 - 50, y + 4, "لغو مأموریت", "title", C.text, align="right")
    # what is being abandoned, and from which stage: the sentence about the consequence already
    # lives in the warning banner at the bottom, so this line is free to carry the mission state
    s.text(377 - 50, y + 30, "مأموریت در رسیدگی · مرحلهٔ ۴ از ۵", "caption", C.danger,
           align="right", max_width=280)
    y += 62

    s.text(377, y, "دلیل لغو", "caption-bold", C.muted, align="right")
    y += 22
    reasons = ["دسترسی به محل ممکن نیست", "حادثه توسط تیم دیگری پوشش داده شد",
               "خطر جانی برای امدادگر", "سایر دلایل"]
    for index, reason in enumerate(reasons):
        ry = y + index * 48
        active = index == 0
        s.rect(16, ry, 361, 42, fill=C.danger_soft if active else C.surface_2, radius=14,
               outline=C.danger if active else None, outline_w=1.4 if active else 0)
        s.circle(347, ry + 21, 9, fill=C.danger if active else "#FFFFFF",
                 outline=None if active else C.outline_strong, outline_w=0 if active else 1.2)
        if active:
            s.i.draw_icon(347, ry + 21, "mdi-check", 12, "#FFFFFF")
        s.text(325, ry + 10, reason, "body-sm", C.text if active else C.text_2, align="right",
               max_width=270)
    y += len(reasons) * 48 + 4

    s.rect(16, y, 361, 66, fill=C.surface_2, radius=16)
    s.text(345, y + 10, "توضیح تکمیلی (اختیاری)", "caption", C.muted, align="right")
    s.text(345, y + 32, "مسیر بن‌بست است؛ نیروی جایگزین لازم است.", "body-sm", C.text_2,
           align="right", max_width=320)
    y += 80

    s.rect(16, y, 361, 54, fill=C.warning_soft, radius=14)
    s.i.draw_icon(357 - 20, y + 18, "mdi-alert-circle-outline", 17, C.warning)
    s.text(357 - 42, y + 10, "پس از لغو، مأموریت از شما گرفته می‌شود", "caption-bold", C.warning,
           align="right")
    s.text(357 - 42, y + 30, "مرکز امداد برای یافتن جایگزین مطلع می‌شود.", "caption", C.muted,
           align="right", max_width=290)
    y += 70

    s.button(201, y, 176, 50, "لغو مأموریت", variant="filled", color=C.danger)
    s.button(16, y, 176, 50, "ادامهٔ مأموریت", variant="tonal", color=C.primary)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 16/17 — report + completed
# --------------------------------------------------------------------------- #
def mission_report() -> Screen:
    cam = sc.camera(140, 60, 0.20).aim_at(*sc.INCIDENT, 196, 180)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 246, 393, 606)))
    s.top_scrim(120)
    chrome(s, tab=MISSION_TAB, locked=True)
    incident_marker(s, cam, *sc.INCIDENT, None, icon="fire", rings=False)
    scrim(s, 60, top=236, height=616)

    top = 240
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=56)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    # the duration and the two wall-clock ends used to be a separate box at the bottom; they belong
    # in the subtitle, where they answer "how long was I on this?" before the reader scrolls
    y = sheet_header(s, top + 20, "گزارش کوتاه مأموریت",
                     f"{fa_digits(sc.MISSION_MINUTES)} دقیقه · از {sc.MISSION_TIMES['accepted']}"
                     f" تا {sc.MISSION_TIMES['closed']}",
                     icon="mdi-clipboard-check-outline", tone="success", title_style="title")

    # a mission that ran to completion ends on the last stage, so the rail is the outcome — the
    # old «انجام شد / لغو شد» pair invited the user to cancel a mission they were reporting on
    y = mission_rail(s, 16, y, 361, 4, timestamps=sc.MISSION_STAGE_TIMES_DONE,
                     tone="success") + 14

    # which mission this report is about: the header only says "گزارش کوتاه مأموریت"
    s.rect(16, y, 361, 56, fill=C.danger_soft, radius=14)
    s.i.draw_icon(357 - 18, y + 18, "mdi-fire", 17, C.danger)
    s.text(357 - 38, y + 9, INCIDENT_NAME, "label", C.text, align="right", max_width=290)
    s.text(357 - 38, y + 30, f"{INCIDENT_ADDRESS} · مأموریت شمارهٔ {fa_digits(4127)}",
           "caption", C.muted, align="right", max_width=300)
    y += 68

    s.text(357, y, "خلاصهٔ اقدام", "caption-bold", C.muted, align="right")
    y += 22
    # the textarea is the only thing on this sheet the rescuer actually writes: give it the room
    # that the deleted «زمان صرف‌شده» box used to take
    s.rect(16, y, 361, 126, fill=C.surface_2, radius=16)
    s.para(15, y + 10, "آتش‌سوزی انبار با کمک تیم پشتیبانی مهار شد؛ ساکنان تخلیه شدند و محل به آتش‌نشانی تحویل داده شد.",
           "body-sm", C.text_2, align="right", max_width=330)
    s.rect(16, y + 96, 361, 1.2, fill=C.outline)
    s.text(357 - 12, y + 104, f"{fa_digits(96)}/{fa_digits(300)}", "caption", C.muted_2,
           align="left")
    y += 140

    s.text(357, y, "وضعیت درخواست‌کننده", "caption-bold", C.muted, align="right")
    y += 22
    chips = [("سالم", "success"), ("آسیب جزئی", "warning"), ("تحویل به مرکز درمانی", "info")]
    cx = 357
    for label, tone in chips:
        width = s.tw(label, "caption-bold") + 22
        s.chip(cx - width, y, label, None, tone, h=30)
        cx -= width + 8
    y += 44

    s.rect(16, y, 361, 44, fill=C.info_soft, radius=12)
    s.i.draw_icon(357 - 20, y + 22, "mdi-lock-outline", 16, C.info)
    s.text(357 - 40, y + 12, "امتیاز درخواست‌کننده پس از بسته‌شدن مأموریت ثبت می‌شود", "caption",
           C.info, align="right", max_width=300)
    y += 58

    s.button(16, y, 361, 52, "ثبت گزارش و بستن مأموریت", icon="mdi-content-save-check-outline",
             variant="filled", shadow=True)
    home_bar(s)
    return s


def mission_completed() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=MISSION_TAB)

    # celebration header over a light map
    cam = sc.camera(140, 60, 0.16).aim_at(*sc.INCIDENT, 196, 190)
    preview = Screen(background=C.map_land, width=393, height=300)
    from bb.map import draw_base, draw_labels, Camera, to_world
    cam_h = Camera(to_world(140, 60), 0.16)
    draw_base(preview, cam_h)
    draw_labels(preview, cam_h)
    draw_route(preview, cam_h, sc.route_world(MISSION_ROUTE), width_m=12, mute=0.5)
    preview.i.draw_icon(*cam_h.project_grid(*sc.INCIDENT, preview), "fire", 22, C.danger)
    s.img.paste(preview.img, (0, 108 * s.s))
    s.gradient(0, 108, 393, 84, "#F1F5F4", 230, 0)

    # the celebration gets its own card: drawn straight on the map the headline sat on street names
    s.shadow(16, 138, 361, 136, radius=24, blur=20, dy=6, alpha=28)
    s.rect(16, 138, 361, 136, fill="#FFFFFF", radius=24)
    s.circle(196.5, 172, 27, fill=C.success_soft)
    s.i.draw_icon(196.5, 172, "mdi-check-bold", 27, C.success)
    s.text(196.5, 200, "مأموریت با موفقیت بسته شد", "title-lg", C.text, align="center")
    s.text(196.5, 232, "گزارش شما همیشه در سوابق امدادگری می‌ماند", "caption", C.muted, align="center")
    y = 288

    card_y = y
    s.shadow(16, card_y, 361, 210, radius=22, blur=18, dy=6, alpha=26)
    s.rect(16, card_y, 361, 210, fill="#FFFFFF", radius=22, outline=C.outline, outline_w=1)
    s.text(357, card_y + 14, "آتش‌سوزی انبار تجاری · بازار قدیم", "label", C.text, align="right",
           max_width=320)
    s.text(357, card_y + 36, f"{sc.MISSION_TIMES['accepted']} تا {sc.MISSION_TIMES['closed']}"
           " · لیدر تیم: شما", "caption", C.muted, align="right")
    s.divider(30, card_y + 58, 363)
    metric_tiles(s, 28, card_y + 68, 337, [("مدت", f"{fa_digits(sc.MISSION_MINUTES)} دقیقه", ""),
                                           ("مسافت", f"{fa_number(sc.MISSION_DISTANCE_KM)} کیلومتر", ""),
                                           ("تیم", f"{fa_digits(4)} نفر", "")], h=60)
    s.divider(30, card_y + 142, 363)
    s.text(357, card_y + 152, "امتیاز درخواست‌کننده", "caption", C.muted, align="right")
    s.stars(357 - 96, card_y + 172, 5)
    s.text(250, card_y + 164, "۵ از ۵", "caption-bold", C.amber, align="right")
    y = card_y + 224

    s.rect(16, y, 361, 56, fill=C.surface_2, radius=16)
    s.text(357, y + 10, "گزارش کوتاه شما", "caption-bold", C.muted, align="right")
    s.text(357, y + 30, "آتش مهار و محل به آتش‌نشانی تحویل داده شد.", "caption", C.text_2,
           align="right", max_width=320)
    y += 70

    # the closing summary uses the same five-stage rail as the live plates. Its old three-mark
    # timeline had invented times for این مأموریت (a «۱۰:۰۵ رسیدن» that never happened).
    s.rect(16, y, 361, 97, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
    mission_rail(s, 28, y + 8, 337, 4, timestamps=sc.MISSION_STAGE_TIMES_DONE, tone="success")
    y += 111

    s.button(201, y, 176, 50, "سوابق مأموریت", icon="mdi-history", variant="tonal")
    s.button(16, y, 176, 50, "بازگشت به نقشه", icon="mdi-map-outline", variant="filled")
    y += 62
    s.text(196.5, y, "وضعیت آمادگی شما برای مأموریت بعدی فعال است", "caption", C.muted_2,
           align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 18/19 — extra states
# --------------------------------------------------------------------------- #
def mission_no_offer() -> Screen:
    cam = sc.camera(sc.USER[0] + 40, sc.USER[1] - 80, 0.19)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 126), box(0, 520, 393, 332)))
    s.top_scrim(128)
    chrome(s, tab=MISSION_TAB)
    map_tools(s, 128)
    user_cone(s, cam, *sc.USER, bearing=28)

    top = 512
    s.shadow(12, top, 369, 220, radius=26, blur=24, dy=8, alpha=44)
    s.rect(12, top, 369, 220, fill="#FFFFFF", radius=26, outline=C.outline, outline_w=1)
    s.rect(188, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)
    empty_state(s, top + 10, "mdi-lifebuoy", "پیشنهاد فعالی نیست",
                "وقتی حادثه‌ای در محدودهٔ شما ثبت شود، پیشنهاد مأموریت روی همین نقشه نمایش داده می‌شود.",
                None)
    s.button(24, top + 172, 168, 42, "تازه‌سازی", icon="mdi-refresh", variant="tonal")
    s.button(201, top + 172, 168, 42, "تغییر محدوده", icon="mdi-map-marker-radius-outline",
             variant="outline")
    home_bar(s)
    return s


def mission_offline() -> Screen:
    cam = sc.camera(sc.USER[0] + 40, sc.USER[1] - 80, 0.19)
    s = map_view(cam, pois=False)
    scrim(s, 40)
    chrome(s, tab=MISSION_TAB, locked=True)
    s.rect(0, 116, 393, 44, fill=C.warning)
    s.i.draw_icon(357 - 22, 138, "mdi-wifi-off", 17, "#FFFFFF")
    s.text(357 - 40, 130, "اتصال قطع است · تلاش دوباره برای اتصال", "caption-bold", "#FFFFFF",
           align="right")

    top = 300
    s.shadow(16, top, 361, 286, radius=26, blur=24, dy=10, alpha=60)
    s.rect(16, top, 361, 286, fill="#FFFFFF", radius=26)
    s.circle(196.5, top + 44, 30, fill=C.warning_soft)
    s.i.draw_icon(196.5, top + 44, "mdi-cloud-off-outline", 30, C.warning)
    s.text(196.5, top + 84, "ارتباط با سرور امداد قطع است", "title", C.text, align="center")
    # para() anchors at the block's left edge, so centre it on the card, not inside it
    s.para(41.5, top + 114, "پیشنهاد مأموریت دریافت نمی‌شود و موقعیت شما ارسال نمی‌شود. "
           "اطلاعات مأموریت فعلی از حافظهٔ دستگاه نمایش داده می‌شود.",
           "body-sm", C.muted, align="center", max_width=310, line_height=21)
    s.spinner(196.5, top + 192, 8, C.warning, 2)
    s.text(196.5, top + 208, "تلاش خودکار در ۵ ثانیه", "caption-bold", C.warning, align="center")
    s.button(40, top + 232, 313, 36, "تلاش دوباره", icon="mdi-refresh", variant="tonal")

    # an offline mission still has a state, and the copy above promises it is cached: show it
    s.rect(16, 610, 361, 96, fill=C.surface_2, radius=16)
    mission_steps(s, 30, 622, 333, 3, note="از حافظهٔ دستگاه")
    s.i.draw_icon(345, 668, "mdi-database-outline", 16, C.muted)
    s.text(325, 658, "آخرین همگام‌سازی موفق: ۱۰:۰۳", "caption", C.text_2, align="right")
    home_bar(s)
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "m-01-ready-on": ("mission/01-mission-ready-on.png", mission_ready_on),
    "m-02-ready-off": ("mission/02-mission-ready-off.png", mission_ready_off),
    "m-03-offer": ("mission/03-mission-offer.png", mission_offer),
    "m-04-offer-details": ("mission/04-mission-offer-details.png", mission_offer_details),
    "m-05-accepted": ("mission/05-mission-accepted.png", mission_accept_confirm),
    "m-06-dispatch": ("mission/06-mission-dispatch.png", mission_accepted),
    "m-07-navigation": ("mission/07-mission-navigation-active.png", mission_navigation),
    "m-08-alternatives": ("mission/08-mission-route-alternatives.png", mission_alternatives),
    "m-09-arrived": ("mission/09-mission-arrived.png", mission_arrived),
    "m-10-in-progress": ("mission/10-mission-in-progress.png", mission_in_progress),
    "m-11-support": ("mission/11-support-request.png", support_request),
    "m-12-support-pending": ("mission/12-support-pending.png", support_pending),
    "m-13-support-accepted": ("mission/13-support-accepted-notification.png", support_accepted),
    "m-14-team": ("mission/14-team-leader-dashboard.png", team_leader),
    "m-15-cancel": ("mission/15-mission-cancel.png", mission_cancel),
    "m-16-report": ("mission/16-mission-report.png", mission_report),
    "m-17-completed": ("mission/17-mission-completed.png", mission_completed),
    "m-18-no-offer": ("mission/18-mission-no-offer.png", mission_no_offer),
    "m-19-offline": ("mission/19-mission-offline.png", mission_offline),
}


def _at(key: str, fn: Callable[[], Screen]):
    """Stamp the plate's own wall-clock onto its status bar before it draws."""
    def run() -> Screen:
        ui.MOMENT = sc.MISSION_CLOCKS.get(key)
        try:
            return fn()
        finally:
            ui.MOMENT = None
    return run


# the raw functions stay reachable for tests: `SCREENS` holds the clock-stamping wrappers
PLATES = dict(SCREENS)
SCREENS = {key: (path, _at(key, fn)) for key, (path, fn) in PLATES.items()}
