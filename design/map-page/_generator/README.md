# Map-page mockup generator

Renders every PNG under `design/map-page/` from code, so the whole reference set
stays consistent (one city, one palette, one type scale) and can be regenerated
after a design change.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install pillow arabic-reshaper python-bidi
python render.py                    # all screens
python render.py navigation --sheet # one section + contact sheet
python render.py 09-navigation-active
```

## Why not an image model?

Image models break Persian text and invent a different map on every frame. These
mockups need exact labels, exact numbers and one continuous map, so the renderer
draws them: `bb/text.py` shapes Persian with `arabic-reshaper` + `python-bidi`,
`bb/icons.py` uses the same Material Design Icons font as the client, and
`bb/map.py` draws a deterministic vector city.

## Layout

| module | responsibility |
|---|---|
| `bb/theme.py` | colour, type, radius and spacing tokens (mirrors `packages/client/src/styles/tokens.ts`) |
| `bb/text.py` | Persian shaping, RTL layout, wrapping, Persian digits |
| `bb/icons.py` | MDI icon lookup from the shipped CSS, glyph drawing |
| `bb/prims.py` | Screen canvas and UI primitives (card, button, chip, sheet, scrim, gradient) |
| `bb/map.py` | vector city, camera with rotation, routes, markers, map chrome |
| `bb/ui.py` | page-level components (section control, manoeuvre banner, telemetry strip) |
| `bb/scenario.py` | the single fixed trip/incident used across screens |
| `screens/*.py` | one function per PNG, registered in `SCREENS` |
| `assets/` | Vazirmatn + MDI webfont (needed to render outside the app) |

Rendering is deterministic: no randomness outside the fixed city seed, so diffs in
the PNGs always mean a real design change.

`_preview-*.png` files next to this folder are quick contact sheets for review and
are not part of the deliverable set.
