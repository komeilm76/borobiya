# `@borobiya/server`

Fastify bootstrap for Borobiya. The current skeleton validates server environment settings, registers Helmet, a credentials-aware CORS allowlist, and the global in-memory IP rate limit, then exposes `GET /_public/health`.

Before starting, copy the repository's `.env.example` to `.env` and replace the JWT placeholders with distinct random secrets of at least 32 characters. `DATABASE_URL` is validated but no database connection is opened by this scaffold.

```bash
bun --filter @borobiya/server typecheck
bun --filter @borobiya/server test
bun --filter @borobiya/server dev
```

Domain handlers, authentication hooks, Redis-backed limits, persistence, and OpenAPI wiring are intentionally left for later tasks.
