# Visual acceptance (P5)

How Borobiya 2.0 reviews the implemented UI against the 141 canonical references in `design/`: what the 2026-11-16 evidence pass verified, where the evidence lives, how to regenerate it, and why nothing in this document is automated approval. Companion documents: `docs/DESIGN_MATRIX.md` (the per-row authority) and `docs/ACCEPTANCE.md` (the deferral of human sign-off).

## Why human, not automated

Pixel-diff gates would either block every intentional redesign or rubber-stamp real regressions. The canonical references are design intent, and this product carries deliberate, documented deviations (see the deviation register in `docs/DESIGN_MATRIX.md`). Visual acceptance therefore records evidence and keeps a human the judge. The tooling below makes the evidence cheap to produce and deterministic to reproduce. No script flips a row to `done`; code evidence may move `missing` to `partial`, and only a human moves `partial` to `done`.

## The artifacts and where they live

The captures and the harness are generated review aids. They are committed so a reviewer can compare implementation against reference without running anything (mirroring how `design/` carries the references); their dependency tree is not:

- `docs/visual-acceptance/screens/` — one `<reference-id>-impl.png` per canonical reference exercised in a capture run, plus fifteen `dark-*` aid shots, two `reduced-motion-*` aids and three `admin-narrow-*` aids (125 captures). Two further captures (`navigation-19-trip-cancel-impl.png`, `navigation-20-trip-completed-impl.png`) document superseded references and are deliberately not cited on their matrix rows, which carry no capture references by policy.
- `scripts/visual-acceptance/` — the capture harness (Node, `puppeteer-core` over `@sparticuz/chromium`), pinned by `package.json`. `scenarios.json` is the machine-readable capture plan keyed by reference id: route, persona, viewport and DPR, an ordered list of input steps (click, clickAt, clickText, type, upload, hold, hover, offline, dark, light, reducedMotion, network latency, wait, clip), and optional per-scenario or per-shot viewport clips for transient states. `node_modules/` inside it is gitignored; nothing under it ships to production.

Regenerating the evidence requires no credentials — the demo bundle is the only requirement.

## Regenerating the evidence

1. `bun install`
2. `bun run preview:build` (vite, preview mode, outDir `build/preview-app`)
3. `bun run preview` (serves the demo bundle on `0.0.0.0:4173`)
4. One-time tool install: `cd scripts/visual-acceptance && npm install --no-audit --no-fund`

The capture tool deliberately runs outside the Bun toolchain: it automates a browser, is pinned by its own lockfile (`scripts/visual-acceptance/package-lock.json`) and never ships. The Bun-only guard covers the product runtime and `scripts/*.ts`, not this local reviewer.
5. `node scripts/visual-acceptance/capture.mjs scripts/visual-acceptance/scenarios.json [only-ref-id]`
6. Drift check: regenerate everything into a scratch dir (`OUT_DIR=/tmp/regen node scripts/visual-acceptance/capture.mjs scripts/visual-acceptance/scenarios.json`) and run `node scripts/visual-acceptance/diff.mjs /tmp/regen` — it pixel-compares the regeneration against the committed captures and classifies each as identical, volatile-only (<= 0.5% of pixels: the status clock, pulse dots, animation phases and wall-clock timestamps) or REVIEW. Anything flagged REVIEW, and any capture missing from the regeneration, fails the check and needs a human to look before the committed capture is replaced. The checker reports drift; it never approves.

Toolchain note: the headless Chromium needs host NSS and runtime libraries. On a normal workstation a system Chromium (`CHROMIUM_EXECUTABLE`) suffices; in the sandbox where the 2026-11-16 pass ran, the libraries were staged under a gitignored `.stagef/` directory and `LD_LIBRARY_PATH` pointed there. Captures must always be taken against the demo bundle (fake-data pill visible) so evidence can never be confused with production data.

## Canvas and determinism

Mobile references render at 393 × 852 CSS pixels with `deviceScaleFactor: 2`, i.e. 786 × 1704 physical pixels — the design canvas. The demo world is byte-stable (fixed `T0`, fixed fixtures, persona selected by the `?persona=` query parameter), so re-captures of unedited screens are identical.

Full-page screenshots are not sufficient for every state. Known cases and how the harness handles them:

- The SOS hold progress indicator does not paint in headless full-page captures (deterministic, independent of screenshot flags). Hold references are captured with a viewport clip sized to the button instead (`clip`, and `shots[].clip` for per-shot clips).
- The submitting card is a transient state; the demo answers `POST /_user/sos` after an artificial 1500 ms delay so the state is screenshottable. Production latency does the real work.
- History/sharing empty states and the list/admin error states are reached through four preview-only knobs in the demo fake-data layer: `?history=empty` (empty history lists), `?shares=empty` (empty Sharing Center), `?fail=history` (history endpoints answer 500 with a Persian preview-failure envelope) and `?fail=admin` (admin GET endpoints answer the same). They are screenshot-only determinism aids, never wired to production behaviour.
- First-load states are reached with a fifth knob, `?slow=<comma-separated path substrings>`: matching endpoint responses are delayed 2500 ms in the demo mock (the session check is never matched), so skeletons and loading compositions render deterministically. Uniform network latency cannot express this — it delays the session check as well and the capture degenerates to the boot frame, and CDP-level request interception does not apply either, because the demo mock answers `fetch` in-page and no network request ever leaves the browser.
- The requester-only mission rail (the signed-in account's own cancellable request) is shadowed by the responder missions in the stock demo world. The capture uses `?missions=empty&offers=empty`, two preview-only query knobs added for the harness, which serve an empty missions list and an empty offers inbox.
- The map has no long-press gesture; destination selection is tap-to-select. `navigation-02` is captured as tap-to-select and differs materially from the reference.
- The map-canvas point click needs an explicit `clickAt` step; clicking the canvas element center would hit the search bar.

## What the 2026-11-16 pass verified

- The SOS hold progress indicator end to end. The bar is now a bottom-inset pill bound to inline size only; a competing rule that forced it full-width during a hold was removed. The button also paints above the route sheet and rides its top edge at every detent (it was unreachable), and the hold state is visible in the clipped hold captures (the exact fill fraction at capture time is not measured and no mid-hold percentage is claimed).
- The map route's saved-place quick chips moved out of the sheet into a detent-aware sibling, so they are no longer clipped by the sheet's rounded top edge; the map-route search bar and chips paint above the sheet there only.
- The submitting dialog (`sos/07`), the inline photo error path (`sos/15`), the cancel-request panel (`sos/13`), tap-to-select destination (`navigation/02`) and the hold pill (`sos/02`) were captured by the agent pass; the fidelity notes below record observed differences, and no pixel-level comparison was performed. Rows `sos/07` (`missing` to `partial`), `sos/13` (`done` to `partial`) and `sos/15` (`done` to `partial`) moved on that evidence — see the Stage F fourth-pass log in `docs/DESIGN_MATRIX.md`. No row was flipped to `done`.
- Fidelity notes worth carrying into P5 adjudication: `sos/13` renders the cancel panel inline below the rail with four server-catalog reasons and a required-detail rule enforced client- and server-side (the reference shows a full-screen sheet, five reasons and a 200-character counter); `sos/07` renders the ring, staged rows and the informational note but without per-row done timestamps and with the dim confined to the sheet; `sos/15` has no designed equivalent — the photo rides `POST /_user/sos`, so the retryable error surfaces inline in composer step three; `navigation/02` differs in gesture model (tap, not press-and-hold) and ships no callout.

## The 2026-11-16 empty/error evidence pass

Four more captures were added on 2026-11-16, produced against the demo bundle with the knobs above. The harness itself was fixed so the `persona` query lands correctly when the route already carries query parameters. Every capture in `screens/` — these four, the five dark aids, the reduced-motion aid, and the transient SOS states (`sos/07` sending dialog, `sos/15` inline photo error, the latter via the committed `fixtures/not-an-image.txt` upload) — now has a matching scenario in `scenarios.json` (98 scenarios for 98 captures), and `scripts/check-docs.ts` fails if the plan and the committed captures drift apart again. The harness also creates a missing `OUT_DIR` instead of failing the run.

- `history/10-history-empty` — the history screen with `?history=empty` (requests sub-tab shows the plain empty copy; all tab counters read zero). Not the designed illustrated empty composition.
- `history/11-history-error` — the history screen with `?fail=history` (inline red preview-failure notice with a working retry on the requests list). The designed offline cached-snapshot framing is absent; the mock's failure copy stands in for the server's.
- `companions/09-companions-empty` — the Sharing Center with `?shares=empty` (no incoming or outgoing grants). The designed dedicated companions/add-friend empty state does not exist; the rename to Sharing Center is documented in `docs/LEGACY_REVIEW.md`.
- `admin-states/03-error` — the users console with `?fail=admin` (shared inline `AdminInlineError` panel with retry; mock copy stands in for the server's). The designed full-screen error composition is not built.

All four rows remain `partial` in `docs/DESIGN_MATRIX.md`; no row was flipped to `done` and the human P5 review remains the approval gate.

Fifteen further captures document the dark theme (`dark-map-idle`, `dark-sos-compose`, `dark-history`, `dark-sharing`, `dark-admin-overview`, `dark-admin-reports`, `dark-admin-groups`, `dark-admin-users`, `dark-profile`, `dark-trips`, `dark-admin-dispatch`, `dark-admin-audit`, `dark-admin-incidents`, `dark-admin-jobtypes-impl.png`, `dark-admin-alerts`; the job-types screen has no canonical row of its own and the aid is cited here), taken with `prefers-color-scheme: dark` via the harness's `darkStart` flag. They exist to show that the dark surfaces render coherently (legible chrome, readable sheets and tables, visible accents); no dark-theme row was flipped, and they are aids, not acceptance evidence. The map tiles themselves are deterministic SVG tiles and render light regardless of theme. Two captures (`reduced-motion-map-impl.png` and `reduced-motion-sos-sending-impl.png`, via the harness's `reducedMotionStart` flag) show the map shell and the SOS sending state rendering and settling under `prefers-reduced-motion: reduce`; a screenshot cannot show motion being absent, so the aid only documents that the settled frame is intact. The reduced-motion contract itself is enforced by the motion layer, which zeroes durations under that media query — and by the tests that assert it.

## The 2026-11-19 regeneration sweep

All 105 scenarios were re-run against a freshly built preview bundle and compared pixel-by-pixel with the committed captures. Result: 25 captures byte-identical; the rest differ only in volatile regions — the simulated status-bar clock and recording-pulse dot, CSS animation phase (sending ring, hold pill), and wall-clock-derived strings (the offline card's last-sync timestamp, mission timestamps, session relative times such as "193 hours ago"). Three real discrepancies were found and fixed:

- `navigation/03` and `navigation/06`: their click coordinates predated the quick-chips move out of the sheet (2026-11-16); the clicks landed on a chip / the sheet instead of the map canvas, so no destination was ever selected. Both scenarios now tap the canvas at (250, 250) — the point `navigation/02` already proved — and the captures were regenerated (the destination coordinates printed on the panel change with the tap point, by design).
- `sos/15`: the committed capture showed the *size* rejection ("source too large"), which needs a >15 MB source file and cannot be reproduced from a committable fixture. The scenario's committed fixture (`fixtures/not-an-image.txt`) deterministically produces the *format* rejection instead; the capture was regenerated to that variant. Both variants are the same inline, retryable composer error state.

Three narrow-viewport aids (`admin-narrow-users`, `admin-narrow-reports`, `admin-narrow-groups` at 1000 × 900) document the narrow admin layout — collapsed sidebar, full tables — as aids only.

## The 2026-11-19 capture-completion pass

Thirteen more captures closed the remaining reachable gaps (118 total). Loading states came from the `?slow=` knob above: `admin-states/01-loading` (the overview skeleton batch), `auth-12-onboarding-loading` (the onboarding loading composition), and `history/09-history-loading` — the history screen has no skeleton, so its first-load frame honestly shows chrome and filters with zero counts. `navigation/04-bookmark-saved` drives the real save flow (tap, form, submit, success toast). The remaining `missing` rows whose designed screens do not exist received closest-shipped-surface captures in the established pattern (`sos/09`, `sos/10`, `sos/11`, `navigation/18`, `companions/05`, `users/03-roles`), each named on its row with that exact caveat; `mission/04`, `mission/16` and `companions/03` name their shipped surfaces. Two rows remain deliberately uncaptured: `auth/08-recovery-questions-error` (the demo answers recovery answers unconditionally, so the error state is not reachable in the preview — the same documented limitation as the auth error path) and `mission/13-support-accepted-notification` (a realtime toast that cannot be reached deterministically; per the maintenance contract it stays unverified rather than fabricated). No row was flipped.

## Maintenance contract

- Re-run the captures for any reference whose component changes and land the capture delta with the change.
- Rebuild the preview bundle before capturing; a stale bundle produces stale evidence.
- Keep `scenarios.json` in step with the rendered test ids. If a state cannot be reached deterministically, treat it as unverified until a human adjudicates it — never present fabricated evidence.
- Update `docs/DESIGN_MATRIX.md` rows on code evidence only; the tallies live there, and visual acceptance stays a deferred human review.
