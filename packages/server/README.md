# `@borobiya/server`

Fastify bootstrap for Borobiya. The current app validates server environment settings, registers Helmet, a credentials-aware CORS allowlist, and the global in-memory IP rate limit, exposes `GET /_public/health`, and serves the Swagger/OpenAPI contract catalog. Other API operations remain contract-only.

Before starting, copy the repository's `.env.example` to `.env` and replace the JWT placeholders with distinct random secrets of at least 32 characters. `DATABASE_URL` is validated but the Fastify bootstrap does not open a database connection yet.

## Database foundation

The project selected **Drizzle ORM** with the Postgres.js driver. `src/db/schema.ts` declares the account/security/session and cancellation-reason tables, `src/db/client.ts` provides an explicit client factory, and `drizzle.config.ts` points Drizzle Kit at the schema. The migrations are checked in under `drizzle/`; they are not applied automatically, and the factory is not called by the running API.

Use the explicit database commands from the repository root:

```bash
bun --filter @borobiya/server db:generate # create a reviewed migration from schema changes
bun --filter @borobiya/server db:migrate # apply pending migrations to DATABASE_URL
bun --filter @borobiya/server db:seed    # seed reference data and bootstrap admin
```

Apply migrations before seeding. The seed is idempotent and never overwrites an existing `admin` password. In local development it creates `admin` with the temporary password `admin123`; change it before exposing the service. Seeding refuses that fallback unless `NODE_ENV` is `development` or `test`; outside those modes, set a unique `ADMIN_SEED_PASSWORD`.

## Development commands

```bash
bun --filter @borobiya/server typecheck
bun --filter @borobiya/server test
bun --filter @borobiya/server dev
```
