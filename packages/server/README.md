# `@borobiya/server`

Fastify + TypeScript API for Borobiya. The server validates its environment at startup, registers security headers, CORS and rate limiting, serves health/OpenAPI endpoints, and implements database-backed authentication, refresh/logout, password recovery/security-question flows, and admin user-management routes. SOS, live-location sharing, and mission workflows remain future work.

The API uses PostgreSQL through Drizzle ORM and Postgres.js. Copy the repository's `.env.example` to `.env` and replace the JWT placeholders with distinct random secrets. In Compose, the API receives its container-internal `DATABASE_URL` from the `POSTGRES_*` settings; direct host development uses `DATABASE_URL` from `.env`.

## Database setup

Migrations and seed data are **not** applied automatically at API startup. Apply the checked-in migrations before seeding:

```bash
bun --filter @borobiya/server db:migrate
bun --filter @borobiya/server db:seed
```

`db:migrate` uses Drizzle Kit on a development host. The production API image does not include that dev dependency, so run the checked-in runtime migrator there:

```bash
docker compose run --rm api bun src/db/migrate.ts
```

The seed is idempotent and never overwrites an existing admin password. Local development may use the documented `admin123` fallback; outside development/test, provide a unique `ADMIN_SEED_PASSWORD`. To recover the bootstrap admin account and revoke its existing sessions:

```bash
bun --filter @borobiya/server db:reset-admin-password '<new-password>'
# or, in Compose:
docker compose run --rm -e ADMIN_SEED_PASSWORD api bun src/db/reset-admin-password.ts
```

## Development commands

```bash
bun --filter @borobiya/server dev
bun --filter @borobiya/server test
bun --filter @borobiya/server typecheck
```

Tests use injected stores/Fastify's `inject()` and do not require a live PostgreSQL server. `db:generate` creates a migration from schema changes; review the generated SQL before applying it.
