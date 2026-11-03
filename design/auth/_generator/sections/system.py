"""System pages: anatomy and invariants, the full state matrix, the same page in dark mode, and mobile widths."""
from __future__ import annotations

import authkit as K
from authkit import A, C, Screen

INTRO_W = 500
CARD_W = K.FRAME_W - INTRO_W
FORM_W = 440


# --------------------------------------------------------------------------- #
# 13 — anatomy
# --------------------------------------------------------------------------- #
ANNOTATIONS = [
    ("نوار بالا", "۹۶ پیکسل؛ برند راست، تم و «صفحهٔ اصلی» چپ. هم‌عرض قاب."),
    ("قاب دوستونی", "شعاع ۲۴، حاشیهٔ ۱ پیکسل #CFE1DC، سایهٔ نرم ۴۴."),
    ("ستون معرفی", "۵۰۰ پیکسل از سمت راست؛ گرادیان ۱۵۵ درجه، بدون حاشیه."),
    ("تیتر نمایشی", "۳۰/۴۴ پیکسل؛ خط دوم با رنگ تأکید #F4D796."),
    ("کارت اعتماد", "پایین چسبیده؛ پس‌زمینهٔ ۱۰٪ سفید، ارتفاع از متن."),
    ("ستون فرم", "۷۴۸ پیکسل؛ فرم ۴۴۰ پیکسل، از لبهٔ راست‌خوان شروع می‌شود."),
    ("سر کارت", "آیکن ۵۲، برچسب ۱۲.۵، تیتر ۱۹؛ فاصلهٔ ۲۶ تا فیلد."),
    ("فیلد", "۵۲ پیکسل، شعاع ۸؛ برچسب هنگام پرشدن داخل حاشیه می‌رود."),
    ("دکمه", "۵۲ پیکسل، شعاع ۱۰، سایهٔ ۵۴٪؛ تمام‌عرض فرم."),
    ("پیوند و یادداشت", "پیوند ۱۲ پی‌اس، یادداشت ۱۱.۵ با آیکن قفل."),
]


def anatomy():
    """The login frame at 71% on the left, one numbered annotation per block on the right.

    The earlier version hung its labels outside the canvas; a reference page has to be readable at
    its own edges, so the frame is scaled down and the notes get a real column.
    """
    from PIL import Image

    s = K.screen(1080)
    K.chrome(s)
    s.text(K.FRAME_X + K.FRAME_W, 108, "آناتومی صفحهٔ ورود", "d-h1", C.text, align="right")
    s.text(K.FRAME_X + K.FRAME_W, 146,
           "ده بلوک، اندازه‌های واقعی و رنگ‌هایی که کد امروز استفاده می‌کند.",
           "d-body", C.muted, align="right")

    # ---- the frame, drawn once on its own canvas and pasted at 71% ----
    scale = 0.71
    src_w, src_h = K.W, 900
    sub = K.screen(src_h)
    K.chrome(sub)
    top = (src_h - K.FRAME_H) / 2
    intro_x, card_x, card_w = K.frame(sub, top, K.FRAME_H, INTRO_W, decor=False)
    K.intro(sub, intro_x, top, INTRO_W, K.FRAME_H, kicker="ورود امن به بوروبیا",
            title=["با هم،", "آماده‌تر هستیم."],
            copy="وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید و در زمان نیاز، سریع‌تر به کمک برسید.")
    K.trust_row(sub, intro_x + 56, top + K.FRAME_H - 56 - 78, INTRO_W - 112,
                "حساب شما امن می‌ماند", "اطلاعات حساب شما محرمانه می‌ماند.",
                "mdi-shield-check-outline")
    left = card_x + 64
    anchors = {}
    yy = K.card_head(sub, left, top + 92, CARD_W - 128, "خوش آمدید", "ورود به حساب",
                     "mdi-account-key-outline")
    anchors["head"] = (card_x + card_w - 30, top + 118)
    field_y = yy
    yy = K.field(sub, left, yy, CARD_W - 128, "نام کاربری", "saeed.k", "mdi-account-outline")
    anchors["field"] = (card_x + 10, field_y + 26)
    yy += 16
    yy = K.field(sub, left, yy, CARD_W - 128, "گذرواژه", "••••••••", "mdi-lock-outline",
                 trailing="mdi-eye-outline")
    yy += 14
    sub.text(left + CARD_W - 128, yy, "گذرواژه را فراموش کرده‌اید؟", "d-sm", C.primary,
             align="right")
    yy += 40
    submit_y = yy
    K.submit(sub, left, yy, CARD_W - 128, "ورود به حساب")
    anchors["submit"] = (card_x + 10, submit_y + 26)
    yy += K.FIELD_H + 38
    K.divider(sub, left, yy, CARD_W - 128)
    yy += 30
    K.switch_copy(sub, left, yy, CARD_W - 128, "هنوز حساب ندارید؟", "ساخت حساب جدید")
    anchors["link"] = (card_x + card_w - 30, yy + 6)
    yy += 28
    K.privacy_note(sub, left, yy, CARD_W - 128, "اطلاعات حساب شما محرمانه می‌ماند.")

    scaled = sub.img.convert("RGB").resize((int(src_w * scale), int(src_h * scale)),
                                           Image.LANCZOS)
    fx, fy = 40, 200
    s.img.paste(scaled, (fx, fy))
    s.rect(fx, fy, scaled.width, scaled.height, fill=None, radius=16, outline="#CFE1DC",
           outline_w=1)

    """Anchor every marker to the thing it names, recorded while drawing it.

    Two earlier attempts hand-computed these points and both drifted: the first scaled source
    coordinates along with the bitmap, the second guessed y offsets and ended up labelling the
    submit button as the form column. A marker is only useful if it is on the element.
    """
    def at(point: tuple[float, float]) -> tuple[float, float]:
        return fx + point[0] * scale, fy + point[1] * scale

    points = {
        1: (K.FRAME_X + 24, 44),                                   # chrome bar
        2: (K.FRAME_X + 6, top + 10),                              # frame border
        3: (intro_x + 30, top + 430),                              # intro column
        4: (intro_x + INTRO_W - 60, top + 212),                     # display title
        5: (intro_x + 24, top + K.FRAME_H - 42),                   # trust card
        6: (card_x + 5, top + 300),                                # form column edge
        7: anchors["head"],                                        # card head
        8: anchors["field"],                                       # field
        9: anchors["submit"],                                      # submit
        10: anchors["link"],                                       # link and note
    }
    for number, point in points.items():
        mx, my = at(point)
        s.circle(mx, my, 13, fill="#0A4B4B", outline="#FFFFFF", outline_w=2.5)
        s.text(mx, my - 9, str(number), "d-caption-bold", "#FFFFFF", align="center")

    # ---- annotation column ----
    ax = s.w - 40
    ay = fy + 4
    for index, (head, body) in enumerate(ANNOTATIONS, start=1):
        s.circle(ax - 10, ay + 10, 10, fill=C.primary_soft)
        s.text(ax - 10, ay + 2, str(index), "d-caption-bold", C.primary, align="center")
        s.text(ax - 28, ay, head, "d-label", C.text, align="right", max_width=300)
        s.para(ax - 300, ay + 21, body, "d-caption", C.muted, align="right", max_width=272,
               max_lines=2)
        ay += 52
        if index < len(ANNOTATIONS):
            s.rect(ax - 300, ay - 16, 272, 1, fill="#E7EEEA")
    return s


# --------------------------------------------------------------------------- #
# 14 — state matrix
# --------------------------------------------------------------------------- #
def states():
    """Six card states at once, at 62% scale, so the set can be compared rather than paged through."""
    from PIL import Image

    tiles = [
        ("خالی", "تا وقتی هر دو فیلد پر نشده، دکمه غیرفعال است.", "idle-empty"),
        ("در حال ارسال", "دکمه در حالت بارگذاری؛ فرم قفل می‌شود.", "loading"),
        ("خطای اعتبارنامه", "پیام خطا بالای فرم، بدون پاک کردن مقدارها.", "error"),
        ("حساب ساخته شد", "بازگشت از ثبت‌نام با پیام موفقیت.", "registered"),
        ("گذرواژه تغییر کرد", "بازگشت از بازیابی با پیام موفقیت.", "reset"),
        ("قفل موقت", "پس از چند تلاش ناموفق، ورود موقتاً بسته است.", "locked"),
    ]
    cols, rows = 3, 2
    pad, cap = 24, 44
    tile_w, tile_h = 424, 360
    band = cap + pad
    grid_w = cols * tile_w + (cols - 1) * pad
    grid_x = (K.W - grid_w) / 2
    top = 210
    s = K.screen(top + rows * (tile_h + band) + pad)
    K.chrome(s)
    s.text(K.FRAME_X + K.FRAME_W, 108, "شش حالت کارت ورود", "d-h1", C.text, align="right")
    s.text(K.FRAME_X + K.FRAME_W, 146,
           "همهٔ حالت‌ها هم‌زمان: پیام، رنگ و رفتار دکمه در یک نگاه.",
           "d-body", C.muted, align="right")

    for index, (label, note, kind) in enumerate(tiles):
        col, row = index % cols, index // cols
        # RTL grid: the first tile is the right-most one on its row
        x = grid_x + grid_w - (col + 1) * tile_w - col * pad
        y = top + row * (tile_h + band)

        sub = Screen(background="#FFFFFF", width=tile_w, height=tile_h, scale=1)
        left = 22.0
        width = tile_w - 44
        scale_font = True
        yy = K.card_head(sub, left, 18, width, "خوش آمدید", "ورود به حساب",
                         "mdi-account-key-outline")
        if kind == "registered":
            yy = K.alert(sub, left, yy, width, "حساب شما ساخته شد. برای ادامه وارد شوید.", "success")
        elif kind == "reset":
            yy = K.alert(sub, left, yy, width, "گذرواژه با موفقیت تغییر کرد.", "success")
        elif kind == "error":
            yy = K.alert(sub, left, yy, width, "نام کاربری یا گذرواژه درست نیست.", "error")
        elif kind == "locked":
            yy = K.alert(sub, left, yy, width, "ورود موقتاً قفل شده است.", "warning")
        broken = kind in ("error", "locked")
        yy = K.field(sub, left, yy, width, "نام کاربری", "" if broken else "saeed.k",
                     "mdi-account-outline", state="error" if broken else "idle")
        yy += 10
        yy = K.field(sub, left, yy, width, "گذرواژه", "••••••••", "mdi-lock-outline",
                     trailing="mdi-eye-outline")
        yy += 12
        assert yy + 52 <= tile_h, f"tile overflow: submit ends at {yy + 52}"
        button = {"loading": "loading", "idle-empty": "disabled", "locked": "disabled"}.get(
            kind, "idle")
        K.submit(sub, left, yy, width, "ورود به حساب", state=button)

        s.shadow(x, y, tile_w, tile_h + band, radius=18, blur=22, dy=6, alpha=22)
        s.rect(x, y, tile_w, tile_h + band, fill=C.surface, radius=18, outline=A.card_edge,
               outline_w=1)
        s.img.paste(sub.img.convert("RGB"), (int(x), int(y)))
        s.rect(x, y + tile_h, tile_w, 1, fill=A.row_line)
        # state tone is carried by the pill, not by a bar that collides with the note
        tone = {"error": "danger", "locked": "warning", "registered": "success",
                "reset": "success"}.get(kind)
        lw = 18 + s.tw(label, "d-label")
        if tone:
            s.rect(x + tile_w - 12 - lw, y + tile_h + 9, lw, 24,
                   fill={"danger": C.danger_soft, "warning": C.warning_soft,
                         "success": C.success_soft}[tone], radius=12)
            s.text(x + tile_w - 24, y + tile_h + 12, label, "d-label",
                   {"danger": C.danger, "warning": C.warning, "success": C.success}[tone],
                   align="right")
        else:
            s.text(x + tile_w - 12, y + tile_h + 12, label, "d-label", C.text, align="right")
        s.text(x + tile_w - 12, y + tile_h + 38, note, "d-caption", C.muted, align="right",
               max_width=tile_w - 24)
    return s


# --------------------------------------------------------------------------- #
# 15 — dark mode
# --------------------------------------------------------------------------- #
DARK_BG = "#101D1E"
DARK_SURFACE = "#1B292A"


def dark():
    """The same login page under `:root.dark`, with the tokens the CSS actually swaps."""
    s = Screen(background=DARK_BG, width=K.W, height=900, scale=1)
    K.chrome(s, dark=True)
    top = (900 - K.FRAME_H) / 2

    # frame: one dark surface, hairline #46615D, no white column
    x, w = K.FRAME_X, K.FRAME_W
    s.shadow(x, top, w, K.FRAME_H, radius=K.RADIUS, blur=44, dy=12, alpha=120)
    s.rect(x, top, w, K.FRAME_H, fill=DARK_SURFACE, radius=K.RADIUS, outline="#46615D",
           outline_w=1)
    intro_x = x + w - INTRO_W
    with s.clip_rounded(x, top, w, K.FRAME_H, K.RADIUS):
        s.rect(x, top, w, K.FRAME_H, fill=DARK_SURFACE)
        K.gradient_v(s, intro_x, top, INTRO_W, K.FRAME_H,
                     ("#103B3C", "#1B3535", "#282F35"))

    # intro copy: the same block, in dark-mode colours
    pad = 56
    right = intro_x + INTRO_W - pad
    kw = s.tw("ورود امن به بوروبیا", "d-label") + 46
    with K.translucent(s):
        s.rect(right - kw, top + pad, kw, 34, fill=(255, 255, 255, 30), radius=17,
               outline=(255, 255, 255, 71), outline_w=1)
    s.circle(right - 18, top + pad + 17, 3.5, fill="#F4D796")
    s.text(right - 30, top + pad + 7, "ورود امن به بوروبیا", "d-label", "#FFFFFF", align="right")
    s.text(right, top + pad + 62, "با هم،", "d-display", "#FFFFFF", align="right")
    s.text(right, top + pad + 106, "آماده‌تر هستیم.", "d-display", "#F4D796", align="right")
    s.para(intro_x + pad, top + pad + 170,
           "وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید و در زمان نیاز، سریع‌تر به کمک برسید.",
           "d-body", "#D9EEEA", align="right", max_width=INTRO_W - 2 * pad, max_lines=3)
    K.trust_row(s, intro_x + pad, top + K.FRAME_H - 56 - 74, INTRO_W - 2 * pad,
                "حساب شما امن می‌ماند", "اطلاعات حساب شما محرمانه می‌ماند.",
                "mdi-shield-check-outline")

    left = x + (CARD_W - FORM_W) / 2
    s.rect(x, top + 1, CARD_W - 2, K.FRAME_H - 2, fill=DARK_SURFACE)
    y = top + 92
    # card head, dark
    s.rect(left + FORM_W - 52, y, 52, 52, fill="#203536", radius=17, outline="#3A5350",
           outline_w=1)
    s.i.draw_icon(left + FORM_W - 26, y + 26, "mdi-account-key-outline", 25, "#71C7BE")
    s.text(left + FORM_W - 68, y + 2, "خوش آمدید", "d-sm", "#9DB4B0", align="right")
    s.text(left + FORM_W - 68, y + 22, "ورود به حساب", "d-h2", "#EDF5F2", align="right")
    y += 52 + 26

    for label, value, icon, trailing in (("نام کاربری", "saeed.k", "mdi-account-outline", None),
                                         ("گذرواژه", "••••••••", "mdi-lock-outline",
                                          "mdi-eye-outline")):
        s.rect(left, y, FORM_W, K.FIELD_H, fill="#16252A", radius=K.FIELD_R, outline="#405B57",
               outline_w=1)
        right = left + FORM_W - 14
        s.i.draw_icon(right - 8, y + K.FIELD_H / 2, icon, 18, "#89A5A0")
        right -= 30
        if trailing:
            s.i.draw_icon(left + 22, y + K.FIELD_H / 2, trailing, 18, "#89A5A0")
        s.rect(right - s.tw(label, "d-caption") - 6, y - 8, s.tw(label, "d-caption") + 12, 16,
               fill="#16252A")
        s.text(right, y - 9, label, "d-caption", "#71C7BE", align="right")
        s.text(right, y + (K.FIELD_H - 21) / 2, value, "d-body", "#EDF5F2", align="right")
        y += K.FIELD_H + 16

    s.text(left + FORM_W, y, "گذرواژه را فراموش کرده‌اید؟", "d-sm", "#71C7BE", align="right")
    y += 40
    K.submit(s, left, y, FORM_W, "ورود به حساب")
    y += K.FIELD_H + 38
    s.rect(left, y, FORM_W, 1, fill="#33494A")
    s.text(left + FORM_W / 2, y - 9, "یا", "d-caption", "#7E9490", align="center")
    y += 30
    K.switch_copy(s, left, y, FORM_W, "هنوز حساب ندارید؟", "ساخت حساب جدید")
    y += 28
    K.privacy_note(s, left, y, FORM_W, "اطلاعات حساب شما محرمانه می‌ماند.")
    return s


# --------------------------------------------------------------------------- #
# 16 — responsive
# --------------------------------------------------------------------------- #
def responsive():
    """Phone, tablet and desktop side by side, each drawn at its real width."""
    # Heights are drawn shorter than life: this page compares proportions, and a life-size
    # desktop would push the row past the canvas.
    specs = [("۴۲۰", 420, 620, "موبایل: معرفی جمع می‌شود"),
             ("۹۰۰", 900, 540, "تبلت: دو ستون، معرفی باریک"),
             ("۱۳۶۶", 1250, 500, "دسکتاپ: دو ستون کامل")]
    gap = 26
    total = sum(sp[1] for sp in specs) + gap * (len(specs) - 1)
    canvas_w = total + 96
    s = K.screen(1020, background="#E9F1EE", width=int(canvas_w))
    s.text(canvas_w / 2, 40, "همان صفحه در سه عرض", "d-h1", C.text, align="center")
    s.text(canvas_w / 2, 76,
           "۴۲۰ · ۹۰۰ · ۱۳۶۶ پیکسل — هیچ چیز پنهان نمی‌شود، فقط جمع می‌شود.",
           "d-body", C.muted, align="center")
    x = (canvas_w - total) / 2
    top = 132
    for label, width, height, note in specs:
        s.text(x + width / 2, top - 26, label, "d-caption-bold", C.muted_2, align="center")
        _device(s, x, top, width, height, label, note)
        s.text(x + width / 2, top + height + 24, note, "d-caption", C.muted, align="center",
               max_width=width)
        x += width + gap
    return s


def _comment(s: Screen, x: float, y: float, text: str, align: str = "left"):
    """A quiet page-level note that explains what changes at this width."""
    s.text(x, y, text, "d-caption", C.muted, align=align)


def _device(s: Screen, x: float, y: float, w: float, h: float, label: str, note: str):
    """One width, drawn the way the CSS actually collapses at it."""
    mobile = w < 600
    s.shadow(x, y, w, h, radius=20, blur=26, dy=8, alpha=30)
    s.rect(x, y, w, h, fill="#FFFFFF", radius=20, outline="#CFE1DC", outline_w=1)

    with s.clip_rounded(x, y, w, h, 20):
        if mobile:
            # chrome collapses to mark + theme toggle; the intro moves above the form
            s.rect(x, y, w, 62, fill="#F7FBF9")
            s.rect(x + w - 32, y + 15, 30, 30, fill=C.primary, radius=9)
            s.i.draw_icon(x + w - 17, y + 30, "mdi-plus", 17, "#FFFFFF")
            s.text(x + w - 42, y + 15, "بوروبیا", "d-label", "#173B3C", align="right")
            s.rect(x + 16, y + 15, 32, 32, fill="#FFFFFF", radius=16, outline="#D8E4E0",
                   outline_w=1)
            s.i.draw_icon(x + 32, y + 31, "mdi-weather-night", 15, "#214C49")

            s.text(x + w - 20, y + 92, "با هم، آماده‌تر هستیم.", "d-h2", C.text, align="right",
                   max_width=w - 40)
            s.para(x + 20, y + 126,
                   "وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید.",
                   "d-sm", C.muted, align="right", max_width=w - 40, max_lines=2)

            fy = y + 190
            fw = w - 40
            for field_label, icon, trailing in (("نام کاربری", "mdi-account-outline", None),
                                                ("گذرواژه", "mdi-lock-outline",
                                                 "mdi-eye-outline")):
                s.rect(x + 20, fy, fw, 48, fill="#FFFFFF", radius=8, outline="#C9D6D2",
                       outline_w=1)
                s.i.draw_icon(x + fw - 8, fy + 24, icon, 16, C.muted_2)
                if trailing:
                    s.i.draw_icon(x + 38, fy + 24, trailing, 16, C.muted)
                s.text(x + fw - 24, fy + 14, field_label, "d-sm", C.muted_2, align="right")
                fy += 48 + 12
            fy += 6
            s.text(x + fw + 20, fy, "گذرواژه را فراموش کرده‌اید؟", "d-caption", C.primary,
                   align="right")
            fy += 30
            s.rect(x + 20, fy, fw, 50, fill=C.primary, radius=9)
            s.text(x + 20 + fw / 2, fy + 15, "ورود به حساب", "d-label", "#FFFFFF",
                   align="center")
            fy += 66
            s.text(x + 20 + fw / 2, fy, "هنوز حساب ندارید؟ ساخت حساب جدید", "d-caption", C.muted,
                   align="center", max_width=fw)
        else:
            frame_x, frame_y, frame_w = x + 16, y + 16, w - 32
            frame_h = h - 32
            intro_w = frame_w * (0.40 if w < 1000 else 0.38)
            s.rect(frame_x, frame_y, frame_w, frame_h, fill="#FFFFFF", radius=14,
                   outline="#CFE1DC", outline_w=1)
            ix = frame_x + frame_w - intro_w
            with s.clip_rounded(frame_x, frame_y, frame_w, frame_h, 14):
                K.gradient_v(s, ix, frame_y, intro_w, frame_h, K.INTRO)
            s.text(ix + intro_w - 26, frame_y + 34, "با هم،", "d-h2", "#FFFFFF", align="right")
            s.text(ix + intro_w - 26, frame_y + 66, "آماده‌تر هستیم.", "d-h2", "#F4D796",
                   align="right")
            s.para(ix + 26, frame_y + 110,
                   "وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید.",
                   "d-sm", "#D9EEEA", align="right", max_width=intro_w - 52, max_lines=3)

            cx = frame_x + 28
            cw = frame_w - intro_w - 56
            cy = frame_y + 44
            s.text(cx + cw, cy, "ورود به حساب", "d-h2", C.text, align="right")
            cy += 48
            for field_label, icon in (("نام کاربری", "mdi-account-outline"),
                                      ("گذرواژه", "mdi-lock-outline")):
                s.rect(cx, cy, cw, 44, fill="#FFFFFF", radius=8, outline="#C9D6D2",
                       outline_w=1)
                s.i.draw_icon(cx + cw - 20, cy + 22, icon, 15, C.muted_2)
                s.text(cx + cw - 34, cy + 13, field_label, "d-sm", C.muted_2, align="right")
                cy += 44 + 10
            cy += 8
            s.rect(cx, cy, cw, 46, fill=C.primary, radius=9)
            s.text(cx + cw / 2, cy + 13, "ورود به حساب", "d-label", "#FFFFFF", align="center")
            cy += 64
            s.text(cx + cw, cy, "گذرواژه را فراموش کرده‌اید؟", "d-caption", C.primary,
                   align="right")
            cy += 22
            s.text(cx + cw, cy, "هنوز حساب ندارید؟ ساخت حساب جدید", "d-caption", C.muted,
                   align="right", max_width=cw)


SCREENS = {
    "a-auth-anatomy": ("13-anatomy.png", anatomy),
    "a-auth-states": ("14-states.png", states),
    "a-auth-dark": ("15-dark.png", dark),
    "a-auth-responsive": ("16-responsive.png", responsive),
}
