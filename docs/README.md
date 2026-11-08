# Documentation index

This folder contains practical English documentation for the clean Borobiya rebuild. Each file is written for a specific audience: developers, operators, end users, administrators and reviewers. The canonical visual contract is documented separately under `design/`; this folder explains how the implemented system works and how to operate it.

## Start here

- `DEVELOPMENT.md` describes local prerequisites, environment variables, generated assets, watch mode and debugging.
- `DEPLOYMENT.md` covers production configuration, HTTPS, process startup, database location, backups and health checks.
- `USER_MANUAL.md` explains the mobile account, map, SOS, mission, companion, talk, history and profile workflows.
- `ADMIN_MANUAL.md` explains the desktop overview, dispatch board, users, groups, reports, audit, alerts and settings.

## Technical references

- `ARCHITECTURE.md` defines layers, dependency direction, the transaction/event boundary and runtime topology.
- `API.md` documents envelopes, authentication, endpoint groups, validation and error behavior.
- `WEBSOCKET.md` documents one-use tickets, hello, durable sync, presence, rooms, live location and binary audio.
- `SECURITY.md` documents CSP, CORS, CSRF, sessions, password hashing, recovery, rate limits and data protection.
- `PERFORMANCE.md` documents bounded caches, compression, SQLite pragmas, WebSocket limits and service-worker caching.
- `DESIGN_SYSTEM.md` summarizes colors, typography, spacing, components, responsive behavior and accessibility.

## Process references

- `AUTOMATION.md` documents the `boro` CLI, asset generation, CI workflow, doctor, check, verify and deployment checks.
- `TESTING.md` describes the automated suite, its harness, focused commands and coverage intent.
- `LEGACY_REVIEW.md` records what was learned from the previous architecture and why the clean rebuild is smaller.
- `STATUS.md` summarizes the implemented subsystems and the validation commands that define readiness.
- `ACCEPTANCE.md` maps the original specification and roadmap targets to the clean rebuild and records their closure.
- `RELEASE_NOTES.md` records the 1.0.0 clean-rebuild release and its validation evidence.
- `OPERATIONS.md` is the startup, health, incident, backup, outage and release runbook.

## Reading order

For a first local run, read `DEVELOPMENT.md`, then `AUTOMATION.md`, then `USER_MANUAL.md` or `ADMIN_MANUAL.md` depending on the workflow. For an implementation review, read `ARCHITECTURE.md`, `API.md`, `WEBSOCKET.md`, `SECURITY.md` and `TESTING.md`. For a production release, read `DEPLOYMENT.md`, `SECURITY.md`, `PERFORMANCE.md` and `STATUS.md`. All commands are executed from the repository root.
