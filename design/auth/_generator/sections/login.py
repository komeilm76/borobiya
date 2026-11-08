"""Login: the page itself, then the four states its card can be in."""
from __future__ import annotations

import math

import authkit as K
from authkit import A, C, Screen

# Physical geometry shared by every login page.
INTRO_W = 500
FORM_W = 440
CARD_W = K.FRAME_W - INTRO_W
CARD_RIGHT_PAD = 110          # the form column keeps a generous gutter, as the CSS clamp does


def _frame_top(height: int) -> float:
    return K.CHROME_H + (height - K.CHROME_H - K.FRAME_H) / 2


def _intro(s: Screen, x: float, y: float, w: float, h: float):
    K.intro(
        s, x, y, w, h,
        kicker="ورود امن به بوروبیا",
        title=["با هم،", "آماده‌تر هستیم."],
        copy="وارد حساب خود شوید تا با همراهان‌تان در ارتباط بمانید و در زمان نیاز، سریع‌تر به کمک برسید.",
    )
    K.trust_row(s, x + 56, y + h - 56 - 78, w - 112, "حساب شما امن می‌ماند",
                "اطلاعات ورود شما محرمانه می‌ماند.",
                "mdi-shield-check-outline")


def _card_form(s: Screen, x: float, y: float, w: float, state: str = "idle"):
    """The white column's contents. `state` switches the alert and the CTA behaviour only."""
    right = x + w - 64
    # A login form is a short measure; letting it span the whole column looks unfinished.
    left = right - FORM_W
    width = FORM_W

    y = K.card_head(s, left, y, width, "خوش آمدید", "ورود به حساب", "mdi-account-key-outline")

    if state == "registered":
        y = K.alert(s, left, y, width, "حساب شما ساخته شد. برای ادامه وارد شوید.", "success")
    elif state == "reset":
        y = K.alert(s, left, y, width, "گذرواژه با موفقیت تغییر کرد. حالا می‌توانید وارد شوید.",
                    "success")
    elif state == "error":
        y = K.alert(s, left, y, width, "نام کاربری یا گذرواژه درست نیست. سه تلاش دیگر باقی است.",
                    "error")
    elif state == "locked":
        # The server locks the account after a run of failures; that is a different message.
        y = K.alert(s, left, y, width,
                    "به دلیل تلاش‌های ناموفق، ورود موقتاً قفل شده است. ۱۵ دقیقه دیگر تلاش کنید.",
                    "warning")

    broke = state in ("error", "locked")
    y = K.field(s, left, y, width, "نام کاربری", "" if broke else "saeed.k",
                "mdi-account-outline", state="error" if broke else "idle")
    y += 16
    y = K.field(s, left, y, width, "گذرواژه", "••••••••", "mdi-lock-outline",
                trailing="mdi-eye-outline")
    y += 14

    link = "گذرواژه را فراموش کرده‌اید؟"
    s.text(right, y, link, "d-sm", C.primary, align="right")
    y += 44

    K.submit(s, left, y, width, "ورود به حساب",
             state={"loading": "loading", "disabled": "disabled"}.get(state, "idle"))
    y += K.FIELD_H + 38

    K.divider(s, left, y, width)
    y += 30
    K.switch_copy(s, left, y, width, "هنوز حساب ندارید؟", "ساخت حساب جدید")
    y += 28
    K.privacy_note(s, left, y, width, "اطلاعات حساب شما محرمانه می‌ماند.")
    return y


# --------------------------------------------------------------------------- #
def login():
    s = K.screen(900)
    K.chrome(s)
    top = _frame_top(900)
    intro_x, card_x, card_w = K.frame(s, top, K.FRAME_H, INTRO_W)
    _intro(s, intro_x, top, INTRO_W, K.FRAME_H)
    _card_form(s, card_x, top + 92, card_w)
    return s


def login_smoke():
    """First visit: nothing typed yet, so the CTA is flat and the first field has focus."""
    s = K.screen(900)
    K.chrome(s)
    top = _frame_top(900)
    intro_x, card_x, card_w = K.frame(s, top, K.FRAME_H, INTRO_W)
    _intro(s, intro_x, top, INTRO_W, K.FRAME_H)

    right = card_x + card_w - 64
    left = right - FORM_W
    y = K.card_head(s, left, top + 92, FORM_W, "خوش آمدید", "ورود به حساب",
                    "mdi-account-key-outline")
    y = K.field(s, left, y, FORM_W, "نام کاربری", "", "mdi-account-outline", state="focus")
    y += 16
    y = K.field(s, left, y, FORM_W, "گذرواژه", "", "mdi-lock-outline",
                trailing="mdi-eye-outline")
    y += 14
    link = "گذرواژه را فراموش کرده‌اید؟"
    s.text(right, y, link, "d-sm", C.primary, align="right")
    y += 44
    K.submit(s, left, y, FORM_W, "ورود به حساب", state="disabled")
    y += K.FIELD_H + 8
    s.text(right, y, "تا وقتی هر دو فیلد پر نشده، دکمه غیرفعال می‌ماند.", "d-caption", C.muted,
           align="right", max_width=FORM_W)
    # The rest of the column stays: a first visit still offers the way to registration, and plate 02 has to be
    # comparable with 01 line for line.
    y += 40
    K.divider(s, left, y, FORM_W)
    y += 30
    K.switch_copy(s, left, y, FORM_W, "هنوز حساب ندارید؟", "ساخت حساب جدید")
    y += 28
    K.privacy_note(s, left, y, FORM_W, "اطلاعات حساب شما محرمانه می‌ماند.")
    return s


SCREENS = {
    "a-login": ("01-login.png", login),
    "a-login-empty": ("02-login-empty.png", login_smoke),
}
