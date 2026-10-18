# Borobiya — Documentation Hub

> **Welcome to Borobiya Docs.** This folder is the single source of truth for both **Human Developers** and **AI Assistants** working on the project.
>
> Project: **Location Sharing & SOS Rescue Platform** — Admin Panel + User Web App + Android (Ionic + Vue) + Self-Hosted Offline Vector Map.

---

## 📚 How to Use These Docs

**For Humans:** Start with [`00-INTRO`](#map) or read sequentially. Every doc has a TL;DR at the top.

**For AI Assistants:** Before making any code change, read at least:

1. `ARCHITECTURE.md` — system boundaries & data flow
2. `STRUCTURE.md` — where files live
3. `API.md` — route prefixes & contract rules
4. `SECURITY.md` — hashing, rate-limit, auth invariants
5. `TASKS.md` — what to work on next

> 🤖 **Agent Prompt:** `You are working on Borobiya. Read docs/ARCHITECTURE.md, docs/STRUCTURE.md, docs/API.md, docs/SECURITY.md, docs/MAP_SERVER.md before coding. Respect route prefixes _auth/_public/_user/_admin. Use Zod everywhere.`

---

## 🗺️ Map

| Doc | Purpose | Audience |
|-----|---------|----------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | System diagram, data flows, map server, realtime | All |
| [STRUCTURE.md](./STRUCTURE.md) | Monorepo folder layout, naming conventions | Dev, AI |
| [ROADMAP.md](./ROADMAP.md) | 4 Phases — timeline & milestones | PM, Dev |
| [TASKS.md](./TASKS.md) | Task breakdown per phase (checkboxes) | Dev, AI |
| [PROGRESS.md](./PROGRESS.md) | % done, blockers, changelog | All |
| [API.md](./API.md) | Route prefixes, auth guards, OpenAPI, examples | Backend, Frontend |
| [SECURITY.md](./SECURITY.md) | Hashing, rate-limit, suspension, secrets | Backend |
| [MAP_SERVER.md](./MAP_SERVER.md) | Martin/OSRM/Photon setup, tile pipeline, update | DevOps, Backend |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | Dev on Ubuntu (Docker) vs Windows (no Docker) | Dev |
| [WORKFLOWS.md](./WORKFLOWS.md) | Git hooks, CI/CD, deploy, Android build | DevOps |
| [USER_MANUAL.md](./USER_MANUAL.md) | End-user guide with screenshots placeholders | QA, User |
| [DIAGRAMS/](./DIAGRAMS/) | ERD, SOS flowchart, location sequence (Mermaid) | All |

---

## 🚀 Quick Start (30 seconds)

### Docker (Ubuntu — production-like)

```bash
git clone https://github.com/komeilm76/borobiya.git
cd borobiya
cp .env.example .env              # fill secrets
docker compose up -d
open http://localhost:3000/docs   # Swagger
open http://localhost:5173        # Client
open http://localhost:8000/styles/light.json  # Map tiles check
```

See [DEVELOPMENT.md](./DEVELOPMENT.md#2-docker-ubuntu-recommended) for full steps.

### Without Docker (Windows dev)

```bash
bun install
bun run db:setup          # create postgres db + migrate + seed questions
bun run map:dev            # serve sample tehran.pmtiles via Martin
bun run dev                # vite + fastify concurrently
```

See [DEVELOPMENT.md](./DEVELOPMENT.md#3-windows-without-docker) for prerequisites.

---

## 🧱 Tech Stack at a Glance

| Layer | Mandatory | Version |
|-------|-----------|---------|
| Language | **TypeScript** (`strict: true`) | 5.x |
| Frontend | **Vue 3** (`<script setup>`), **Vuetify 3**, **Tailwind**, **Pinia**, **VueUse**, **Vite** | latest |
| Mobile | **Ionic + Capacitor** (shares 90% with web) | 7+ |
| Map | **MapLibre GL JS** + self-hosted **Martin** + **OSRM/Valhalla** + **Photon/Nominatim** | — |
| Backend | **Fastify** + **PostgreSQL + PostGIS** + **Socket.IO** + **OpenAPI** | — |
| Contracts | **Zod** + **km-api** + **Zopia** (shared `packages/shared`) | — |
| Runtime | **Bun** | 1.x |
| Testing | **Vitest** | 1.x |

Full rationale & alternatives analysis → [ARCHITECTURE.md](./ARCHITECTURE.md#14-tech-stack-rationale)

---

## 🔑 Core Concepts

1. **Offline Vector Map (PBF, not PNG):** Tiles are `/{z}/{x}/{y}.pbf`, rendered client-side. No `tile.openstreetmap.org` at runtime. LAN-only deployment supported.
2. **Separate Map Server:** Tile + Routing + Geocoding runs as independent container/service. API server only proxies config.
3. **Route Prefixes:** `_auth` (guest-only), `_public` (open), `_user` (authenticated), `_admin` (admin-only) — enforced on both frontend & backend. See [API.md](./API.md).
4. **Shared Contract:** Zod schemas in `packages/shared` → Fastify validation → OpenAPI → Zopia generates client types. Single source of truth.
5. **SOS Lifecycle:** `pending → dispatched → accepted → on_the_way → arrived → in_progress → completed` (with cancellations). See [DIAGRAMS/SOS_FLOW.md](./DIAGRAMS/SOS_FLOW.md).

---

## 🛡️ Non-Negotiables for Contributors

- **NEVER** add `DELETE /_admin/users/:id` — only activate/deactivate.
- **NEVER** use raster tiles (`*.png`) for base map.
- **NEVER** log passwords/answers or store them in plain text (argon2id/bcrypt).
- **ALWAYS** validate body/query with Zod (no raw `req.body`).
- **ALWAYS** put docs updates in the same PR as code changes.

---

## 📂 Root Files

- `../README.md` — Project Prompt & Technical Specification (original 500-line spec, frozen).
- `.env.example` — All env vars with comments.
- `docker-compose.yml` — api + postgres + map-server + nginx.
- `packages/` — Monorepo source.

---

## 🔄 Docs Maintenance

- Docs are **high-strictness** (even though code is low-strictness in dev).
- Every feature PR must update `TASKS.md` and `PROGRESS.md`.
- Diagrams are **Mermaid** — renderable on GitHub.

Last updated: 2025-10-18 | Maintainer: Komeil & AI Assistant
