"""SOS section: the citizen's half of an emergency call.

The map-page plates so far describe the rescuer's phone (an offer, a mission, a team). This module
is the other side of the same incident: the person who needs help. It follows the real client flow
(`SosTriggerButton` → `SosRequestSheet` → `useSosCancellation` → `UserSosHistoryView`) step by step,
so every plate maps onto a state the code already has:

    entry → hold → compose → location → photo → review → sending
          → pending → dispatched → accepted → arrived → completed
          ↘ cancel → cancelled          ↘ photo-retry      ↘ offline / validation

The request's own track is `SOS_STAGES` (ثبت، اعزام، پذیرش، رسیدگی، پایان) and every plate after
submission states where the request stands — the same rule the mission plates follow.
"""
from __future__ import annotations

import math
from typing import Callable

from bb import scenario as sc
from bb import ui
from bb.map import Camera, draw_route, fit_camera, fit_camera_rotated
from bb.prims import Screen, scrim
from bb.text import count_chars, fa_digits
from bb.theme import C, R
from bb.ui import chrome, form_step, home_bar, map_tools, metric_tiles, sheet_header, sos_rail

from ._base import box, destination_pin, keepout, map_view, user_cone


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def sheet(s: Screen, top: float, radius: float = 30, grabber: bool = True) -> None:
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=radius, blur=26, dy=-2, alpha=52)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=radius)
    s.rect(0, top + radius, 393, 852 - top - radius, fill="#FFFFFF")
    if grabber:
        s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)


def section_label(s: Screen, y: float, text: str, note: str | None = None) -> float:
    s.text(377, y, text, "caption-bold", C.muted, align="right")
    if note:
        s.text(16, y, note, "caption", C.muted_2, align="left")
    return y + 22


def field(s: Screen, x: float, y: float, w: float, h: float, label: str, value: str | None = None,
          placeholder: str | None = None, icon: str | None = None, error: str | None = None,
          tone: str = "neutral", thumb: bool = False, note: str | None = None) -> float:
    """A read-only input shell: what the field holds, or what it is waiting for."""
    edge = C.danger if error else (C.outline if tone == "neutral" else C.primary)
    s.rect(x, y, w, h, fill=C.surface_2 if not error else C.danger_soft, radius=14,
           outline=edge, outline_w=1.4 if (error or tone != "neutral") else 1)
    right = x + w - 12
    if thumb:
        _photo_thumb(s, x + 12, y + (h - 36) / 2, 48, 36, radius=8)
        s.text(right, y + 5, label, "caption", C.muted, align="right")
        if value:
            s.text(right, y + 23, value, "label", C.text, align="right", max_width=w - 90)
        if note:
            s.text(right, y + 43, note, "caption", C.muted, align="right", max_width=w - 90)
        return y + h
    if icon:
        s.i.draw_icon(right - 8, y + 18, icon, 16, C.danger if error else C.muted)
        right -= 26
    s.text(right, y + 8, label, "caption", C.danger if error else C.muted, align="right")
    body = value if value is not None else placeholder
    if body:
        s.text(right, y + h - 26, body, "label" if value else "caption",
               C.text if value else C.muted_2, align="right", max_width=w - 30)
    return y + h


def severity_cards(s: Screen, y: float, active: str | None = "high") -> float:
    """Three severity tiles, exactly the values `severitySchema` allows."""
    rows = [("low", "کم", "کمک ضروری نیست", C.success),
            ("medium", "متوسط", "رسیدگی لازم است", C.warning),
            ("high", "شدید", "خطر جانی", C.danger)]
    w = (361 - 16) / 3
    for index, (key, label, hint, color) in enumerate(rows):
        x = 16 + index * (w + 8)
        on = key == active
        s.rect(x, y, w, 76, fill=color if on else C.surface_2, radius=R.md,
               outline=None if on else C.outline, outline_w=0 if on else 1)
        s.circle(x + w / 2, y + 20, 8 if not on else 9, fill="#FFFFFF" if on else color)
        if on:
            s.circle(x + w / 2, y + 20, 4.4, fill=color)
        s.text(x + w / 2, y + 34, label, "label-lg", "#FFFFFF" if on else C.text, align="center")
        s.text(x + w / 2, y + 55, hint, "caption", "#FFFFFF" if on else C.muted, align="center",
               max_width=w - 8)
    return y + 76


def incident_tiles(s: Screen, y: float, active: str = "آتش‌سوزی") -> float:
    """Two rows of incident types (3 + 2), the list the picker actually loads."""
    w3 = (361 - 16) / 3
    w2 = (361 - 8) / 2
    for index, (label, icon) in enumerate(sc.SOS_INCIDENT_TYPES[:3]):
        x = 16 + index * (w3 + 8)
        _incident_tile(s, x, y, w3, 56, label, icon, label == active)
    y2 = y + 64
    for index, (label, icon) in enumerate(sc.SOS_INCIDENT_TYPES[3:]):
        x = 16 + index * (w2 + 8)
        _incident_tile(s, x, y2, w2, 56, label, icon, label == active)
    return y2 + 56


def _incident_tile(s: Screen, x: float, y: float, w: float, h: float, label: str, icon: str,
                   on: bool) -> None:
    s.rect(x, y, w, h, fill=C.danger_soft if on else C.surface_2, radius=R.md,
           outline=C.danger if on else None, outline_w=1.6 if on else 0)
    color = C.danger if on else C.muted
    icon_w = s.tw(label, "caption") + 30
    right = x + (w + icon_w) / 2
    s.i.draw_icon(right - 8, y + h / 2, icon, 17, color)
    s.text(right - 22, y + h / 2 - 8, label, "caption", C.danger if on else C.text_2,
           align="right", max_width=w - 26)


def _dim(s: Screen, tab: int = 1, alpha: int = 150) -> None:
    """Chrome, then one scrim, then a white status bar.

    The three dialog plates used to stack two scrims (190 + 150) over a chrome drawn in between,
    which left the clock as dark text on a near-black map. One pass dims the page; the status bar
    is re-drawn on top because a phone never hides the time.
    """
    # the clock is drawn once, after the scrim: drawing it twice left the dark copy under the
    # dim and made the status bar a double print in every audit of these plates
    chrome(s, tab=tab, status=False)
    scrim(s, alpha)
    s.status_bar(ui.MOMENT or "۹:۴۱", color="#FFFFFF")


def _arc(s: Screen, cx: float, cy: float, r_in: float, r_out: float, a0: float, a1: float,
         color: str) -> None:
    """A filled annular sector with round caps — a progress ring that reads as one gesture."""
    steps = max(10, int(abs(a1 - a0) / math.radians(3)))
    outer = [(cx + math.cos(a0 + (a1 - a0) * i / steps) * r_out,
              cy + math.sin(a0 + (a1 - a0) * i / steps) * r_out) for i in range(steps + 1)]
    inner = [(cx + math.cos(a0 + (a1 - a0) * i / steps) * r_in,
              cy + math.sin(a0 + (a1 - a0) * i / steps) * r_in) for i in range(steps, -1, -1)]
    s.polygon(outer + inner, fill=color)
    for angle in (a0, a1):
        s.circle(cx + math.cos(angle) * (r_in + r_out) / 2,
                 cy + math.sin(angle) * (r_in + r_out) / 2, (r_out - r_in) / 2, fill=color)


def hold_button(s: Screen, cx: float, cy: float, r: float = 46, progress: float = 0.64):
    """Press-and-hold control: a red disc inside a solid progress ring.

    A tap that is released early simply does nothing, which is why the destructive action is a hold
    and not a button: the emergency is one gesture away, but not one pocket-dial away. The ring is a
    continuous arc: forty-four separate dots read as a decorative pattern, not as how far you are.
    """
    s.shadow(cx - r, cy - r + 6, r * 2, r * 2, radius=r, blur=20, dy=8, color=C.danger, alpha=90)
    r_in, r_out = r + 6, r + 13
    s.circle(cx, cy, (r_in + r_out) / 2, fill=None, outline=C.danger_soft,
             outline_w=r_out - r_in)
    _arc(s, cx, cy, r_in, r_out, -math.pi / 2, -math.pi / 2 + 2 * math.pi * progress, C.danger)
    s.circle(cx, cy, r, fill=C.danger, outline="#FFFFFF", outline_w=3)
    if r < 38:
        # a small instance is an icon, not a squeezed sentence
        s.i.draw_icon(cx, cy, "mdi-alarm-light", 22, "#FFFFFF")
    else:
        s.i.draw_icon(cx, cy - 18, "mdi-alarm-light", 26, "#FFFFFF")
        s.text(cx, cy + 6, "نگه دارید", "label", "#FFFFFF", align="center")


def rail_sheet(s: Screen, top: float, title: str, subtitle: str, icon: str, stage: int,
               timestamps=None, tone_icon: str = "danger") -> float:
    """Sheet + header + the SOS track, the shape every post-submission plate starts with."""
    sheet(s, top)
    y = sheet_header(s, top + 20, title, subtitle, icon=icon, tone=tone_icon, title_style="title")
    return sos_rail(s, 16, y, 361, stage, timestamps=timestamps) + 12


def _photo_thumb(s: Screen, x: float, y: float, w: float, h: float, radius: float = 12) -> None:
    """A stand-in for the attached photo.

    A fire icon in a pale tile reads as a button, not as a picture: the requester is checking
    *what* they attached, so the row needs something that looks like a frame — dark room, smoke
    under the ceiling, flame along the sill.
    """
    with s.clip_rounded(x, y, w, h, radius):
        # a dark room, not a landscape: ceiling, a lit doorway, smoke and glow at the sill
        s.rect(x, y, w, h, fill="#4A4E56")
        s.rect(x, y + h * 0.46, w, h * 0.54, fill="#3E424A")
        s.rect(x + w * 0.58, y + h * 0.26, w * 0.28, h * 0.42, fill="#D8C8A2", radius=2)
        s.rect(x + w * 0.58, y + h * 0.26, w * 0.28, h * 0.12, fill="#B9A883", radius=2)
        for cx, cy, r in ((0.16, 0.12, 0.17), (0.38, 0.07, 0.19), (0.66, 0.10, 0.16),
                          (0.88, 0.16, 0.13)):
            s.circle(x + w * cx, y + h * cy, w * r, fill="#7E838B")
        # glow: wide and low, so it reads as firelight rather than as peaks
        s.rect(x, y + h * 0.78, w, h * 0.22, fill="#8C3B27")
        s.rect(x, y + h * 0.86, w, h * 0.14, fill="#C4622C")
        s.rect(x + w * 0.10, y + h * 0.93, w * 0.80, h * 0.07, fill="#EE9A3C")
        # two tongues of flame, tallest at the left
        s.polygon([(x + w * 0.16, y + h), (x + w * 0.26, y + h * 0.60),
                   (x + w * 0.36, y + h)], fill="#E2702F")
        s.polygon([(x + w * 0.24, y + h), (x + w * 0.30, y + h * 0.76),
                   (x + w * 0.36, y + h)], fill="#F5B65A")
        s.polygon([(x + w * 0.52, y + h), (x + w * 0.59, y + h * 0.72),
                   (x + w * 0.66, y + h)], fill="#E2702F")


def status_card(s: Screen, y: float, title: str, note: str, icon: str,
                tone: str = "danger") -> float:
    """The state of the request in the requester's own words: no name the API does not send."""
    fill = {"danger": C.danger_soft, "primary": C.primary_soft, "success": C.success_soft,
            "warning": C.warning_soft}[tone]
    ink = {"danger": C.danger, "primary": C.primary, "success": C.success,
           "warning": C.warning}[tone]
    s.rect(16, y, 361, 76, fill=fill, radius=16)
    s.i.draw_icon(357 - 24, y + 24, icon, 20, ink)
    s.text(357 - 48, y + 12, title, "label-lg", ink, align="right", max_width=290)
    # `para` anchors at the block's left edge and right-aligns inside it (x .. x+max_width)
    s.text(357 - 48, y + 40, note, "caption", C.text_2, align="right", max_width=292)
    return y + 88


def requester_facts(s: Screen, y: float, pairs: list[tuple[str, str]]) -> float:
    """The stamps `GET /_user/sos/requests/:id` returns for the stages already reached.

    Everything else about the rescuer — name, vehicle, phone, live position, ETA — is not in any
    requester-facing payload (`sosRequestRecordSchema` carries the requester's own fields only,
    and mission coordinates are readable by the *assigned rescuer*), so the plate must not print
    it. What it can print is this request's own clock.
    """
    metric_tiles(s, 16, y, 361, [(label, value, "mdi-clock-outline") for label, value in pairs],
                 h=62)
    return y + 74


def confidentiality_note(s: Screen, y: float) -> float:
    """Why there is no «تماس با امدادگر» and no rescuer's live position on this side of the app.

    A caption, not a card: it is an explanation attached to the fields above it, and a third
    grey box on a sheet of grey boxes reads as one more thing to act on.
    """
    s.i.draw_icon(357 - 9, y + 8, "mdi-shield-account-outline", 14, C.muted_2)
    s.text(357 - 28, y, "مشخصات و موقعیت امدادگر فقط در اختیار مرکز امداد است.", "caption",
           C.muted_2, align="right", max_width=300)
    return y + 26


# --------------------------------------------------------------------------- #
# 01 — entry: where the flow starts
# --------------------------------------------------------------------------- #
def sos_entry() -> Screen:
    """Where the flow starts: the button, the gesture, and what the next three taps buy.

    The plate used to sell «دو مرحله» — hold, then confirm — while the form itself has four
    steps and the request has five. It also printed three cause chips («آتش و دود»، «خطر جانی»،
    «مصدومیت») that were neither tappable nor the incident types the server serves, and a
    «همیشه اینجا» tag that named the button's position but not its gesture. Here the annotation
    hangs off the dock itself and says the one thing that cannot be guessed: hold it.
    """
    cam = sc.camera(sc.SOS_POINT[0] + 60, sc.SOS_POINT[1] - 110, 0.19)
    dock = ui.sos_dock_box(372)
    # the annotation is painted over the map, so its footprint is reserved with the dock's
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 126), box(0, 452, 393, 400),
                                      box(120, 376, 196, 48), dock))
    s.top_scrim(128)
    chrome(s, tab=1)
    map_tools(s, 128, angle=22)
    user_cone(s, cam, *sc.SOS_POINT, bearing=28)

    ui.sos_dock(s, 372)

    # one annotation, attached to the control it describes by a leader line at its own centre:
    # the old pill floated in the street, said «همیشه اینجا», and pointed at nothing the finger
    # could act on — the thing that cannot be guessed here is the *gesture*, not the position
    s.line([(126, 400), (142, 400)], C.danger, 2, caps=True)
    s.circle(126, 400, 2.6, fill=C.danger)
    s.shadow(142, 384, 168, 32, radius=11, blur=12, dy=4, alpha=40)
    s.rect(142, 384, 168, 32, fill="#FFFFFF", radius=11, outline=C.outline, outline_w=1)
    s.i.draw_icon(296, 400, "mdi-gesture-tap-hold", 19, C.danger)
    s.text(284, 391, "نگه دارید تا فرم باز شود", "caption-bold", C.text, align="right")

    top = 452
    sheet(s, top, radius=28)
    s.text(377, top + 22, "امداد فوری", "title", C.text, align="right")
    s.text(377, top + 50, "دکمهٔ SOS همیشه در همین گوشه است؛ با یک ضربه کاری نمی‌کند.",
           "caption", C.muted, align="right")

    # three beats, each one a page that exists in this folder
    beats = ("دکمه را نگه دارید تا حلقه پر شود.",
             "شدت، نوع و محل را در ۴ قدم تأیید کنید.",
             "وضعیت و زمان رسیدن همین‌جا می‌آید.")
    for index, text in enumerate(beats):
        y = top + 84 + index * 34
        s.circle(357 - 12, y + 9, 11, fill=C.danger_soft)
        s.text(357 - 12, y + 1, fa_digits(index + 1), "caption-bold", C.danger, align="center")
        s.text(357 - 32, y, text, "caption", C.text_2, align="right", max_width=300)

    # the hotline is a real action, not a divider: it sits in its own card with its own chip
    s.rect(16, top + 186, 361, 56, fill=C.warning_soft, radius=14)
    s.i.draw_icon(357 - 20, top + 203, "mdi-phone-alert-outline", 17, C.warning)
    s.text(357 - 42, top + 194, "خطر جانی؟ منتظر فرم نمانید.", "label", C.text_2,
           align="right")
    s.text(357 - 42, top + 214, "با ۱۲۵ تماس بگیرید و دکمه را هم نگه دارید.", "caption",
           C.muted, align="right", max_width=250)
    s.chip(30, top + 201, "۱۲۵", "mdi-phone", "warning", h=26)

    s.button(16, top + 258, 361, 48, "متوجه شدم", variant="filled", shadow=True)
    s.text(196.5, top + 320, "مسیر کامل در تصویرهای ۰۲ تا ۱۲ · سوابق در «تاریخچه»",
           "caption", C.muted_2, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 02 — hold to open
# --------------------------------------------------------------------------- #
def sos_hold() -> Screen:
    """The gesture, on the screen where it happens.

    The plate used to dim the map and open a dialog holding a *second, larger* copy of the SOS
    button — the same mistake the entry plate made with its floating tag: a control that moves
    under the finger teaches a position that does not exist. The hold is drawn on the dock the
    rest of the flow uses, filling along the pill's own outline, with the sheet it opens named
    underneath.

    It also promised «موقعیت شما همین حالا برای مرکز امداد ارسال می‌شود». Nothing is sent until the
    form is confirmed and the send button is pressed; a plate may not say otherwise.
    """
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.24)
    dock = ui.sos_dock_box(372)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 126), box(0, 596, 393, 256),
                                      box(0, 236, 393, 76), box(8, 360, 120, 84)),
                 pois=False)
    s.top_scrim(128)
    chrome(s, tab=1)
    map_tools(s, 128, angle=22)
    user_cone(s, cam, *sc.SOS_POINT, bearing=28)

    # what the hold is for, under the tools and above the control it describes
    s.shadow(16, 236, 361, 76, radius=18, blur=16, dy=6, alpha=44)
    s.rect(16, 236, 361, 76, fill="#FFFFFF", radius=18)
    s.text(357 - 16, 248, "برای باز شدن فرم، نگه دارید", "label-lg", C.text, align="right")
    s.text(357 - 16, 274, "حلقه که پر شود فرم باز می‌شود؛ هر وقت انگشت را", "caption",
           C.muted, align="right", max_width=330)
    s.text(357 - 16, 292, "بردارید، هیچ چیزی ارسال نمی‌شود.", "caption", C.muted, align="right")

    # the progress travels along the pill's own outline, 5 px outside the white rim: drawn on the
    # pill's edge it was half-buried under the button and read as a red hook
    track = dict(x=16 - 5, y=372 - 5, w=ui.SOS_W + 10, h=ui.SOS_H + 10)
    s.line(ui.pill_perimeter(**track, progress=1.0), C.danger_soft, 5)
    s.line(ui.pill_perimeter(**track, progress=0.62), C.danger, 5)
    ui.sos_dock(s, 372)

    # two answers, at the thumb, with a plate behind them so no street name cuts through
    s.rect(16, 448, 168, 26, fill="#FFFFFF", radius=9, outline=C.outline, outline_w=1)
    s.text(100, 453, "دست نگه دارید…", "caption-bold", C.danger, align="center")
    s.rect(16, 480, 168, 26, fill="#FFFFFF", radius=9, outline=C.outline, outline_w=1)
    s.text(100, 485, "لغو: انگشت را بردارید", "caption", C.muted, align="center")

    top = 596
    sheet(s, top, radius=28)
    s.text(377, top + 20, "چه چیزی ارسال می‌شود؟", "title-sm", C.text, align="right")
    s.text(377, top + 46, "پس از باز شدن فرم، این‌ها را می‌بینید و تأیید می‌کنید:", "caption",
           C.muted, align="right")

    rows = [("موقعیت محل حادثه", "از GPS یا با انتخاب روی نقشه", "mdi-crosshairs-gps"),
            ("شدت، نوع حادثه و شرح", "شرح ۱۰ تا ۵۰۰ نویسه", "mdi-shape-outline"),
            ("عکس صحنه", "اختیاری · ارسال را متوقف نمی‌کند", "mdi-camera-outline"),
            ("شناسهٔ پیگیری", "برای دیدن وضعیت و لغو", "mdi-pound-box-outline")]
    for index, (label, note, icon) in enumerate(rows):
        y = top + 70 + index * 41
        s.i.draw_icon(357 - 22, y + 20, icon, 18, C.muted_2)
        s.text(357 - 46, y + 6, label, "label", C.text, align="right")
        s.text(357 - 46, y + 26, note, "caption", C.muted, align="right")
        if index < len(rows) - 1:
            s.rect(16, y + 41, 361, 1, fill=C.outline)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 03 — compose: severity, type, description
# --------------------------------------------------------------------------- #
def sos_compose() -> Screen:
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.26)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 214, 393, 638)), pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)

    top = 206
    sheet(s, top)
    y = sheet_header(s, top + 20, "درخواست امداد فوری", "پیش‌نویس · هنوز ارسال نشده",
                     icon="mdi-alarm-light", tone="danger", title_style="title")
    y = form_step(s, 16, y, 361, 1, "شرح حادثه") + 10

    y = section_label(s, y, "شدت حادثه", "بر اساس خطری که شما را تهدید می‌کند")
    # no severity is pre-selected: `severity` is a required choice and the plate's own error
    # list says «شدت حادثه انتخاب نشده است», so the demo state must show exactly that
    y = severity_cards(s, y, None) + 14
    y = section_label(s, y, "نوع حادثه")
    y = incident_tiles(s, y, "آتش‌سوزی") + 14
    y = section_label(s, y, "شرح وضعیت", count_chars(sc.SOS_DESCRIPTION, 500))
    s.rect(16, y, 361, 84, fill=C.surface_2, radius=14, outline=C.outline, outline_w=1)
    s.para(28, y + 8, sc.SOS_DESCRIPTION, "caption", C.text_2, align="right", max_width=330)
    y += 92

    # the requester's first question is "will they find me?" — answer it before the CTA
    s.i.draw_icon(357 - 10, y + 9, "mdi-crosshairs-gps", 15, C.primary)
    s.text(357 - 30, y + 1, "موقعیت شما خودکار ثبت می‌شود؛", "caption", C.text_2, align="right")
    s.text(357 - 30, y + 18, "در قدم بعد روی نقشه اصلاحش کنید.", "caption", C.muted,
           align="right")
    y += 40

    # the header's × already leaves the form; a second, quieter exit next to the CTA only made
    # the forward action look optional
    # red is the request itself; moving between form screens is the ordinary primary action
    s.button(16, y, 361, 50, "ادامه", icon="mdi-arrow-left", variant="filled", shadow=True)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 04 — location: the map-page map, used as the picker
# --------------------------------------------------------------------------- #
def sos_location() -> Screen:
    # frame both the GPS fix and the hand-placed pin, so the dashed offset is a real distance
    cam = fit_camera([sc.to_world(*sc.SOS_POINT), sc.to_world(*sc.SOS_MANUAL)],
                     (40, 210, 353, 570), padding=0.66, max_ppu=0.5)
    # the two legend cards sit at y=200 over the map and the distance pill hangs at the middle
    # of the offset line; the camera is known before anything is drawn, so both are reserved
    # exactly instead of guessed — a street name half-hidden behind a pill reads as a defect
    probe = Screen()
    _gx, _gy = cam.project_grid(*sc.SOS_POINT, probe)
    _px, _py = cam.project_grid(*sc.SOS_MANUAL, probe)
    _mid = ((_px + _gx) / 2, (_py + _gy) / 2)
    _tw = probe.tw(f"{fa_digits(sc.SOS_MANUAL_OFFSET_M)} متر از GPS", "caption-bold") + 24
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 200), box(0, 590, 393, 262),
                                      box(12, 198, 369, 38),
                                      box(_mid[0] - _tw / 2, _mid[1] - 14, _tw, 28)))
    s.status_bar(sc.SOS_CLOCKS["s-04-location"])
    s.top_scrim(200, start=0)

    # a floating header instead of the section control: a full-screen choice, not a tab
    s.shadow(16, 112, 361, 66, radius=18, blur=16, dy=6, alpha=40)
    s.rect(16, 112, 361, 66, fill="#FFFFFF", radius=18)
    s.icon_button(26, 123, 44, "mdi-close", 19, C.text_2, fill=C.surface_2, outline=None,
                  shadow=False, radius=13)
    s.text(357 - 12, 120, "محل حادثه را تعیین کنید", "title-sm", C.text, align="right")
    s.text(357 - 12, 145, "روی نقشه ضربه بزنید یا نشانگر را جابه‌جا کنید", "caption", C.muted,
           align="right")

    # accuracy halo of the raw GPS fix, then the pin the user placed
    gx, gy = cam.project_grid(*sc.SOS_POINT)
    px, py = cam.project_grid(*sc.SOS_MANUAL)
    with s.alpha_layer():
        s.circle(gx, gy, 26, fill=(29, 111, 184, 52))
    s.circle(gx, gy, 5, fill=C.origin, outline="#FFFFFF", outline_w=1.6)
    with s.alpha_layer():
        s.circle(px, py, 40, fill=(175, 52, 56, 26))
    destination_pin(s, cam, *sc.SOS_MANUAL, None, color=C.incident, icon="map-marker",
                    pulse=True)

    # the offset from the GPS fix, stated at its true length
    s.line([(px, py), (gx, gy)], "#FFFFFF", 4.4)
    s.line([(px, py), (gx, gy)], C.danger, 2.2)
    mid = ((px + gx) / 2, (py + gy) / 2)
    label = f"{fa_digits(sc.SOS_MANUAL_OFFSET_M)} متر از GPS"
    tw = s.tw(label, "caption-bold") + 18
    s.rect(mid[0] - tw / 2, mid[1] - 11, tw, 22, fill="#FFFFFF", radius=8, outline=C.outline,
           outline_w=1)
    s.text(mid[0], mid[1] - 8, label, "caption-bold", C.danger, align="center")

    # legend so neither dot is a guess
    s.shadow(16, 200, 174, 34, radius=12, blur=10, dy=3, alpha=30)
    s.rect(16, 200, 174, 34, fill="#FFFFFF", radius=12)
    s.circle(30, 217, 5, fill=C.origin)
    s.text(172, 208, "موقعیت GPS شما", "caption", C.text_2, align="right")
    s.shadow(203, 200, 174, 34, radius=12, blur=10, dy=3, alpha=30)
    s.rect(203, 200, 174, 34, fill="#FFFFFF", radius=12)
    s.circle(217, 217, 5, fill=C.incident)
    s.text(359, 208, "نقطهٔ انتخابی شما", "caption", C.text_2, align="right")

    # bottom card: what the pin means, then one confirm
    top = 582
    sheet(s, top, radius=26)
    s.text(357, top + 20, "مرحلهٔ ۲ از ۴ · محل حادثه", "caption-bold", C.muted, align="right")
    s.text(357, top + 40, sc.SOS_ADDRESS, "label", C.text, align="right", max_width=336)
    s.chip(24, top + 68, "دستی روی نقشه", "mdi-gesture-tap", "warning", h=24)
    s.chip(24, top + 98, f"دقت GPS: حدود {fa_digits(sc.SOS_ACCURACY)} متر",
           "mdi-crosshairs-gps", "info", h=24)
    s.button(16, top + 134, 361, 50, "تأیید این نقطه", icon="mdi-check", variant="filled",
             shadow=True)
    s.button(16, top + 190, 361, 44, "برگشت به موقعیت فعلی من", icon="mdi-crosshairs-gps",
             variant="outline")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 05 — photo (optional, never blocking)
# --------------------------------------------------------------------------- #
def sos_photo() -> Screen:
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.26)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 300, 393, 552)), pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)

    top = 292
    sheet(s, top)
    y = sheet_header(s, top + 20, "عکس صحنه", "اختیاری · ارسال درخواست را متوقف نمی‌کند",
                     icon="mdi-camera-outline", tone="primary", title_style="title")
    y = form_step(s, 16, y, 361, 3, "عکس صحنه") + 14

    # source tiles
    for index, (label, icon, hint) in enumerate([("دوربین", "mdi-camera", "همین حالا ثبت کن"),
                                                 ("گالری", "mdi-image", "از گوشی انتخاب کن")]):
        x = 16 + index * 184.5
        s.rect(x, y, 176.5, 84, fill=C.surface_2, radius=16, outline=C.outline, outline_w=1)
        s.i.draw_icon(x + 176.5 / 2, y + 26, icon, 24, C.primary)
        s.text(x + 176.5 / 2, y + 44, label, "label", C.text, align="center")
        s.text(x + 176.5 / 2, y + 63, hint, "caption", C.muted_2, align="center")
    y += 96

    # one attached photo, rendered as the thumbnail the client shows after choosing a file
    s.rect(16, y, 361, 92, fill=C.surface_2, radius=16, outline=C.outline, outline_w=1)
    _photo_thumb(s, 28, y + 10, 88, 72, radius=12)
    s.text(357 - 14, y + 12, "IMG_2041.jpg", "label", C.text, align="right")
    s.text(357 - 14, y + 34, "۲٫۱ مگابایت", "caption", C.muted, align="right")
    s.ltr(150, y + 34, "3024×4032", "caption", C.muted_2)
    s.chip(128, y + 56, "حذف عکس", "mdi-close", "danger", h=24)
    y += 106

    s.text(377, y, "فقط تصویر — تا ۵ مگابایت", "caption", C.muted_2, align="right")
    s.ltr(46, y, "JPEG · PNG · WebP", "caption", C.muted_2)
    y += 26
    s.button(16, y, 361, 50, "ادامه به بازبینی", icon="mdi-arrow-left", variant="filled",
             shadow=True)
    y += 58
    s.text(196.5, y, "ادامه بدون عکس", "caption-bold", C.primary, align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 06 — review: the last screen before the request exists
# --------------------------------------------------------------------------- #
def sos_review() -> Screen:
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.26)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 196, 393, 656)), pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)

    top = 188
    sheet(s, top)
    y = sheet_header(s, top + 20, "بازبینی پیش از ارسال", "پس از ارسال، درخواست قابل پیگیری است",
                     icon="mdi-clipboard-check-outline", tone="danger", title_style="title")
    y = form_step(s, 16, y, 361, 4, "بازبینی") + 12

    rows = [("نوع حادثه", "آتش‌سوزی", "mdi-fire"),
            ("شدت", "شدید · خطر جانی", "mdi-alert-outline"),
            ("موقعیت", "خیابان شریعتی، بازار قدیم، پلاک ۱۴", "mdi-map-marker-outline")]
    for label, value, icon in rows:
        y = field(s, 16, y, 361, 52, label, value, icon=icon) + 8
    # the photo row shows the frame itself: a filename cannot be checked at a glance
    y = field(s, 16, y, 361, 66, "تصویر", "IMG_2041.jpg", thumb=True,
              note="۲٫۱ مگابایت · پیوست شده") + 8
    s.text(357 - 12, y - 4, "شرح", "caption", C.muted, align="right")
    s.rect(16, y + 18, 361, 62, fill=C.surface_2, radius=14, outline=C.outline, outline_w=1)
    s.para(28, y + 24, sc.SOS_DESCRIPTION, "caption", C.text_2, align="right", max_width=330)
    y += 92

    # readiness is a promise, not decoration: the server refuses a short description
    s.rect(16, y, 361, 52, fill=C.success_soft, radius=14)
    s.i.draw_icon(357 - 20, y + 17, "mdi-check-circle-outline", 17, C.success)
    s.text(357 - 42, y + 8, "همهٔ موارد لازم کامل است", "label", C.success, align="right")
    s.text(357 - 42, y + 28, "شرح بیش از ۱۰ نویسه است و موقعیت ثبت شده.", "caption", C.muted,
           align="right")
    y += 64

    s.button(16, y, 361, 52, "ارسال درخواست امداد فوری", icon="mdi-send-circle-outline",
             variant="filled", color=C.danger, shadow=True)
    y += 60
    s.button(16, y, 361, 44, "بازگشت و ویرایش", variant="outline")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 07 — sending
# --------------------------------------------------------------------------- #
def sos_sending() -> Screen:
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.3)
    s = map_view(cam, pois=False)
    _dim(s, tab=1)

    top = 258
    s.shadow(16, top, 361, 328, radius=28, blur=26, dy=10, alpha=70)
    s.rect(16, top, 361, 328, fill="#FFFFFF", radius=28)
    s.spinner(196.5, top + 58, 26, C.danger, 3.4)
    s.text(196.5, top + 100, "در حال ارسال به مرکز امداد", "title", C.text, align="center")
    s.text(196.5, top + 128, "این پنجره را نبندید؛ چند ثانیه بیشتر طول نمی‌کشد.", "caption",
           C.muted, align="center", max_width=300)

    steps = [("ثبت درخواست", "done", sc.SOS_TIMES["submitted"]),
             ("ارسال تصویر صحنه", "busy", None),
             ("اطلاع به امدادگران نزدیک", "wait", None)]
    for index, (label, state, when) in enumerate(steps):
        y = top + 168 + index * 40
        if state == "done":
            s.circle(357 - 18, y + 12, 10, fill=C.success)
            s.i.draw_icon(357 - 18, y + 12, "mdi-check", 12, "#FFFFFF")
        elif state == "busy":
            s.spinner(357 - 18, y + 12, 9, C.danger, 2)
        else:
            s.circle(357 - 18, y + 12, 9.5, fill="#FFFFFF", outline=C.outline_strong, outline_w=1.6)
        s.text(357 - 38, y + 4, label, "label", C.text if state != "wait" else C.muted,
               align="right")
        if when:
            s.text(30, y + 4, when, "caption", C.muted_2, align="left")
        if index < len(steps) - 1:
            s.divider(30, y + 32, 363)

    s.rect(32, top + 282, 329, 32, fill=C.surface_2, radius=10)
    s.i.draw_icon(345, top + 298, "mdi-information-outline", 14, C.muted)
    s.text(327, top + 289, "تا پایان ارسال، درخواست در سوابق «در حال ثبت» است.", "caption",
           C.muted, align="right", max_width=280)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 08 — pending: registered, nobody assigned yet
# --------------------------------------------------------------------------- #
def sos_pending() -> Screen:
    # aim_at, not a centred camera: at 852/2 the pin lands under the sheet
    cam = sc.camera(*sc.SOS_POINT, 0.3).aim_at(*sc.SOS_POINT, 196, 196)
    # the alarm pin and its «شما» pill are drawn on top of the map; reserving their footprint
    # keeps «خیابان ۱۲ فروردین» from printing across the pin's head
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 300, 393, 552),
                                      box(158, 148, 76, 88)), pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)
    destination_pin(s, cam, *sc.SOS_POINT, "شما", color=C.incident, icon="alarm-light",
                    pulse=True)

    top = 292
    y = rail_sheet(s, top, "درخواست شما ثبت شد", f"پیگیری {fa_digits(sc.SOS_ID)} · "
                    f"{sc.SOS_TIMES['submitted']}", "mdi-clock-outline", 0,
                    timestamps=sc.SOS_STAGE_TIMES)

    # what the system is doing right now. A determinate bar here promised a progress nobody knows;
    # the request is waiting for an answer, which is exactly what the spinner says.
    s.rect(16, y, 361, 88, fill=C.danger_soft, radius=16)
    s.spinner(357 - 30, y + 32, 16, C.danger, 2.4)
    s.text(357 - 58, y + 14, "در حال یافتن امدادگر آماده", "label-lg", C.danger, align="right")
    s.text(357 - 58, y + 38, "به امدادگران آموزش‌دیده تا شعاع ۵ کیلومتر اطلاع شد.",
           "caption", C.muted, align="right", max_width=260)
    s.text(357 - 58, y + 58, "به‌محض پذیرش، وضعیت و زمان رسیدن همین‌جا می‌آید.", "caption",
           C.muted, align="right", max_width=260)
    y += 100

    s.text(377, y, "تا رسیدن امدادگر چه کنم؟", "caption-bold", C.muted, align="right")
    y += 22
    for icon, text in [("mdi-phone", "گوشی را در دسترس نگه دارید؛ ممکن است تماس بگیریم."),
                       ("mdi-map-marker-check", "اگر جای خود را ترک کردید، موقعیت را دوباره بفرستید."),
                       ("mdi-phone-alert-outline", "اگر وضعیت بدتر شد، با ۱۲۵ تماس بگیرید.")]:
        s.rect(16, y, 361, 46, fill=C.surface_2, radius=14)
        s.i.draw_icon(357 - 20, y + 23, icon, 17, C.text_2)
        s.text(357 - 42, y + 14, text, "caption", C.text_2, align="right", max_width=300)
        y += 52
    y += 4
    s.button(16, y, 176, 46, "لغو درخواست", icon="mdi-close", variant="outline",
             color=C.danger)
    s.button(201, y, 176, 46, "پیگیری در سوابق", icon="mdi-history", variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 09 — dispatched: a rescuer has been chosen
# --------------------------------------------------------------------------- #
def sos_dispatched() -> Screen:
    """`dispatched`: the centre picked a rescuer; the rescuer has not accepted yet.

    There is nobody to name, call or follow yet — `GET /_user/sos/requests/:id` returns the
    request's own fields (status, place, timestamps) and nothing about the rescuer, and mission
    coordinates are readable by the *assigned rescuer*, not the requester. So this plate shows the
    two stamps that exist and says what the requester is waiting for.
    """
    cam = sc.camera(*sc.SOS_POINT, 0.3).aim_at(*sc.SOS_POINT, 196, 196)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 358, 393, 494),
                                      box(158, 1, 76, -1), box(150, 150, 92, 96)),
                 pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)
    destination_pin(s, cam, *sc.SOS_POINT, "محل حادثه", color=C.incident, icon="alarm-light",
                    pulse=True)

    top = 358
    y = rail_sheet(s, top, "امدادگر تعیین شد", f"پیگیری {fa_digits(sc.SOS_ID)} · "
                    f"اعزام {sc.SOS_TIMES['dispatched']}", "mdi-account-check-outline", 1,
                    timestamps=sc.SOS_STAGE_TIMES)
    y = status_card(s, y, "در انتظار پذیرش امدادگر",
                    "امدادگر برگزیده شده؛ پذیرش او هنوز ثبت نشده.", "mdi-timer-sand",
                    "warning")
    y = requester_facts(s, y, [("ثبت", sc.SOS_TIMES["submitted"]),
                               ("اعزام", sc.SOS_TIMES["dispatched"])])
    y = confidentiality_note(s, y)
    y += 4
    s.rect(16, y, 361, 44, fill=C.surface_2, radius=14)
    s.i.draw_icon(357 - 20, y + 22, "mdi-phone-in-talk-outline", 16, C.text_2)
    s.text(357 - 42, y + 13, "گوشی را در دسترس نگه دارید؛ مرکز امداد ممکن است زنگ بزند.",
           "caption", C.text_2, align="right", max_width=300)
    y += 56
    s.button(16, y, 361, 46, "لغو درخواست", icon="mdi-close", variant="outline", color=C.danger)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 10 — accepted: the rescuer took it and is moving
# --------------------------------------------------------------------------- #
def sos_accepted() -> Screen:
    """`accepted`: a rescuer took the request. The requester still sees only their own request.

    No name, no vehicle, no phone number and no live truck on the map: `sosRequestRecordSchema`
    carries the requester's fields, and mission coordinates are readable by the *assigned rescuer*
    (`missionNavigationTargetSchema`). Naming «زهرا احمدی», drawing her truck and offering a
    «تماس» button invented a payload the requester's client cannot fetch. The plate keeps what is
    true: the status, the two stamps, and what the requester should do now.
    """
    cam = sc.camera(*sc.SOS_POINT, 0.34).aim_at(*sc.SOS_POINT, 196, 200)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 300, 393, 552),
                                      box(148, 146, 96, 96)), pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)
    destination_pin(s, cam, *sc.SOS_POINT, "محل حادثه", color=C.incident, icon="alarm-light",
                    pulse=True)

    top = 296
    y = rail_sheet(s, top, "امدادگر در راه شماست", f"پذیرش {sc.SOS_TIMES['accepted']} · "
                    f"پیگیری {fa_digits(sc.SOS_ID)}", "mdi-account-check-outline", 2,
                    timestamps=sc.SOS_STAGE_TIMES)
    y = status_card(s, y, "امدادگری درخواست شما را پذیرفت",
                    "او در راه است؛ زمان رسیدن را مرکز امداد اعلام می‌کند.", "mdi-check",
                    "primary")
    y = requester_facts(s, y, [("ثبت", sc.SOS_TIMES["submitted"]),
                               ("پذیرش", sc.SOS_TIMES["accepted"])])
    y = confidentiality_note(s, y)
    y += 4

    # two things that help, drawn as the same row shape the pending plate uses
    for icon, text in [("mdi-phone-in-talk-outline",
                        "گوشی در دسترس بمانید؛ ممکن است برای هماهنگی تماس بگیریم."),
                       ("mdi-map-marker-check", "اگر محل را ترک کردید، موقعیت را دوباره بفرستید.")]:
        s.rect(16, y, 361, 44, fill=C.surface_2, radius=14)
        s.i.draw_icon(357 - 20, y + 22, icon, 16, C.text_2)
        s.text(357 - 42, y + 13, text, "caption", C.text_2, align="right", max_width=316)
        y += 50

    y += 4
    s.button(16, y, 361, 46, "لغو درخواست", icon="mdi-close", variant="outline", color=C.danger)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 11 — arrived / in progress
# --------------------------------------------------------------------------- #
def sos_arrived() -> Screen:
    """`accepted` after arrival: the rescue has started at the place the requester gave.

    The rescuer is not drawn as a marker either — the requester's map has one point on it, the
    incident. What changed is the stage, the stamp, and what the requester can now usefully do.
    """
    cam = sc.camera(*sc.SOS_POINT, 0.46).aim_at(*sc.SOS_POINT, 210, 202)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 296, 393, 556)),
                 pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)
    destination_pin(s, cam, *sc.SOS_POINT, "محل حادثه", color=C.incident, icon="alarm-light")
    # the check belongs to the *place*: help is here, at this pin
    px, py = cam.project_grid(*sc.SOS_POINT)
    s.arc_badge(px + 13, py - 30, C.success, "mdi-check-bold", 11)

    top = 288
    y = rail_sheet(s, top, "امدادگر رسید", f"رسیدن {sc.SOS_TIMES['arrived']} · رسیدگی آغاز شد",
                   "mdi-map-marker-check", 3, timestamps=sc.SOS_STAGE_TIMES)
    y = status_card(s, y, "امدادگر در محل حادثه است",
                    "رسیدگی آغاز شده؛ تا پایان کار در دسترس بمانید.", "mdi-account-hard-hat",
                    "success")

    # two things that actually change the outcome, instead of four generic reminders
    for icon, text in [("mdi-account-multiple-outline", "به امدادگر بگویید چند نفر داخل هستند."),
                       ("mdi-map-marker-radius-outline", "همسایه‌ها را از محل دور نگه دارید.")]:
        s.rect(16, y, 361, 44, fill=C.surface_2, radius=12)
        s.i.draw_icon(357 - 20, y + 22, icon, 16, C.text_2)
        s.text(357 - 42, y + 13, text, "caption", C.text_2, align="right", max_width=316)
        y += 50

    y = requester_facts(s, y + 4, [("ثبت", sc.SOS_TIMES["submitted"]),
                                   ("رسیدن", sc.SOS_TIMES["arrived"])])
    y = confidentiality_note(s, y)
    y += 6
    s.button(16, y, 361, 46, "لغو درخواست", icon="mdi-close", variant="outline", color=C.danger)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 12 — completed
# --------------------------------------------------------------------------- #
def sos_completed() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=1)

    # a small reminder of the place, so the closing plate still belongs to the map
    preview = Screen(background=C.map_land, width=393, height=252)
    from bb.map import Camera, draw_base, draw_labels, to_world
    cam_h = Camera(to_world(*sc.SOS_POINT), 0.16)
    draw_base(preview, cam_h)
    draw_labels(preview, cam_h)
    preview.i.draw_icon(*cam_h.project_grid(*sc.SOS_POINT, preview), "alarm-light", 20, C.incident)
    s.img.paste(preview.img, (0, 108 * s.s))
    s.gradient(0, 108, 393, 84, "#F1F5F4", 250, 0)

    s.shadow(16, 120, 361, 128, radius=24, blur=20, dy=6, alpha=28)
    s.rect(16, 120, 361, 128, fill="#FFFFFF", radius=24)
    s.circle(196.5, 152, 25, fill=C.success_soft)
    s.i.draw_icon(196.5, 152, "mdi-check-bold", 25, C.success)
    s.text(196.5, 178, "درخواست شما با موفقیت بسته شد", "title", C.text, align="center")
    s.text(196.5, 206, "امدادگر گزارش پایانی را ثبت کرد", "caption", C.muted, align="center")
    s.text(196.5, 226, f"{sc.SOS_TIMES['submitted']} تا {sc.SOS_TIMES['completed']} · "
           f"{fa_digits(36)} دقیقه", "caption-bold", C.muted_2, align="center")

    y = 260
    s.rect(16, y, 361, 97, fill="#FFFFFF", radius=18, outline=C.outline, outline_w=1)
    sos_rail(s, 28, y + 8, 337, 4, timestamps=sc.SOS_STAGE_TIMES_DONE, ended="انجام شد")
    y += 109

    # three facts the record holds and the plate has not already said: type, place, id. The
    # rescuer's name is not among them — `sosRequestRecordSchema` never carries it (this plate
    # used to invent it). The window («۹:۳۶ تا ۱۰:۱۲») and its ۳۶ minutes are already the
    # header's headline and the rail's five stamps; a card row repeating them made one sentence
    # appear three times on a single screen.
    card_h = 168
    s.shadow(16, y, 361, card_h, radius=20, blur=18, dy=5, alpha=22)
    s.rect(16, y, 361, card_h, fill="#FFFFFF", radius=20)
    s.text(357 - 16, y + 14, "خلاصهٔ درخواست", "label-lg", C.text, align="right")
    rows = [("mdi-fire", "نوع حادثه", "آتش‌سوزی · شدت شدید"),
            ("mdi-map-marker-outline", "محل", "خیابان شریعتی، بازار قدیم، پلاک ۱۴"),
            ("mdi-pound-box-outline", "شناسهٔ پیگیری", fa_digits(sc.SOS_ID))]
    for index, (icon, label, value) in enumerate(rows):
        ry = y + 46 + index * 40
        s.i.draw_icon(357 - 20, ry + 9, icon, 17, C.muted)
        s.text(357 - 40, ry, label, "caption", C.muted, align="right")
        s.text(357 - 40 - 88, ry, value, "caption-bold", C.text_2, align="right",
               max_width=206)
    y += card_h + 16

    # what the requester wrote stays with the record: the same text the detail plate shows
    s.rect(16, y, 361, 112, fill=C.surface_2, radius=18)
    s.text(357 - 16, y + 12, "شرح شما", "caption-bold", C.muted, align="right")
    s.para(28, y + 36, sc.SOS_DESCRIPTION, "caption", C.text_2, align="right", max_width=330)
    y += 128

    # actions sit at the bottom of the plate, where a closing screen's actions belong
    s.button(16, 700, 361, 52, "بازگشت به نقشه", icon="mdi-map-outline", variant="filled",
             shadow=True)
    s.button(16, 760, 361, 46, "سوابق درخواست‌ها", icon="mdi-history", variant="tonal")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 13 — cancel with a reason
# --------------------------------------------------------------------------- #
def sos_cancel() -> Screen:
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.24)
    s = map_view(cam, pois=False)
    _dim(s, tab=1)

    top = 186
    s.shadow(16, top, 361, 548, radius=28, blur=26, dy=10, alpha=70)
    s.rect(16, top, 361, 548, fill="#FFFFFF", radius=28)
    s.circle(357 - 26, top + 30, 21, fill=C.danger_soft)
    s.i.draw_icon(357 - 26, top + 30, "mdi-alert-outline", 22, C.danger)
    s.text(357 - 54, top + 12, "لغو درخواست امداد", "title", C.text, align="right")
    s.text(357 - 54, top + 38, "لغو، آخرین راه‌حل است و برای مرکز ثبت می‌شود.", "caption",
           C.muted, align="right", max_width=270)

    s.text(357 - 20, top + 68, "دلیل لغو را انتخاب کنید", "caption-bold", C.muted, align="right")
    y = top + 94
    for index, reason in enumerate(sc.SOS_CANCEL_REASONS):
        on = index == len(sc.SOS_CANCEL_REASONS) - 1      # «سایر» is the one that needs text
        s.rect(16, y, 361, 40, fill=C.danger_soft if on else C.surface_2, radius=12,
               outline=C.danger if on else None, outline_w=1.4 if on else 0)
        s.circle(357 - 24, y + 20, 9.5, fill=C.danger if on else "#FFFFFF",
                 outline=None if on else C.outline_strong, outline_w=0 if on else 1.6)
        if on:
            s.i.draw_icon(357 - 24, y + 20, "mdi-check", 11, "#FFFFFF")
        s.text(357 - 42, y + 11, reason, "caption", C.text if on else C.text_2, align="right")
        y += 43

    # «سایر» is the only reason the API marks requiresCustomText. The plate used to show it
    # selected with an empty field and an enabled confirm — a state the form refuses to send.
    note = "همسایه کمک کرد و آتش خاموش شد."
    s.rect(16, y + 10, 361, 78, fill="#FFFFFF", radius=12, outline=C.outline_strong,
           outline_w=1.4)
    s.text(357 - 28, y + 18, "توضیح بدهید (۱۰ تا ۲۰۰ نویسه)", "caption-bold", C.muted,
           align="right")
    s.text(357 - 28, y + 40, note, "caption", C.text, align="right", max_width=310)
    # counted the same way every other field counts: `len()` also charges for the ZWNJ and the
    # hamze, which are spelling, so «آتش‌سوزی» read as ۸ instead of ۷
    s.text(357 - 28, y + 60, count_chars(note, 200), "caption", C.muted, align="right")

    s.rect(16, y + 98, 361, 48, fill=C.warning_soft, radius=12)
    s.i.draw_icon(357 - 18, y + 114, "mdi-information-outline", 15, C.warning)
    s.text(357 - 38, y + 102, "پس از لغو، پیشنهادهای در انتظار بسته می‌شوند", "caption-bold",
           C.warning, align="right", max_width=300)
    s.text(357 - 38, y + 121, "و مأموریت امدادگر پذیرفته‌شده پایان می‌یابد.", "caption",
           C.muted, align="right", max_width=300)

    # inset inside the dialog: at 16/201 the two buttons sat flush with the card's own edge
    s.button(32, top + 470, 153, 46, "بازگشت", variant="text", color=C.muted)
    s.button(196, top + 470, 165, 46, "تأیید لغو", icon="mdi-close-circle-outline",
             variant="filled", color=C.danger)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 14 — cancelled
# --------------------------------------------------------------------------- #
def sos_cancelled() -> Screen:
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.2)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 236, 393, 616)), pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)
    scrim(s, 60, top=232, height=620)

    top = 228
    s.shadow(0, top - 10, 393, 852 - top + 20, radius=30, blur=26, dy=-2, alpha=56)
    s.rect(0, top, 393, 852 - top + 2, fill="#FFFFFF", radius=30)
    s.rect(0, top + 30, 393, 852 - top - 30, fill="#FFFFFF")
    s.rect(170, top + 8, 53, 4.5, fill=C.outline_strong, radius=3)

    s.circle(196.5, top + 54, 26, fill=C.surface_3)
    s.i.draw_icon(196.5, top + 54, "mdi-close-circle-outline", 26, C.muted)
    s.text(196.5, top + 88, "درخواست امداد شما لغو شد", "title", C.text, align="center")
    s.text(196.5, top + 116, f"{sc.SOS_TIMES['submitted']} ثبت شد و پیش از اعزام لغو شد.",
           "caption", C.muted, align="center")
    y = sos_rail(s, 16, top + 140, 361, -1, timestamps=None, ended="لغو شد") + 14

    s.rect(16, y, 361, 92, fill=C.surface_2, radius=16)
    s.text(357 - 14, y + 10, "چه اتفاقی می‌افتد؟", "caption-bold", C.text_2, align="right")
    for index, line in enumerate(["پیشنهادهای در انتظار برای امدادگران بسته شد.",
                                  "اگر مأموریتی شروع شده بود، پایان یافت.",
                                  "درخواست با دلیل و توضیح شما در سوابق می‌ماند."]):
        s.circle(357 - 16, y + 38 + index * 20, 2.2, fill=C.muted_2)
        s.text(357 - 26, y + 30 + index * 20, line, "caption", C.muted, align="right",
               max_width=320)
    y += 106

    # the record of *why*: the same two fields the cancellation dialog collected
    s.rect(16, y, 361, 118, fill="#FFFFFF", radius=16, outline=C.outline, outline_w=1)
    s.text(357 - 14, y + 10, "دلیل لغو", "caption-bold", C.muted, align="right")
    s.text(357 - 14, y + 30, "سایر", "label", C.text, align="right")
    s.text(357 - 14, y + 56, "«همسایه کمک کرد و آتش خاموش شد.»", "caption", C.text_2,
           align="right")
    s.text(357 - 14, y + 84, f"ثبت {sc.SOS_TIMES['submitted']} · لغو {sc.SOS_TIMES['cancel']} · "
           f"{fa_digits(5)} دقیقه", "caption", C.muted_2, align="right")
    y += 134

    # the request was just withdrawn by the user: the red filled button must not invite another
    # emergency ping by reflex, so "back to the map" is primary and a new request is deliberate
    s.button(16, 700, 361, 52, "بازگشت به نقشه", icon="mdi-map-outline", variant="filled",
             shadow=True)
    s.button(16, 762, 361, 46, "ثبت درخواست جدید", icon="mdi-plus", variant="outline",
             color=C.danger)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 15 — the request exists, the photo did not
# --------------------------------------------------------------------------- #
def sos_photo_retry() -> Screen:
    cam = sc.camera(*sc.SOS_POINT, 0.26).aim_at(*sc.SOS_POINT, 196, 168)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 268, 393, 584),
                                      box(158, 116, 76, 60)), pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)
    destination_pin(s, cam, *sc.SOS_POINT, None, color=C.incident, icon="alarm-light")

    top = 260
    y = rail_sheet(s, top, "درخواست ثبت شد، عکس ارسال نشد",
                   f"پیگیری {fa_digits(sc.SOS_ID)} · {sc.SOS_TIMES['submitted']}",
                   "mdi-image-off-outline", 0, timestamps=sc.SOS_STAGE_TIMES)

    s.rect(16, y, 361, 78, fill=C.warning_soft, radius=16)
    s.i.draw_icon(357 - 20, y + 18, "mdi-alert-outline", 17, C.warning)
    s.text(357 - 42, y + 9, "ارسال تصویر کامل نشد", "label", C.warning, align="right")
    s.text(357 - 42, y + 30, "درخواست شما ثبت شده و به امدادگران رسیده است؛ فقط عکس", "caption",
           C.muted, align="right", max_width=300)
    s.text(357 - 42, y + 48, "صحنه ضمیمه نشد.", "caption", C.muted, align="right")
    y += 90

    # the attachment that failed, with the frame itself: a filename alone tells the user nothing
    s.rect(16, y, 361, 64, fill=C.surface_2, radius=14)
    _photo_thumb(s, 16 + 361 - 12 - 44, y + 10, 44, 44, radius=10)
    s.text(357 - 68, y + 8, "IMG_2041.jpg", "label", C.text, align="right")
    s.text(357 - 68, y + 30, "۲٫۱ مگابایت", "caption", C.muted, align="right")
    s.text(357 - 68, y + 46, "خطای شبکه هنگام بارگذاری", "caption", C.danger, align="right")
    y += 78

    s.button(16, 634, 361, 50, "تلاش دوباره برای ارسال تصویر", icon="mdi-reload", variant="filled",
             color=C.danger, shadow=True)
    s.button(16, 694, 361, 46, "ادامه بدون تصویر", icon="mdi-image-off-outline", variant="tonal")
    s.button(16, 752, 361, 42, "لغو این درخواست", variant="text", color=C.danger)
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 16 — offline
# --------------------------------------------------------------------------- #
def sos_offline() -> Screen:
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.2)
    s = map_view(cam, pois=False)
    scrim(s, 40)
    chrome(s, tab=1)
    s.rect(0, 116, 393, 44, fill=C.warning)
    s.i.draw_icon(357 - 22, 138, "mdi-wifi-off", 17, "#FFFFFF")
    s.text(357 - 40, 130, "اتصال قطع است · در حالت آفلاین", "caption-bold",
           "#FFFFFF", align="right")

    top = 232
    s.shadow(16, top, 361, 296, radius=26, blur=24, dy=10, alpha=60)
    s.rect(16, top, 361, 296, fill="#FFFFFF", radius=26)
    s.circle(196.5, top + 44, 30, fill=C.warning_soft)
    s.i.draw_icon(196.5, top + 44, "mdi-cloud-off-outline", 30, C.warning)
    s.text(196.5, top + 84, "بدون اینترنت، درخواست ثبت نمی‌شود", "title", C.text, align="center")
    s.para(41.5, top + 114, "ثبت درخواست فقط با اتصال انجام می‌شود تا مرکز امداد مطمئن شود "
           "آن را دیده است.", "body-sm", C.muted, align="center", max_width=310, line_height=21)
    # one call to action, not a banner and a button saying the same number
    s.button(32, top + 176, 329, 48, "تماس با ۱۲۵", icon="mdi-phone", variant="filled",
             color=C.danger, shadow=True)
    s.button(32, top + 232, 329, 40, "تلاش دوباره برای اتصال", icon="mdi-refresh",
             variant="text", color=C.primary)

    # what actually still works without a connection, and what does not.
    # The plate used to promise «سوابق درخواست‌ها روی دستگاه است» with a sync time — there is no
    # offline cache anywhere in the client (no storage, no service worker), so that card was an
    # affordance for a page that cannot load.
    s.text(377, 600, "در حالت آفلاین", "caption-bold", C.muted, align="right")
    y = 622
    # the chip owns the row's left 112 px, so every note that shares the row must fold into
    # the space that is left — measured, not borrowed from the whole card width
    for ok, title, note, icon in [
            (True, "تماس با ۱۲۵", "بدون اینترنت هم برقرار می‌شود.", "mdi-phone"),
            (True, "موقعیت فعلی شما", "به شبکه نیاز ندارد؛ از ماهواره می‌آید.", "mdi-crosshairs-gps"),
            (False, "ثبت یا لغو درخواست", "هر دو تأیید مرکز را می‌خواهند.",
             "mdi-alarm-light-off-outline"),
            (False, "دیدن سوابق", "فهرست از سرور خوانده می‌شود.", "mdi-history")]:
        s.rect(16, y, 361, 46, fill="#FFFFFF", radius=12, outline=C.outline, outline_w=1)
        s.i.draw_icon(357 - 20, y + 23, icon, 16, C.success if ok else C.muted_2)
        s.text(357 - 44, y + 8, title, "caption-bold", C.text_2 if ok else C.muted,
               align="right")
        s.text(357 - 44, y + 26, note, "caption", C.muted_2, align="right", max_width=210)
        s.chip(28, y + 11, "در دسترس" if ok else "نیازمند اتصال", None,
               "success" if ok else "neutral", h=24)
        y += 52
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 17 — history
# --------------------------------------------------------------------------- #
def _sos_row(s: Screen, y: float, item: dict) -> float:
    """One SOS record, in the same card language the History section uses."""
    active = item.get("active", False)
    # 92/112, not 80/100: the status pill needs 14px of breathing room above the 18px corner,
    # and at the old height it sat 8px from the edge and looked like it was sliding out
    h = 112 if active else 92
    s.shadow(16, y, 361, h, radius=18, blur=14, dy=4, alpha=18)
    s.rect(16, y, 361, h, fill="#FFFFFF", radius=18,
           outline=C.danger if active else C.outline, outline_w=1.6 if active else 1)
    right = 357 - 52
    s.circle(357 - 24, y + 26, 17, fill=C.danger_soft if active else C.surface_3)
    s.i.draw_icon(357 - 24, y + 26, item.get("icon", "mdi-alarm-light"), 17,
                  C.danger if active else C.muted)
    s.text(right, y + 12, item["title"], "label", C.text, align="right", max_width=250)
    s.text(right, y + 34, item["when"], "caption", C.muted_2, align="right")

    # status on the row's bottom line, 14px clear of the card's edge
    chip_w = s.chip_width(item["chip"])
    pill_y = y + h - 24 - 14
    s.chip(16 + 12, pill_y, item["chip"], None, item["tone"], h=24)

    if active:
        # the request's own rail, mini: five dots and where it stands, on the same baseline
        label = item["stage_label"]
        tw = s.tw(label, "caption") + 8
        dots_x = 16 + 12 + chip_w + 16
        mid = pill_y + 12
        s.text(dots_x + tw, mid - 8.5, label, "caption", C.danger, align="right")
        cx = dots_x + tw + 6
        for index in range(5):
            on = index <= item["stage"]
            here = index == item["stage"]
            s.circle(cx + 10 + index * 13, mid, 4.6 if not here else 5.2,
                     fill=C.danger if on else "#FFFFFF",
                     outline=None if on else C.outline_strong, outline_w=0 if on else 1.4)
    # a chevron so every record, not only the live one, reads as a door
    s.i.draw_icon(16 + 16, y + h / 2, "mdi-chevron-left", 18, C.muted_2)
    return y + h + 10


def sos_history() -> Screen:
    s = Screen(background=C.background)
    # the same section control as every other plate: on a plain page the "on map" skin
    # turns the three inactive segments into white-on-white and they vanish
    chrome(s, tab=0, map_mode=False)

    s.text(377, 126, "سوابق درخواست‌های امداد", "title-lg", C.text, align="right")
    s.text(377, 158, "وضعیت هر درخواست، از ثبت تا بسته‌شدن", "caption", C.muted, align="right")

    # counts come from the four records below (one live, three ended), so the chip is a promise
    # the list keeps — a bare «فعال» with no number was a filter the user had to verify himself
    chips = [("همه · ۴", True), ("فعال · ۱", False), ("پایان‌یافته · ۳", False)]
    cursor = 377
    for label, on in chips:
        w = s.tw(label, "caption-bold") + 30
        cursor -= w
        s.rect(cursor, 186, w, 34, fill=C.primary if on else "#FFFFFF", radius=17,
               outline=None if on else C.outline, outline_w=0 if on else 1)
        s.text(cursor + w / 2, 194, label, "caption-bold", "#FFFFFF" if on else C.text_2,
               align="center")
        cursor -= 8

    # the live request is the one thing a requester opens this page for: it goes first
    s.rect(16, 234, 361, 56, fill=C.danger_soft, radius=16)
    s.i.draw_icon(357 - 22, 250, "mdi-alarm-light", 18, C.danger)
    s.text(357 - 44, 242, "درخواست فعال شما در جریان است", "label", C.danger, align="right")
    s.text(357 - 44, 262, "برای دیدن وضعیت روی نقشه برگردید.", "caption", C.muted,
           align="right")
    s.i.draw_icon(30, 262, "mdi-chevron-left", 20, C.danger)

    items = [
        {"title": "آتش‌سوزی · بازار قدیم", "when": "امروز · ۹:۳۶", "chip": "در حال رسیدگی",
         "tone": "danger", "active": True, "stage": 3, "stage_label": "مرحلهٔ ۴ از ۵",
         "icon": "mdi-fire"},
        {"title": "اورژانس پزشکی · خیابان دانشگاه", "when": "دیروز · ۲۱:۱۰",
         "chip": "انجام شد", "tone": "success", "icon": "mdi-medical-bag"},
        {"title": "تصادف · بلوار چمران", "when": "۲ روز پیش · ۰۸:۰۲", "chip": "لغو توسط شما",
         "tone": "muted", "icon": "mdi-car"},
        {"title": "سیل و آبگرفتگی · کوچهٔ لاله", "when": "۵ روز پیش · ۱۹:۴۵",
         "chip": "منقضی شد", "tone": "warning", "icon": "mdi-home-flood"},
    ]
    y = 306
    for item in items:
        y = _sos_row(s, y, item)

    s.button(16, y + 10, 361, 46, "درخواست‌های بیشتر", icon="mdi-chevron-down",
             variant="outline")
    s.text(196.5, y + 66, "درخواست‌ها از همهٔ دستگاه‌های شما جمع می‌شوند", "caption", C.muted,
           align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 18 — one request, opened
# --------------------------------------------------------------------------- #
def sos_history_detail() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)

    s.icon_button(16, 122, 38, "mdi-chevron-right", 20, C.text_2, fill="#FFFFFF", radius=13)
    s.text(377, 120, "پروندهٔ امداد", "title-lg", C.text, align="right")
    s.text(377, 152, f"پیگیری {fa_digits(sc.SOS_ID)} · {sc.SOS_TIMES['submitted']}",
           "caption", C.muted, align="right")

    s.rect(16, 176, 361, 106, fill="#FFFFFF", radius=18, outline=C.outline, outline_w=1)
    sos_rail(s, 28, 184, 337, 3, timestamps=sc.SOS_STAGE_TIMES)

    # what was reported
    s.rect(16, 292, 361, 86, fill=C.danger_soft, radius=18)
    s.i.draw_icon(357 - 20, 308, "mdi-fire", 20, C.danger)
    s.text(357 - 44, 302, "آتش‌سوزی · شدت بالا", "label-lg", C.text, align="right")
    s.text(357 - 44, 328, sc.SOS_ADDRESS, "caption", C.text_2, align="right", max_width=290)
    # incident detail, not a warning: an amber pill on a red card shouted over the status
    s.chip(28, 348, "طبقهٔ دوم · دو نفر", None, "neutral", h=22)

    s.text(377, 392, "شرح ثبت‌شده", "caption-bold", C.muted, align="right")
    s.rect(16, 412, 361, 74, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    s.para(28, 422, sc.SOS_DESCRIPTION, "caption", C.text_2, align="right", max_width=330)

    # the photo, as a thumbnail with one action instead of a row of overlapping pills
    s.text(377, 500, "تصویر صحنه", "caption-bold", C.muted, align="right")
    s.rect(16, 520, 361, 58, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    _photo_thumb(s, 24, 526, 46, 46, radius=10)
    s.text(345, 528, "IMG_2041.jpg", "caption-bold", C.text_2, align="right")
    s.text(345, 546, "۲٫۱ مگابایت · پیوست شده", "caption", C.muted, align="right")

    # what this record actually holds beyond the description: the place and the clock.
    # `sosRequestDetailSchema` returns the requester's own fields plus the cancellation detail —
    # there is no rescuer on it, so the plate cannot print one (it used to name «زهرا احمدی»).
    s.text(377, 594, "مشخصات درخواست", "caption-bold", C.muted, align="right")
    s.rect(16, 614, 361, 96, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
    for index, (label, value) in enumerate([("شناسهٔ پیگیری", fa_digits(sc.SOS_ID)),
                                            ("ثبت", f"{sc.SOS_TIMES['submitted']} · امروز"),
                                            ("آخرین وضعیت", "رسیدگی · ۹:۵۳")]):
        ry = 622 + index * 28
        s.text(357 - 12, ry, label, "caption", C.muted, align="right")
        s.text(357 - 100, ry, value, "caption-bold", C.text_2, align="right", max_width=240)
    s.button(16, 722, 361, 48, "لغو این درخواست", icon="mdi-close", variant="outline",
             color=C.danger)
    s.button(16, 778, 361, 42, "بازگشت به سوابق", icon="mdi-chevron-right", variant="text")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 19 — validation: what the send button refuses
# --------------------------------------------------------------------------- #
def sos_validation() -> Screen:
    cam = sc.camera(sc.SOS_POINT[0], sc.SOS_POINT[1], 0.26)
    s = map_view(cam, exclude=keepout(box(0, 0, 393, 118), box(0, 168, 393, 684)), pois=False)
    s.top_scrim(120)
    chrome(s, tab=1)

    top = 160
    sheet(s, top)
    y = sheet_header(s, top + 20, "درخواست امداد فوری", "برای ارسال، موارد زیر را کامل کنید",
                     icon="mdi-alarm-light", tone="danger", title_style="title")

    s.rect(16, y, 361, 104, fill=C.danger_soft, radius=14)
    s.text(357 - 14, y + 8, "این موارد مانع ارسال است:", "caption-bold", C.danger,
           align="right")
    # every blocking item, in the order the form asks for them — severity was missing from the
    # list while the plate drew it as chosen
    for index, line in enumerate(["شدت حادثه انتخاب نشده است.",
                                  "نوع حادثه انتخاب نشده است.",
                                  "شرح وضعیت کمتر از ۱۰ نویسه است."]):
        s.circle(357 - 18, y + 34 + index * 20, 2.2, fill=C.danger)
        s.text(357 - 28, y + 26 + index * 20, line, "caption", C.danger, align="right")
    y += 116

    y = section_label(s, y, "شدت حادثه")
    # nothing is chosen yet — that is *why* the send button is locked
    y = severity_cards(s, y, None) + 12
    # the card below already says the catalog failed; a label note said it twice
    y = section_label(s, y, "نوع حادثه")
    # the catalog failed: the plate shows the recoverable error, not an empty dropdown
    s.rect(16, y, 361, 56, fill=C.warning_soft, radius=12)
    s.i.draw_icon(357 - 18, y + 20, "mdi-alert-outline", 16, C.warning)
    s.text(357 - 38, y + 10, "فهرست نوع حادثه دریافت نشد", "caption-bold", C.warning,
           align="right")
    s.text(357 - 38, y + 30, "اتصال را بررسی و دوباره تلاش کنید.", "caption", C.muted,
           align="right")
    s.chip(24, y + 14, "بارگذاری دوباره", "mdi-reload", "warning", h=26)
    y += 68

    short = "دود زیاد"
    y = section_label(s, y, "شرح وضعیت", count_chars(short, 500))
    s.rect(16, y, 361, 96, fill=C.danger_soft, radius=14, outline=C.danger, outline_w=1.4)
    # eight characters, which is what the counter above the field says and what the error says
    s.text(357 - 12, y + 10, short, "label", C.text, align="right")
    # one sentence, once: the two lines said the same minimum length in different words
    s.text(357 - 12, y + 38, "حداقل ۱۰ نویسه دربارهٔ وضعیت، افراد و راه دسترسی بنویسید.",
           "caption", C.danger, align="right", max_width=330)

    # the action sits where every other sheet in this flow puts it, not glued to the last field
    s.button(16, 676, 361, 50, "ارسال درخواست امداد فوری", icon="mdi-lock-outline",
             variant="surface", color=C.muted_2)
    s.text(196.5, 734, "تا تکمیل موارد بالا، این دکمه فعال نمی‌شود", "caption", C.muted,
           align="center")
    home_bar(s)
    return s


# --------------------------------------------------------------------------- #
# 20 — no requests yet
# --------------------------------------------------------------------------- #
def sos_history_empty() -> Screen:
    s = Screen(background=C.background)
    chrome(s, tab=0, map_mode=False)
    s.text(377, 130, "سوابق درخواست‌های امداد", "title-lg", C.text, align="right")
    s.text(377, 160, "وضعیت هر درخواست، از ثبت تا بسته‌شدن", "caption", C.muted, align="right")

    s.rect(16, 200, 361, 296, fill="#FFFFFF", radius=24, outline=C.outline, outline_w=1)
    s.circle(196.5, 274, 38, fill=C.danger_soft)
    s.i.draw_icon(196.5, 274, "mdi-lifebuoy", 34, C.danger)
    s.text(196.5, 326, "هنوز درخواستی ثبت نکرده‌اید", "title", C.text, align="center")
    s.para(56.5, 356, "درخواست امداد فقط در وضعیت اضطراری فرستاده می‌شود و همیشه در همین "
           "فهرست می‌ماند.", "body-sm", C.muted, align="center", max_width=280)
    s.button(56.5, 430, 280, 50, "بازگشت به نقشه", icon="mdi-map-outline", variant="filled")

    # an empty list is the best moment to teach the flow: one card, three beats, and the door to
    # the full guide — the space below the CTA used to be 178 px of nothing
    s.text(377, 540, "از این‌جا چه چیزی رد می‌شود؟", "caption-bold", C.muted, align="right")
    y = 562
    for icon, title, note in [
            ("mdi-gesture-tap-hold", "دکمهٔ SOS را نگه می‌دارید",
             "با یک ضربه کاری نمی‌کند؛ برای همین تصادفی فرستاده نمی‌شود."),
            ("mdi-clipboard-text-outline", "فرم چهار قدمی را تأیید می‌کنید",
             "شدت، نوع، محل و شرح؛ پیش از ارسال همه را می‌بینید."),
            ("mdi-progress-clock", "وضعیت را همین‌جا دنبال می‌کنید",
             "از «ثبت» تا «پایان»؛ هر تغییر با ساعتش می‌ماند.")]:
        s.rect(16, y, 361, 50, fill="#FFFFFF", radius=14, outline=C.outline, outline_w=1)
        s.circle(357 - 24, y + 25, 15, fill=C.danger_soft)
        s.i.draw_icon(357 - 24, y + 25, icon, 16, C.danger)
        s.text(357 - 48, y + 8, title, "caption-bold", C.text, align="right", max_width=288)
        s.text(357 - 48, y + 27, note, "caption", C.muted, align="right", max_width=288)
        y += 56

    s.button(16, y + 2, 361, 44, "راهنمای کامل مسیر امداد", icon="mdi-map-legend",
             variant="tonal")
    s.text(196.5, y + 52, "همان تصویر راهنمای این پوشه", "caption", C.muted_2, align="center")
    home_bar(s)
    return s


SCREENS: dict[str, tuple[str, Callable[[], Screen]]] = {
    "s-01-entry": ("sos/01-sos-entry.png", sos_entry),
    "s-02-hold": ("sos/02-sos-hold-to-open.png", sos_hold),
    "s-03-compose": ("sos/03-sos-compose.png", sos_compose),
    "s-04-location": ("sos/04-sos-location-picker.png", sos_location),
    "s-05-photo": ("sos/05-sos-photo.png", sos_photo),
    "s-06-review": ("sos/06-sos-review.png", sos_review),
    "s-07-sending": ("sos/07-sos-sending.png", sos_sending),
    "s-08-pending": ("sos/08-sos-pending.png", sos_pending),
    "s-09-dispatched": ("sos/09-sos-dispatched.png", sos_dispatched),
    "s-10-accepted": ("sos/10-sos-rescuer-en-route.png", sos_accepted),
    "s-11-arrived": ("sos/11-sos-rescuer-arrived.png", sos_arrived),
    "s-12-completed": ("sos/12-sos-completed.png", sos_completed),
    "s-13-cancel": ("sos/13-sos-cancel-reason.png", sos_cancel),
    "s-14-cancelled": ("sos/14-sos-cancelled.png", sos_cancelled),
    "s-15-photo-retry": ("sos/15-sos-photo-retry.png", sos_photo_retry),
    "s-16-offline": ("sos/16-sos-offline.png", sos_offline),
    "s-17-history": ("sos/17-sos-history.png", sos_history),
    "s-18-history-detail": ("sos/18-sos-history-detail.png", sos_history_detail),
    "s-19-validation": ("sos/19-sos-validation.png", sos_validation),
    "s-20-history-empty": ("sos/20-sos-history-empty.png", sos_history_empty),
}

# the raw functions stay reachable for tests: `SCREENS` holds the clock-stamping wrappers
PLATES = dict(SCREENS)


def _at(key: str, fn: Callable[[], Screen]):
    """Stamp the plate's own wall-clock onto its status bar before it draws."""
    def run() -> Screen:
        ui.MOMENT = sc.SOS_CLOCKS.get(key)
        try:
            return fn()
        finally:
            ui.MOMENT = None
    return run


SCREENS = {key: (path, _at(key, fn)) for key, (path, fn) in PLATES.items()}
