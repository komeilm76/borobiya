# کتابخانهٔ آیکن — Icon library

Every Material Design Icon the product renders, in one place: what each glyph is called, what it is for, which
size it takes and where it appears in the code.

| file | what it is |
|---|---|
| `01-overview.png` | the eight roles, the size ramp, and why this folder exists |
| `02…08-*.png` | every icon as a tile: glyph, `mdi-*` name, use count, files, roles |
| `icons.json` | the machine-readable inventory the pages and the tests read |
| `_generator/` | the scanner and renderer that produce all of the above |

**Run it** (from `design/icons/_generator`, with Pillow + arabic-reshaper + python-bidi installed):

```bash
python render.py          # rescan packages/client/src, rewrite icons.json, redraw every page
python inventory.py       # rescan only
python -m pytest .        # the three guards below
```

The generator reuses `design/map-page/_generator` for the MDI webfont and text shaping and
`design/admin-panel/_generator/atheme.py` for the palette and desktop type ramp, so these pages read as part of the
same design system rather than as a separate document.

## Roles

The catalog groups by what the icon *does*, not by which file it lives in. An icon may serve several roles — the
first is the one drawn on the tile, every one is kept in `icons.json`.

| role | meaning | examples |
|---|---|---|
| `actions` | buttons and anything that performs a job | `mdi-refresh`, `mdi-close`, `mdi-plus` |
| `fields` | inside inputs, labels, checkboxes, selects | `mdi-magnify`, `mdi-eye-outline` |
| `navigation` | rail, app menu, breadcrumbs, back links, tabs | `mdi-menu`, `mdi-arrow-left` |
| `status` | alerts, offline, success, empty and error panels | `mdi-cloud-off-outline`, `mdi-wifi-off` |
| `cards` | card titles, list rows, table cells, headings | `mdi-chart-box-outline`, `mdi-clock-outline` |
| `map` | layers, crosshairs, routes, markers, map controls | `mdi-crosshairs-gps`, `mdi-map-marker-path` |
| `media` | images, files, copy, download, print | `mdi-content-copy`, `mdi-image-outline` |
| `account` | login, logout, locks, roles, permissions | `mdi-shield-check-outline`, `mdi-logout` |

## Sizes

Five sizes are allowed; anything else is a new decision, not a detail.

| px | place |
|---|---|
| 16 | inline, beside a sentence or inside a table cell |
| 18 | `<v-btn prepend-icon>` default |
| 20 | toolbar and icon-only actions |
| 22 | card title |
| 26 | the state panel's large glyph |

## Where the icons live in the design folder

| folder | covers |
|---|---|
| `design/icons/` | the whole library, this catalogue |
| `design/admin-panel/design-system/02-controls.png` | the specimen strip: one icon per allowed size, plus the pointer to this folder |
| `design/admin-panel/*` | the screens that use them, drawn with the same webfont |

## How it stays true

* **Regenerated, never hand-written.** `icons.json` is produced by scanning `packages/client/src` for `mdi-*` tokens
  and reading the element and slot that carry each one. A test fails when the committed JSON no longer matches the
  code, so a new icon must be regenerated with it.
* **Checked against the shipped font.** `mdi-*` strings have no compile step; a misspelled name renders as a blank
  box in every browser. A test compares every name with `materialdesignicons.css` from
  `design/map-page/_generator/assets`. This caught one real bug: `mdi-sparkles` (from the placeholder page) does not
  exist in the font and was replaced with `mdi-creation-outline`.
* **Covered by the pages.** A test keeps the page count sufficient for the icon count, so a shrinking catalog cannot
  silently drop tiles.

## Known gap

`mdi-*` names inside `<script>` blocks that are not navigation tuples are classified by name and file only. They are
inventoried (nothing is missing from the catalog), but the role of a data-table glyph can be approximate; the markup
icons are exact.
