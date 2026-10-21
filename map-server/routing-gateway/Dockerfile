FROM oven/bun:1.4.3

WORKDIR /app
COPY map-config.mjs geocoding.mjs routing.mjs server.mjs ./
USER bun
EXPOSE 3000
# Run the entrypoint directly so Docker's SIGTERM reaches the server process
# (server.mjs closes the HTTP server on shutdown signals).
CMD ["bun", "server.mjs"]
