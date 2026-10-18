# Borobiya — Progress

> Track % done per feature, blockers, changelog. Update in every PR alongside `TASKS.md`.

---

## Overall: 5% — Docs Phase (2025-10-18)

We have just bootstrapped **documentation** on a fresh repo (only `README.md` existed). Infra/code phases follow.

| Area | % | Status |
|------|---|--------|
| Documentation (`docs/`) | 100% | ✅ Created: 11 docs + 4 diagrams |
| Monorepo scaffold | 0% | ⬜ Not started |
| Auth & Users | 0% | ⬜ |
| Map Server | 0% | ⬜ |
| Location Sharing | 0% | ⬜ |
| SOS Rescue | 0% | ⬜ |
| Search & Routing | 0% | ⬜ |
| UI/UX & a11y | 0% | ⬜ |
| CI/CD & Android | 0% | ⬜ |

---

## Phase Scoreboard

### Phase 1 — Foundation (Auth & Map) — 0%

| Milestone | % | Notes |
|-----------|---|-------|
| Monorepo + Contracts | 0% | — |
| Auth system | 0% | — |
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

See [TASKS.md § Checklist](./TASKS.md#checklist-against-spec-23-39-mandatory) for per-item tracking. All 39 start unchecked.

---

## Blockers & Risks

| # | Issue | Impact | Owner | Status |
|---|-------|--------|-------|--------|
| 1 | Empty repo — no scaffold yet | Cannot start coding until scaffold PR merged | @komeilm76 | 🟡 Docs PR in progress |
| 2 | Map data size — Iran PBF ~2GB | Dev with Tehran subset (~100MB) to unblock; full pipeline later | TBD | 🟡 Mitigated via configurable `MAP_REGION` |
| 3 | ORM choice (Drizzle vs Prisma) not decided | Blocks DB migrations | TBD | 🔵 Open — ADR needed |
| 4 | No Ubuntu VPS provisioned yet | Deploy pipeline untestable until infra ready | TBD | 🔵 Pending procurement |

---

## Changelog

### 2025-10-18 — Docs Bootstrap

- Created `docs/` with 11 markdown files + 4 diagram docs on branch `arena/071fb407-borobiya`.
- Covers ARCHITECTURE, STRUCTURE, ROADMAP, TASKS, PROGRESS, API, SECURITY, MAP_SERVER, WORKFLOWS, USER_MANUAL, DEVELOPMENT, plus DIAGRAMS (ERD, SOS_FLOW, LOCATION_SEQUENCE, MAP_PIPELINE).
- Updated `PROGRESS.md` to reflect 100% docs completion, 0% code.
- Next: monorepo scaffold PR (`T1.0.1`–`T1.0.7`).

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
### 2025-XX-XX — Short title
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

