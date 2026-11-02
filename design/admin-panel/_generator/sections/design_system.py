"""Design system reference for the admin panel: tokens, controls, patterns."""
from __future__ import annotations

import atheme  # noqa: F401
from atheme import A, C, PAD, RAIL, TYPE
import desk as D

# (token, usage) — the hex is read from the live theme, so the card can never drift
# from the colours the rest of the mockups are drawn with.
SWATCHES = [
    ("primary", "کنش اصلی، لینک، سایدبار فعال"),
    ("primary_soft", "چیپ، آیتم انتخاب‌شده، آواتار"),
    ("mission", "تأکید مأموریت امداد، نمودار"),
    ("text", "متن اصلی، تیتر و جدول"),
    ("success", "آماده، پذیرفته‌شده"),
    ("warning", "دیرکرد، در انتظار"),
    ("danger", "لغو، خطا، غیرفعال"),
    ("info", "اطلاع‌رسانی، راهنما"),
]


# --------------------------------------------------------------------------- #
# 01 — foundations
# --------------------------------------------------------------------------- #
def foundations():
    s, y = D.page(
        "system", "سامانه / سیستم طراحی", "سیستم طراحی پنل مدیریت",
        "توکن‌های مشترک با صفحهٔ نقشه: رنگ، تایپوگرافی، شعاع و فاصله.",
    )

    # ---- palette ----------------------------------------------------------
    palette_w, palette_pad = 700, 20
    D.card(s, PAD, y, palette_w, 336, "پالت رنگ", "mdi-palette-outline")
    swatch_right = PAD + palette_w - palette_pad        # inner right edge of the card
    for index, (name, usage) in enumerate(SWATCHES):
        hexa = getattr(C, name)
        col, row = index // 4, index % 4
        sx = swatch_right - 40 - col * 330             # left edge of the swatch
        sy = y + 60 + row * 66
        s.rect(sx, sy, 40, 40, fill=hexa, radius=9, outline=A.card_edge, outline_w=1)
        s.text(sx - 12, sy + 2, name, "d-label", C.text, align="right")
        s.text(sx - 12, sy + 24, f"{hexa} · {usage}", "d-caption", C.muted, align="right",
               max_width=240)

    # ---- typography -------------------------------------------------------
    D.card(s, RAIL - 392, y, 392, 336, "تایپوگرافی", "mdi-format-size")
    ramp = [("d-display", "نمای کلی"), ("d-h1", "گزارش رویدادها"),
            ("d-h2", "آخرین درخواست‌ها"), ("d-title", "گروه‌های امداد"),
            ("d-body", "متن بدنه با ارتفاع خط ۲۲"), ("d-sm", "متن ثانویه و توضیح"),
            ("d-caption", "برچسب جدول")]
    ty = y + 58
    for token, sample in ramp:
        s.text(RAIL - 22, ty, sample, token, C.text, align="right", max_width=250)
        s.text(RAIL - 372, ty + 4, token, "d-mono", C.muted_2, align="left")
        ty += {"d-display": 40, "d-h1": 34}.get(token, 30)

    y += 356

    # ---- spacing ----------------------------------------------------------
    D.card(s, PAD, y, 548, 280, "فاصله و شعاع", "mdi-ruler-square")
    steps = [("۴", 8), ("۸", 14), ("۱۲", 20), ("۱۶", 28), ("۲۴", 40), ("۲۸", 48)]
    rx = PAD + 528
    for label, width in steps:
        s.rect(rx - width * 2, y + 66, width * 2, 34, fill=C.primary_soft, radius=6)
        s.text(rx - 8, y + 74, label, "d-caption", C.primary, align="right")
        rx -= width * 2 + 22
    s.text(PAD + 528, y + 116, "مضرب‌های ۴ پیکسل؛ حاشیهٔ کارت ۲۰، فاصلهٔ ستون‌ها ۲۸.",
           "d-sm", C.muted, align="right", max_width=490)

    for index, (label, radius) in enumerate([("کارت ۱۶", 16), ("درون‌کارت ۱۲", 12),
                                             ("دکمه ۱۱", 11), ("چیپ ۱۲", 12)]):
        bx = PAD + 528 - 84 - index * 108
        s.rect(bx, y + 160, 84, 62, fill=C.surface_2, radius=radius,
               outline=A.card_edge, outline_w=1)
        s.text(bx + 42, y + 230, label, "d-caption", C.muted, align="center")

    # ---- elevation --------------------------------------------------------
    D.card(s, PAD + 568, y, 550, 280, "سایه و لایه", "mdi-layers-outline")
    for index, (label, blur, alpha) in enumerate([("لایهٔ ۱ · کارت", 18, 16),
                                                  ("لایهٔ ۲ · کشو", 40, 70),
                                                  ("لایهٔ ۳ · مودال", 60, 90)]):
        ex = PAD + 568 + 530 - 110 - index * 168
        s.shadow(ex, y + 78, 110, 62, radius=14, blur=blur, dy=4 + index * 2, alpha=alpha)
        s.rect(ex, y + 78, 110, 62, fill=C.surface, radius=14, outline=A.card_edge, outline_w=1)
        s.text(ex + 55, y + 154, label, "d-caption", C.muted, align="center")
    s.para(PAD + 588, y + 196,
           "سایهٔ کارت ۱۶٪، کشو ۷۰٪ و مودال ۹۰٪ شفافیت دارند؛ هیچ سایه‌ای روی متن نمی‌افتد.",
           "d-sm", C.muted, align="right", max_width=510, line_height=20, max_lines=2)
    return s


# --------------------------------------------------------------------------- #
# 02 — controls
# --------------------------------------------------------------------------- #
def controls():
    s, y = D.page(
        "system", "سامانه / سیستم طراحی / کنترل‌ها", "کنترل‌ها",
        "دکمه‌ها، فیلدها، چیپ‌ها و سوییچ‌ها با اندازه و حالت یکسان در همهٔ صفحات.",
    )

    # ---- buttons (right card) --------------------------------------------
    bx0 = RAIL - 548
    br, bl = bx0 + 528, bx0 + 20
    D.card(s, bx0, y, 548, 300, "دکمه‌ها", "mdi-gesture-tap-button")
    # 162 + 12 + 162 + 12 + 160 = 508 = card inner width
    bw1, bw2, bw3 = 162, 162, 160
    D._button(s, bl, y + 56, bw1, 42, "ثبت اعزام", "mdi-send", "filled")
    D._button(s, bl + 174, y + 56, bw2, 42, "خروجی CSV", "mdi-download-outline", "outline")
    D._button(s, bl + 348, y + 56, bw3, 42, "بازخوانی", "mdi-refresh", "tonal")
    s.text(br, y + 110, "پر برای کنش اصلی، خط‌دار برای ثانویه، ملایم برای تکرارپذیر.",
           "d-caption", C.muted, align="right", max_width=508)
    D._button(s, bl, y + 138, bw1, 42, "لغو مأموریت", "mdi-close-circle-outline", "danger")
    D._button(s, bl + 174, y + 138, bw2, 42, "ذخیرهٔ پیش‌نویس", "mdi-content-save-outline",
              "danger-outline")
    s.rect(bl + 348, y + 138, bw3, 42, fill=C.surface_3, radius=11)
    s.text(bl + 348 + bw3 / 2, y + 149, "غیرفعال", "d-label", C.muted_2, align="center")
    s.text(br, y + 192, "هر ناحیه فقط یک دکمهٔ پر دارد؛ دکمهٔ غیرفعال نه سایه دارد نه حاشیه.",
           "d-caption", C.muted, align="right", max_width=508)
    s.text(br, y + 236, "ارتفاع دکمه ۴۲، شعاع ۱۱، فاصلهٔ افقی ۱۲.",
           "d-caption", C.muted_2, align="right", max_width=508)

    # ---- fields (left card) ----------------------------------------------
    fx0 = PAD
    fr, fl = fx0 + 528, fx0 + 20
    D.card(s, fx0, y, 548, 300, "فیلد و انتخاب", "mdi-form-textbox")
    D.field(s, fl, y + 56, 508, "جست‌وجوی کاربر یا مأموریت", h=44)
    D.select(s, fl, y + 112, 248, "همهٔ وضعیت‌ها")
    D.select(s, fl + 260, y + 112, 248, "۷ روز گذشته")
    s.text(br if False else fr, y + 166, "فیلد خطا", "d-caption-bold", C.danger, align="right")
    s.rect(fl, y + 186, 508, 44, fill=C.danger_soft, radius=10, outline=C.danger, outline_w=1)
    s.text(fl + 494, y + 197, "شمارهٔ همراه باید ۱۱ رقم باشد", "d-sm", C.danger, align="right")
    s.text(fr, y + 248, "همهٔ فیلدها ارتفاع ۴۴ و شعاع ۱۰ دارند؛ خطا با پس‌زمینهٔ صورتی و متن سرخ.",
           "d-caption", C.muted, align="right", max_width=508)

    y += 380

    # ---- pills (right card) ----------------------------------------------
    D.card(s, RAIL - 548, y, 548, 220, "چیپ وضعیت", "mdi-tag-outline")
    pills = [("فعال", "success"), ("در مأموریت", "warning"), ("غیرفعال", "danger"),
             ("پیش‌نویس", "neutral"), ("مدیر سامانه", "info"), ("امدادگر", "primary")]
    px, py = RAIL - 20, y + 58
    for label, tone in pills:
        w = D.pill(s, px, py, label, tone, None, 24, right=True)
        px -= w + 10
        if px < RAIL - 508:
            px, py = RAIL - 20, py + 36
    s.text(RAIL - 20, y + 156, "هر وضعیت یک رنگ ثابت دارد و رنگ‌ها در کل پنل تکرار می‌شوند.",
           "d-caption", C.muted, align="right", max_width=508)

    # ---- toggles / tabs / avatars (left card) ----------------------------
    gx0 = PAD
    gr, gl = gx0 + 528, gx0 + 20
    D.card(s, gx0, y, 548, 220, "سوییچ، تب و آواتار", "mdi-toggle-switch-outline")
    s.text(gr, y + 54, "اعلان صوتی برای درخواست بحرانی", "d-sm", C.text_2, align="right")
    s.toggle(gl, y + 50, 44, 26, True)
    s.text(gr, y + 94, "ایمیل روزانهٔ گزارش", "d-sm", C.text_2, align="right")
    s.toggle(gl, y + 90, 44, 26, False)
    tabs = [("همه", True), ("امدادگران", False), ("مدیران", False)]
    tx = gr
    for label, on in tabs:
        tw = s.tw(label, "d-label") + 30
        tx -= tw
        s.rect(tx, y + 138, tw, 34, fill=C.primary if on else C.surface, radius=10,
               outline=None if on else A.card_edge, outline_w=0 if on else 1)
        s.text(tx + tw - 14, y + 147, label, "d-label", "#FFFFFF" if on else C.text_2,
               align="right")
        tx -= 8
    for index, (ini, name) in enumerate([("س", "سعید کریمی"), ("ز", "زهرا احمدی")]):
        ax = gl + index * 200
        s.circle(ax + 17, y + 186, 17, fill=C.primary_soft)
        s.text(ax + 17, y + 178, ini, "d-label", C.primary, align="center")
        s.text(ax + 44, y + 178, name, "d-sm", C.text_2, align="left")
    return s


# --------------------------------------------------------------------------- #
# 03 — patterns
# --------------------------------------------------------------------------- #
def patterns():
    s, y = D.page(
        "system", "سامانه / سیستم طراحی / الگوها", "الگوها",
        "کارت، جدول، شاخص و لایه‌های روی‌هم — همان ساختاری که همهٔ صفحات استفاده می‌کنند.",
    )

    # page skeleton
    D.card(s, PAD, y, 548, 300, "اسکلت صفحه", "mdi-view-dashboard-outline")
    sb_x, sb_w = PAD + 528 - 54, 54
    s.rect(sb_x, y + 56, sb_w, 186, fill=C.primary_soft, radius=8)
    s.text(sb_x + 27, y + 250, "سایدبار", "d-caption", C.primary, align="center")
    stack_x = PAD + 20
    stack_w = sb_x - 16 - stack_x
    s.rect(stack_x, y + 56, stack_w, 30, fill=C.surface_3, radius=7)
    s.text(stack_x + stack_w - 12, y + 61, "نوار بالا ۶۸", "d-caption", C.text_2, align="right")
    s.rect(stack_x, y + 92, stack_w, 40, fill=C.primary_soft, radius=7)
    s.text(stack_x + stack_w - 12, y + 102, "سرصفحهٔ صفحه", "d-caption", C.primary, align="right")
    kw = (stack_w - 24) / 3
    for index in range(3):
        s.rect(stack_x + index * (kw + 12), y + 138, kw, 36, fill=C.surface_2, radius=7,
               outline=A.card_edge, outline_w=1)
    s.text(stack_x + stack_w - 6, y + 150, "شاخص‌ها", "d-caption", C.muted_2, align="right")
    s.rect(stack_x, y + 180, stack_w, 62, fill=C.surface_2, radius=7, outline=A.card_edge,
           outline_w=1)
    s.text(stack_x + stack_w - 12, y + 202, "جدول یا نقشه", "d-caption", C.text_2, align="right")
    s.text(PAD + 528, y + 262, "۲۸ پیکسل حاشیه دور محتوا، ستون کنار ۳۰۰ پیکسل.",
           "d-caption", C.muted, align="right")

    # table pattern
    D.card(s, RAIL - 548, y, 548, 300, "جدول", "mdi-table")
    cols = [("گروه", 170), ("وضعیت", 110), ("اعضا", 90)]
    rows = [[("strong", "آتش‌نشانی"), ("pill", "فعال", "success"), "۱۸ نفر"],
            [("strong", "اورژانس"), ("pill", "فعال", "success"), "۲۶ نفر"],
            [("strong", "هلال احمر"), ("pill", "در مأموریت", "warning"), "۱۲ نفر"]]
    D.table(s, RAIL - 528, y + 52, 508, cols, rows, 52)
    s.text(RAIL - 20, y + 250, "سطر ۴۸ تا ۵۶ پیکسل، خط ۱ پیکسل، سرستون خاکستری روشن.",
           "d-caption", C.muted, align="right", max_width=508)

    y += 320

    # layering
    D.card(s, PAD, y, 1120, 220, "لایه‌ها", "mdi-window-restore")
    labels = [("دراور ۵۶۰ پیکسل از راست", "mdi-dock-right"),
              ("مودال ۷۲۰ × ۶۲۰", "mdi-card-text-outline"),
              ("توست بالا-چپ", "mdi-message-alert-outline")]
    for index, (label, icon) in enumerate(labels):
        bx = PAD + 20 + index * 366
        s.rect(bx, y + 56, 330, 120, fill=C.surface_2, radius=12, outline=A.card_edge, outline_w=1)
        s.i.draw_icon(bx + 310, y + 92, icon, 22, C.primary)
        s.text(bx + 288, y + 82, label, "d-label", C.text_2, align="right", max_width=250)
        s.text(bx + 288, y + 108, "روی همه‌چیز، با پردهٔ ۲۴٪", "d-caption", C.muted, align="right")
    return s


SCREENS = {
    "a-ds-foundations": ("design-system/01-foundations.png", foundations),
    "a-ds-controls": ("design-system/02-controls.png", controls),
    "a-ds-patterns": ("design-system/03-patterns.png", patterns),
}
