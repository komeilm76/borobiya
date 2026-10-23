import assert from "node:assert/strict";
import test from "node:test";
import { describeUpstream, formatUpstreamLog, readUpstreamBody } from "./upstream.mjs";

function fakeResponse(text, { status = 200, throwOnRead = false } = {}) {
  return {
    status,
    async text() {
      if (throwOnRead) throw new Error("socket hang up");
      return text;
    }
  };
}

test("readUpstreamBody keeps the text alongside the parsed value", async () => {
  const ok = await readUpstreamBody(fakeResponse('{"code":"Ok"}'));
  assert.deepEqual(ok, { text: '{"code":"Ok"}', parsed: { code: "Ok" }, readFailed: false });

  const notJson = await readUpstreamBody(fakeResponse("<html>502</html>"));
  assert.equal(notJson.parsed, undefined);
  assert.equal(notJson.readFailed, false);

  const unreadable = await readUpstreamBody(fakeResponse("", { throwOnRead: true }));
  assert.deepEqual(unreadable, { text: "", parsed: undefined, readFailed: true });
});

test("describeUpstream drops the query string so user text cannot be echoed", async () => {
  const body = await readUpstreamBody(fakeResponse('{"code":"Internal"}', { status: 500 }));
  const { fields } = describeUpstream({
    endpoint: "http://photon:2322/api?q=Azadi%20Square&limit=5",
    status: 500,
    ...body
  });
  assert.equal(fields.upstream, "photon:2322/api");
  assert.equal(fields.upstream_status, 500);
  assert.equal(fields.upstream_code, "Internal");
  assert.equal(fields.upstream_body, undefined);
});

test("describeUpstream reports an unreadable body as null, not as empty", async () => {
  const body = await readUpstreamBody(fakeResponse("", { throwOnRead: true }));
  const { fields } = describeUpstream({ endpoint: "http://osrm-car:5000/route/v1/car", status: 200, ...body });
  assert.equal(fields.upstream_body, null);
  assert.match(formatUpstreamLog("car routing", { status: 200, endpoint: "x", fields }), /body=<unreadable>/);
});

test("an object with neither code nor message is shown as an excerpt", async () => {
  const { fields } = describeUpstream({ endpoint: "http://h/p", status: 200, text: "{}", parsed: {}, readFailed: false });
  assert.equal(fields.upstream_body, "{}");
});

test("formatUpstreamLog names the configured endpoint when it differs from the parsed one", () => {
  const line = formatUpstreamLog("car routing", {
    status: 404,
    endpoint: "not a url",
    message: "nope",
    fields: { upstream: "not a url", upstream_status: 404 }
  });
  assert.match(line, /^car routing: upstream not a url answered HTTP 404 message=nope$/);
});

test("a non-URL endpoint degrades to the raw string instead of throwing", () => {
  const { fields } = describeUpstream({ endpoint: "osrm-car:5000?x=1", status: 599, text: "", readFailed: true });
  assert.equal(fields.upstream, "osrm-car:5000");
  assert.equal(fields.upstream_status, 599);
});
