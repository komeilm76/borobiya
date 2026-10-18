# `@borobiya/shared`

The shared, runtime-validated API contract for Borobiya. This package contains Zod schemas, inferred TypeScript types, and `km-api` route descriptors. It does not depend on Fastify, Vue, or database code.

```ts
import { apiRoutes, loginSchema, registerSchema } from "@borobiya/shared";
import type { LoginInput, RegisterInput } from "@borobiya/shared";

const loginPath = apiRoutes.auth.login.url; // /_auth/login
const openApiPath = apiRoutes.auth.login.makeOpenApiPathShape();
```

Add route contracts with `defineRoute({ method, url, schema, meta })`. The descriptor keeps those four Borobiya-facing fields and also exposes the matching `km-api` config (`pathShape`, `request`, `response`, OpenAPI helpers); route handlers and Fastify registration remain in the server workspace.

Input schemas validate untrusted request data. Security-answer schemas trim surrounding whitespace; the authentication service must still lowercase answers before argon2 hashing and comparison as required by `docs/SECURITY.md`. Server-only rules that depend on database state or environment configuration (such as username uniqueness and the maximum history-sharing window) remain server responsibilities.

Query schemas coerce URL pagination values to numbers, default to `page=1` and `limit=20`, and cap pagination limits at 100. User search trims `q` to at most 30 characters, accepts `online=true|false`, and requires `lat` and `lon` together. Geocoding trims `q` to 1–200 characters, defaults `limit` to 5 (maximum 20), and parses bounding boxes in `west,south,east,north` order.

Run package checks from the repository root:

```bash
bun --filter @borobiya/shared typecheck
bun --filter @borobiya/shared test
```
