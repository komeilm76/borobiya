"""Admin dashboard screens: live overview, dispatch board, reporting."""
from __future__ import annotations

import atheme  # noqa: F401  (sets up sys.path for bb)
from atheme import A, C, PAD, RAIL, W
from bb import scenario as sc
from bb.map import draw_base, draw_labels, draw_pois, incident_marker, team_marker

import desk as D

# three columns of the content area
MAIN_X, MAIN_W = 368, 780
RAIL_X, RAIL_W = PAD, 312
TOP = 188


def _page(active, crumbs, title, sub, actions=()):
    s = D.screen()
    D.sidebar(s, active)
    D.topbar(s, crumbs)
    y = D.page_head(s, 96, title, sub, actions)
    return s, y


# --------------------------------------------------------------------------- #
# 01 — live overview
# --------------------------------------------------------------------------- #
def overview():
    s, y = _page(
        "dashboard", "عملیات / نمای کلی", "نمای کلی",
        "وضعیت لحظه‌ای درخواست‌های امداد، مأموریت‌های فعال و آمادگی گروه‌ها.",
        [("به‌روزرسانی", "mdi-refresh", "outline"), ("گزارش روز", "mdi-download-outline", "filled")],
    )

    tiles = [
        ("درخواست‌های امروز", "۱۲۴", "۱۲٪ بیشتر از دیروز", "primary", "mdi-bell-ring-outline",
         [8, 11, 9, 14, 12, 16, 15]),
        ("مأموریت‌های فعال", "۸", "۲ در انتظار پذیرش", "warning", "mdi-radar",
         [3, 5, 4, 6, 5, 7, 8]),
        ("میانگین زمان پاسخ", "۴:۱۲", "۴۲ ثانیه سریع‌تر", "success", "mdi-timer-outline",
         [9, 8, 9, 7, 7, 6, 5]),
        ("امدادگران آنلاین", "۳۶", "از ۴۴ نفر", "info", "mdi-account-heart-outline",
         [22, 26, 25, 30, 28, 34, 36]),
    ]
    kw = (1120 - 3 * 16) / 4
    for index, (label, value, delta, tone, icon, _spark) in enumerate(tiles):
        x = RAIL - kw - index * (kw + 16)
        D.kpi(s, x, y, kw, 104, label, value, delta, tone, icon)

    y += 124

    # --- live map ----------------------------------------------------------
    D.card(s, MAIN_X, y, MAIN_W, 300, "نقشهٔ عملیات زنده", "mdi-map-marker-radius-outline",
           "نمای کامل")
    mx, my, mw, mh = MAIN_X + 20, y + 52, MAIN_W - 40, 206
    cam = sc.camera(190, 130, 0.155)

    def draw_map(sub):
        draw_base(sub, cam)
        draw_labels(sub, cam)
        draw_pois(sub, cam)
        incident_marker(sub, cam, 300, 250, None, icon="fire")
        incident_marker(sub, cam, 40, 300, None, icon="water", rings=False)
        incident_marker(sub, cam, 300, -60, None, icon="ambulance", rings=False)
        team_marker(sub, cam, 236, 196, "س", "success")
        team_marker(sub, cam, 130, 232, "ز", "success")
        team_marker(sub, cam, 300, 150, "ع", "warning")

    D.map_tile(s, mx, my, mw, mh, draw_map, radius=12)
    with s.alpha_layer():
        s.rect(mx, my, mw, 38, fill=(255, 255, 255, 232))
    s.text(mx + mw - 14, my + 10, "۳ حادثهٔ فعال · ۲ تیم در مسیر", "d-sm", C.text_2, align="right")
    D.pill(s, mx + 12, my + 8, "زنده", "danger", "mdi-record-circle-outline", 22)
    s.text(MAIN_X + MAIN_W - 20, y + 272, "آخرین به‌روزرسانی: ۹:۴۱:۲۲", "d-caption",
           C.muted_2, align="right")

    # --- latest SOS --------------------------------------------------------
    y += 320
    D.card(s, MAIN_X, y, MAIN_W, 240, "آخرین درخواست‌های امداد", "mdi-bell-ring-outline", "همه")
    cols = [("درخواست‌کننده", 240), ("نوع حادثه", 120), ("موقعیت", 170), ("زمان", 90),
            ("وضعیت", 120)]
    rows = [
        [("avatar", "ر", "رضا محمدی", "۰۹۱۲…۴۵۶۷"), ("strong", "آتش‌سوزی"), "بازار قدیم",
         "۹:۳۸", ("pill", "در حال اعزام", "warning")],
        [("avatar", "م", "مریم رضایی", "۰۹۳۵…۱۲۰۸"), ("strong", "پزشکی"), "خیابان ولیعصر",
         "۹:۳۱", ("pill", "پذیرفته شد", "success")],
        [("avatar", "ح", "حسین کریمی", "۰۹۱۹…۷۷۳۴"), ("strong", "غرق‌شدگی"), "رودخانهٔ شمالی",
         "۹:۲۴", ("pill", "در انتظار", "danger")],
    ]
    D.table(s, MAIN_X + 20, y + 50, MAIN_W - 40, cols, rows, 52)

    # --- rail: service groups ---------------------------------------------
    D.card(s, RAIL_X, TOP + 124, RAIL_W, 300, "گروه‌های امداد", "mdi-lifebuoy", "مدیریت")
    groups = [
        ("آتش‌نشانی", "fire-truck", "۶ از ۸ نفر", "آماده", "success"),
        ("اورژانس", "ambulance", "۱۱ از ۱۲ نفر", "آماده", "success"),
        ("هلال احمر", "hospital-box-outline", "۴ از ۶ نفر", "در مأموریت", "warning"),
        ("امداد کوهستان", "map-marker-radius-outline", "۲ از ۴ نفر", "کمبود نیرو", "danger"),
    ]
    gy = TOP + 124 + 56
    for name, icon, count, status, tone in groups:
        s.circle(RAIL_X + RAIL_W - 36, gy + 21, 17, fill=C.surface_2)
        s.i.draw_icon(RAIL_X + RAIL_W - 36, gy + 21, icon, 17, C.text_2)
        s.text(RAIL_X + RAIL_W - 62, gy + 2, name, "d-label", C.text, align="right")
        s.text(RAIL_X + RAIL_W - 62, gy + 22, count, "d-caption", C.muted, align="right")
        D.pill(s, RAIL_X + 18, gy + 10, status, tone, None, 22)
        gy += 60

    # --- rail: alerts ------------------------------------------------------
    D.card(s, RAIL_X, TOP + 444, RAIL_W, 240, "هشدارهای سامانه", "mdi-bell-alert-outline", "همه")
    alerts = [
        ("دسترسی گروه امداد کوهستان به دو نوع حادثه قطع شد", "۹:۳۹", "warning"),
        ("درخواست SOS بدون پذیرش بیش از ۴ دقیقه در انتظار است", "۹:۳۵", "danger"),
        ("نسخهٔ پشتیبان پایگاه داده با موفقیت ثبت شد", "۸:۰۰", "success"),
    ]
    ay = TOP + 444 + 56
    for text, time, tone in alerts:
        color = {"warning": C.warning, "danger": C.danger, "success": C.success}[tone]
        s.circle(RAIL_X + RAIL_W - 24, ay + 8, 4, fill=color)
        s.para(RAIL_X + 36, ay, text, "d-sm", C.text_2, align="right",
               max_width=RAIL_W - 72, line_height=19, max_lines=2)
        s.text(RAIL_X + RAIL_W - 36, ay + 40, time, "d-caption", C.muted_2, align="right")
        ay += 60
    return s


# --------------------------------------------------------------------------- #
# 02 — dispatch board
# --------------------------------------------------------------------------- #
QX, QW = PAD, 316
MX, MW = 366, 456
DX, DW = 844, 300


def dispatch():
    s = D.screen()
    D.sidebar(s, "dispatch")
    D.topbar(s, "عملیات / اعزام و امداد")
    y = D.page_head(s, 96, "اعزام و امداد",
                    "درخواست‌های باز، نزدیک‌ترین امدادگران و ثبت اعزام — همه در یک صفحه.",
                    [("بازخوانی صف", "mdi-refresh", "outline")])

    # ---- queue ----
    items = [
        ("آتش‌سوزی ساختمان", "بازار قدیم · ۴ دقیقه پیش", "دیرکرد", "danger", True,
         "نزدیک‌ترین تیم: آتش‌نشانی مرکزی"),
        ("غرق‌شدگی", "رودخانهٔ شمالی · ۲ دقیقه پیش", "فوری", "warning", False,
         "نزدیک‌ترین تیم: هلال احمر"),
        ("سقوط از ارتفاع", "خیابان چمران · ۹ دقیقه پیش", "منتظر", "warning", False,
         "نزدیک‌ترین تیم: اورژانس تهران"),
        ("حادثهٔ رانندگی", "بزرگراه صدر · ۱۲ دقیقه پیش", "منتظر", "warning", False,
         "نزدیک‌ترین تیم: اورژانس تهران"),
        ("گم‌شدن کودک", "پارک ملت · ۱۸ دقیقه پیش", "بسته", "neutral", False,
         "تحویل به آتش‌نشانی مرکزی · بسته"),
        ("مسمومیت غذایی", "رستوران بازار · ۲۴ دقیقه پیش", "بسته", "neutral", False,
         "تحویل به اورژانس تهران · بسته"),
    ]
    open_n = sum(1 for it in items if it[2] != "بسته")
    D.card(s, QX, y, QW, 684, "صف درخواست‌ها", "mdi-playlist-check", f"{D.fa(open_n)} باز")
    qy = y + 54
    for title, meta, state, tone, active, foot in items:
        s.rect(QX + 14, qy, QW - 28, 96, fill=C.primary_soft if active else C.surface_2,
               radius=12, outline=C.primary if active else None, outline_w=1.4 if active else 0)
        s.text(QX + QW - 28, qy + 12, title, "d-label-lg", C.text, align="right")
        s.text(QX + QW - 28, qy + 34, meta, "d-caption", C.muted, align="right")
        s.text(QX + QW - 28, qy + 54, foot, "d-caption",
               C.text_2, align="right", max_width=QW - 120)
        D.pill(s, QX + 22, qy + 12, state, tone, None, 22)
        qy += 104

    # ---- map ----
    D.card(s, MX, y, MW, 404, "موقعیت حادثه‌ها", "mdi-map-marker-radius-outline")
    cam = sc.camera(190, 130, 0.2)

    def draw_map(sub):
        draw_base(sub, cam)
        draw_labels(sub, cam)
        draw_pois(sub, cam)
        incident_marker(sub, cam, 300, 250, None, icon="fire")
        incident_marker(sub, cam, 40, 300, None, icon="water", rings=False)
        incident_marker(sub, cam, 300, -60, None, icon="ambulance", rings=False)
        team_marker(sub, cam, 236, 196, "س", "success")
        team_marker(sub, cam, 130, 232, "ز", "success")

    D.map_tile(s, MX + 16, y + 52, MW - 32, 334, draw_map, radius=12)

    # ---- nearest responders ----
    ny = y + 424
    D.card(s, MX, ny, MW, 260, "نزدیک‌ترین امدادگران", "mdi-account-search-outline", "فیلتر")
    cols = [("امدادگر", 200), ("فاصله", 90), ("وضعیت", 120)]
    rows = [
        [("avatar", "س", "سعید کریمی", "آتش‌نشانی · خودرو"), "۴۲۰ م", ("pill", "آماده", "success")],
        [("avatar", "ز", "زهرا احمدی", "اورژانس · موتور"), "۶۵۰ م",
         ("pill", "در مأموریت", "warning")],
        [("avatar", "ع", "علی موسوی", "آتش‌نشانی · خودرو"), "۱٫۲ کیلومتر",
         ("pill", "آماده", "success")],
    ]
    D.table(s, MX + 18, ny + 50, MW - 36, cols, rows, 52)

    # ---- detail panel ----
    D.card(s, DX, y, DW, 684)
    inner_r = DX + DW - 18
    D.pill(s, inner_r, y + 18, "دیرکرد", "danger", None, 24, right=True)
    s.text(inner_r, y + 52, "آتش‌سوزی ساختمان", "d-h2", C.text, align="right", max_width=DW - 36)
    s.text(inner_r, y + 82, "بازار قدیم، نبش کوچهٔ بهار", "d-sm", C.muted, align="right",
           max_width=DW - 36)
    s.rect(DX + 16, y + 112, DW - 32, 1, fill=A.row_line)

    info = [("نوع حادثه", "آتش‌سوزی"), ("درخواست‌کننده", "رضا محمدی"),
            ("زمان ثبت", "۹:۳۸ · ۶ دقیقه پیش"), ("اولویت", "بحرانی")]
    iy = y + 126
    for label, value in info:
        s.text(inner_r, iy, label, "d-caption", C.muted, align="right")
        s.text(inner_r, iy + 18, value, "d-label", C.text, align="right")
        iy += 48

    s.rect(DX + 16, iy + 4, DW - 32, 1, fill=A.row_line)
    s.text(inner_r, iy + 18, "اعزام انتخابی", "d-label", C.text, align="right")
    sy = iy + 44
    for name, meta in [("سعید کریمی", "آتش‌نشانی · ۴۲۰ م"), ("علی موسوی", "آتش‌نشانی · ۱٫۲ کیلومتر")]:
        s.rect(DX + 16, sy, DW - 32, 50, fill=C.surface_2, radius=10)
        s.circle(DX + DW - 40, sy + 25, 12, fill=C.primary)
        s.i.draw_icon(DX + DW - 40, sy + 25, "mdi-check", 14, "#FFFFFF")
        s.text(DX + DW - 60, sy + 8, name, "d-label", C.text, align="right")
        s.text(DX + DW - 60, sy + 27, meta, "d-caption", C.muted, align="right", max_width=DW - 90)
        sy += 58

    D._button(s, DX + 16, y + 612, DW - 32, 48, "ثبت و ارسال اعزام", "mdi-send", "filled")
    D._button(s, DX + 16, y + 556, DW - 32, 42, "انصراف از درخواست", None, "outline")
    s.para(DX + 18, y + 496, "با ثبت اعزام، اعلان فوری برای امدادگران انتخاب‌شده ارسال می‌شود.",
           "d-caption", C.muted_2, align="right", max_width=DW - 36, line_height=17, max_lines=2)
    return s


# --------------------------------------------------------------------------- #
# 03 — reporting
# --------------------------------------------------------------------------- #
def reports():
    s, y = _page(
        "reports", "عملیات / گزارش‌ها", "گزارش‌ها و تحلیل عملکرد",
        "روند درخواست‌ها، زمان پاسخ گروه‌ها و کیفیت رسیدگی در بازهٔ انتخابی.",
        [("بازه: ۳۰ روز", "mdi-calendar-range", "outline"),
         ("خروجی گزارش", "mdi-download-outline", "filled")],
    )

    tiles = [
        ("کل درخواست‌ها", "۲٬۴۱۸", "۸٫۲٪ رشد", "primary", "mdi-bell-ring-outline", None),
        ("میانگین زمان پاسخ", "۴:۱۲", "۳۸ ثانیه بهبود", "success", "mdi-timer-outline", None),
        ("نرخ پذیرش", "۹۲٪", "۳٪ رشد", "info", "mdi-check-decagram-outline", None),
        ("مأموریت‌های لغوشده", "۳۸", "۱۲٪ کاهش", "warning", "mdi-close-circle-outline", None),
    ]
    kw = (1120 - 3 * 16) / 4
    for index, (label, value, delta, tone, icon, _spark) in enumerate(tiles):
        x = RAIL - kw - index * (kw + 16)
        D.kpi(s, x, y, kw, 104, label, value, delta, tone, icon)

    y += 124

    # trend
    D.card(s, MAIN_X, y, MAIN_W, 250, "روند درخواست و مأموریت", "mdi-chart-timeline-variant",
           "۷ روز آخر")
    D.chart_line(s, MAIN_X + 34, y + 58, MAIN_W - 66, 130,
                 [[42, 55, 48, 61, 58, 72, 66], [30, 38, 35, 44, 41, 52, 47]],
                 ["شنبه", "یک‌شنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنج‌شنبه", "جمعه"],
                 [C.primary, C.warning])
    D.legend_row(s, MAIN_X + MAIN_W - 30, y + 216, [("درخواست‌ها", C.primary),
                                                    ("مأموریت‌ها", C.warning)])

    # donut
    D.card(s, RAIL_X, y, 340, 250, "سهم گروه‌ها", "mdi-chart-donut")
    D.donut(s, RAIL_X + 170, y + 92, 54, [42, 28, 18, 12],
            [C.primary, C.warning, C.info, C.mission], 18, "۲٬۴۱۸", "درخواست")
    shares = [("آتش‌نشانی", "۴۲٪", C.primary), ("اورژانس", "۲۸٪", C.warning),
              ("هلال احمر", "۱۸٪", C.info), ("کوهستان", "۱۲٪", C.mission)]
    for index, (label, value, color) in enumerate(shares):
        ly = y + 160 + index * 21
        s.circle(RAIL_X + 30, ly + 7, 4.5, fill=color)
        s.text(RAIL_X + 44, ly, label, "d-caption", C.muted, align="left")
        s.text(RAIL_X + 320, ly, value, "d-caption-bold", C.text_2, align="right")

    y += 270

    # bars
    D.card(s, RAIL_X, y, 340, 286, "بر اساس نوع حادثه", "mdi-chart-bar")
    D.chart_bars(s, RAIL_X + 22, y + 56, 296, 150, [58, 42, 30, 22, 14],
                 ["آتش", "پزشکی", "غرق", "تصادف", "سایر"], C.primary, highlight=0)
    s.text(RAIL_X + 318, y + 250, "بیشترین فراوانی: آتش‌سوزی", "d-caption", C.muted, align="right")

    # group performance
    D.card(s, MAIN_X, y, MAIN_W, 286, "عملکرد گروه‌ها", "mdi-table-large", "خروجی")
    cols = [("گروه", 210), ("درخواست", 100), ("میانگین پاسخ", 130), ("پذیرش", 90),
            ("رضایت", 100), ("وضعیت", 120)]
    rows = [
        [("strong", "آتش‌نشانی"), "۱٬۰۱۸", "۳:۵۴", "۹۶٪", "۴٫۸", ("pill", "عالی", "success")],
        [("strong", "اورژانس"), "۶۷۶", "۴:۲۰", "۹۳٪", "۴٫۶", ("pill", "خوب", "success")],
        [("strong", "هلال احمر"), "۴۳۵", "۵:۰۸", "۸۸٪", "۴٫۲", ("pill", "متوسط", "warning")],
        [("strong", "امداد کوهستان"), "۲۸۹", "۷:۳۱", "۷۴٪", "۳٫۶",
         ("pill", "ضعیف", "danger")],
    ]
    D.table(s, MAIN_X + 20, y + 50, MAIN_W - 40, cols, rows, 46)
    return s


SCREENS = {
    "a-dash-overview": ("dashboard/01-overview.png", overview),
    "a-dash-dispatch": ("dashboard/02-dispatch-board.png", dispatch),
    "a-dash-reports": ("dashboard/03-reports.png", reports),
}
