# All-page design-token migration — Batch 1: account/device color semantics

## Scope and evidence

- The [full client inventory and staged plan](../../../docs/CLIENT_STYLE_TOKEN_MIGRATION.md) covers all CSS-bearing components/pages and inline-style sites. The user chose **all visual design values** and **separately tested/pushed batches**; this first batch changes only the `/_user/devices` view, its session component, shared palette definitions, and related tests. Other pages and other value categories remain for later batches.
- **Genuine signed-in before/reference:** the user's mobile/tablet/desktop screenshots from the device-page review, preserved as `../../devices/section-4/real-current-{mobile,tablet,desktop}.png` (390 × 1105, 645 × 860, 1007 × 630). They precede this token migration. No signed-in after screenshot of this batch is available from the local environment.
- **Local fixture-backed comparisons:** `before-light-{mobile,tablet,desktop}.png`, `after-light-{mobile,tablet,desktop}.png`, `dark-before-{mobile,tablet,desktop}.png`, `dark-after-{mobile,tablet,desktop}.png`, at the matching viewport widths. These use intercepted authentication and example device responses, **not the user's live backend**. The dark captures are not authenticated user screenshots.

## Findings, priority, and change

| Priority | Reviewed item / issue | Implemented and verified |
| --- | --- | --- |
| Medium | The page hardcoded its heading, supporting-copy, error and row-border colors instead of sourcing them from the one global config file. Other pages with the same values could drift. | Added semantic light/dark palette entries in `packages/client/src/styles/tokens.ts`: `supporting-text`, `error-text`, `row-outline`. Both the page and the session panel consume the generated `--bb-color-*` variables; headings use the existing `text` token. |
| Low | Two translucent borders used embedded RGB triples even though their semantic base colors are in the palette. | Compose the same 8%/32% opacity from the global tokens using `color-mix`; retain existing full-outline dark overrides. |
| Keep | Touch geometry, route/navigation, session actions, responsive layout and light/dark contrast already worked. | No changes to rendered strings, business behavior, sizes, or shared shell. Remaining static design values (typography, spacing, shadows, other files) are explicitly deferred to later batches. |

**Pixel/geometry check:** In local Chromium at 390/645/1007px, computed foreground/background/border colors before and after matched numerically in light and dark themes (including translucent borders, whose CSS serialization changed from `rgba` to `color(srgb … / alpha)`). Session row positions and widths were unchanged, the document had no horizontal overflow, and there were no page errors. New token-based contrast checks cover the light supporting text and light/dark error text.

**Approval and remaining work:** Batch 1 was authorized as part of the user-selected staged migration; its individual palette names and visual outcome have not been separately approved. Genuine signed-in after screenshots at mobile/tablet/desktop are pending if the user wants to close the authenticated comparison. Do not treat this batch as completion of the all-page request or start Batch 2 without the user's instruction. The local backend is unavailable; no live revoke flow, release or merge was performed.

## Validation

- Full client Vitest: **266 files, 1,768 tests passed** (including a new semantic token/contrast assertion).
- Vue TypeScript, E2E TypeScript, Vite production build and `git diff --check`: **passed**. The build's existing large-chunk advisory was non-fatal.
