# Borobiya — Progress

> Track % done per feature, blockers, changelog. Update in every PR alongside `TASKS.md`.

---

## Overall: 10% — Phase 1 Foundation underway (2026-10-18)

The documentation baseline and first three implementation tasks are complete. Shared schemas and route contracts now exist; the API server, client runtime, and product features remain unimplemented. Percentages are milestone estimates, not a count of source lines.

| Area | % | Status |
|------|---|--------|
| Documentation (`docs/`) | 100% | ✅ 12 docs + 4 diagrams authored; manual screenshots remain placeholders |
| Monorepo scaffold | 43% | 🟡 T1.0.1–T1.0.3 complete; T1.0.4–T1.0.7 pending |
| Auth & Users | 0% | ⬜ Schemas and route descriptors exist; handlers, persistence, security enforcement, and UI remain |
| Map Server | 0% | ⬜ Not started |
| Location Sharing | 0% | ⬜ Not started |
| SOS Rescue | 0% | ⬜ Not started |
| Search & Routing | 0% | ⬜ Not started |
| UI/UX & a11y | 0% | ⬜ Not started |
| CI/CD & Android | 0% | ⬜ Not started |

---

## Phase Scoreboard

### Phase 1 — Foundation (Auth & Map) — 10%

| Milestone | % | Notes |
|-----------|---|-------|
| Monorepo + Contracts | 43% | T1.0.1–T1.0.3 root config, shared Zod schemas, and km-api descriptors done; server runtime wiring remains |
| Auth system | 0% | Schemas exist; endpoints, persistence, security enforcement, and UI remain |
| Map Server | 0% | — |
| Client Map canvas | 0% | — |

### Phase 2 — Location Sharing — 0%

| Milestone | % | Notes |
|-----------|---|-------|
| Live share + expiry | 0% | — |
| History share + retention | 0% | — |
| Multi-device priority | 0% | — |

### Phase 3 — SOS Rescue — 0%

| Milestone | % | Notes |
|-----------|---|-------|
| Incidents/categories | 0% | — |
| SOS request | 0% | — |
| Dispatch + nearest | 0% | — |
| Proposals | 0% | — |
| Live mission + routing | 0% | — |
| Cancellation + re-dispatch | 0% | — |

### Phase 4 — Polish — 0%

| Milestone | % | Notes |
|-----------|---|-------|
| Rating + history | 0% | — |
| Search + geocode | 0% | — |
| UI/UX + perf | 0% | — |
| Deploy + Android | 0% | — |

---

## Checklist Against Spec §23 (Summary)

See [TASKS.md § Checklist](./TASKS.md#checklist-against-spec-23-39-mandatory) for per-item tracking. The 39 product requirements remain unchecked until their acceptance criteria are implemented and verified.

---

## Blockers & Risks

| # | Issue | Impact | Owner | Status |
|---|-------|--------|-------|--------|
| 1 | Docker/Compose are not installed and Bun is not on `PATH` in the current agent environment | Compose runtime cannot be checked; Bun 1.4.3 is invoked through `npm exec` for install, tests, and typecheck | Environment | 🟡 Validation limitation |
| 2 | Map data size — Iran PBF is large | Start with a Tehran subset; full pipeline later | TBD | 🟡 Mitigated via configurable `MAP_REGION` |
| 3 | ORM choice (Drizzle vs Prisma) not decided | Blocks DB migrations | TBD | 🔵 Open — ADR needed |
| 4 | No Ubuntu VPS provisioned yet | Deployment pipeline cannot be tested against production infrastructure | TBD | 🔵 Pending procurement |

---

## Changelog

### 2026-10-18 — Shared route descriptors (T1.0.3)

- Added `km-api` 0.4.1 and a `defineRoute({ method, url, schema, meta })` adapter that preserves Borobiya descriptors while producing km-api configs.
- Added 59 route contracts across auth, public, user, location, SOS, and admin APIs. Handler registration and OpenAPI server wiring remain future tasks.
- Added route tests for unique operation IDs/method paths, path-parameter alignment, OpenAPI path conversion, auth/deprecation mapping, and public exports.
- Validation: frozen-lockfile install, all 23 Vitest tests across six files, shared TypeScript typecheck, route subpath/path-helper smoke test, and `git diff --check` passed.

### 2026-10-18 — Shared contracts (T1.0.2)

- Added the private `@borobiya/shared` workspace package with Zod schemas for auth, users, location, SOS, admin, search, common responses, and enums; exported inferred types and package subpaths.
- Added 19 tests across five files covering password/question invariants, location sharing rules, coordinate and query parsing, SOS bounds, dispatch recipients, admin inputs, cancellation reasons, and the public schema barrel.
- Added TypeScript 5 and Vitest development tooling plus `bun.lock`; pinned compatible package ranges for the documented Node 20+ fallback.
- Validation: `bun install --frozen-lockfile`, all 19 Vitest tests, package TypeScript typecheck, and a package self-reference import smoke test passed with Bun 1.4.3 invoked through `npm exec`.

### 2026-10-18 — Phase 1 kickoff (T1.0.1)

- Added the private Bun workspace manifest, strict shared TypeScript configuration, secret/data-aware `.gitignore`, and documented `.env.example`.
- Aligned the active development guide with the explicit global rate limit (100 requests/minute) and same-origin browser proxy paths (`/api`, `/map`); corrected the TypeScript workspace alias example.
- Marked T1.0.1 complete. Monorepo + Contracts was 14%; no auth, map, or feature code was claimed complete.
- Validation: Node config/environment assertions, TypeScript 5 inherited-config check, Git ignore checks, `git diff --check`, and Bun 1.4.3 empty-workspace install dry-run passed. Docker/Compose runtime checks remain unavailable.

### 2025-10-18 — Docs Bootstrap

- Created 12 markdown docs + 4 diagram docs on branch `arena/071fb407-borobiya`.
- Covers ARCHITECTURE, STRUCTURE, ROADMAP, TASKS, PROGRESS, API, SECURITY, MAP_SERVER, WORKFLOWS, USER_MANUAL, DEVELOPMENT, plus DIAGRAMS (ERD, SOS_FLOW, LOCATION_SEQUENCE, MAP_PIPELINE).
- Established the initial documentation baseline; implementation followed as a separate phase.

### 2025-05-01 — Spec Released

- Frozen `README.md` with 24 sections + 39 checklist items.

---

## How to Update This File

In every feature PR, edit the relevant **%** in tables above:

```markdown
| Monorepo + Contracts | 80% | Shared schemas done, client scaffold pending |
```

And append to Changelog:

```markdown
### YYYY-MM-DD — Short title
- What landed, link to PR #n
- New % and blockers
```

Keep it human-readable and AI-parseable (tables with `|`).

---

## Demo Readiness

| Demo | Ready? | Link |
|------|--------|------|
| P1 Auth + Map offline | ⬜ | — |
| P2 Live sharing | ⬜ | — |
| P3 Full SOS | ⬜ | — |
| MVP ship (deploy + APK) | ⬜ | — |
