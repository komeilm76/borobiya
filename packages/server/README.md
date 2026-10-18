# `@borobiya/server`

Fastify bootstrap for Borobiya. The current app validates server environment settings, registers Helmet, a credentials-aware CORS allowlist, and the global in-memory IP rate limit, exposes `GET /_public/health`, and serves the Swagger/OpenAPI contract catalog. Other API operations remain contract-only.

Before starting, copy the repository's `.env.example` to `.env` and replace the JWT placeholders with distinct random secrets of at least 32 characters. `DATABASE_URL` is validated but the Fastify bootstrap does not open a database connection yet.

## Database foundation

The project selected **Drizzle ORM** with the Postgres.js driver. `src/db/schema.ts` declares the initial account/security/session tables, `src/db/client.ts` provides an explicit client factory, and `drizzle.config.ts` points Drizzle Kit at the schema. The factory is not called by the running API; the initial SQL migration is a follow-up task.

After the ORM/schema task is complete, the next database task can generate a reviewed migration with:

```bash
bun --filter @borobiya/server db:generate
```

## Development commands

```bash
bun --filter @borobiya/server typecheck
bun --filter @borobiya/server test
bun --filter @borobiya/server dev
```
