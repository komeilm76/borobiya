FROM oven/bun:1.4.3

WORKDIR /app
ENV NODE_ENV=production

# Copy workspace manifests first so dependency installation can use the lockfile cache.
COPY package.json bun.lock ./
COPY packages/client/package.json ./packages/client/package.json
COPY packages/server/package.json ./packages/server/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN bun install --frozen-lockfile --production

# The API imports the shared workspace at runtime; client source is not part of this image.
COPY packages/server ./packages/server
COPY packages/shared ./packages/shared

# The uploads directory must exist and belong to the runtime user before the volume is mounted on it:
# a named volume inherits ownership from the image's directory, so without this the API would run as
# `bun` against a root-owned /app/data and every photo upload would fail with EACCES.
RUN mkdir -p /app/data/uploads && chown -R bun:bun /app/data

WORKDIR /app/packages/server
USER bun
EXPOSE 3000
# Run the entrypoint directly so Docker's SIGTERM reaches the server process
# (server.ts closes Fastify and the Postgres pool on shutdown signals).
CMD ["bun", "src/server.ts"]
