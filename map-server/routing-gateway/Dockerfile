# Match the API's verified Bun base when Docker Hub is blocked on the VM.
ARG BOROBIYA_BUN_BASE_IMAGE=oven/bun:1.4.3
FROM ${BOROBIYA_BUN_BASE_IMAGE}

WORKDIR /app
COPY map-config.mjs geocoding.mjs elevation.mjs routing.mjs server.mjs upstream.mjs ./
USER bun
EXPOSE 3000
# Run the entrypoint directly so Docker's SIGTERM reaches the server process
# (server.mjs closes the HTTP server on shutdown signals).
CMD ["bun", "server.mjs"]
