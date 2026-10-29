// Shared diagnostics for the two upstream proxies in this image (OSRM and Photon).
//
// Both used to answer 502 with a bare `{ error: "..." }` or one canned sentence. That is a dead end for
// whoever is standing in front of a failed `verify-routing.sh`: "OSRM returned an error" does not separate
// "the profile container replied HTTP 400 because it cannot snap these coordinates" from "it replied 200
// with something that is not a routing answer" from "a proxy in the middle swallowed the body". Everything
// in this file exists to make those three cases look different, and nothing here changes what a successful
// request returns.
//
// The excerpt limit is deliberately small: the upstream body is operator context, not a payload, and the
// response this produces is served to browsers.

const BODY_EXCERPT_LIMIT = 400;

function excerpt(text) {
  const flat = String(text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length === 0) return "";
  return flat.length > BODY_EXCERPT_LIMIT ? `${flat.slice(0, BODY_EXCERPT_LIMIT)}…` : flat;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Read the upstream once, as text, and try to parse it. `response.json()` cannot be used here: it consumes
// the body, so the fallback path had nothing left to show. `readFailed` is for the case where reading the
// body itself threw (a reset mid-response), which is a different fault from "not JSON".
async function readUpstreamBody(response) {
  let text;
  try {
    text = await response.text();
  } catch {
    return { text: "", parsed: undefined, readFailed: true };
  }
  try {
    return { text, parsed: JSON.parse(text), readFailed: false };
  } catch {
    return { text, parsed: undefined, readFailed: false };
  }
}

// "http://osrm-car:5000/route/v1/car" -> "osrm-car:5000/route/v1/car": the host and path say which
// container and service answered, which is what an operator needs. The query string is dropped on purpose —
// for Photon it carries the user's search text, and a search string has no business being logged or echoed
// to a browser.
function upstreamName(endpoint) {
  const raw = String(endpoint ?? "");
  try {
    const url = new URL(raw);
    // "osrm-car:5000/route" (no scheme) parses as a scheme named osrm-car with an empty host, and reporting
    // the pathname alone would be worse than useless — keep the string the operator configured instead.
    if (url.host) return `${url.host}${url.pathname}`;
  } catch {
    // Not an absolute URL; show it as configured, minus any query string.
  }
  return raw.split("?", 1)[0].trim();
}

function describeUpstream({ endpoint, status, text, parsed, readFailed = false }) {
  const fields = {
    upstream: upstreamName(endpoint),
    upstream_status: Number.isInteger(status) ? status : null
  };
  if (readFailed) {
    fields.upstream_body = null; // the body could not be read at all; say so rather than pretend it was empty
  } else if (isRecord(parsed)) {
    if (typeof parsed.code === "string" && parsed.code) fields.upstream_code = parsed.code;
    if (typeof parsed.message === "string" && parsed.message.trim()) fields.upstream_message = parsed.message.trim();
    // An object without either field is still worth showing: `{"code":"Ok"}`-shaped surprises are how this
    // class of bug was first noticed.
    if (fields.upstream_code === undefined && fields.upstream_message === undefined) {
      fields.upstream_body = excerpt(JSON.stringify(parsed)) || null;
    }
  } else {
    fields.upstream_body = parsed === undefined ? (excerpt(text) || null) : excerpt(JSON.stringify(parsed));
  }

  const message = typeof fields.upstream_message === "string" ? fields.upstream_message : undefined;
  return { fields, message };
}

function formatUpstreamLog(prefix, { status, endpoint, message, fields }) {
  const parts = [`${prefix}: upstream ${fields.upstream} answered HTTP ${fields.upstream_status ?? status}`];
  if (fields.upstream_code) parts.push(`code=${fields.upstream_code}`);
  if (message) parts.push(`message=${message}`);
  if (fields.upstream_body !== undefined) parts.push(`body=${fields.upstream_body ?? "<unreadable>"}`);
  if (endpoint && upstreamName(endpoint) !== fields.upstream) parts.push(`configured=${endpoint}`);
  return parts.join(" ");
}

export { describeUpstream, formatUpstreamLog, readUpstreamBody, upstreamName };
