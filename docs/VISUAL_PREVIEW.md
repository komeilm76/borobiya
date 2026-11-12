# Visual Preview Server

The visual preview server is a review harness for design and product review. It renders the real Borobiya Vue client — the same route table, layouts, views, stores, styles and behavior as production — while replacing only the network layer with deterministic fixtures. It exists so the owner can inspect every genuinely implemented page in a browser before visual approval is granted, without a production database, production accounts or production credentials.

## What it is — and what it is not

- Real application bundle (`vite build --mode preview`), real router, real stores, real styles. Routes match production exactly (`/_user/map`, `/_admin/overview`, …).
- Deterministic fictional world in `src/client/preview/demo-data.ts` and `demo-data-admin.ts`. All accounts, incidents, missions, shares, audit entries and locations are invented; coordinates are a fixed grid in Tehran; every timestamp derives from a fixed epoch (`T0 = 2026-11-08T09:00:00Z`), so re-renders are byte-identical.
- The fetch mock (`src/client/preview/demo-fetch.ts`) answers API calls in-process, before any network request. Unmatched endpoints return `404` with code `PREVIEW_UNMOCKED` so a missing fixture appears as a visible error, never as silent fake success.
- Vector SVG map tiles are generated deterministically by the preview server itself; no external tile service is contacted.
- The preview never reads or writes `data/`, never touches the production server, never needs its accounts, and is served only on the machine that runs it (or the LAN, see below). Do not expose the port to the public internet; the preview has no authentication by design.
- The preview is never a source of truth for "done". A page listed as ready is awaiting human review, not visually approved.

## Quick start

```sh
bun run preview          # build the preview bundle (cached unless sources changed) and serve on :4173
bun scripts/preview.ts --skip-build   # serve the existing build without rebuilding
```

Stop with `Ctrl+C`. The server binds `0.0.0.0` by default so another device on the same LAN can open the catalog.

## Local and network access

- This machine: `http://127.0.0.1:4173/`
- Another device on the same LAN: `http://<IP-of-this-machine>:4173/` (the startup banner prints the detected LAN addresses, for example `http://169.254.0.21:4173/`).

Firewall requirements for LAN access:

- Linux: `sudo ufw allow 4173/tcp` (or the equivalent firewalld/iptables rule).
- macOS: approve the network prompt for your terminal when it appears, or allow incoming connections for it in System Settings.
- Windows: create an inbound firewall rule for TCP port 4173.

Without those rules the catalog is reachable only from this machine. Never forward port 4173 on a router or open it to the internet.

Port and host can be overridden: `bun scripts/preview.ts --port 4200 --host 127.0.0.1` (defaults `PREVIEW_PORT` / `PREVIEW_HOST`).

## The catalog

`http://127.0.0.1:4173/` is the review workspace. It is generated from an explicit registry, `src/client/preview/registry.ts` — the single source of truth for which pages are previewable. Every card shows:

- Page name, product section, route identifier, and the fictional persona used for the link
- Implementation status: **Ready for visual review**, **Partially implemented** (with the reason inline), or **Not ready**
- A short "what can be tested" summary and a concrete review checklist per page
- Two ways to open the page: desktop (same browser tab) or a 390×844 mobile popup (browser pop-ups must be allowed)
- A persistent in-app banner inside the preview marking all data as fictional

Filter chips narrow the list to guest/auth, user experience, or the admin console; the search box matches page name or route. Section counters update live. No screenshots, mock HTML or simplified alternative components exist anywhere in the preview — every link mounts the production view.

## Demo personas and credentials

No credentials are real. Any password works; typing `admin` on the login screen lands in the admin console, `saeed.k` (default) lands in the responder experience, `leila.n` demonstrates the onboarding-required account. Guest pages (login, register, recovery) open with no session at all.

| Persona link parameter | Account | Used for |
| --- | --- | --- |
| *(none)* | `saeed.k` — responder, ready for mission | All map-layout pages |
| `?persona=admin` | `admin` — administrator | All admin-console pages |
| `?persona=onboarding` | `leila.n` — security questions pending | The onboarding screen |
| `?anon=1` | *(no session)* | Login, register, recovery |

In-app navigation preserves the chosen persona for the lifetime of the tab; a full reload of an admin URL without `?persona=admin` falls back to the user persona.

## What the demo world contains

- An active responder mission (`/_user/mission`) with a team, a pending support request, and a pending offer of a fire incident
- The user's own dispatched SOS as a requester (`/_user/sos`), one completed rated mission, one cancelled request — History shows all three categories (trips, missions, shares) with day grouping
- Trips: one completed trip with stops matching the recorded demo track, one planned trip, one cancelled trip, one pending trip invitation
- Sharing Center: one live outbound share, one inbound history share, plus expired and revoked examples
- Admin console: overview KPIs and trend, a dispatch queue with nearest responders and groups, two pending support requests with candidates and ineligibility reasons, alerts, audit log, settings, system health, and CSV exports — both CSVs are generated in the browser from the demo world (no server download happens)
- Talk (`/_user/talk`) is listed as **Partially implemented**: the screen renders, but the real-time audio path needs a live server peer and microphone; it cannot be exercised meaningfully against fixtures
- History does not replay travel routes: no track is recorded for any trip or mission yet (see the Stage D approval gate in `docs/TRIP_TRACK_PROPOSAL.md`)

## Keeping the preview honest

- `tests/preview-pages.test.ts` smoke-renders every registry page through the real `App.vue` and fails when a page makes a request the mock does not cover (`[preview] unmocked`).
- `tests/preview-mock.test.ts` exercises every mock handler and the persona/session state machine.
- `docs/DESIGN_MATRIX.md` tracks design-reference status; the preview catalog is the review surface, not a status claim. Visual approval remains a human act and is never auto-assigned.
- Statically, the preview contributes nothing to the production bundle (`vite.preview.config.ts` targets `build/preview-app/`, git-ignored). Production builds (`bun run build`) do not set `VITE_PREVIEW_DEMO`, so the mock is compiled out.

## Extending the preview

1. Add or adjust fixtures in `demo-data.ts` / `demo-data-admin.ts` (keep them deterministic and fictional).
2. Register new endpoints in `demo-fetch.ts`; an unregistered path is a loud `PREVIEW_UNMOCKED` error, which is intentional.
3. Register new pages in `registry.ts` with an honest status; list a page as ready only when it truly renders end to end.
4. Run `bunx --bun vitest run tests/preview-pages.test.ts tests/preview-mock.test.ts`.
