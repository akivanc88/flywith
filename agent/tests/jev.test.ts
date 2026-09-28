import test from "node:test";
import assert from "node:assert/strict";
import { createJevClient, HeuristicJevClient, HttpJevClient, JevError, type JevRequest } from "../src/jev.js";
import { buildJevRequest } from "../src/intake.js";

const request: JevRequest = { model: "jev-latest", state: "hi", questions: { urgent: { type: "noul", instructions: "urgent" } } };
const ok = { model: "jev-1.13.0", answers: { urgent: { type: "noul", noul: 0.9 } }, usage: { input_tokens: 10, output_tokens: 1 } };
const respond = (status: number, body: unknown = ok) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stub(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return responses.shift()!; }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

test("posts typed questions to /v1/systemone with a bearer key", async () => {
  const { calls, fetchImpl } = stub([respond(200)]);
  const client = new HttpJevClient({ apiKey: "sk-test", baseUrl: "https://jev.test/", fetchImpl });
  const response = await client.systemOne(request, new AbortController().signal);
  assert.equal(response.answers.urgent.noul, 0.9);
  assert.equal(calls[0].url, "https://jev.test/v1/systemone");
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer sk-test");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), request);
  assert.equal(client.engine, "jev");
});

test("retries 429/529 with jittered exponential backoff, then succeeds", async () => {
  const sleeps: number[] = [];
  const { calls, fetchImpl } = stub([respond(429), respond(529), respond(200)]);
  const client = new HttpJevClient({ apiKey: "k", fetchImpl, sleep: async (ms) => { sleeps.push(ms); }, random: () => 1 });
  await client.systemOne(request);
  assert.equal(calls.length, 3);
  assert.deepEqual(sleeps, [250, 500]);
});

test("gives up after max retries and surfaces the status", async () => {
  const { fetchImpl } = stub([respond(429), respond(429)]);
  const client = new HttpJevClient({ apiKey: "k", fetchImpl, maxRetries: 1, sleep: async () => {} });
  await assert.rejects(client.systemOne(request), (e: JevError) => e.status === 429);
});

test("does not retry auth or validation errors, and rejects malformed bodies", async () => {
  for (const status of [401, 422]) {
    const { calls, fetchImpl } = stub([respond(status)]);
    await assert.rejects(new HttpJevClient({ apiKey: "k", fetchImpl }).systemOne(request), (e: JevError) => e.status === status);
    assert.equal(calls.length, 1);
  }
  const { fetchImpl } = stub([respond(200, { nope: true })]);
  await assert.rejects(new HttpJevClient({ apiKey: "k", fetchImpl }).systemOne(request), /unexpected response/);
  const { fetchImpl: nullBody } = stub([respond(200, null)]);
  await assert.rejects(new HttpJevClient({ apiKey: "k", fetchImpl: nullBody }).systemOne(request), /unexpected response/);
  assert.throws(() => new HttpJevClient({ apiKey: "" }), /TYPESAFE_API_KEY/);
});

test("default sleep and random are used when not injected", async () => {
  const { fetchImpl } = stub([respond(429), respond(200)]);
  const client = new HttpJevClient({ apiKey: "k", fetchImpl });
  assert.equal((await client.systemOne(request)).model, "jev-1.13.0");
});

test("heuristic fallback answers every question type with probabilities", async () => {
  const client = new HeuristicJevClient();
  const full = buildJevRequest("Cheap flights Toronto to Mumbai with my baby and grandpa who uses a wheelchair");
  full.questions.depth = { type: "score", instructions: "how detailed", criteria: ["low", "high"] };
  const { answers, model } = await client.systemOne(full);
  assert.equal(model, "heuristic-v1");
  assert.equal(answers.intent.choice, "plan_stopover");
  assert.ok(answers.has_infant.noul! > 0.9 && answers.has_senior.noul! > 0.9 && answers.needs_wheelchair.noul! > 0.9);
  assert.ok(answers.has_children.noul! < 0.1);
  assert.equal(answers.priority.choice, "budget");
  assert.equal(answers.depth.type, "score");
  const plain = await client.systemOne({ ...full, state: "Toronto to Mumbai" });
  assert.equal(plain.answers.priority.choice, "balanced");
  const booking = await client.systemOne({ ...full, state: { request: "book 2 tickets for our flight" } });
  assert.equal(booking.answers.intent.choice, "booking");
  const odd = await client.systemOne({ ...full, state: 42, questions: { unknown: { type: "noul", instructions: "?" }, pick: { type: "choice", instructions: "?", criteria: { a: "a", b: "b" } } } });
  assert.equal(odd.answers.unknown.noul, 0.04);
  assert.equal(odd.answers.pick.choice, "a");
  const codes = await client.systemOne({ ...full, state: "BOM from YYZ in May" });
  assert.equal(codes.answers.intent.choice, "plan_stopover");
  const noKids = await client.systemOne({ ...full, state: "Toronto to Mumbai, no kids this time" });
  assert.ok(noKids.answers.has_children.noul! < 0.1);
  const empty = await client.systemOne({ ...full, state: undefined, questions: { intent: full.questions.intent } });
  assert.equal(empty.answers.intent.choice, "off_topic");
});

test("createJevClient picks the live client only when a key is present", () => {
  assert.equal(createJevClient({}).engine, "heuristic");
  assert.equal(createJevClient({ TYPESAFE_API_KEY: "k" }).engine, "jev");
});
