import { createServer } from "node:http";
import { parseMapConfig } from "./map-config.mjs";
import { handleRoutingRequest } from "./routing.mjs";

const maxRequestBytes = 16 * 1024;
const mapConfig = parseMapConfig(process.env);

function toHeaders(rawHeaders) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(rawHeaders)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function toWebRequest(incoming) {
  const method = incoming.method ?? "GET";
  let body;
  if (method !== "GET" && method !== "HEAD") {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    for await (const chunk of incoming) {
      size += chunk.length;
      if (size > maxRequestBytes) {
        tooLarge = true;
      } else if (!tooLarge) {
        chunks.push(chunk);
      }
    }
    if (tooLarge) {
      const error = new Error("Request body too large");
      error.statusCode = 413;
      throw error;
    }
    body = Buffer.concat(chunks).toString("utf8");
  }

  const host = incoming.headers.host ?? "localhost";
  const url = new URL(incoming.url ?? "/", `http://${host}`);
  const init = { method, headers: toHeaders(incoming.headers) };
  if (body !== undefined) {
    init.body = body;
    init.duplex = "half";
  }
  return new Request(url, init);
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const request = await toWebRequest(incoming);
    const response = await handleRoutingRequest(request, { mapConfig });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (incoming.method === "HEAD") {
      outgoing.end();
      return;
    }
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const status = error?.statusCode ?? 500;
    const code = status === 413 ? "request_too_large" : status < 500 ? "invalid_request" : "internal_error";
    if (status >= 500) console.error("Routing gateway request failed", error);
    outgoing.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    outgoing.end(JSON.stringify({ error: code }));
  }
});

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
server.listen(port, host, () => {
  const address = server.address();
  console.log(`Routing gateway listening on http://${host}:${typeof address === "object" && address ? address.port : port}`);
});

// Close gracefully on `docker compose down/stop` instead of dropping requests.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5_000).unref();
  });
}
