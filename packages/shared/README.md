# `@borobiya/shared`

The shared, runtime-validated API contract for Borobiya. This package contains Zod schemas and inferred TypeScript types; it does not depend on Fastify, Vue, or database code.

```ts
import { loginSchema, registerSchema } from "@borobiya/shared";
import type { LoginInput, RegisterInput } from "@borobiya/shared";
```

Input schemas validate untrusted request data. Security-answer schemas trim surrounding whitespace; the authentication service must still lowercase answers before argon2 hashing and comparison as required by `docs/SECURITY.md`. Server-only rules that depend on database state or environment configuration (such as username uniqueness and the maximum history-sharing window) remain server responsibilities. The geocoding query schema defaults to five results and caps requests at twenty.

Run package checks from the repository root:

```bash
bun --filter @borobiya/shared typecheck
bun --filter @borobiya/shared test
```
