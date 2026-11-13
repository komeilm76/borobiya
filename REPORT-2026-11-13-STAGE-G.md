# Delivery report — Stages B through G (2026-11-13)

Branch `arena/250278b6-borobiya`, PR [#6](https://github.com/komeilm76/borobiya/pull/6) (**open, not merged, no tag, no GitHub release**), base `main`. This report covers the preview server (Stage B), the design-reference review (Stage C), consented track recording (Stage D), history discovery (Stage E), visual and functional acceptance (Stage F), and this close-out (Stage G). Dates: D on 2026-11-11/12, E on 2026-11-12, F/G on 2026-11-13.

## 1. Implementation status

| Stage | Commit | Status | Summary |
|---|---|---|---|
| B — visual preview server | (earlier) | Done | `build/preview-app` (git-ignored) served by `bun scripts/preview.ts` on port **4173**; homepage lists every genuinely completed page; every page reachable directly at `/app/<route>?persona=<admin\|user\|onboarding>`; realistic fake data; red demo badge when built with `VITE_PREVIEW_DEMO=true`. |
| C — design reference review | (earlier) | Done | 141 canonical references under `design/` cross-referenced and kept honest in `docs/DESIGN_MATRIX.md`. Counts **now**: 23 done, 75 partial, 25 missing, 12 superseded, 5 reference, 1 deviation (plus per-row notes). No row flips to `done` without human visual acceptance. |
| D — consented track recording | `b0b3328` | Done & verified | Trips and responder missions; see §5. |
| E — history discovery (minimal) | `5d24aa4` | Done & verified | Date-range chips, status/lifecycle chips, resettable empty states, per-tab summary lines, unfiltered badge totals. Vehicle/companions/toggles deliberately omitted (no backing data); `history/05` stays `partial` until human acceptance. |
| F — visual & functional acceptance | `80d93fd`, `faa2cf5` | Done (human sign-off pending) | 46 captures (23 pages × desktop 1280×900 / mobile 390×844) regenerated from the final build into `/home/user/visual-acceptance/`. Material defects found by inspecting the running app were fixed; see §3 and §4. |
| G — this report | untracked | Done | — |

## 2. Test and CI results

- `./boro verify` — **exit 0**: Vue + SW build, server `tsc`, client `vue-tsc --noEmit`, documentation guards (English-only docs, design image count, legacy-path absence), and the full Vitest suite: **1232/1232 passed** (96 files). Coverage: statements 94.07% / branches 87.42% / functions 94.62% / lines 96.24% — thresholds pass, no gate lowered.
- Note: the Stage E stage-log entry had quoted Persian chip labels and tripped `check-docs` (English-only); labels were restated in English in `faa2cf5` (meaning unchanged).
- One regression was caught and fixed in Stage F: `map-shell.test.ts` documents that the **profile** screen keeps the **history** tab highlighted in the pill (three of seven screens are not tabs themselves). An earlier preview-only experiment reverted that; it was restored in `faa2cf5` and the question is flagged for the owner (§7).
- CI on PR #6 ("Borobiya quality gate"): latest run **pass** (1m8s). The branch is mergeable.

## 3. Visual acceptance — what was reviewed (and what "reviewed" means)

Every one of the 46 captures was opened and inspected against the running preview (not mockups). **No page is visually approved** — visual approval is a human judgment (Stage F contract). "Reviewed" below means inspected + material defects fixed + re-compared on the final build.

| Page | desktop | mobile | Notes |
|---|---|---|---|
| login | reviewed | reviewed | Simplified vs design (recorded partial); renders cleanly both viewports. |
| register | reviewed | reviewed | Tall form scrolls; CTA no longer clipped at first paint (auth-panel fix). |
| recovery | reviewed | reviewed | Fine (simplified treatment, recorded partial). |
| onboarding | reviewed | reviewed | Fine (simplified treatment). |
| map | reviewed | reviewed | Saved-places sheet; sheet detents reworked (footer/CTA no longer pushed below frame). |
| sos | reviewed | reviewed | Step rail + severity grid render; CTA visible. |
| mission | reviewed | reviewed | Mission sheet + lifecycle rail; RTL OK. |
| talk | reviewed | reviewed | Known divergent vs reference (recorded; unfixed). |
| sharing | reviewed | reviewed | Create-share panel verified interactively (search/radios/duration); peers list styled. |
| history | reviewed | reviewed | Filter chips now use `--primary` (was an undefined `#0f6fff` fallback). |
| trips | reviewed | reviewed | Fine. |
| profile | reviewed | reviewed | Device-sessions row was unstyled/overlapping — fixed and verified. Sheet clips at detent but scrolls (by design). |
| adminOverview | reviewed | reviewed | KPI/chart/rows fine; mobile top bar no longer overflows (was 426px vs 390px viewport). |
| adminDispatch | reviewed | reviewed | Fine. |
| adminSupportRequests | reviewed | reviewed | Filter chips wrap; cards readable. |
| adminReports | reviewed | reviewed | CSV buttons fit; earlier perceived clipping was the demo badge overlay. |
| adminUsers | reviewed | reviewed | Table scrolls inside panel ≤1100px; page no longer overflows. |
| adminGroups | reviewed | reviewed | Known divergent vs reference (recorded; unfixed). |
| adminIncidents | reviewed | reviewed | Fine. |
| adminJobTypes | reviewed | reviewed | Policy text collapsed to one word per line — fixed (full-row text cell on small screens). |
| adminAudit | reviewed | reviewed | Toolbar fits; search capped at 240px (placeholder truncates ~90px — cosmetic). |
| adminAlerts | reviewed | reviewed | Fine. |
| adminSettings | reviewed | reviewed | Fine. |

Interactive spot-checks: Ctrl/Cmd+K command palette (was effectively unstyled — fixed and verified open/keyboard-active states), share-create search flow, register tall-form scroll, map sheet detents, admin mobile scrollWidth (all 390px).

### Defects fixed in Stage F (commits `80d93fd`, `faa2cf5`)

1. Bottom sheet detents used `translateY`, permanently pushing the footer/CTA below the frame edge (clipped, and content under it unreachable). Detents now set the visible window height (28/52/76%) with the body scrolling inside — verified on mission/sos CTAs.
2. Auth panel: `place-items:center` + unbounded height clipped the register CTA at first paint; now a flex column with internal scroll and auto-margin centring.
3. Admin console ≤1100px: the scoped `.admin-search` rule out-specified the global compaction, overflowing the top bar on 390px (scrollWidth 426–438). Repeated the rule in the scoped block — now 390px everywhere (probe-verified on all 11 admin pages).
4. Admin tables wrapped in `.panel:has(.admin-table){overflow-x:auto}` below 1100px (verified `scrollWidth > clientWidth`, RTL-scrollable).
5. `.admin-list` job-type rows collapsed beside two action buttons; text now takes the full row on ≤620px.
6. Missing styles added: admin page primitives (~25 selectors, session 2), command palette chrome (backdrop/panel/search/items), device-sessions list (it rendered overlapping inline text), peer-list avatar, toast close button, `mb-3`/`mt-3`/`my-3`.
7. History filter chips `--primary`; map sheet title/subtitle reflect idle vs destination state; admin body background uses `--surface-2`; preview build picks up repo-root `.env.preview` (`envDir`).
8. Docs guard regression (Persian labels in English-only docs) — restated in English.
9. MapLayout profile tab experiment **reverted** (kept the tested, documented history-pill contract).

## 4. Design-reference coverage and discrepancies

- 141 canonical references (154 PNGs minus 13 `_generator/_preview-*.png`): **23 done · 75 partial · 25 missing · 12 superseded · 5 reference · 1 deviation** (registry in `docs/DESIGN_MATRIX.md`).
- Deliberate, documented deviations: recovery-unknown-account enumeration resistance (matrix row 06); turn-by-turn trip planning superseded by the simplified SOS→mission workflow; Stage E history filter omits vehicle/companions/toggles (no data — will not flip to `done` until human acceptance).
- Known unfixed divergences (recorded, partial): login (top bar/heading lockup/social variants missing), talk screen, adminGroups density, bottom-sheet 28/52/76 detents never pixel-validated against `bottom-sheet.png`, dark-theme surfaces not re-validated this cycle.
- Superseded stage: the legacy multi-service roadmap (PostGIS/OSRM/Android/Docker) is superseded, not skipped — see `docs/ACCEPTANCE.md` "Legacy feature scope reconciliation".

## 5. Trip tracking — what shipped, retention, migration

- **Consent model**: account-level opt-in `users.record_track` (default **OFF**) + explicit per-context consent decision (`track_consents`) + active-context gating (a live trip, or a live mission the user participates in). Accuracy worse than the configured bound is rejected (`src/server/services/track.ts`).
- **Readers**: the trip/mission participants and recipients within the share scope; administrator track reads are audit-logged. No public exposure.
- **Retention**: raw points only. `TRIP_TRACK_RETENTION_DAYS` (default **180**, clamped 1–3650). An hourly batched purge deletes expired raw points; **before any purge, per-context trip/mission summaries are computed and persisted** (`track_summaries`: distance, duration, point count, first/last fix, quality) so distance/duration survive the point horizon. If summary computation fails for a context, its points are **kept** (fail-closed, logged) rather than silently deleted.
- **Migration**: additive only — schema v9 creates `track_points`, `track_consents`, `track_summaries` (+ indices) and `users.record_track` via `ensureColumn(... DEFAULT 0)`. Existing rows keep working; no destructive migration; summaries persist before purge so re-planning is safe. Down-migration not required by the change.
- Full rationale: `docs/TRIP_TRACK_PROPOSAL.md` and the "Stage log" in `docs/IMPLEMENTATION_PLAN.md`.

## 6. Running the visual preview (start here)

```bash
bun install                 # once
bun run preview:build       # build/preview-app (git-ignored; REQUIRED after any client patch)
bun scripts/preview.ts --skip-build   # serves http://localhost:4173
```

Then open `http://localhost:4173/` — the preview homepage lists every completed page.
Direct entries (personas): `?persona=admin` (operations console), `?persona=onboarding` (security-question onboarding), `?anon=1` (logged-out auth pages). The bundle is built with `VITE_PREVIEW_DEMO=true`, so a red **نمایش با دادگان ساختگی** (fake data) badge shows on every screen — expected, and it intentionally occludes the bottom-inline-end corner in captures.

Data is deterministic fake data (SVG tiles, seeded demo users/missions/trips). Current server in this workspace is live on **127.0.0.1:4173** (`/app/...` routes return 200). Captures: `/home/user/visual-acceptance/*.png` (46 files, regenerated 2026-11-13 from the final build).

## 7. Remaining limitations, risks, incomplete work

- **No human visual approval on any page yet.** All 46 pages are reviewed-by-agent only; approval flips matrix rows and is explicitly the owner's call.
- Admin data tables at ≤1100px scroll horizontally inside their panel (deliberate minimal fix, not a designed responsive table); job-type/audit/users tables are dense.
- Admin mobile top bar shows the status pill + collapsed search icon (no full search field) — fine but cramped.
- Register taller than a phone viewport scrolls (expected); the demo badge overlaps the CTA in captures (demo-only).
- Profile keeps the history pill highlighted per the tested contract — if the owner prefers no pill on profile, that is a one-line change plus the test expectation; flagged, not changed.
- Dark theme had a smoke check this cycle (map/history/sos/admin); the white-on-light chrome and admin active-item contrast bugs it surfaced are fixed. A full dark-theme audit and the reduced-motion capture pass remain open.
- 75 partial + 25 missing matrix rows remain; none of them silently redefined (see `docs/DESIGN_MATRIX.md`).
- Coverage dip vs 94.14% statements last report (94.07%) — within noise, thresholds pass.
- CI run for the final commit (`faa2cf5`) passed as of 2026-11-13; PR #6 stays **open and unmerged**; effective `main` is untouched.
- `REPORT-2026-11-12-STAGES-6-7.md` (earlier session report) remains untracked and is intentionally not committed.

## 8. Items needing your review / decision

1. **Merge decision for PR #6** (open, mergeable, CI green). No tag/release will be created without explicit instruction.
2. **Human visual acceptance** walk-through — the tooling is ready (`capture.mjs`, `shot.mjs`, `shotm.mjs` in `/home/user/visual-tools/`, output in `/home/user/visual-acceptance/`).
3. **Profile parent-tab contract** (history pill highlighted on `/_user/profile`) — keep as tested, or change code + test together.
4. Whether `history/05` flips to `done` after your pass, and the dark-theme/contrast review.
5. The three recorded reference divergences (login, talk, adminGroups) — fix in a follow-up or re-scope explicitly.
6. Release call for 2.0.0 (IMPLEMENTATION_PLAN Stage 7) — deliberately untouched; E/F/G do not rename or skip it.

## 9. PR / release state

PR #6 "Migrate runtime to Bun 1.4.4 and client to Vue 3 (2.0.0)" — **OPEN**, `MERGEABLE`, not draft, base `main`, head `arena/250278b6-borobiya`, latest quality-gate run **pass**. No merge, no tag, no GitHub release created. Commits on the branch: `b0b3328` (Stage D), `5d24aa4` (Stage E), `80d93fd` (Stage F visual acceptance pass), `faa2cf5` (docs-guard + parent-tab contract fix), `6c319dc` (second pass: dark-theme chrome, toast dismissal, dead utilities), `e67b180` (design-matrix second-pass log). CI green on the latest commit.


## 10. Second pass (2026-11-13, continued) — reference comparison and bug hunt

The owner asked to check the completed pages against the design images and fix bugs. Work done:

- **Systematic comparison** of all 46 captures against the canonical references, family by family
  (auth 16, map design-system/navigation/sos/mission/history/sharing/profile, admin console), plus a
  dark-theme smoke check and a scripted interactive bug hunt (23-route console/page/request sweep:
  zero errors; 11 interaction checks: all green after correcting two test expectations to the
  documented demo/preview and Vuetify behaviors).
- **Bugs found and fixed** (`6c319dc`): toast close buttons were unclickable (`pointer-events`
  root with no child opt-in); hard-coded light translucent chrome (`.quick-chip`, `.round-control`,
  `.connection-badge`, `.live-chip`, `.admin-topbar`) became light-on-light in dark theme — dark
  twins added; the admin sidebar active item used `--primary-deep` on `--primary-soft` (invisible in
  dark) — now `--primary`; `.mt-2` (SOS screen) resolved to nothing (Vuetify helpers not bundled) —
  defined; dead `#sos-description` rule removed. All verified on the rebuilt preview (46 captures
  regenerated; dark map/history/sos/admin legible; `./boro verify` exit 0, 1232/1232, coverage
  94.14% / 87.4% / 94.52% / 96.25%).
- **Checked and deliberately kept**: profile keeps the history pill highlighted (tested contract);
  the admin topbar "اتصال مجدد…" pill copy is the documented disconnected state pinned by
  `tests/admin-layout.test.ts` (the preview has no WebSocket; the fake-data badge frames it);
  `#sos-description` removed, `.placement-armed`/`.is-spinning`/`.char-count` confirmed styled;
  demo-auth accepts any credential by design (persona follows username — the auth error path is not
  previewable; server-side rejection is tested); the SOS description minimum is enforced at submit,
  by design (documented in code).
- **Comparison outcome**: every remaining reference↔implementation gap is a recorded matrix row
  (75 partial / 25 missing / 12 superseded); no status was flipped. The most visible ones for your
  acceptance walk-through: login vs `01-login.png` (no top bar/lockup), auth mobile (brand panel
  hidden rather than the designed compact strip), bottom-sheet detents unvalidated, mission offer
  red banner absent, admin overview without operations map/alerts/group-availability column, admin
  reports without deltas/period/donut, admin users without avatars/last-login, no admin skeletons.
  Auth composition and the mobile brand strip were intentionally not rebuilt — that scope decision
  belongs to you.
- **CI**: PR #6 quality gate is green at `e67b180`. PR remains open; no merge, no tag, no release.

Files changed in this pass: `src/client/app.css`, `src/client/layouts/AdminLayout.vue`,
`docs/DESIGN_MATRIX.md`. The preview server is still live on 127.0.0.1:4173; the visual-acceptance
captures are current for the final build.

## 11. Third pass (2026-11-13, continued) — defects from direct inspection

The sweep continued after §10 with a close read of the register/onboarding, the admin users list
against `users/01-list.png`, the SOS composer against `sos/19` (validation), and the dark theme.
All fixes verified on the rebuilt preview; all 46 captures were regenerated at each rebuild and
the final set was pixel-diffed against the pre-purge captures (identical except the live
status-bar clock).

- **Security-question selects rendered dirty-but-blank** (`a752276`): `ref(['',…])` seeded
  Vuetify selects with a present-but-unknown value — no placeholder, no combobox affordance, a
  "dirty" empty field. Slots now initialize to `null` and map to `''` only at the payload
  boundary (server still sees five positions). Verified in both pages' captures.
- **Dark-mode map tiles rendered light** (`da43856`): the tiles are `<img>`s with inline
  positioning and never carried `map-tile`, so the dark filter authored for them never ran.
  The class is applied; dark map screenshot verified.
- **Dead legacy design system** (`45d1d05`): roughly 400 lines of unreachable CSS from a
  superseded iteration removed from `app.css` (admin KPI/card/modal/stepper set, auth chrome,
  POI/overlay marker classes, skeleton/shimmer, unused toast variants, orphaned keyframes),
  keeping Vuetify runtime classes and the dynamically constructed `toast--${tone}` variants.
  LightningCSS parse + rebuild + capture diff + `./boro verify` (exit 0) all clean.
- **Evaluated, deliberately not changed**: the SOS short-description gate lives at submit by
  design — `tests/sos-view.test.ts` pins click-then-explain behavior, so the `sos/19`
  disabled-button composition stays a product decision; `admin users` parity gaps remain the
  recorded matrix rows (230–232); the SOS description minimum, demo-auth, and the admin
  topbar disconnected pill remain as previously documented.
- **Verification**: `./boro verify` exit 0 (coverage 94.06 / 87.39 / 94.62 / 96.24); 46/46
  captures regenerated at each rebuild; map-shell pages pixel-identical apart from the clock.
  Commits: `a752276`, `da43856`, `45d1d05` — CI green through `da43856`; the `45d1d05` run and
  this report's commit are pending at the time of writing.
- **CI note for the record**: build-time pipes in this session masked exit codes once; builds
  are now checked unpiped (`preview:build` exit 0 confirmed for `45d1d05`).

## 12. Fourth pass (2026-11-13, continued) — Wave-1 design-system tokens, RTL mirroring, auth cluster

This pass began the "Comprehensive UI Visual Audit & Pixel-Accurate Design Implementation"
mandate. Scope executed this session: Phase A inventory refresh, Phase B (design-system
tokens/foundations), and Phase D (auth cluster: login, register, recovery, onboarding +
AuthLayout). Map/admin/guides phases are not complete and are tracked below as pending.

### Systemic fixes (all pages affected, all verified by rebuild + capture)

- **Vuetify controls were laid out LTR on an RTL page** — `createVuetify` never declared the
  RTL locale, so field icons sat on the leading edge, labels hugged the left, and the password
  eye toggle mirrored wrong. `plugins/vuetify.ts` now declares `locale: { locale: 'fa', rtl: { fa: true } }`
  with the `fa` messages pack. All 1232 tests still pass; every capture regenerated. This is the
  single highest-leverage correctness fix for the whole surface: no per-view patching was
  required, and no LTR exception remains anywhere in the tree.
- **Button/CTA radius pinned to the design value (14px)** — per-row left-edge PIL scans of
  two independent refs (map controls.png, sos CTAs) agree on ≈14px: `--r14: 14px` added,
  `.primary-button`/`.ghost-button`/`.danger-button` moved to it, `--v-border-radius-lg: 11px`
  per admin foundations (admin button floor 11), `--r11: 11px` added; `.admin-action` and
  `.admin-select` use `var(--r11)`; dead `.field` rule removed.
- **Sheet handle + danger CTA + round controls** — `.sheet__handle` (64×5 pill) renders in
  `MapLayout` (was missing entirely vs `bottom-sheet.png`); `SosView` submit now uses the
  `.primary-button--danger` variant added to `app.css`; `.round-control` is a true 50% circle.

### Auth cluster rebuilt to the references (refs at 1440×900 / 1440×1400 / 1440×1000)

- `AuthLayout` rewritten: floating top bar (brand link `/assets/logo.svg` + «بورو بیا», home
  pill «صفحه اصلی», circular theme-toggle via `settings.cycle()` with `mdi-weather-night` /
  `mdi-weather-sunny`), 5fr/6fr split card (radius `--r26`), trailing brand panel
  (165° teal gradient, per-screen badge pill with yellow dot, two-line headline with yellow
  accent line, radar art, glass «حساب شما امن می‌ماند» card) and leading form panel.
- Brand copy is authored per screen in typed route meta (`router/index.ts` `RouteMeta.brand`):
  login «ورود امن به بورو بیا»/«یا هم، آماده‌تر هستیم.»; register «یک قدم تا همراهی»/«حسابی امن،
  همراهی نزدیک.»; recovery «بازیابی امن حساب»/«دوباره به حسابتان برسید.»; onboarding
  «یک مرحله ضروری»/«از حسابتان بهتر محافظت کنید.».
- New `components/AuthHeading.vue` (icon tile + eyebrow + title lockup) used by all four views;
  eyebrow/title steps (مرحله ۱/۲/۳ از ۳, تکمیل راه‌اندازی حساب) match the ref compositions.
  Register keeps the «پیج پنج پرسش» security-question factory and `#reg-*` ids; recovery keeps
  `.auth-card__question` rows (tests updated only for the renamed step heading: `.auth-heading__title`);
  onboarding keeps `.auth-card__hint` («پنج پرسش» substring preserved).
- Ref-viewport captures (`visual-acceptance/*-ref.png`) now exist for all four auth screens via
  an extended capture harness; they render on-brand: warm sage stage wash, split card, floating
  labels, trailing icons — visually compared against `design/auth/01-login.png`,
  `03-register.png` (content is the «مرحله ۱ از ۳» variant; filename/content offset noted again),
  `05-recovery-account.png`, `11-onboarding.png`.
- Note on ref artifacts: the refs depict a different logo mark (teal rounded-square plus); the
  repo's own `/assets/logo.svg` compass is kept deliberately — swapping brand marks is a
  product decision, not a CSS fix.

### Verification

- `./boro verify` exit 0 (1232/1232 tests; coverage 94.14 / 87.45 / 94.49 / 96.25).
- `bun run preview:build` exit 0; full capture suite clean (46 screens) plus 4 `-ref` captures.
- Icons added to the shipped WM subset requirement were checked against
  `design/icons/icons.json` (comment-question-outline replaces shield-question-outline, which
  is not shipped).

### Not done / open

- Phase B: **CONFIRMED reference conflict — human decision required.** Exact-pixel scans:
  map `colors.png` swatches `#28724F` (success), `#8C5609` (warning), no mission token; admin
  `01-foundations.png` prints `#2C7A57` (success), `#A9690B` (warning), `#8A4B0F` (mission,
  «تأکید مأموریت امداد، نمودار» — relief-mission emphasis/charts) under its swatches. Both are
  deliberate, both are equal-authority design-system refs, and they cannot both be satisfied by
  one token set. `app.css` still ships the map set (`#28724F`/`#8C5609`, no mission token) — no
  tokens were changed. Decision needed: either (a) admin foundations wins and `:root` gains
  `--success: #2C7A57; --warning: #A9690B; --mission: #8A4B0F` (map then drifts), or
  (b) map wins (admin drifts), or (c) scoped override — admin shell uses the admin set locally,
  map keeps the map set. Option (c) preserves both refs without global churn. Record the call
  here when made; `./boro verify` and both capture suites must be re-checked after it.
- Phase C (log evidence), Phase D remainder (admin panel per-screen pass vs its 22 refs,
  map pages vs 69 refs, guides, profile, mission, history), Phase E (tablet/mobile sweep with
  ref viewports), Phase F (before/after composite set) — all pending.
- DESIGN_MATRIX rows flip only with human visual acceptance; none flipped this pass.
- Visual approval remains with the human reviewer; no merge/tag/release.
- Commits this pass: Phase-B/auth/RTL edits are uncommitted pending this report; CI state at
  the time of writing is green at `17df4bf` (docs-only commit that precedes these edits).

## 13. Fifth pass (2026-11-13, continued) — non-auth clusters: pages, components, materials

Scope this pass: every route except the auth family (accepted), the shared shells, the
shared stylesheets, and the design-system refs that pin them. RTL correctness across Vuetify
controls landed earlier this session (§12) and is assumed below.

### Bugs found and fixed

- **Map overlay carried a one-tap «خروج» (logout) round-control** (`MapLayout.vue`): a
  mis-tap target on the safety screen, absent from every ref. Kept — but ONLY because
  `tests/map-shell.test.ts` pins it — AND paired with the corrective fix: ProfileView now has
  the ref-backed red «خروج از حساب» danger button at the sheet bottom (`data-testid="logout-button"`),
  ending the session and routing to login (socket disconnected). The map-overlay button stays
  until the pin is retired with the owner's agreement; both paths now exist.
- **Mission offer severity pill was always red** (`MissionView.vue`): `status-pill--danger`
  unconditionally for کم/متوسط/شدید. New `severityTone()` in `utils/status.ts` maps
  low→success, medium→warning, high→danger — measured dot colours in `sos/03-sos-compose.png`
  are exactly #28724F/#8C5609/#AF3438.
- **SOS severity dots used colours matching no reference** (`SosView.vue`): hard-coded
  #2C7A57 (admin swatch) and #B57A12 (--amber) for low/medium. Now `var(--success)` /
  `var(--warning)`; high already `#AF3438` → `var(--danger)`.
- **Admin sidebar/topbar vs `dashboard/01-overview.png`**: added the reference information
  architecture — section groups (عملیات / مدیریت / سامانه), bottom user card
  (avatar initials «AD» + username + role label), bell button linking to «هشدارها» with a red
  dot when open alerts exist, and the reference search placeholder «جستجوی کاربر، مأموریت یا حادثه…».
  No test-pinned selectors changed (`.admin-nav__item`, aria-current, `.admin-nav__badge`,
  `.admin-search[aria-label=جست‌وجوی فرمان]`, `.admin-link-button` all intact).
- **Admin users table** (`users/01-list.png`): avatar-initial circles added to the کاربر cell,
  raw enum role column now renders Persian labels (امدادگر / کاربر / مدیر), and the «جست‌وجو»
  action is solid primary instead of Vuetify tonal (which rendered near-black).
- **Dead CSS purged**: 27 rules unreachable from any client/server/test source removed
  (auth stepper/recovery/panel remnants, connection-badge, error-panel, queue-card, live-chip,
  admin-dispatch/queue/filter/tabs/map/button, segmented-control, talk-hold, offline/report
  panels). The `stores.test.ts` comment that cited the removed `.connection-badge[data-offline]`
  contract was updated to describe the surviving `data-offline` attribute mechanism.
  Map chips (24) vs admin chips (12) both retained — correct per their own refs.
- **Duplicated CSS comment** in the 620px media query (pre-existing) deduplicated.

### Token conflict evidence, now complete

Exact-pixel scans across ALL refs (all 141): `#28724F`/`#8C5609` appear only in map-page
refs (incl. colors.png), `#2C7A57`/`#A9690B` only in admin-panel refs (incl. the printed
swatches in foundations). `#8A4B0F` (mission brown) appears in BOTH families and the mission
rail refs (mission-state.png is dominated by it); map colors.png does NOT print it but
several mission/history refs use it. `app.css` ships `--mission: #8A4B0F` unused; map ships
`--success/--warning` as the map values. The success/warning conflict remains
**OPEN — owner decision required** (admin wins / map wins / scoped `.admin-shell` override).
No token values were changed this pass.

### Verification

`./boro verify` exit 0 (1232/1232). `bun run preview:build` exit 0; full capture suite
(46 screens + 12 `-ref` ref-viewport captures) regenerated and visually spot-checked
(map, sos, mission, sharing, history, profile, admin overview/users) — no regressions;
map-shell clock drift only on the map pages.

### Deliberately not changed (owner decisions, not bugs)

- Map idle shows the sheet at 'half' detent (`tests/stores.test.ts` pins it); refs depict the
  collapsed search-pill state — a product call with test evidence behind it.
- The assigned-mission (server-dispatch) model vs the ref's open-offer marketplace with
  countdown timer — product scope; tracked in DESIGN_MATRIX mission rows.
- Mission offer severity, requester phone, and distance stat cards from `mission/03` are not
  all present (server sends a leaner offer view) — recorded in matrix.
- One-tap map logout retained pending owner decision (see above).
- Admin KPI delta badges, live-map card on overview, bulk actions, pagination, avatars with
  phone numbers, and CSV export from `users/01-list.png`/`dashboard/01-overview.png` are
  feature builds, not fixes; matrix rows stand.
- Visual approval remains with the human reviewer; DESIGN_MATRIX rows unchanged; no
  merge/tag/release. Commits this pass are pushed to `arena/250278b6-borobiya`.

## §14 — Sixth pass (2026-11-13): raw-enum/icon purity, settings-preview fidelity, mobile admin navigation

Scope: PNG-vs-page sweep of the admin console and user cluster, plus a mobile shell audit.
All 141 refs were not re-litigated; this is a bug-hunt pass over what the capture suite renders.

### Fixed (client-visible)

1. **Raw enums leaking into the admin UI** (the recurring bug class):
   - `OverviewView` «درخواست‌های اخیر» status pill now renders `statusLabel()`/`statusTone()`
     (was the raw `SOS_STATUS` key in a neutral pill).
   - `ReportsView` «توزیع وضعیت درخواست‌ها» rows render `statusLabel()` (was raw keys).
   - `AlertsView` kind column now maps `responder_offline`/`location_stale`
     (the two kinds the demo fixtures actually emit) plus coverage/sos/mission_offers_expired;
     fallback keeps the raw kind rather than inventing a translation.
   - `AuditView` action column maps the audit actions the server emits (`mission_offer_accept`,
     `support_request_approved`, `user_ready_toggle`, `admin_login`, `mission_complete`,
     `share_create`, plus the `admin.ts`/`sos.ts`/`teams.ts` families) to Persian labels;
     unmapped actions render verbatim — inventing a translation misstates the event.
   - `DispatchView` queue severity/group status and `GroupsView` group status go through
     `SEVERITY_LABELS`/`groupStatusLabel()` (new exports in `utils/status.ts`).
   - `ProfileView` header role renders Persian (`ROLE_LABELS`), was `auth.user?.role`.
   - `HistoryView` mission severity now uses the shared `SEVERITY_LABELS`
     (high: «شدید», matching the rest of the app; was a local copy with «زیاد»).
2. **«مأموریت جاری» KPI icon** was `mdi-web` (a browser glyph) → `mdi-crosshairs-gps`
   (verified present in the shipped icon subset).
3. **Incident/job-type identifier rows** now read «شناسه: inc_fire» / «شناسه: jt_fire»,
   matching how the incident-types reference prints its keys (`شناسه: medical`).
4. **Settings screen showed five invented setting keys** (`dispatch_radius_m`,
   `offer_ttl_seconds`, `offline_alert_minutes`, `max_team_size`, `location_stale_minutes`)
   that the real server neither seeds nor accepts on PUT — the preview was lying about the
   operational surface. Demo fixtures now mirror the server seed exactly
   (`sos_auto_dispatch`, `default_dispatch_radius_m`, `mission_ready_required`,
   `maintenance_mode`) and the form labels all four. `mission_ready_required` added to
   the boolean validator (`'0'`/`'1'` rule).
5. **Health panel read `health.dataVersion`** — a field that only exists on the *public*
   health endpoint; the admin payload (`services/admin.systemHealth()`) has `serverTime`,
   not `dataVersion`, so the row always rendered «—». Row replaced with «زمان سرور»
   (`mdi-clock-outline`) fed by `health.serverTime`; «کاربران» (`database.users`) and
   «اتصال‌های زنده» (`realtime.connections`) unchanged and now fed by a demo fixture that
   matches the real shape (`database: repo.stats()`, `realtime: hub+realtime stats()`).
6. **Admin had no navigation at ≤1100px** — the sidebar was `display: none` with no
   alternative, stranding phone/tablet operators. AdminLayout now has a hamburger in the
   topbar that toggles an off-canvas drawer (`role="dialog"`, `aria-modal`, Escape/backdrop/
   route-change close, `aria-expanded` on the trigger). The nav markup moved into
   `components/AdminNav.vue`, rendered by both the fixed sidebar and the drawer so they
   cannot drift; tests pin the 11 destinations, `aria-current`, drawer open/Escape/backdrop/
   route-close, and that the drawer renders full labels (not icons-only).
7. **Search button rendered as a blank rounded box on mobile** — the global compaction rule
   `.admin-search span { display:none }` also hid the magnifier (a `<span>`); selector fixed
   to `span:not(.mdi)` (same bug class fixed for `.admin-search span` on desktop).
8. **Legacy ≤900px `.admin-nav` compaction** hid the drawer's labels (dead rules from when the
   sidebar compressed to icons); removed, along with the duplicated global `.admin-nav*` block
   (scoped `AdminNav.vue` is now the single owner) and the dead ≤1100px `.admin-shell` column.
9. **Filter inputs collapsed to ~55px** carrying only «جسس» of their placeholder —
   `.panel__filters .v-text-field` now gets `flex: 0 0 auto; width: 240px; min-width: 170px`
   (Vuetify's own flex sizing won over the previous `flex: 0 1 240px`).
10. **A11y contract test** updated to read `AdminNav.vue` for the navigation-landmark
    assertions (markup moved out of AdminLayout; shell keeps the `<aside>` landmarks).

### Verified

`./boro verify` exit 0 — 96 files / 1235 tests, statement coverage 94.02% (≥94% gate).
`bun run preview:build` exit 0; capture suite regenerated (58 OK, 0 FAIL); drawer flow
checked in a real browser (11 items, Escape closes). Checks: admin desktop/mobile captures
reviewed for all twelve admin screens; user-cluster spot checks clean; desktop sidebar
unchanged after the CSS cleanup.

### Notes / not changed

- Red «پیش‌نمایش با دادگان ساختگی» pill is the intentional preview contract (previews must
  never look like real data) — kept, `pointer-events: none`.
- Tokens (`--success`/`--warning` map-vs-admin conflict) untouched — still owner's decision.
- `target` column in the audit view renders raw ids (e.g. `sos_1`) by design; the server sends
  only the id there, and resolving names client-side would fabricate data.
- Admin CSV export keeps raw action keys on purpose (machine-readable output).
- DESIGN_MATRIX untouched; PR stays open; no merge/tag/release; visual approval = human.

## §15 — Seventh pass (2026-11-13, continued): recording indicator placement, undefined CSS tokens, oval icons

Scope: two defects reported after the sixth pass — the mission track-recording pill overlapping the
top navigation, and "icons rendering as ovals instead of circles" in some sections. Bug-hunt, no
new features; DESIGN_MATRIX unchanged; PR stays open; visual approval remains the owner's call.

### Fixed (client-visible)

1. **TrackRecordingIndicator overlapped the top pill.** The pill
   (`.top-pill`, `top: 64px; height: 44px`) owns y≈64–108; the indicator was
   `inset-block-start: 96px; z-index: 25`, so it painted 12px over the active «تاریخچه» tab and
   crossed the avatar tile. The indicator is now anchored `inset-block-start: 116px` (pill bottom
   + 8px) and centered horizontally (`inset-inline: 0; margin-inline: auto; inline-size:
   max-content`) instead of pinned to the inline-start edge, where it collided with the right-hand
   map controls (edge controls start at y≈128).
2. **Two components referenced CSS custom properties that do not exist anywhere** —
   `var(--surface-1)` (TrackRecordingIndicator, TrackConsentPrompt) and `var(--text-1)` /
   `var(--text-2)` (indicator, consent prompt, TrackReplayPanel) — so their backgrounds computed
   to transparent and body text inherited instead of using the intended muted tone. On the light
   map that meant the recording pill was see-through with weak text contrast.
   - `var(--surface-1)` → `var(--surface)` (indicator, consent prompt), plus `box-shadow:
     var(--shadow-md)` on the indicator for separation from the map;
   - `var(--text-1)` → `var(--text)`; `var(--text-2)` → `var(--muted)` (4 occurrences).
   A full sweep of `var(--*)` references vs definitions across `src/client` shows the remaining
   undefined names all carry fallbacks (`--line-1`, `--muted-ink`, `--bb-route-duration`).
3. **The same overlap affected TrackConsentPrompt** (`inset-block-start: 96px; inset-inline: 12px`
   → `inset-block-start: 116px`); it is full-width under the pill and was clipping the same tabs.
4. **Oval (stretched-circle) icons in the saved-places rows.** `.place-row > .mdi:first-child` is a
   fixed 34×34 circle (`border-radius: 50%`), but the generic `.place-row span { flex: 1 }`
   rule also matched it, so `flex-basis: 0; flex-grow: 1` stretched the "circle" to fill the row
   (~129×34px on the map sheet, ~102×34px on profile → ellipse). Home / work / hospital place-row
   icons on the map sheet and the profile saved-places list all rendered as ovals.
   - `.place-row span` → `.place-row span:not(.mdi)`;
   - `.place-row > .mdi:first-child` now carries `flex: none` (mirrors the existing
     `.peer-row > span:not(.peer-row__avatar)` pattern used elsewhere in the same stylesheet).

### Verified

- Automated oval sweep (elements with `border-radius ≥ 40%` and |w−h| > 2px) over 27 page/viewport
  combinations — mobile light + dark (map/sos/mission), desktop admin (overview/users/groups/
  alerts/dispatch/settings/audit/reports), desktop auth (login/register/recovery), mobile user
  cluster, onboarding: **before** the fix, 6 ovals (map ×3, profile ×3, all the place-row icons);
  **after**, **0 ovals** everywhere. (First scan attempt used wrong routes and hit the catalog
  redirect — rerun with the `/app` history prefix; results above are the correct runs.)
- `mission-mobile.png` re-inspected: indicator sits fully below the pill, centered, solid white
  surface, red border/stop/dot — no overlap with pill, avatar tile, or tabs.
- `map-mobile.png` re-inspected: home/briefcase/hospital icons render as true circles.
- `./boro verify` exit 0 — 96 files / 1235 tests, statement coverage **94.09%** (gate ≥94%).
- `bun run preview:build` exit 0; capture suite regenerated (**58 OK, 0 FAIL**).
- KPI squircle chips and the `rounded` auth/map presence tiles (`--r16`) are intentional
  rounded-square design, **not** ovals — left unchanged. SOS severity dots and rail step circles
  were measured ≈13px and are circular. `peer-row__avatar` is a fixed 38px `50%` circle and was
  already correct. `CommandPalette`'s `clip-path: inset(50%)` is the standard visually-hidden
  pattern, not a shape bug.

### Carried-over notes from §14 (omitted there)

- The drawer fix in `ced3417` also made the drawer content grow past the viewport so it scrolls
  instead of clipping the footer (`.admin-drawer :deep(.admin-nav-content) { block-size: auto;
  min-block-size: 100% }`), and compacted the topbar below 620px: the operator paragraph hides
  (`.admin-topbar p { display: none }`) and the title goes `15px` + `nowrap`. Verified on
  SupportRequests only — other admin screens were not individually re-checked at that width.
- AdminLayout still wires `useCommandPalette(() => [])` — the palette opens empty by design until
  a command source is implemented; intentionally unchanged.

### Not changed / open

- Token conflict (`--success`/`--warning` map-vs-admin) remains the owner's decision (§4/d5d78a5).
- DESIGN_MATRIX untouched; PR #6 open and unmerged; no tag/release; visual approval = human.
- Other admin screens at ≤620px not re-inspected (only SupportRequests verified) — flagged, not claimed done.

## §16 — Eighth pass (2026-11-13, continued): dark-theme contrast sweep

Scope: user-reported "texts inside tabs or buttons in dark mode is not visible" and
"titles & fields and content in dark mode have wrong color". Full token audit plus a fresh
46-capture dark suite (all 23 pages × desktop/mobile, prefers-color-scheme: dark); every capture
was opened and inspected, not just computed.

### Root causes fixed

1. **Vuetify's dark theme was never activated.** `borobiyaDark` existed in `plugins/vuetify.ts`
   but nothing ever assigned it, so every Vuetify control in the admin console (tables, text
   fields, buttons, chips, dialogs) stayed light while the custom shell around it went dark —
   the "titles & fields & content have the wrong color" report. `App.vue` now follows
   `settings.resolvedTheme` and calls `vuetifyTheme.change('borobiyaDark' | 'borobiyaLight')`
   (watch, `immediate: true`). Verified: admin Users table, Settings form, Groups form,
   SupportRequests filters/cards, palette and drawer all render dark with readable on-surface
   ink; light mode unchanged. (First implementation used the deprecated
   `theme.global.name.value =` setter — warning seen in tests — replaced with `change()`.)
2. **White text on dark-mode accent fills.** Dark accents are light pastels (`--primary`
   #71C7BE, `--danger` #E4787C, `--warning` #D7A44D, `--info` #73B1C8), so `color: #fff`
   failed contrast on exactly the "tabs and buttons". New `--on-accent` token
   (light `#FFFFFF` / dark `#082222`); all accent-fill text switched to it:
   `.primary-button`, `.primary-button--danger`, `.top-pill__item.is-active`, `.user-marker__dot`
   (app.css and MapCanvas), `.sos-button`, `.rail__step.is-done i`, `.skip-link`,
   `.history-chip.is-active`, `.history-tab.is-active`, `.talk-button`, `.offline-banner`,
   `.track-rec__stop`, `.admin-nav__badge`, `.map-marker*`. Three redundant per-component dark
   overrides deleted (now covered by the token). `.sos-button__progress` now `currentColor`.
3. **`--primary-deep` used as foreground text.** In dark it is `#0A3D3D`, i.e. dark-on-dark.
   Rendered «درخواست‌های من ۴» (History subtab) and the active «در انتظار بررسی» filter in the
   support-request review queue effectively invisible — the exact reported bug. All five uses
   (`.history-subtab.is-active`, `.admin-filter.is-active`, `.team-requirement.is-filled`,
   `.support-item__approved`, `.support-review__selected.is-ok`) now use `var(--primary)`.
4. **Hex fallbacks carrying light-only values.** `var(--muted-ink, #4C5F60)` (trips/share rows,
   dispatch labels), `var(--warning, #c78b1e)`, `var(--border, #d8dedd)`, `var(--surface, #fff)`,
   `var(--muted, #66706f)`, `var(--primary-soft, #eef4f3)` — all now reference the tokens alone,
   which flip correctly in dark.
5. **Sparkline stroke** on the overview trend chart hard-coded `#0E6666` (seriesColors[0]) —
   invisible on the dark panel. Now `stroke="var(--primary)"` (identical #0E6666 in light).
   The canonical `adminSeries` legend dots keep the frozen design-system hexes (labels/numbers
   carry the data; see notes).

### Verified

- Captures regenerated: 58 light OK (0 FAIL) + 46 dark OK (0 FAIL); both suites re-checked by eye.
  Light regressions spot-checked (sos/history/mission/adminOverview — all unchanged).
- Dark palette (Ctrl+K) and dark mobile admin drawer rendered and inspected: fully readable.
- `./boro verify` exit 0 — 96 files / 1235 tests; statements 94.03% (gate ≥94%); typecheck clean;
  docs guard clean. (Statement coverage moved 94.09% → 94.03% with the App.vue theme watch, still
  above the gate.)
- Commits: this section lands with the eighth pass commit; PR #6 stays open, CI re-checked after push.

### Notes / not changed

- `DESIGN_TOKENS.adminSeries` (chart legend dots) is the frozen design-system series; two of the
  five dark-brown dots are dim on the dark panel but sit next to labels and values. If the owner
  wants a dark-mode series variant, that is a design-system decision (token change), not a CSS patch.
- Auth brand panel is intentionally always-dark (constant teal) in both themes — unchanged.
- Map tiles dark filter (`brightness/saturate/hue-rotate`) unchanged — visual acceptance item.
- Consent prompt still has no preview-fixture trigger; unchanged (`--surface`/`--muted` fixed earlier).
- DESIGN_MATRIX untouched; PR #6 open; no merge/tag/release; visual approval = human.

## §17 — Ninth pass (2026-11-13, continued): full re-review against the 141 references — logout confirmation, admin palette trigger, light-theme `--on-accent`, preview pill, checkboxes

A fresh review pass over every reference family, comparing pages, components and materials
against the build. No DESIGN_MATRIX flips; PR #6 stays open; visual approval remains the owner's.

### Fixed (with evidence)

1. **Profile logout had no confirmation (design: profile/06-logout-confirm.png).** One tap on
   «خروج از حساب» ended the session instantly — disastrous for an SOS responder mid-shift and a
   direct contradiction of the reference dialog («از حساب خارج می‌شوید؟», current device, SOS
   re-login warning). ProfileView now opens a proper `role="dialog"` aria-modal confirmation:
   heading, body, current-device row (name + last activity from the sessions payload), amber SOS
   warning, solid-danger «خروج» + «انصراف», scrim-click and Escape to dismiss
   (`logout-confirm*` testids). The wide button keeps the ref's soft danger fill; the dialog CTA
   now uses the filled style from the ref. Dialog closes immediately on confirm so a hanging
   navigation can never leave it as a dead overlay. 5 new tests pin the behaviour; the acceptance
   is visually verified in both themes
   (`/home/user/visual-acceptance/profile-{light,dark}-logout.png`).
2. **Admin topbar «جست‌وجوی فرمان» button did nothing.** It toggled a private, entry-less palette
   instance owned by the admin layout while the global `<CommandPalette />` (which holds the real
   command registry and the Ctrl+K binding) rendered nothing. The trigger now flips the new shared
   `commandPaletteOpen` flag (`composables/useCommandPalette.ts`), which the global palette binds
   via an optional `openRef` parameter; the phantom instance and the layout's dead Ctrl+K handler
   are gone (the composable's own `useMagicKeys` already handled Ctrl/Cmd+K). Admin test now
   asserts the flag flips; palette test files reset the shared ref per test so state cannot leak
   between tests (module-level ref outlives each mount).
3. **Light theme never defined `--on-accent`** (only dark did). Every `var(--on-accent)` color in
   light mode was an invalid var() substitution → initial value (canvastext), so light primary
   buttons/tab pills rendered dark-on-teal by accident: ~3.5:1, off-design (the reference login
   shows white text on the teal CTA). `:root` now defines `--on-accent: #FFFFFF` (white on deep
   teal in light; the dark override keeps `#082222`, near-black on mint, ~10:1). Verified on the
   regenerated light captures (login CTA, top-pill active tab, mission «پذیرش مأموریت»,
   sos «ادامه»/«ارسال», history chips).
4. **«پیش‌نمایش با دادگان ساختگی» pill overlapped the bottom CTA** on every map-mode screen
   (fixed position, bottom: 14px). Moved to the top-center status-bar dead zone
   (`left: 50%; transform: translateX(-50%); top: 8px`), pointer-events none, still unmistakable.
   Verified on map/sos/profile (mobile) and admin overview + login (desktop): no control is
   covered on any of them.
5. **Native checkboxes were near-invisible in dark mode** (reported on TripsView
   «فقط ذخیره‌شده‌ها»; all app checkboxes were unstyled except two scoped rules). Global
   `input[type="checkbox"]` is now custom-drawn: 18px box, `--muted` border, primary fill +
   `--on-accent` check on `:checked`, visible focus ring; a `.share-field input[type="checkbox"]`
   override beats the generic 100%-width form-field rule that was stretching it. Verified in the
   dark trips capture.
6. **Logout dialog danger fill in dark mode.** The solid «خروج» CTA initially took white text on
   the dark `--danger` rose (#E4787C) — 2.6:1. Danger fills keep `--on-accent` semantics instead
   (white on #AF3438 in light ≈ 7.4:1; #082222 on rose in dark ≈ 4.9:1), matching the existing
   dark-pill («توقف») treatment.
7. **Escape now closes the profile logout dialog**, same contract as the admin drawer.

### Adjudicated — not bugs, no change made

- **MapView «مقصد انتخاب‌شده» card shows coordinates + «ذخیره در مکان‌های من», whereas
  navigation/06-destination-selected.png shows a named card with traffic/ETA chips, a «سفر» CTA
  and «ارسال موقعیت».** The reference flow belongs to the navigation (مسیریابی) product family,
  which this codebase re-scoped to map/places/trips: there is no routing or traffic data source
  anywhere in the app, and inventing one (fake ETAs, a dead-end «سفر» CTA) would fabricate product
  capability. Name/address for a map-tapped pin does not exist without a reverse-geocode call;
  the pin carries only coordinates. The current card is the intentional implemented scope. If the
  owner wants the navigation family built (or the refs re-issued against the implemented
  information architecture), that is a scope decision, not a CSS fix.
- **History screen structure** (segmented tabs سفرها/مأموریت‌ها/اشتراک‌ها + status filter chips)
  differs from history/01-history-trips.png (companions/missions/trips tabs + playback) for the
  same reason: the app implements SOS-first trips/missions/shares, not the companions family.
  Structure retained; verified readable in light and dark.
- **Companions (همراهان) family absent**: top pill is نقشه/سفرها/اشتراک‌گذاری/مأموریت/تاریخچه —
  the companions flow was re-scoped to sharing. Refs under map-page/companions document an
  unimplemented flow; they are design inputs, not acceptance criteria for this build.
- **adminSeries legend dots** (dark, two dim browns) still owner/design-system territory —
  unchanged, see §16 notes.
- **Auth brand panel always dark** — intentional, unchanged.
- Capture filename→screen mapping for sos/talk and sharing/history remains approximate (routes are
  correct; some ref files group differently). Not a functional defect.

### Verified

- Captures regenerated after every change: 58 light OK (0 FAIL) + 46 dark OK (0 FAIL); both
  suites re-checked by eye; targeted re-captures of pill placement on five screens and of the
  logout dialog in both themes.
- `./boro verify` exit 0 — 96 files / **1240 tests**; statements **94.20%** (gate ≥94%);
  branches 87.55%; functions 94.60%; lines 96.31%; typecheck clean; docs guard clean;
  5 new logout-confirmation tests, 1 strengthened admin-layout palette test.
- Delta from `e36b4e2`: 11 files (app.css, preview-main.ts, CommandPalette.vue,
  useCommandPalette.ts, AdminLayout.vue, ProfileView.vue, TripsView.vue + 4 test files) + this §17.
- `git diff` whitespace/style consistent with existing patterns; no DESIGN_MATRIX edits.

### Open items carried forward (owner/design-system calls, not bugs)

- Navigation-family refs (map-page/navigation/*) vs implemented map/places/trips scope — needs an
  owner decision (build navigation, re-issue refs, or keep scope; DESIGN_MATRIX stays untouched).
- `adminSeries` dark-mode variant — token decision.
- SOS dock / SOS-button light-mode pixel parity with refs — visual acceptance item (human).
- DESIGN_MATRIX untouched (23/75/25/12, owner-only); PR #6 open; no merge/tag/release;
  visual approval = human.
## 18. Stage H — Not-started/incomplete pages and services (2026-11-13)

Branch `arena/250278b6-borobiya`, same open PR #6. Scope: the not-yet-built admin reporting surface and the group member-management gap, both adjudicated as buildable without owner decisions.

**Shipped (untracked as of this entry being written):**

- `GET /_admin/reports?days=7|30|90` (`reportsQuery`, admin-auth): every number computed from
  SQLite for the requested window — total requests, average response seconds (recorded `accept` disposition),
  acceptance rate (decided `mission_offers`), cancellation count — and deltas against the equal previous
  window; deltas are `null` when the previous window has no data. 7-day (extendable to 92) trend of requests
  vs missions, incidents-by-type counts, per-group performance rows (requests attributed via
  `sos_requests.assigned_group_id`, offers accepted/decided, average accept latency, average mission rating)
  and `groupRequestTotal`. Response-time and rating fields are `null` (not zero) when unmeasured.
- New `GET /_admin/groups/:id/members` roster endpoint (leader pinned first; presence via the realtime
  service; exposes membership role, job type, rating and active flag — the schema has no join timestamp, so
  none is invented). Group edit (`PATCH /_admin/groups/:id`) and member add/remove
  (`POST`/`DELETE .../members[/:userId]`) were already server-ready; the client had no UI.
- Reports screen (`adminReports`) rebuilt: four KPI cards with previous-window delta lines, 7/30/90-day
  period chips, an inline SVG trend (both series share one scale), a group-share donut that reuses each
  group's own color, incidents-by-type bars, a group-performance table with documented grade thresholds,
  and preserved CSV export links. Empty windows render explicit empty states; nothing is shown as measured
  when it is not.
- Groups screen (`adminGroups`) gains per-group toggles for an inline edit panel (name, color, capacity,
  status, incident coverage chips — coverage required, mirroring the server rule) and a members panel
  (leader badge, presence dot, job type, rating, two-step remove, candidate search excluding current members).
- Preview fixtures: deterministic `adminReportsFor(days)`, full `GroupMemberView` rosters, `_admin/reports`
  and member CRUD handlers stubbed; registry catalog entries for `adminReports` and `adminGroups` updated.
  The demo `swim` icon was rejected by the shipped icon subset and replaced with `waves`.
- `GROUP_STATUS_LABELS` gains the `paused` label (server already accepts it).
- View fixtures in `tests/views.test.ts` updated to the real reports payload shape;
  `tests/admin-overview-view.test.ts` rewritten for the new screen contract.

**Verification:** `./boro verify` exit **0** — 1263 tests passed (was 1240), coverage statements **94.11%**
/ branches 87.19% / lines 96.24% (no gate lowered; margin over the 94% statement gate is ~0.11pp — flagged
for the owner; the new attribution test in `tests/admin-reports-members.test.ts` exists partly to cover
those branches). Docs guard clean; build, `tsc`, `vue-tsc` and all packaging steps green.

**Visual verification (inspection only, not approval):** light/dark desktop and light mobile captures of
both screens were opened and inspected (1280×900, 390×844): RTL layout holds, sidebar active state correct,
KPI/donut/table/grade chips legible in both themes, no horizontal overflow on mobile. No page is visually
approved — that remains the human gate.

**Deliberately not done:** all DESIGN_MATRIX rows for these pages remain `missing`/`partial` in
`docs/DESIGN_MATRIX.md`; statuses flip only after human visual acceptance (Stage H review log added, no
rows changed). Remaining matrix items (e.g. `admin-panel/states/04-offline`, `admin-panel/users/*`,
`mission/*`, `history/07|08`, `navigation/*`, `companions/*`) were not in this stage's scope and are mostly
owner decisions or human-gated. The reference PNG `design/admin-panel/dashboard/03-reports.png` also shows
completed-missions and satisfaction deltas with values the database cannot yet distinguish; what ships is
one honest delta per KPI, documented in the Stage H matrix log.
