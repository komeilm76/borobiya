# Performance

Performance comes from a small runtime, bounded caches and avoiding duplicated state. One Bun process serves static assets, JSON, SVG tiles and WebSockets. There is no external cache, message broker, ORM or separate application server in the request path.

## Server path

HTTP responses are written directly by `Bun.serve`. JSON envelopes are small; static and SVG responses add ETags, cache-control and gzip compression (Bun 1.4.4 offers gzip; Brotli is not used). The static server refuses paths outside `public`. The declarative router resolves a route once per request and validates only declared fields. Rate limiter buckets use a bounded LRU cache keyed by IP and route; they do not spawn timers.

SQLite uses foreign keys, a busy timeout, memory temp storage and a tuned cache size. File-backed databases use WAL and normal synchronous mode. The repository uses prepared statements through a thin typed layer. Live fixes are held in a bounded LRU cache and persisted at most every five seconds per user, which prevents high-frequency geolocation from becoming a write amplification problem. Expired shares and old location points are purged by maintenance jobs.

Offline map tiles are deterministic SVG built from pure functions and cached by `dataVersion`. Tiles receive SHA-256 ETags and one-year immutable cache headers. The service worker uses a separate bounded tile cache with 256 entries. Static precache entries are versioned from their content so a new deploy invalidates the old cache atomically.

## Realtime path

Each browser keeps one WebSocket. The hub sends periodic pings and closes dead peers. Frames are bounded by `WS_MAX_FRAME_BYTES`; JSON queues are bounded; room membership is bounded. Live location, presence, SOS events, mission updates and talk state reuse the same connection. Durable events are written inside the domain transaction and published after commit, so a reconnect can catch up through `sync` instead of replaying an entire snapshot.

Audio is 16 kHz PCM16 in small frames. The floor controller enforces one speaker, ordered sequence numbers, a 30-second hold ceiling and a two-second idle release. Frames are forwarded directly to the target peer without transcoding, recording or database writes. This keeps latency and storage cost low.

## Browser path

The browser ships a Vite bundle with one entry chunk and per-view code-split chunks, so the login shell never downloads the administrator console. Theme resolves before paint through a small inline attribute in `src/client/index.html`. Vue Router renders one view at a time and unmounts composables, geolocation watches and audio capture on navigation. The map places only visible tiles and a small set of POI and live markers. Charts are inline SVG. Images and fonts are self-hosted and preloaded where useful, and Tailwind CSS 4 is compiled to one stylesheet.

## Verification

`./boro check` validates the full suite, including asset and architecture invariants. `bun run bench` records release figures for 1,000 validations, 100 deterministic tiles, 50 concurrent public reads and WebSocket live-location fan-out; `tests/performance.test.ts` keeps those measurements inside generous automated budgets. `/_public/health`, `/_admin/system/health` and the realtime statistics expose live counters for peers, frames, map cache entries, database tables and talk-floor state. Use these counters with request IDs when investigating latency or cache growth.
