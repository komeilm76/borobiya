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

WORKDIR /app/packages/server
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]
