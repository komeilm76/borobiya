"""Password recovery: a three-step wizard on one page, plus the page it ends on."""
from __future__ import annotations

import authkit as K
from authkit import C, Screen

INTRO_W = 480
CARD_W = K.FRAME_W - INTRO_W
FORM_W = 420
STEPS = ("حساب", "پرسش‌ها", "گذرواژه")


def _intro_panel(s: Screen, x: float, y: float, w: float, h: float, step: int, kicker: str,
                 title, copy):
    """Recovery carries the step rail and nothing else: two supporting blocks crowd a 480px column."""
    K.intro(s, x, y, w, h, kicker=kicker, title=title, copy=copy, steps=(step, list(STEPS)))


def _step_one(s: Screen, left: float, right: float, y: float, w: float):
    y = K.intro_copy(s, left, y, w, "نام کاربری حساب را وارد کنید تا پرسش‌های امنیتی نمایش داده شوند.")
    y = K.field(s, left, y, w, "نام کاربری", "saeed.k", "mdi-account-outline")
    y += 22
    K.submit(s, left, y, w, "نمایش پرسش‌ها")
    return y + K.FIELD_H


def _step_two(s: Screen, left: float, right: float, y: float, w: float):
    y = K.intro_copy(s, left, y, w, "پاسخ‌ها را همان‌طور که هنگام ساخت حساب ثبت کردید وارد کنید.")
    questions = [
        ("نام نخستین معلم شما چه بود؟", "آقای رضایی"),
        ("نام خیابانی که در آن بزرگ شدید؟", ""),
        ("نام نخستین حیوان خانگی‌تان؟", ""),
    ]
    for question, answer in questions:
        s.para(left + 46, y, question, "d-sm", C.muted, align="right", max_width=w - 46,
               max_lines=2)
        y += 40
        y = K.field(s, left, y, w, "پاسخ شما", answer, "mdi-comment-question-outline")
        y += 14
    y += 6
    # secondary + primary, secondary at the physical left
    back_w = s.tw("بازگشت", "d-label") + 34
    s.rect(left, y, back_w, K.FIELD_H, fill="#E7F0EC", radius=10)
    s.text(left + back_w - 17, y + (K.FIELD_H - 20) / 2, "بازگشت", "d-label", C.primary,
           align="right")
    K.submit(s, left + back_w + 12, y, w - back_w - 12, "بررسی پاسخ‌ها")
    return y + K.FIELD_H


def _step_three(s: Screen, left: float, right: float, y: float, w: float):
    y = K.intro_copy(s, left, y, w, "یک گذرواژهٔ تازه بسازید تا دوباره به حساب‌تان دسترسی پیدا کنید.")
    y = K.field(s, left, y, w, "گذرواژهٔ تازه", "••••••••••", "mdi-lock-outline",
                hint="حداقل ۸ نویسه، شامل دست‌کم یک حرف و یک عدد")
    y += 20
    y = K.field(s, left, y, w, "تکرار گذرواژهٔ تازه", "••••••••••", "mdi-lock-check-outline")
    y += 12
    K.checkbox(s, left + w, y, "نمایش گذرواژه‌ها")
    y += 40
    restart_w = s.tw("شروع دوباره", "d-label") + 40
    s.rect(left, y, restart_w, K.FIELD_H, fill="#E7F0EC", radius=10)
    s.text(left + restart_w - 20, y + (K.FIELD_H - 20) / 2, "شروع دوباره", "d-label", C.primary,
           align="right")
    K.submit(s, left + restart_w + 12, y, w - restart_w - 12, "تغییر گذرواژه")
    return y + K.FIELD_H


def _measure_bottom(step: int, title: str, icon: str, body, form_error: str | None) -> float:
    """Draw the column once on a throwaway canvas to learn where it really ends.

    Guessing the frame height is how the footer ended up printed on top of the submit button: each
    step asks for a different number of rows, and the answer has to be measured, not estimated.
    """
    scratch = K.screen(1800)
    left, right = 60.0, 60.0 + FORM_W
    y = K.card_head(scratch, left, 40, FORM_W, f"مرحلهٔ {K.fa(step)} از ۳", title, icon)
    if form_error:
        y = K.alert(scratch, left, y, FORM_W, form_error, "error")
    return body(scratch, left, right, y, FORM_W) - 40


def _page(step: int, title: str, icon: str, body, form_error: str | None = None):
    """Page height follows the step: the question step is three fields tall, the others are not."""
    frame_h = max(520, _measure_bottom(step, title, icon, body, form_error) + 72 + 150)
    s = K.screen(frame_h + 300)      # snapped up to the plate ladder
    canvas = s.h                      # use the real height, not the requested one
    K.chrome(s)
    top = (canvas - frame_h) / 2 + 4
    intro_x, card_x, card_w = K.frame(s, top, frame_h, INTRO_W, decor=False)

    _intro_panel(s, intro_x, top, INTRO_W, frame_h, step,
                 "بازیابی امن حساب",
                 ["دوباره به", "حساب‌تان برسید."],
                 "با پاسخ به پرسش‌هایی که هنگام ساخت حساب انتخاب کرده‌اید، گذرواژهٔ تازه‌ای تنظیم کنید.")

    left = card_x + (card_w - FORM_W) / 2
    right = left + FORM_W
    y = K.card_head(s, left, top + 72, FORM_W, f"مرحلهٔ {K.fa(step)} از ۳", title, icon)
    if form_error:
        y = K.alert(s, left, y, FORM_W, form_error, "error")
    content_end = body(s, left, right, y, FORM_W)

    # The footer follows the content when the step is short and stays pinned when it is tall. Pinned
    # unconditionally left 100px of dead air under a one-field step.
    footer = min(content_end + 48, top + frame_h - 96)
    K.switch_copy(s, left, footer, FORM_W, "گذرواژه را به یاد آوردید؟", "بازگشت به ورود")
    K.privacy_note(s, left, footer + 34, FORM_W,
                   "بوروبیا پاسخ‌های ثبت‌شدهٔ شما نمایش نمی‌دهد.")
    return s


def recovery_step_one():
    return _page(1, "حساب‌تان را پیدا کنید", "mdi-shield-key-outline", _step_one)


def recovery_step_one_error():
    return _page(1, "حساب‌تان را پیدا کنید", "mdi-shield-key-outline", _step_one,
                 form_error="نام کاربری معتبر وارد کنید.")


def recovery_step_two():
    return _page(2, "پاسخ پرسش‌ها", "mdi-shield-key-outline", _step_two)


def recovery_step_three():
    return _page(3, "گذرواژهٔ تازه", "mdi-lock-reset", _step_three)


def _step_two_error(s: Screen, left: float, right: float, y: float, w: float):
    s.para(left + 46, y, "نام نخستین معلم شما چه بود؟", "d-sm", C.muted, align="right",
           max_width=w - 46, max_lines=2)
    y += 40
    y = K.field(s, left, y, w, "پاسخ شما", "آقای رضایی", "mdi-comment-question-outline",
                state="error")
    y += 14
    for question in ("نام خیابانی که در آن بزرگ شدید؟", "نام نخستین حیوان خانگی‌تان؟"):
        s.para(left + 46, y, question, "d-sm", C.muted, align="right", max_width=w - 46,
               max_lines=2)
        y += 40
        y = K.field(s, left, y, w, "پاسخ شما", "شهید بهشتی", "mdi-comment-question-outline")
        y += 14

    y += 6
    back_w = s.tw("بازگشت", "d-label") + 34
    s.rect(left, y, back_w, K.FIELD_H, fill="#E7F0EC", radius=10)
    s.text(left + back_w - 17, y + (K.FIELD_H - 20) / 2, "بازگشت", "d-label", C.primary,
           align="right")
    K.submit(s, left + back_w + 12, y, w - back_w - 12, "بررسی پاسخ‌ها")
    return y + K.FIELD_H


def recovery_step_two_error():
    """A wrong answer, and the counter that tells people how many attempts are left."""
    return _page(2, "پاسخ پرسش‌ها", "mdi-shield-key-outline", _step_two_error,
                 form_error="دو پاسخ درست نبود. یک تلاش دیگر باقی است.")


def recovery_done():
    """Step four: the password is stored. No form, one way forward."""
    s = K.screen(900)
    K.chrome(s)
    top = (900 - K.FRAME_H) / 2 + 4
    intro_x, card_x, card_w = K.frame(s, top, K.FRAME_H, INTRO_W, decor=False)
    _intro_panel(s, intro_x, top, INTRO_W, K.FRAME_H, 4, "بازیابی انجام شد",
                 ["دوباره به", "حساب‌تان برسید."],
                 "با پاسخ به پرسش‌هایی که هنگام ساخت حساب انتخاب کرده‌اید، گذرواژهٔ تازه‌ای تنظیم کنید.")

    left = card_x + (card_w - FORM_W) / 2
    right = left + FORM_W
    cy = top + 168
    s.circle(left + FORM_W / 2, cy + 39, 40, fill="#E4F2EA")
    s.i.draw_icon(left + FORM_W / 2, cy + 39, "mdi-check", 34, "#2C7A57")
    s.text(left + FORM_W / 2, cy + 100, "بازیابی انجام شد", "d-sm", "#6D8985", align="center")
    s.text(left + FORM_W / 2, cy + 122, "گذرواژهٔ تازه ذخیره شد", "d-h1", "#1A3B3C",
           align="center")
    s.para(left + 10, cy + 160, "اکنون می‌توانید با گذرواژهٔ جدید وارد بوروبیا شوید.", "d-body",
           C.muted, align="right", max_width=FORM_W - 20, max_lines=2)
    K.submit(s, left, cy + 216, FORM_W, "رفتن به صفحهٔ ورود")

    K.privacy_note(s, left, top + K.FRAME_H - 62, FORM_W,
                   "بوروبیا پاسخ‌های ثبت‌شدهٔ شما را نمایش نمی‌دهد.")
    return s


SCREENS = {
    "a-recovery-1": ("05-recovery-account.png", recovery_step_one),
    "a-recovery-1-error": ("06-recovery-account-error.png", recovery_step_one_error),
    "a-recovery-2": ("07-recovery-questions.png", recovery_step_two),
    "a-recovery-2-error": ("08-recovery-questions-error.png", recovery_step_two_error),
    "a-recovery-3": ("09-recovery-password.png", recovery_step_three),
    "a-recovery-4": ("10-recovery-done.png", recovery_done),
}
