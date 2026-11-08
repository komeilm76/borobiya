# Architecture

Borobiya is a single-process Node.js application with no third-party runtime dependencies. Native HTTP serving, RFC 6455 WebSockets, `node:sqlite`, direct TypeScript execution, Web Crypto primitives and the browser platform API replace the earlier framework stack. The design goal is a small number of explicit boundaries rather than many plugins and duplicated stores.

## Layers

`src/core` contains infrastructure primitives: strict validators, typed errors, deterministic LRU caches, password and cookie helpers, configuration, token-bucket rate limiting, HTTP response helpers, a declarative router, safe static file serving and a native WebSocket hub. These modules depend only on Node.js and the shared protocol.

`src/domain` contains pure rules: geometry, state transitions, catalogs and deterministic SVG vector tiles. It does not import the database, services or Node-specific modules. Geometry helpers are shared from `public/js/geo.js` so browser and server agree on coordinate conversion, distance, staleness and visible tile ranges.

`src/db` contains one SQLite schema, a typed repository and `UnitOfWork`. The repository owns SQL, event appending, event filtering and transaction execution. `UnitOfWork` wraps every state-changing use case: it opens a SQLite transaction, appends durable events inside that transaction, commits, and only then publishes those events through the WebSocket hub. A failed transaction publishes nothing.

`src/services` contains use cases. Authentication owns sessions and recovery; users owns profiles, devices, places and sync; location owns live fixes, shares and history; SOS owns requests, missions and transitions; talk owns the one-to-one floor; administration owns console operations; realtime owns tickets, presence, rooms and audio authorization. Services never construct HTTP responses.

`src/routes` declares every endpoint, HTTP method, auth requirement, body schema, query schema and rate bucket. `src/app.ts` builds configuration, database, repository, hub, unit of work, services, router, static files, rate limiters and jobs, then handles one request pipeline. `src/index.ts` is the command-line entry point.

## Request and event flow

An HTTP request receives a request ID, strict security headers, CORS headers and origin checks. The router resolves the declarative route, parses and validates input, applies rate limits, resolves the session cookie and calls one service method. Responses use a strict `{ok,requestId,data}` envelope or `{ok,requestId,error}` error envelope. Static responses add ETags, compression and explicit cache policies.

A state-changing service method uses `UnitOfWork`. The SQLite transaction writes domain rows and event rows together. After commit, the hub publishes the event to rooms derived from its audience. Clients also maintain an event cursor; after reconnection they call `sync` to receive any durable events they missed. This makes realtime delivery an acceleration path, not the source of truth.

## Browser topology

`public/index.html` loads a pre-paint theme resolver, generated icon CSS, `app.css` and the module router in `app.js`. The browser uses one authenticated WebSocket created with a short-lived ticket. JSON messages carry commands, acknowledgements, errors, presence, location, talk state and durable events. Binary frames carry ephemeral 16 kHz PCM16 audio with a ten-byte header. The service worker precaches versioned static assets and maintains a bounded offline tile cache. Private APIs are never cached.

## Dependency direction

Dependencies point inward: routes depend on services, services depend on domain and core, core does not depend on services, and domain depends only on shared pure constants. Browser modules import the same protocol and geometry constants as the server. Tests may use the app factory directly. This direction keeps the pure rules portable and makes the runtime surface small enough to audit.
