"""System pages: anatomy and invariants, the full state matrix, the same page in dark mode, and mobile widths."""
from __future__ import annotations

import authkit as K
import sections.login as login
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

    Two earlier drafts failed here and both for the same reason: the panel was placed by eye. The frame
    is now centred in a real panel with a caption strip above it, and every marker is anchored to the
    element it names, so the page has no dead band and no marker floating in the margin.
    """
    from PIL import Image

    scale = 0.71
    src_w, src_h = K.W, 900
    src = K.screen(src_h)
    K.chrome(src)
    top = (src.h - K.FRAME_H) / 2
    intro_x, card_x, card_w = K.frame(src, top, K.FRAME_H, INTRO_W, decor=False)
    K.intro(src, intro_x, top, INTRO_W, K.FRAME_H, kicker="ورود امن به بوروبیا",
            title=["با هم،", "آماده‌تر هستیم."],
            copy="وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید و در زمان نیاز، سریع‌تر به کمک برسید.")
    K.trust_row(src, intro_x + 56, top + K.FRAME_H - 56 - 78, INTRO_W - 112,
                "حساب شما امن می‌ماند", "اطلاعات حساب شما محرمانه می‌ماند.",
                "mdi-shield-check-outline")

    left = card_x + 64
    yy = K.card_head(src, left, top + 92, CARD_W - 128, "خوش آمدید", "ورود به حساب",
                     "mdi-account-key-outline")
    head_y = yy - 26
    field_y = yy
    yy = K.field(src, left, yy, CARD_W - 128, "نام کاربری", "saeed.k", "mdi-account-outline")
    yy += 16
    yy = K.field(src, left, yy, CARD_W - 128, "گذرواژه", "••••••••", "mdi-lock-outline",
                 trailing="mdi-eye-outline")
    yy += 14
    src.text(left + CARD_W - 128, yy, "گذرواژه را فراموش کرده‌اید؟", "d-sm", C.primary,
             align="right")
    yy += 40
    submit_y = yy
    K.submit(src, left, yy, CARD_W - 128, "ورود به حساب")
    yy += K.FIELD_H + 38
    K.divider(src, left, yy, CARD_W - 128)
    yy += 30
    K.switch_copy(src, left, yy, CARD_W - 128, "هنوز حساب ندارید؟", "ساخت حساب جدید")
    link_y = yy

    frame_img = src.img.convert("RGB").resize((int(src_w * scale), int(src_h * scale)),
                                              Image.LANCZOS)

    # --- page -----------------------------------------------------------------
    s = K.screen(900)
    K.chrome(s)
    s.text(K.FRAME_X + K.FRAME_W, 100, "آناتومی صفحهٔ ورود", "d-h1", C.text, align="right")
    s.text(K.FRAME_X + K.FRAME_W, 138,
           "ده بلوک، اندازه و رنگ واقعی — صفحه در ۷۱٪ اندازهٔ اصلی.",
           "d-body", C.muted, align="right")

    panel_x, panel_y = 40, 178
    panel_w = frame_img.width + 48
    panel_h = frame_img.height + 48
    s.rect(panel_x, panel_y, panel_w, panel_h, fill="#F7FBF9", radius=18,
           outline="#DCE7E3", outline_w=1)
    fx, fy = panel_x + 24, panel_y + 24
    s.img.paste(frame_img, (fx, fy))
    s.rect(fx, fy, frame_img.width, frame_img.height, fill=None, radius=16, outline="#CFE1DC",
           outline_w=1)

    def at(sx: float, sy: float) -> tuple[float, float]:
        return fx + sx * scale, fy + sy * scale

    # Markers carry their own numbers so the dict order can follow the layout. 3 and 5 used to sit
    # 26px apart on the same edge and touched each other; 3 moved to the intro's other side.
    points = {
        1: (K.FRAME_X + 26, 44),                                   # chrome bar
        2: (K.FRAME_X + 8, top + 14),                              # frame border
        3: (intro_x + INTRO_W - 28, top + 420),                    # intro column
        4: (intro_x + INTRO_W - 62, top + 214),                    # display title
        5: (intro_x + 26, top + K.FRAME_H - 40),                   # trust card
        6: (card_x + 8, top + 300),                                # form column edge
        7: (card_x + card_w - 34, head_y),                         # card head
        8: (card_x + 10, field_y + 26),                            # field
        9: (card_x + 10, submit_y + 26),                           # submit
        10: (card_x + card_w - 34, link_y + 6),                    # link and note
    }
    for number, point in points.items():
        mx, my = at(*point)
        s.circle(mx, my, 13, fill="#0A4B4B", outline="#FFFFFF", outline_w=2.5)
        s.text(mx, my - 9, str(number), "d-caption-bold", "#FFFFFF", align="center")

    # ---- annotation column ---------------------------------------------------
    ax = s.w - 40
    ay = panel_y + 16
    for index, (head, body) in enumerate(ANNOTATIONS, start=1):
        s.circle(ax - 10, ay + 10, 10, fill=C.primary_soft)
        s.text(ax - 10, ay + 2, str(index), "d-caption-bold", C.primary, align="center")
        s.text(ax - 28, ay, head, "d-label", C.text, align="right", max_width=300)
        s.para(ax - 300, ay + 21, body, "d-caption", C.muted, align="right", max_width=272,
               max_lines=2)
        ay += 72
        if index < len(ANNOTATIONS):
            s.rect(ax - 300, ay - 18, 272, 1, fill="#E7EEEA")
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
    pad = 24
    cap = 64                   # pill at +9, note at +38; the card must be taller than both
    gap = 18                   # real air between rows, so no caption sits under the next tile
    tile_w, tile_h = 424, 360
    card_h = tile_h + cap
    band = card_h + gap
    grid_w = cols * tile_w + (cols - 1) * pad
    grid_x = (K.W - grid_w) / 2
    top = 210
    s = K.screen(top + (rows - 1) * band + card_h + pad)
    K.chrome(s)
    s.text(K.FRAME_X + K.FRAME_W, 108, "شش حالت کارت ورود", "d-h1", C.text, align="right")
    s.text(K.FRAME_X + K.FRAME_W, 146,
           "همهٔ حالت‌ها هم‌زمان: پیام، رنگ و رفتار دکمه در یک نگاه.",
           "d-body", C.muted, align="right")

    # Geometry first, drawing second: a tile's soft shadow used to land on the caption band of the tile above it,
    # so every shadow is laid down before any card, and each card clips its pasted screenshot to the radius.
    cells = []
    for index, (label, note, kind) in enumerate(tiles):
        col, row = index % cols, index // cols
        # RTL grid: the first tile is the right-most one on its row
        x = grid_x + grid_w - (col + 1) * tile_w - col * pad
        y = top + row * band
        cells.append((x, y, label, note, kind))

    for x, y, _, _, _ in cells:
        s.shadow(x, y, tile_w, card_h, radius=18, blur=22, dy=6, alpha=22)

    for x, y, label, note, kind in cells:
        s.rect(x, y, tile_w, card_h, fill=C.surface, radius=18, outline=A.card_edge, outline_w=1)
        with s.clip_rounded(x, y, tile_w, tile_h, 18):
            sub = Screen(background="#FFFFFF", width=tile_w, height=tile_h, scale=1)
            left = 22.0
            width = tile_w - 44
            yy = K.card_head(sub, left, 18, width, "خوش آمدید", "ورود به حساب",
                             "mdi-account-key-outline")
            if kind == "registered":
                yy = K.alert(sub, left, yy, width, "حساب شما ساخته شد. برای ادامه وارد شوید.",
                             "success")
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
            s.img.paste(sub.img.convert("RGB"), (int(x), int(y)))

        s.rect(x + 1, y + tile_h, tile_w - 2, 1, fill=A.row_line)
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
    """The same login page under `:root.dark`.

    This plate used to be a second, hand-written drawing of the login screen, and it drifted exactly as fast as
    that implies: the divider lost its 20px gap, the frame lost its 24px corners on the left, and the form sat
    40px off the light page. It is now the *same* `login.login()` drawing run inside `K.theme(dark=True)`, so the
    only difference between plates 01 and 15 is the token table — which is precisely what the CSS does.
    """
    with K.theme(dark=True):
        s = K.screen(900)
        K.chrome(s)
        top = (900 - K.FRAME_H) / 2
        intro_x, card_x, card_w = K.frame(s, top, K.FRAME_H, login.INTRO_W)
        login._intro(s, intro_x, top, login.INTRO_W, K.FRAME_H)
        login._card_form(s, card_x, top + 92, card_w)
    return s



# --------------------------------------------------------------------------- #
# 16 — responsive
# --------------------------------------------------------------------------- #
KICKER = "ورود امن به بوروبیا"
HERO_COPY = "وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید."
TRUST_TITLE = "حساب شما امن می‌ماند"
TRUST_BODY = "اطلاعات حساب شما محرمانه می‌ماند."


def _kicker(s: Screen, right: float, y: float):
    kw = s.tw(KICKER, "d-label") + 46
    with K.translucent(s):
        s.rect(right - kw, y, kw, 32, fill=(255, 255, 255, 30), radius=16,
               outline=(255, 255, 255, 71), outline_w=1)
    s.circle(right - 18, y + 16, 3.5, fill="#F4D796")
    s.text(right - 30, y + 7, KICKER, "d-label", "#FFFFFF", align="right")


def _intro_block(s: Screen, x: float, y: float, w: float, compact: bool) -> float:
    """`.auth-intro` when the grid has collapsed: full width, `min-height: 0`, padding 2rem / 1.5rem.

    The height is measured before anything is drawn — the gradient has to cover exactly the block the copy
    occupies, and painting it afterwards would erase the copy.
    """
    pad = 24 if compact else 32
    inner = w - pad * 2
    style = "d-h2" if compact else "d-h1"
    line_h = 30 if compact else 34
    copy_style = "d-sm" if compact else "d-body"
    copy_lines = K._line_count(HERO_COPY, copy_style, inner)
    trust_h = max(74, 20 + 20 + K._line_count(TRUST_BODY, "d-caption", inner - 88) * 17 + 16)
    height = (pad + 32 + 14 + line_h * 2 + 8
              + copy_lines * (19 if compact else 22) + 18 + trust_h + pad)

    with s.clip_rounded(x, y, w, height, 0):
        K.gradient_v(s, x, y, w, height, K.INTRO)
        right = x + w - pad
        _kicker(s, right, y + pad)
        ty = y + pad + 46
        s.text(right, ty, "با هم،", style, "#FFFFFF", align="right", max_width=inner)
        s.text(right, ty + line_h, "آماده‌تر هستیم.", style, "#F4D796", align="right",
               max_width=inner)
        s.para(x + pad, ty + line_h * 2 - 4, HERO_COPY, copy_style, "#D9EEEA", align="right",
               max_width=inner, max_lines=copy_lines)
        K.trust_row(s, x + pad, y + height - pad - trust_h, inner, TRUST_TITLE, TRUST_BODY,
                    "mdi-shield-check-outline")
    return height


def _intro_column(s: Screen, x: float, y: float, w: float, h: float, compact: bool):
    """The teal column of the two-column layout: kicker, display title, copy, trust card at the foot."""
    pad = 24 if compact else 56
    inner = w - pad * 2
    with s.clip_rounded(x, y, w, h, 0):
        K.gradient_v(s, x, y, w, h, K.INTRO)
        right = x + w - pad
        _kicker(s, right, y + pad)
        s.text(right, y + pad + 52, "با هم،", "d-display", "#FFFFFF", align="right",
               max_width=inner)
        s.text(right, y + pad + 96, "آماده‌تر هستیم.", "d-display", "#F4D796", align="right",
               max_width=inner)
        s.para(x + pad, y + pad + 158, HERO_COPY, "d-body", "#D9EEEA", align="right",
               max_width=inner, max_lines=2)
        trust_h = max(74, 20 + 20 + K._line_count(TRUST_BODY, "d-caption", inner - 88) * 17 + 16)
        K.trust_row(s, x + pad, y + h - pad - trust_h, inner, TRUST_TITLE, TRUST_BODY,
                    "mdi-shield-check-outline")


def _form_column(s: Screen, x: float, y: float, w: float, compact: bool):
    """`.auth-card-body`: padding clamp(2rem, 5vw, 4rem); 1.5rem under 560."""
    pad = 24 if compact else (40 if w < 620 else 56)
    left = x + pad
    width = w - pad * 2
    if width < 220:
        return
    yy = y + (24 if compact else pad)

    tile = 44 if compact else 52
    s.rect(left + width - tile, yy, tile, tile, fill=C.tile_fill,
           radius=14 if compact else 17, outline=C.tile_edge, outline_w=1)
    s.i.draw_icon(left + width - tile / 2, yy + tile / 2, "mdi-account-key-outline",
                  21 if compact else 25, C.primary)
    s.text(left + width - tile - 14, yy + 2, "خوش آمدید", "d-sm", C.muted, align="right",
           max_width=width - tile - 20)
    s.text(left + width - tile - 14, yy + 20, "ورود به حساب",
           "d-title" if compact else "d-h2", C.ink, align="right", max_width=width - tile - 20)
    yy += tile + (18 if compact else 26)

    fh = 46 if compact else 52
    for label, value, icon, trailing in (("نام کاربری", "saeed.k", "mdi-account-outline", None),
                                         ("گذرواژه", "••••••••", "mdi-lock-outline",
                                          "mdi-eye-outline")):
        s.rect(left, yy, width, fh, fill=C.field_fill, radius=8, outline=C.field_edge,
               outline_w=1)
        right = left + width - 12
        s.i.draw_icon(right - 8, yy + fh / 2, icon, 16, C.muted_2)
        right -= 28
        if trailing:
            s.i.draw_icon(left + 20, yy + fh / 2, trailing, 16, C.muted)
        lab_w = s.tw(label, "d-caption") + 12
        s.rect(right - lab_w, yy - 8, lab_w, 16, fill=C.field_fill)
        s.text(right, yy - 9, label, "d-caption", C.primary, align="right")
        s.text(right, yy + (fh - 20) / 2, value, "d-sm", C.text, align="right",
               max_width=right - left - (34 if trailing else 12))
        yy += fh + (10 if compact else 16)

    s.text(left + width, yy, "گذرواژه را فراموش کرده‌اید؟", "d-caption" if compact else "d-sm",
           C.primary, align="right")
    yy += 24 if compact else 38

    cta_h = 50 if compact else 52
    s.rect(left, yy, width, cta_h, fill=C.primary, radius=9)
    s.text(left + width / 2, yy + (15 if compact else 16), "ورود به حساب",
           "d-label" if compact else "d-label-lg", "#FFFFFF", align="center")
    yy += cta_h + (22 if compact else 36)

    mid = left + width / 2
    s.rect(left, yy, width / 2 - 20, 1, fill=C.line)
    s.rect(mid + 20, yy, width / 2 - 20, 1, fill=C.line)
    s.text(mid, yy - 9, "یا", "d-caption", C.line_ink, align="center")
    yy += 24

    lead, link = "هنوز حساب ندارید؟", "ساخت حساب جدید"
    total = s.tw(lead + " ", "d-sm") + s.tw(link, "d-label")
    right = left + (width + total) / 2
    s.text(right, yy, link, "d-label", C.primary, align="right")
    s.text(right - s.tw(link, "d-label") - 6, yy, lead, "d-sm", C.switch_lead, align="right")


def _auth_viewport(w: int, h: int) -> Screen:
    """The login page rendered at a real viewport width, following the two breakpoints in `auth.css`.

    `@media (max-width: 900px)` turns the two-column grid into one column (the intro stacks above the form and
    its `min-height` is dropped); `@media (max-width: 560px)` tightens the paddings, shrinks the title, hides
    `.auth-decoration` and collapses the chrome. Both live here once, and all three devices on plate 16 are
    rendered by this one function — so the plate cannot claim a layout the stylesheet does not produce.
    """
    compact = w <= 560
    stacked = w <= 900
    page_radius = 20 if compact else 24
    pad = 12 if compact else 24
    chrome_h = 76 if compact else 88

    s = Screen(background=C.page, width=w, height=h, scale=1)

    if compact:
        s.rect(w - 14 - 34, 21, 34, 34, fill=C.brand_tile, radius=11)
        s.i.draw_icon(w - 14 - 17, 38, "mdi-plus", 19, "#FFFFFF")
        s.text(w - 64, 22, "بوروبیا", "d-label", "#173B3C", align="right")
        s.rect(14, 22, 32, 32, fill="#FFFFFF", radius=16, outline="#D8E4E0", outline_w=1)
        s.i.draw_icon(30, 38, "mdi-weather-night", 15, "#214C49")
    else:
        s.rect(w - pad - 42, 23, 42, 42, fill=C.brand_tile, radius=13)
        s.i.draw_icon(w - pad - 21, 44, "mdi-plus", 24, "#FFFFFF")
        s.text(w - pad - 54, 22, "بوروبیا", "d-h2", "#173B3C", align="right")
        pill = s.tw("صفحهٔ اصلی", "d-label") + 62
        K._pill_link(s, pad, 24, pill, "صفحهٔ اصلی", "mdi-arrow-left")
        s.rect(pad + pill + 12, 22, 44, 44, fill="#FFFFFF", radius=22, outline="#D8E4E0",
               outline_w=1)
        s.i.draw_icon(pad + pill + 34, 44, "mdi-weather-night", 20, "#214C49")

    fx, fw = pad, w - pad * 2
    top = chrome_h + (10 if compact else 24)
    bottom = h - (10 if compact else 24)
    s.shadow(fx, top, fw, bottom - top, radius=page_radius, blur=30, dy=10, alpha=36)
    s.rect(fx, top, fw, bottom - top, fill="#FFFFFF", radius=page_radius, outline="#CFE1DC",
           outline_w=1)
    with s.clip_rounded(fx, top, fw, bottom - top, page_radius):
        s.rect(fx, top, fw, bottom - top, fill="#FFFFFF")

    if stacked:
        intro_h = _intro_block(s, fx, top, fw, compact)
        _form_column(s, fx, top + intro_h, fw, compact)
    else:
        intro_w = round(fw * 0.40)
        _intro_column(s, fx + fw - intro_w, top, intro_w, bottom - top, compact)
        _form_column(s, fx, top, fw - intro_w, compact)
    return s


def _device(s: Screen, x: float, y: float, w: float, h: float, label: str, note: str):
    """One real viewport at 1:1, pasted into the plate with a hairline so it reads as a screen."""
    view = _auth_viewport(int(w), int(h))
    s.shadow(x, y, w, h, radius=22, blur=26, dy=8, alpha=34)
    with s.clip_rounded(x, y, w, h, 22):
        s.img.paste(view.img.convert("RGB"), (int(x), int(y)))
    s.rect(x, y, w, h, fill=None, radius=22, outline="#C9DAD5", outline_w=1)


def responsive():
    """Phone, tablet and desktop at their real widths, all three drawn by the same renderer."""
    specs = [
        ("۴۲۰ × ۸۴۴", 420, 844, "موبایل — تک‌ستون؛ معرفی بالای فرم، تزئین پنهان، نوار ۴٫۷۵rem"),
        ("۹۰۰ × ۹۰۰", 900, 900, "تبلت — روی نقطهٔ شکست ۹۰۰: معرفی و فرم زیر هم، بدون min-height"),
        ("۱۳۶۶ × ۷۶۸", 1366, 768, "دسکتاپ — دو ستون، معرفی ۴۰٪ از سمت راست"),
    ]
    gap = 32
    total = sum(sp[1] for sp in specs) + gap * (len(specs) - 1)
    canvas_w = int(total + 128)
    x = (canvas_w - total) / 2
    # the sheet has to hold the tallest device *and* its caption line
    top = 196
    height = K.snap(top + max(sp[2] for sp in specs) + 26 + 17 + 26)
    s = Screen(background="#E9F1EE", width=canvas_w, height=height, scale=1)
    s.text(canvas_w / 2, 44, "همان صفحه در سه عرض", "d-h1", C.text, align="center")
    s.text(canvas_w / 2, 80,
           "۴۲۰ · ۹۰۰ · ۱۳۶۶ پیکسل — هیچ چیز پنهان نمی‌شود، فقط جمع می‌شود.",
           "d-body", C.muted, align="center")
    for label, width, box_h, note in specs:
        s.text(x + width / 2, top - 34, label, "d-caption-bold", C.muted_2, align="center")
        _device(s, x, top, width, box_h, label, note)
        s.text(x + width / 2, top + box_h + 26, note, "d-caption", C.muted, align="center",
               max_width=width + gap - 8)
        x += width + gap
    return s


SCREENS = {
    "a-auth-anatomy": ("13-anatomy.png", anatomy),
    "a-auth-states": ("14-states.png", states),
    "a-auth-dark": ("15-dark.png", dark),
    "a-auth-responsive": ("16-responsive.png", responsive),
}
