# احراز هویت — Authentication reference images

Every screen a visitor sees before they are inside BoroBiya: login, registration, the three-step password recovery,
the mandatory security-question onboarding, and the states, dark theme and widths they all have to hold up in.

These are **reference images, not screenshots**. Each one is drawn from the same tokens the client renders with, so a
developer can translate a block 1:1 instead of guessing at pixel values.

| file | what it shows |
|---|---|
| `01-login.png` | login, filled, primary action — the canonical layout |
| `02-login-empty.png` | first visit: empty fields, focus ring on the first, CTA disabled |
| `03-register.png` | registration: account fields plus five security questions |
| `04-register-error.png` | `USERNAME_TAKEN` and an incomplete question set |
| `05-recovery-account.png` | recovery step 1 — find the account |
| `06-recovery-account-error.png` | step 1 with an invalid username |
| `07-recovery-questions.png` | step 2 — answer three of the five questions |
| `08-recovery-questions-error.png` | step 2 with a wrong answer and the attempt counter |
| `09-recovery-password.png` | step 3 — set a new password |
| `10-recovery-done.png` | step 4 — password saved, one way forward |
| `11-onboarding.png` | mandatory security questions for a freshly created account |
| `12-onboarding-loading.png` | the same page while the question catalog is fetched |
| `13-anatomy.png` | ten numbered parts of the login frame with their real measurements |
| `14-states.png` | six card states side by side |
| `15-dark.png` | login under `:root.dark` |
| `16-responsive.png` | 420 / 900 / 1366 px side by side |

## Run it

```bash
cd design/auth/_generator
python render.py              # every page
python render.py login        # one section
python render.py a-recovery-2 # one page
python -m pytest . -q         # the contract tests
```

Requires Pillow, arabic-reshaper and python-bidi. The generator borrows:

* `design/map-page/_generator/bb` — palette, Vazirmatn + Material Design Icons fonts, Arabic shaping, canvas
  primitives;
* `design/admin-panel/_generator/atheme.py` — the desktop type ramp, so auth and admin captions are the same size.

## What the pages encode

**Layout.** A quiet 88px chrome bar, then one 1248px frame with a 24px radius: dark intro column on the physical
right, white form column on the left, one hairline border and one soft shadow around both. That matches
`App.vue`'s `.auth-chrome` + `styles/auth.css`'s `.app-shell--auth .auth-layout`.

**Form measure.** The login form is 440px wide and anchored to the reading-start edge of its column. A short form
stretched across a 748px column looks unfinished; 440 is what the fields actually need.

**Field anatomy.** 52px tall, 8px radius, 8px `rounded="lg"` corner. An empty field shows its label inline; a filled
one lifts the label into the border in brand colour — that is what `v-text-field` does, and it is why the answer
fields on the recovery pages keep the word «پاسخ شما» instead of turning into bare text.

**States.** Success and failure are the same layout: an alert above the form, the failing field outlined in danger,
the CTA flat when it cannot be pressed. `14-states.png` is the contract — six states, one grid.

**Dark mode.** Only the tokens change: page `#101D1E`, panel `#1B292A`, hairline `#46615D`, text `#EDF5F2`, brand
accent `#71C7BE`. The intro gradient and the trust card keep their structure.

## Where these are implemented

| page | client file |
|---|---|
| login | `packages/client/src/views/_auth/LoginView.vue` |
| registration | `packages/client/src/views/_auth/RegisterView.vue` |
| recovery | `packages/client/src/views/_auth/ForgotPasswordView.vue` |
| onboarding | `packages/client/src/views/_user/CompleteSecurityQuestionsView.vue` |
| chrome, tokens | `packages/client/src/App.vue`, `packages/client/src/styles/auth.css` |

The images document what those files do **today**; they are not a proposal to replace them. Where a mockup and the
code disagree, the code is the defect only if the image is clearly better — otherwise the next commit should fix the
image.

## Tests

`_generator/test_reference.py` fails when:

* a rendered page is missing from the folder;
* a page has no entry in this README;
* the icon names drawn into the pages are not in the shipped Material Design Icons font (the bug that produced a
  blank glyph in the admin icons library);
* a page's declared size does not match its file.

## Image index

As rendered on 2026-11-03, in the order a visitor meets them:

| # | page | size |
|---|---|---|
| 01 | login | 1440×900 |
| 02 | login, first visit | 1440×900 |
| 03 | registration | 1440×1120 |
| 04 | registration, username taken | 1440×1120 |
| 05 | recovery: account | 1440×820 |
| 06 | recovery: account, invalid | 1440×846 |
| 07 | recovery: questions | 1440×1030 |
| 08 | recovery: questions, wrong answer | 1440×1000 |
| 09 | recovery: new password | 1440×906 |
| 10 | recovery: done | 1440×900 |
| 11 | onboarding | 1440×920 |
| 12 | onboarding, loading | 1440×920 |
| 13 | anatomy | 1440×1080 |
| 14 | six card states | 1440×1090 |
| 15 | dark mode | 1440×900 |
| 16 | three widths | 2718×1020 |

Heights differ on purpose: the reference shows each page whole, without scroll. Page 16 is wide because it
compares three viewports side by side at their real widths.
