# Visual acceptance (P5)

How Borobiya 2.0 reviews the implemented UI against the 141 canonical references in `design/`: what the 2026-11-16 evidence pass verified, where the evidence lives, how to regenerate it, and why nothing in this document is automated approval. Companion documents: `docs/DESIGN_MATRIX.md` (the per-row authority) and `docs/ACCEPTANCE.md` (the deferral of human sign-off).

## Why human, not automated

Pixel-diff gates would either block every intentional redesign or rubber-stamp real regressions. The canonical references are design intent, and this product carries deliberate, documented deviations (see the deviation register in `docs/DESIGN_MATRIX.md`). Visual acceptance therefore records evidence and keeps a human the judge. The tooling below makes the evidence cheap to produce and deterministic to reproduce. No script flips a row to `done`; code evidence may move `missing` to `partial`, and only a human moves `partial` to `done`.

## The artifacts and where they live

The captures and the harness are generated review aids. They are committed so a reviewer can compare implementation against reference without running anything (mirroring how `design/` carries the references); their dependency tree is not:

- `docs/visual-acceptance/screens/` — one `<reference-id>-impl.png` per canonical reference exercised in a capture run (88 captures).
- `scripts/visual-acceptance/` — the capture harness (Node, `puppeteer-core` over `@sparticuz/chromium`), pinned by `package.json`. `scenarios.json` is the machine-readable capture plan keyed by reference id: route, persona, viewport and DPR, an ordered list of input steps (click, clickAt, clickText, type, upload, hold, hover, offline, dark, network latency, wait, clip), and optional per-scenario or per-shot viewport clips for transient states. `node_modules/` inside it is gitignored; nothing under it ships to production.

Regenerating the evidence requires no credentials — the demo bundle is the only requirement.

## Regenerating the evidence

1. `bun install`
2. `bun run preview:build` (vite, preview mode, outDir `build/preview-app`)
3. `bun run preview` (serves the demo bundle on `0.0.0.0:4173`)
4. One-time tool install: `cd scripts/visual-acceptance && npm install --no-audit --no-fund`

The capture tool deliberately runs outside the Bun toolchain: it automates a browser, is pinned by its own lockfile (`scripts/visual-acceptance/package-lock.json`) and never ships. The Bun-only guard covers the product runtime and `scripts/*.ts`, not this local reviewer.
5. `node scripts/visual-acceptance/capture.mjs scripts/visual-acceptance/scenarios.json [only-ref-id]`

Toolchain note: the headless Chromium needs host NSS and runtime libraries. On a normal workstation a system Chromium (`CHROMIUM_EXECUTABLE`) suffices; in the sandbox where the 2026-11-16 pass ran, the libraries were staged under a gitignored `.stagef/` directory and `LD_LIBRARY_PATH` pointed there. Captures must always be taken against the demo bundle (fake-data pill visible) so evidence can never be confused with production data.

## Canvas and determinism

Mobile references render at 393 × 852 CSS pixels with `deviceScaleFactor: 2`, i.e. 786 × 1704 physical pixels — the design canvas. The demo world is byte-stable (fixed `T0`, fixed fixtures, persona selected by the `?persona=` query parameter), so re-captures of unedited screens are identical.

Full-page screenshots are not sufficient for every state. Known cases and how the harness handles them:

- The SOS hold progress indicator does not paint in headless full-page captures (deterministic, independent of screenshot flags). Hold references are captured with a viewport clip sized to the button instead (`clip`, and `shots[].clip` for per-shot clips).
- The submitting card is a transient state; the demo answers `POST /_user/sos` after an artificial 1500 ms delay so the state is screenshottable. Production latency does the real work.
- The requester-only mission rail (the signed-in account's own cancellable request) is shadowed by the responder missions in the stock demo world. The capture uses `?missions=empty&offers=empty`, two preview-only query knobs added for the harness, which serve an empty missions list and an empty offers inbox.
- The map has no long-press gesture; destination selection is tap-to-select. `navigation-02` is captured as tap-to-select and differs materially from the reference.
- The map-canvas point click needs an explicit `clickAt` step; clicking the canvas element center would hit the search bar.

## What the 2026-11-16 pass verified

- The SOS hold progress indicator end to end. The bar is now a bottom-inset pill bound to inline size only; a competing rule that forced it full-width during a hold was removed. The button also paints above the route sheet and rides its top edge at every detent (it was unreachable), and the hold state is visible in the clipped hold captures (~50 percent fill mid-hold).
- The map route's saved-place quick chips moved out of the sheet into a detent-aware sibling, so they are no longer clipped by the sheet's rounded top edge; the map-route search bar and chips paint above the sheet there only.
- The submitting dialog (`sos/07`), the inline photo error path (`sos/15`), the cancel-request panel (`sos/13`), tap-to-select destination (`navigation/02`) and the hold pill (`sos/02`) were captured and compared against their references by the agent pass. Rows `sos/07` (`missing` to `partial`), `sos/13` (`done` to `partial`) and `sos/15` (`done` to `partial`) moved on that evidence — see the Stage F fourth-pass log in `docs/DESIGN_MATRIX.md`. No row was flipped to `done`.
- Fidelity notes worth carrying into P5 adjudication: `sos/13` renders the cancel panel inline below the rail with four server-catalog reasons and a required-detail rule enforced client- and server-side (the reference shows a full-screen sheet, five reasons and a 200-character counter); `sos/07` renders the ring, staged rows and the informational note but without per-row done timestamps and with the dim confined to the sheet; `sos/15` has no designed equivalent — the photo rides `POST /_user/sos`, so the retryable error surfaces inline in composer step three; `navigation/02` differs in gesture model (tap, not press-and-hold) and ships no callout.

## Maintenance contract

- Re-run the captures for any reference whose component changes and land the capture delta with the change.
- Rebuild the preview bundle before capturing; a stale bundle produces stale evidence.
- Keep `scenarios.json` in step with the rendered test ids. If a state cannot be reached deterministically, treat it as unverified until a human adjudicates it — never present fabricated evidence.
- Update `docs/DESIGN_MATRIX.md` rows on code evidence only; the tallies live there, and visual acceptance stays a deferred human review.
