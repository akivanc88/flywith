import test from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import http from "node:http";
import { createAgentServer, startServer } from "../src/server.js";
import { HeuristicJevClient } from "../src/jev.js";
import type { ModelClient } from "../src/model.js";
import { GOLDEN_PROMPT, ScriptedModel } from "./fixtures.js";

async function withServer(fn: (base: string) => Promise<void>, model: ModelClient = new ScriptedModel()) {
  const server = createAgentServer({ model, jev: new HeuristicJevClient(), allowedOrigins: ["https://flywith.test"] });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}

async function plan(base: string, body: unknown) {
  const created = await fetch(`${base}/api/plan`, { method: "POST", headers: { "content-type": "application/json", origin: "https://flywith.test" }, body: JSON.stringify(body) });
  return { created, run: await created.json() as { runId: string; eventsUrl: string } };
}

test("POST creates an opaque run and SSE replays the full sequenced trace", () => withServer(async (base) => {
  const { created, run } = await plan(base, { prompt: GOLDEN_PROMPT });
  assert.equal(created.status, 202);
  assert.equal(created.headers.get("access-control-allow-origin"), "https://flywith.test");
  assert.match(run.runId, /^[0-9a-f-]+$/);
  assert.equal(run.eventsUrl, `/api/plan/${run.runId}/events`);
  const text = await (await fetch(base + run.eventsUrl)).text();
  assert.match(text, /^id: 1\ndata: \{"sequence":1/m);
  for (const type of ["router.decision", "subagent.start", "subagent.tool_result", "verdict"]) assert.match(text, new RegExp(`"type":"${type}"`));
  assert.equal((text.match(/"type":"run.done"/g) ?? []).length, 1);
  assert.match(text, /"worthItScore":86/);
}));

test("reconnecting with Last-Event-ID resumes after the given sequence", () => withServer(async (base) => {
  const { run } = await plan(base, { prompt: GOLDEN_PROMPT });
  await (await fetch(base + run.eventsUrl)).text();
  const resumed = await (await fetch(base + run.eventsUrl, { headers: { "last-event-id": "3" } })).text();
  assert.doesNotMatch(resumed, /"sequence":3,/);
  assert.match(resumed, /"sequence":4,/);
  const finished = await (await fetch(base + run.eventsUrl, { headers: { "last-event-id": "9999" } })).text();
  assert.equal(finished, "");
}));

test("a live listener receives events as they are emitted", () => withServer(async (base) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const model = new ScriptedModel();
  const draft = model.draft.bind(model);
  model.draft = async (input) => { await gate; return draft(input); };
  const server = createAgentServer({ model, jev: new HeuristicJevClient() });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const local = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const { run } = await plan(local, { prompt: GOLDEN_PROMPT });
    const streaming = fetch(local + run.eventsUrl).then((r) => r.text());
    setTimeout(release, 50);
    assert.match(await streaming, /"type":"verdict"/);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
}));

test("long runs get heartbeats, and finished runs expire after the retention window", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const model = new ScriptedModel();
  const draft = model.draft.bind(model);
  model.draft = async (input) => { await gate; return draft(input); };
  const server = createAgentServer({ model, jev: new HeuristicJevClient(), heartbeatMs: 5, retentionMs: 20 });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const { run } = await plan(base, { prompt: GOLDEN_PROMPT });
    const streaming = fetch(base + run.eventsUrl).then((r) => r.text());
    setTimeout(release, 40);
    assert.match(await streaming, /: heartbeat/);
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal((await fetch(base + run.eventsUrl)).status, 404);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});

test("disconnecting the last listener cancels unfinished work", () => withServer(async (base) => {
  const { run } = await plan(base, { prompt: GOLDEN_PROMPT });
  await new Promise<void>((resolve) => {
    const req = http.get(base + run.eventsUrl, (res) => { res.once("data", () => { req.destroy(); resolve(); }); });
  });
}, new ScriptedModel([true], () => new Promise(() => {}) as never)));

test("enforces methods, malformed bodies, size limits, CORS, and unknown runs", () => withServer(async (base) => {
  assert.equal((await fetch(`${base}/api/plan`)).status, 405);
  assert.equal((await fetch(`${base}/api/plan`, { method: "POST", body: "{" })).status, 400);
  assert.equal((await fetch(`${base}/api/plan`, { method: "POST", body: JSON.stringify({ prompt: "x".repeat(17000) }) })).status, 413);
  assert.equal((await fetch(`${base}/api/plan/00000000-0000-0000-0000-000000000000/events`)).status, 404);
  assert.equal((await fetch(`${base}/api/plan/00000000-0000-0000-0000-000000000000/events`, { method: "POST" })).status, 405);
  assert.equal((await fetch(`${base}/api/plan`, { method: "OPTIONS", headers: { origin: "https://evil.test" } })).status, 403);
  assert.equal((await fetch(`${base}/api/plan`, { method: "OPTIONS" })).status, 403);
  const preflight = await fetch(`${base}/api/plan`, { method: "OPTIONS", headers: { origin: "https://flywith.test" } });
  assert.equal(preflight.status, 204);
  assert.equal((await fetch(`${base}/nope`)).status, 404);
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /FlyWith Agent/);
}));

test("startServer runs offline without keys and reports its engines", async () => {
  const lines: string[] = [];
  const server = startServer({ PORT: "0" }, (line) => lines.push(line));
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise<void>((resolve) => server.close(() => resolve()));
  assert.match(lines.join("\n"), /offline classifier/);
  assert.match(lines.join("\n"), /offline template/);
  const keyed: string[] = [];
  const live = startServer({ PORT: "0", TYPESAFE_API_KEY: "k", ANTHROPIC_API_KEY: "k" }, (line) => keyed.push(line));
  await new Promise<void>((resolve) => live.once("listening", () => resolve()));
  await new Promise((resolve) => setTimeout(resolve, 10));
  await new Promise<void>((resolve) => live.close(() => resolve()));
  assert.match(keyed.join("\n"), /live classifier · drafting: live model/);
});
