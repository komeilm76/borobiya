# Borobiya 2.0.0 — Stages 6 & 7 Delivery Report

| | |
|---|---|
| **Date** | 2026-11-12 |
| **Branch** | `arena/250278b6-borobiya` (branched from `42056450`) |
| **Pull request** | #6 — *Migrate runtime to Bun 1.4.4 and client to Vue 3 (2.0.0)* — **OPEN, not merged** |
| **Scope** | The last 4 commits on the branch |
| **Commits covered** | `50fcb0b` → `18a54ad` → `eb53174` → `1a0adb1` (in order) |
| **Status** | Staging plan (Stages 1–7) **complete**; CI green; release **not tagged** — merge is the owner's decision |

---

## 1. Executive summary

These four commits finish the 2.0.0 product alignment. **Stage 6** rebuilt the History screen around the data the system actually stores. **Stage 7** audited the whole branch against its documentation and closed one real upgrade-blocking defect in the database migration. Two further commits hardened the test harness (it leaked real traffic to a developer's dev server) and scrubbed stale claims from the docs. Nothing was merged; the PR stays open for review.

| Metric | Value |
|---|---|
| Commits in scope | 4 |
| Files changed | 45 (+3,440 / −129) |
| Split | client +1,187 · server +558 · tests +1,573 · docs +88 · scripts +1 |
| Automated tests | **1156 / 1156 pass** (91 files) |
| CI on branch head | **success** (push and pull_request) |
| `./boro verify` | **exit 0** (build, typechecks, docs guard, coverage) |
| Coverage (gates unchanged) | Statements **94.17%** · Branches **88.27%** · Functions **94.21%** · Lines **96.14%** |

## 2. What the four commits did

### `50fcb0b` — Stage 6: History (day-grouped tabs, inline detail, scoped share windows)

The history screen was a flat SOS/mission list. It now mirrors the canonical design's information architecture, within what the data layer can honestly show:

- **Trips tab** — finished trips only (completed/cancelled), day-grouped: stop count, leader/member role, localized status. Expanding a row shows the ranked stops, members, start/end times, *repeat-as-new-trip* and a save toggle.
- **Missions tab** — *«درخواست‌های من»* (tracking code, manual-fix flag, severity, and the server-held status timeline from `GET /_user/sos/:id`) and *«مأموریت‌های من»* (status, granted star rating, rating note) under sub-tabs.
- **Shares tab** — every location share the viewer was part of, both directions, active/expired/revoked, via `GET /_user/location/shares?include=all` — audited, with a working retry.
- **Scoped sharing from any record** — new `HistorySharePanel` spawns a history-window share whose default range is the record's own lifetime; route/motion/accuracy scope selection; the server re-validates chronological order, the future bound and the 30-day cap.
- The `repeat` icon was added to the shipped MDI subset. **Deliberately not built:** replay, kilometres/duration/vehicle, filter/search, companion aggregates — no track is recorded, so those statistics cannot be shown honestly (DEV-02 holds; DF-04 governs any future replay surface).

*Design artifacts: rows `history/01–11` and `sos/17–20` in `docs/DESIGN_MATRIX.md` updated; none flipped to `done` without implementation evidence.*

### `18a54ad` — Stage 7: documentation, authorization and backward-compatibility review

- **Docs audit** — USER/ADMIN manuals, ACCEPTANCE, STATUS, RELEASE_NOTES, DESIGN_MATRIX and the plan read against the implementation and corrected where stale (e.g. ACCEPTANCE no longer claims a replay surface that does not exist).
- **API pass** — the served `/_public/openapi.json` was generated in-process and diffed against **all 102 route registrations**: 14 public (7 `/_public/*` + 7 `/_auth/*`), 49 user, 39 admin; security markers consistent; **every mutating route declares a rate bucket**.
- **Authorization pass** — recorded in `docs/SECURITY.md` ("Authorization audit (Stage 7)"): foreign/unknown ids answer **404, never 403**; admin-only projections stay on the admin surface; enforcing test suites named as evidence.
- **Backward-compatibility defect found and fixed** — on a pre-fix database whose designated mission leader had replaced a stale operational owner *whose membership was later removed*, the v5 `mission_members` backfill minted a **second active leader** and the upgrade died at `idx_mission_members_one_leader` — the install refused to boot. The backfill now keeps the existing active leader; v6 reconciles `missions.responder_id` / `sos_requests.assigned_responder_id`. Two regression cases in `tests/database.test.ts` pin both paths (verified to fail without the fix).
- **Migration notes** v1→v8 added to `docs/DEPLOYMENT.md` (pre-upgrade backup, `meta.schema_version` check).

### `eb53174` — Test harness made fully hermetic

Console noise exposed a leak: happy-dom resolves relative-URL fetches against `localhost:3000`, so mounted components really called a developer's `./boro dev` server (401s) — the suite passed only by timing luck. Both leaks closed (`tests/admin-views.test.ts` offline stub + seed-time `sos.load` spy; `tests/map-shell.test.ts` 401-envelope stub in `beforeEach`). A full sweep logs **zero** references to `localhost:3000`. DEVELOPMENT.md / RELEASE_NOTES.md state the guarantee honestly.

### `1a0adb1` — Documentation scrub

Removed remaining false claims (root README "history playback"; missing trips/teams in service maps), linked `DESIGN_MATRIX.md` and `IMPLEMENTATION_PLAN.md` from the docs index, noted DESIGN_MATRIX's role in visual acceptance. No behavior change; CI re-verified green.

## 3. Where the project stands

### 3.1 Staged plan — 7/7 stages delivered

| Stage | Title | Status |
|---|---|---|
| 1 | Architecture and defect review (findings) | ✅ done |
| 2 | Job-type policies, offers, immediate dispatch | ✅ done |
| 3 | Mission teams, leadership, support requests | ✅ done |
| 4 | Sharing Center (companions renamed end to end) | ✅ done (`8c0304a`, `385c88a`) |
| 5 | Trips and group rides (`trips` domain, schema v8) | ✅ done (`4ddd0d4`) |
| 6 | History (day-grouped tabs, inline detail, scoped shares) | ✅ done (`50fcb0b`) |
| 7 | Documentation, authorization and backward-compat review | ✅ done (`18a54ad`) |

### 3.2 Quality gates (branch head)

| Gate | Result |
|---|---|
| `./boro verify` (doctor + build + tsc + vue-tsc + docs guard + coverage) | exit 0 |
| Vitest | 1156/1156 (91 files) |
| Coverage thresholds (statements 94 / branches 83 / functions 94 / lines 95) | all pass — no gate lowered since the clean rebuild |
| `bun run smoke` | exit 0 — CSP/CORS/framing, OpenAPI, tiles, login, WS hello, SOS fan-out, admin overview |
| `bun run acceptance` | 23 checks closed |
| `bun run bench` | exit 0, all budgets met (live-location fan-out 0.84 ms) |
| CI (`push` + `pull_request`) | green |
| Docs guard | 24 required documents · 154 canonical design images · English-only · clean |

### 3.3 Acceptance checklist

**74 / 74 items checked, 0 open** (`docs/ACCEPTANCE.md`). Two items deserve emphasis: no routing engine exists anywhere in scope (by design, DEV-02), and professional **visual acceptance is a deferred human review** — no screenshot comparison or real-device run is claimed.

### 3.4 Design coverage (`docs/DESIGN_MATRIX.md`, 141 canonical references)

| Status | Count | % of 141 |
|---|---:|---:|
| done | 23 | 16.3% |
| partial | 70 | 49.6% |
| missing | 30 | 21.3% |
| superseded (out of contract, documented) | 12 | 8.5% |
| reference (spec/anatomy sheets) | 5 | 3.5% |
| deviation (documented with reason) | 1 | 0.7% |

Reading the table honestly:

- **Out of scope by explicit decision** (superseded + reference + deviation): 18/141 = **12.8%**.
- **In-scope build targets**: 123/141 = **87.2%**.
  - Built fully (`done`): 23/123 = **18.7%**
  - Built partially (`partial`): 70/123 = **56.9%**
  - Not built (`missing`): 30/123 = **24.4%**
  - **Implemented at least partially: 93/123 = 75.6%**

`missing` is not hidden debt: it is dominated by designed artifacts that presuppose the superseded routing product (kilometre totals, ETAs, turn-by-turn) or undecided product surfaces (history filter/search, replay, per-companion aggregates, admin 3-column board, real-device visual QA). Each `missing` row says exactly what is absent and why.

## 4. Complete vs incomplete — the honest ledger

**Complete and verified**
- Bun-only runtime end to end; Vue 3 + Vuetify + Pinia client; offline SVG tiles; WebSocket realtime with durable events; talk floor; SOS→mission with teams, offers and support requests; trips/group rides; Sharing Center with audited grants; day-grouped history with scoped share windows; admin console with support-requests queue; migration hardening; hermetic suite; full docs set consistent with the build.

**Incomplete / deferred (and why)**
1. **Human visual acceptance** against the PNGs — deliberately deferred; the automated suite verifies structure and behavior only.
2. **Replay/playback of movement** — needs track recording; the design's `بازپخش` cannot be rendered honestly today. Product decision required first.
3. **History filter, search, kilometre/vehicle/duration stats, companion-level aggregates, month summaries** — no data exists to compute them; DEV-02 (no routing engine) holds.
4. **Designed depth gaps** (per `DESIGN_MATRIX.md`): 30 `missing` + 70 `partial` rows — mostly designed polish (skeletons, empty-state illustrations, cached-snapshot offline framing, dedicated admin layouts), plus the deferred items above.
5. **Release mechanics** — no tag, no GitHub release, PR #6 unmerged. All three are the owner's call.
6. **Production upgrade note** — any live database predating Stage 3 migrates automatically at startup; Stage 7 fixed the one crash path found for that case, but **take a backup before the first post-upgrade boot** and verify `meta.schema_version = 8` afterwards (see `docs/DEPLOYMENT.md`).

## 5. Risks and watch-items

- **Coverage functions gate is thin**: 94.32% measured vs 94% threshold. Protected by tests, never by lowering gates; it has not breached since the clean rebuild.
- **SFC-instrumented coverage varies run to run** (Vuetify/MissionView remap flap, documented in `tests/`); guards sit below the lowest measured figure.
- **Two runs fine, CI green**, but the release commit should be a frozen point — no content changes without rerunning `./boro verify`.
- **Preview/deploy realities** (proxy headers, `FRAME_ANCESTORS`, `COOKIE_SECURE=1`) are enforced by guards and CI's `deploy:check`, but production OS hardening remains an operator responsibility (`docs/OPERATIONS.md`).

## 6. Recommended next steps

1. **Reviewer pass on PR #6** (description and CI are current; comments 1–58 carry the stage-by-stage evidence).
2. **Owner decisions** on the three product questions blocking the deferred design: track-recording for replay; history filter/search; companion-level aggregates.
3. **Merge** PR #6 when satisfied (CI green), then — only with explicit approval — **tag** the release and **schedule the v8-aware upgrade** with a pre-boot backup.
4. **Human visual acceptance** against `design/` PNGs as the final sign-off step.
