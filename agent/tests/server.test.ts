import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createAgentServer } from "../src/server.js";
import type { ModelClient } from "../src/orchestrator.js";

const model: ModelClient = {
  async draft(input) { return { route: `${input.request.origin} → ${input.request.destination}`, summary: "Snapshot comparison.", directBaselineCAD: input.directBaselineCAD, options: input.options, verifierNote: "", dataStatus: "estimated" }; },
  async verify(input) { return { approved: true, note: "Approved.", draftHash: input.draftHash }; },
};

async function withServer(fn: (base: string) => Promise<void>) { const server = createAgentServer({ model, allowedOrigins: ["https://flywith.test"] }); await new Promise<void>((resolve) => server.listen(0, resolve)); try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); } }

test("POST creates opaque run and SSE replays sequenced terminal stream", () => withServer(async (base) => {
  const created = await fetch(`${base}/api/plan`, { method: "POST", headers: { "content-type": "application/json", origin: "https://flywith.test" }, body: JSON.stringify({ prompt: "YYZ to BOM" }) });
  assert.equal(created.status, 202); assert.equal(created.headers.get("access-control-allow-origin"), "https://flywith.test");
  const body = await created.json() as { runId: string; eventsUrl: string }; assert.match(body.runId, /^[0-9a-f-]+$/); assert.equal(body.eventsUrl, `/api/plan/${body.runId}/events`);
  const response = await fetch(base + body.eventsUrl); assert.equal(response.status, 200); const text = await response.text();
  assert.match(text, /"sequence":1/); assert.equal((text.match(/"type":"run.done"/g) ?? []).length, 1); assert.equal((text.match(/"type":"verdict"/g) ?? []).length, 1);
}));

test("enforces methods, malformed bodies, size limits, CORS, and unknown runs", () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/api/plan`)).status, 405);
  assert.equal((await fetch(`${base}/api/plan`, { method: "POST", body: "{" })).status, 400);
  assert.equal((await fetch(`${base}/api/plan`, { method: "POST", body: JSON.stringify({ prompt: "x".repeat(17000) }) })).status, 413);
  assert.equal((await fetch(`${base}/api/plan/00000000-0000-0000-0000-000000000000/events`)).status, 404);
  assert.equal((await fetch(`${base}/api/plan`, { method: "OPTIONS", headers: { origin: "https://evil.test" } })).status, 403);
}));
