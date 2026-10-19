FROM oven/bun:1.4.3

WORKDIR /app
COPY map-config.mjs geocoding.mjs routing.mjs server.mjs ./
USER bun
EXPOSE 3000
CMD ["bun", "run", "server.mjs"]
