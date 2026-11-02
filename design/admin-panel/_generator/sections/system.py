"""Administrative functions: audit trail, alerts/broadcast, system settings."""
from __future__ import annotations

import atheme  # noqa: F401
from atheme import A, C, PAD, RAIL
import desk as D


# --------------------------------------------------------------------------- #
# 01 — audit log
# --------------------------------------------------------------------------- #
def audit():
    s, y = D.page(
        "audit", "سامانه / گزارش رویدادها", "گزارش رویدادها",
        "هر تغییر حساس در پنل با کاربر، زمان و آدرس شبکه ثبت می‌شود و قابل خروجی گرفتن است.",
        [("خروجی CSV", "mdi-download-outline", "outline"), ("بازخوانی", "mdi-refresh", "filled")],
    )

    D.field(s, RAIL - 360, y, 360, "جست‌وجوی کاربر یا هدف رویداد")
    D.select(s, RAIL - 372 - 200, y, 200, "همهٔ اقدام‌ها")
    D.select(s, RAIL - 584 - 210, y, 210, "۷ روز گذشته")
    y += 62

    rows = [
        ("۹:۴۱", "مهدی رستمی", "اعزام امدادگر", "SOS-۱۴۸۲ · سعید کریمی", "۱۰٫۲۴٫۵٫۱۸"),
        ("۹:۳۸", "سامانه", "دریافت درخواست SOS", "SOS-۱۴۸۲ · آتش‌سوزی", "—"),
        ("۹:۲۶", "مهدی رستمی", "تغییر وضعیت کاربر", "hossein.k · غیرفعال", "۱۰٫۲۴٫۵٫۱۸"),
        ("۸:۵۸", "مریم رستمی", "ویرایش گروه امداد", "امداد کوهستان · افزودن «سقوط»", "۱۰٫۲۴٫۷٫۴"),
        ("۸:۳۲", "مریم رستمی", "افزودن نوع حادثه", "حادثهٔ شیمیایی", "۱۰٫۲۴٫۷٫۴"),
        ("۸:۰۵", "سامانه", "پشتیبان‌گیری خودکار", "پایگاه داده · ۴۱۲ مگابایت", "—"),
        ("۷:۵۰", "مهدی رستمی", "ورود موفق", "نشست مرورگر Chrome", "۱۰٫۲۴٫۵٫۱۸"),
        ("۷:۴۷", "ناشناس", "ورود ناموفق (۳ بار)", "mehdi.r", "۹۱٫۹۹٫۱۴٫۲۲"),
    ]
    D.card(s, PAD, y, 1120, 540, "۲۴ رویداد در ۷ روز گذشته", "mdi-history", "فیلتر پیشرفته")
    cols = [("زمان", 90), ("کاربر", 180), ("اقدام", 220), ("هدف", 320), ("آدرس شبکه", 150)]
    D.table(s, PAD + 20, y + 50, 1080, cols,
            [[time, actor, ("strong", action), target, ip] for time, actor, action, target, ip in rows],
            50)
    s.text(RAIL - 34, y + 512, "نمایش ۸ رویداد از ۲۴ رویداد", "d-caption", C.muted_2, align="right")
    s.text(PAD + 34, y + 512, "صفحهٔ ۱ از ۳", "d-caption", C.muted_2, align="left")

    y += 560
    D.banner(s, PAD, y, 1120,
             "رویدادهای امنیتی (ورود ناموفق، تغییر دسترسی) هرگز حذف نمی‌شوند و در خروجی نیز می‌آیند.",
             "info")
    return s


# --------------------------------------------------------------------------- #
# 02 — alerts & broadcast
# --------------------------------------------------------------------------- #
def alerts():
    s, y = D.page(
        "alerts", "سامانه / هشدارها", "هشدارها و اطلاع‌رسانی",
        "هشدارهای خودکار سامانه و پیام‌های دستی برای گروه‌های امداد.",
        [("علامت‌گذاری همه به‌عنوان خوانده‌شده", "mdi-check-all", "outline")],
    )

    # composer (right column)
    cx, cw = 720, 428
    D.card(s, cx, y, cw, 420, "ارسال اطلاعیه", "mdi-bullhorn-outline")
    s.text(cx + cw - 20, y + 56, "مخاطب", "d-caption-bold", C.muted, align="right")
    D.select(s, cx + 20, y + 78, cw - 40, "همهٔ گروه‌های امداد")
    s.text(cx + cw - 20, y + 136, "موضوع", "d-caption-bold", C.muted, align="right")
    D.field(s, cx + 20, y + 158, cw - 40, "مثلاً قطع موقت سرویس نقشه", "قطع موقت سرویس نقشه",
            None, 44)
    s.text(cx + cw - 20, y + 218, "متن پیام", "d-caption-bold", C.muted, align="right")
    s.rect(cx + 20, y + 240, cw - 40, 96, fill=C.surface, radius=10, outline=A.card_edge)
    s.para(cx + 34, y + 252,
           "سرویس نقشه امروز از ۱۴:۰۰ تا ۱۴:۳۰ در دسترس نیست؛ مسیریابی موقتاً با نقشهٔ ذخیره‌شده "
           "کار می‌کند.",
           "d-sm", C.text_2, align="right", max_width=cw - 68, line_height=20, max_lines=3)
    s.text(cx + cw - 20, y + 350, "ارسال از طریق: اعلان درون‌برنامه‌ای + پیامک", "d-caption",
           C.muted, align="right")
    D._button(s, cx + cw - 20 - 200, y + 372, 200, 40, "ارسال اطلاعیه", "mdi-send", "filled")

    # alert rules under the composer
    ry = y + 440
    D.card(s, cx, ry, cw, 160, "قاعده‌های فعال", "mdi-tune-variant")
    rules = [("SOS بدون پذیرش بیش از ۴ دقیقه", True),
             ("گروه بدون عضو فعال", True),
             ("پاسخ کندتر از آستانهٔ گروه", False)]
    sy = ry + 52
    for label, on in rules:
        s.text(cx + cw - 20, sy + 3, label, "d-sm", C.text_2, align="right", max_width=cw - 96)
        s.toggle(cx + 20, sy - 2, 40, 24, on)
        sy += 36

    # alert list (left)
    lx, lw = PAD, 660
    D.card(s, lx, y, lw, 600, "آخرین هشدارها", "mdi-bell-alert-outline", "تنظیم قاعده‌ها")
    items = [
        ("درخواست SOS بدون پذیرش بیش از ۴ دقیقه", "SOS-۱۴۸۲ · بازار قدیم", "۹:۳۵", "danger",
         "mdi-alert-circle-outline", False),
        ("گروه امداد کوهستان بدون عضو فعال", "۲ جایگاه خالی · تأثیر در ارجاع", "۹:۱۲", "warning",
         "mdi-account-alert-outline", False),
        ("زمان پاسخ گروه هلال احمر از آستانه گذشت", "میانگین ۷:۳۱ در برابر آستانهٔ ۶:۰۰", "۸:۴۰",
         "warning", "mdi-timer-outline", False),
        ("پشتیبان‌گیری شبانه با موفقیت انجام شد", "۴۱۲ مگابایت · پایگاه داده", "۸:۰۰", "success",
         "mdi-check-decagram-outline", True),
        ("ورود ناموفق مکرر به حساب مدیر", "mehdi.r · ۳ تلاش · IP ۹۱٫۹۹٫۱۴٫۲۲", "۷:۴۷", "danger",
         "mdi-shield-alert-outline", True),
    ]
    iy = y + 52
    for title, meta, time, tone, icon, read in items:
        fill = C.surface_2 if read else C.surface
        s.rect(lx + 16, iy, lw - 32, 92, fill=fill, radius=12,
               outline=A.card_edge, outline_w=1)
        color = {"danger": C.danger, "warning": C.warning, "success": C.success}[tone]
        soft = {"danger": C.danger_soft, "warning": C.warning_soft, "success": C.success_soft}[tone]
        s.circle(lx + lw - 50, iy + 50, 18, fill=soft)
        s.i.draw_icon(lx + lw - 50, iy + 50, icon, 19, color)
        s.text(lx + lw - 78, iy + 14, title, "d-label", C.text, align="right", max_width=lw - 150)
        s.text(lx + lw - 78, iy + 38, meta, "d-caption", C.muted, align="right", max_width=lw - 150)
        s.text(lx + lw - 78, iy + 60, time, "d-caption", C.muted_2, align="right")
        if not read:
            s.circle(lx + 24, iy + 30, 4, fill=C.primary)
            s.text(lx + 38, iy + 22, "نخوانده", "d-caption", C.primary, align="left")
        s.text(lx + 38, iy + 54, "مشاهده", "d-caption-bold", C.primary, align="left")
        iy += 100
    return s


# --------------------------------------------------------------------------- #
# 03 — settings
# --------------------------------------------------------------------------- #
def settings():
    s, y = D.page(
        "settings", "سامانه / تنظیمات", "تنظیمات سامانه",
        "آستانه‌ها، دامنهٔ اعزام و کانال‌های اطلاع‌رسانی — تغییرات فوری روی اعزام اثر می‌گذارد.",
        [("ذخیرهٔ تنظیمات", "mdi-content-save-outline", "filled")],
    )

    # right column: operational thresholds
    cx, cw = 600, 548
    D.card(s, cx, y, cw, 300, "آستانه‌های عملیاتی", "mdi-timer-outline")
    rows = [("حداکثر زمان انتظار SOS پیش از هشدار", "۴ دقیقه"),
            ("شعاع پیش‌فرض جست‌وجوی امدادگر", "۵ کیلومتر"),
            ("حداکثر امدادگر پیشنهادی برای هر درخواست", "۶ نفر"),
            ("مهلت پاسخ به پیشنهاد مأموریت", "۹۰ ثانیه")]
    ry = y + 56
    for label, value in rows:
        s.text(cx + cw - 20, ry, label, "d-sm", C.text_2, align="right", max_width=cw - 190)
        s.rect(cx + 20, ry - 4, 120, 32, fill=C.surface_2, radius=8, outline=A.card_edge)
        s.text(cx + 130, ry + 3, value, "d-label", C.text, align="right")
        s.rect(cx + 20, ry + 34, cw - 40, 1, fill=A.row_line)
        ry += 58

    # left column: channels
    lx, lw = PAD, 548
    D.card(s, lx, y, lw, 300, "کانال‌های اطلاع‌رسانی", "mdi-bullhorn-outline")
    channels = [("اعلان درون‌برنامه‌ای برای امدادگران", True),
                ("پیامک برای امدادگران خارج از برنامه", True),
                ("ایمیل روزانهٔ گزارش عملکرد", False),
                ("اعلان صوتی برای درخواست‌های بحرانی", True)]
    ccy = y + 58
    for label, on in channels:
        s.text(lx + lw - 20, ccy + 4, label, "d-sm", C.text_2, align="right", max_width=lw - 90)
        s.toggle(lx + 20, ccy, 44, 26, on)
        s.rect(lx + 20, ccy + 38, lw - 40, 1, fill=A.row_line)
        ccy += 58

    y += 320

    # maintenance & danger zone
    D.card(s, PAD, y, 1120, 210, "نگهداری و وضعیت سامانه", "mdi-cogs")
    s.text(RAIL - 20, y + 56, "حالت تعمیرات", "d-title", C.text, align="right")
    s.text(RAIL - 20, y + 82, "در حالت تعمیرات، درخواست SOS جدید ثبت نمی‌شود و پیام نگهداری "
                              "به کاربران نمایش داده می‌شود.", "d-sm", C.muted, align="right",
           max_width=760)
    s.toggle(PAD + 20, y + 66, 44, 26, False)

    s.rect(PAD + 20, y + 120, 1080, 1, fill=A.row_line)
    s.text(RAIL - 20, y + 138, "پنجرهٔ پشتیبان‌گیری", "d-label", C.text, align="right")
    s.text(RAIL - 20, y + 160, "هر شب ۳:۰۰ — آخرین اجرا: امروز ۳:۰۰ (موفق)", "d-caption",
           C.muted, align="right")
    D._button(s, PAD + 20, y + 142, 190, 40, "اجرای دستی پشتیبان", "mdi-database-outline", "outline")

    y += 230
    D.card(s, PAD, y, 1120, 120)
    s.rect(PAD, y, 4, 120, fill=C.danger, radius=2)
    s.text(RAIL - 20, y + 20, "حساب‌های غیرفعال پس از ۹۰ روز حذف نمی‌شوند", "d-title", C.text,
           align="right")
    s.text(RAIL - 20, y + 48, "داده‌های امداد به‌صورت پیش‌فرض نگه داشته می‌شوند؛ حذف فقط از "
                              "مسیر درخواست رسمی و با ثبت در گزارش رویدادها انجام می‌شود.",
           "d-sm", C.muted, align="right", max_width=880)
    D._button(s, PAD + 20, y + 58, 170, 40, "سیاست نگهداری", "mdi-file-document-outline", "outline")
    return s


SCREENS = {
    "a-sys-audit": ("system/01-audit-log.png", audit),
    "a-sys-alerts": ("system/02-alerts.png", alerts),
    "a-sys-settings": ("system/03-settings.png", settings),
}
