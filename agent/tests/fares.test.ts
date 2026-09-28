import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bundledSnapshot, faresFor, LetsFGClient, LetsFGError, loadSnapshot, parseSnapshot, pollFares, routesFor, type FareSnapshot } from "../src/fares.js";
import { runOrchestrator } from "../src/orchestrator.js";
import { HeuristicJevClient } from "../src/jev.js";
import { parseArgs } from "../scripts/poll-fares.js";
import { GOLDEN_PROMPT, ScriptedModel } from "./fixtures.js";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function stub(responses: Response[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return responses.shift()!; }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}
const offer = (price: number, extra = {}) => ({ price, currency: "CAD", airline: "Emirates", origin: "YYZ", destination: "DXB", duration_minutes: 750, stops: 0, ...extra });
const party = { adults: 1, children: 0, infants: 0 };

test("bundled snapshot is the June 2026 recording and lookups are case-insensitive", () => {
  const s = bundledSnapshot();
  assert.equal(s.observedAt, "2026-06-01");
  assert.equal(faresFor(s, "yyz", "bom")[0].priceCAD, 849);
  assert.deepEqual(faresFor(s, "YYZ", "LHR"), []);
});

test("snapshot files are validated; malformed offers are dropped", () => {
  const good = { origin: "YYZ", destination: "BOM", priceCAD: 900, airline: "X", durationHours: 20, stops: 1 };
  const parsed = parseSnapshot(JSON.stringify({ source: "poll", observedAt: "2026-09-27T10:00:00Z", offers: { "YYZ-BOM": [good, { ...good, priceCAD: -1 }, { ...good, durationHours: 0 }, null], bad: "x" } }));
  assert.deepEqual(parsed.offers, { "YYZ-BOM": [good] });
  for (const bad of [{}, { source: "x", observedAt: "nope", offers: {} }, { source: "x", observedAt: "2026-01-01" }, null]) assert.throws(() => parseSnapshot(JSON.stringify(bad)), /Fare snapshot must/);
  assert.equal(loadSnapshot({}).source, bundledSnapshot().source);
  const file = join(mkdtempSync(join(tmpdir(), "fares-")), "latest.json");
  writeFileSync(file, JSON.stringify({ source: "disk", observedAt: "2026-09-27", offers: {} }));
  assert.equal(loadSnapshot({ FLYWITH_FARE_SNAPSHOT: file }).source, "disk");
  assert.equal(loadSnapshot({ FLYWITH_FARE_SNAPSHOT: "/x.json" }, () => JSON.stringify({ source: "file", observedAt: "2026-09-27", offers: {} })).source, "file");
});

test("LetsFG: starts a search, polls until completed, and returns the cheapest CAD offer", async () => {
  const { calls, fetchImpl } = stub([
    json(200, { search_id: "s/1" }),
    json(200, { status: "searching" }),
    json(200, { status: "completed", offers: [offer(900), offer(641.4, { airline: undefined, airline_code: "EK" }), offer(10, { currency: "USD" }), offer(5, { duration_minutes: 0 })] }),
  ]);
  const sleeps: number[] = [];
  const client = new LetsFGClient({ apiKey: "tok", baseUrl: "https://lf.test/", fetchImpl, pollMs: 5, sleep: async (ms) => { sleeps.push(ms); } });
  assert.deepEqual(await client.cheapest("YYZ", "DXB", "2026-11-10", party), { origin: "YYZ", destination: "DXB", priceCAD: 641, airline: "EK", durationHours: 12.5, stops: 0 });
  assert.equal(calls[0].url, "https://lf.test/api/search");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { origin: "YYZ", destination: "DXB", date_from: "2026-11-10", adults: 1, children: 0, infants: 0, currency: "CAD", limit: 20 });
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, "Bearer tok");
  assert.equal(calls[1].url, "https://lf.test/api/results/s%2F1");
  assert.deepEqual(sleeps, [5]);
});

test("LetsFG: empty results, clarification, missing ids, failures, timeouts and HTTP errors", async () => {
  const run = (responses: Response[], opts = {}) => new LetsFGClient({ apiKey: "Bearer tok", fetchImpl: stub(responses).fetchImpl, sleep: async () => {}, ...opts }).cheapest("YYZ", "DXB", "2026-11-10", party);
  assert.equal(await run([json(200, { search_id: "1" }), json(200, { status: "completed" })]), null);
  const fallback = await run([json(200, { search_id: "1" }), json(200, { status: "completed", offers: [offer(700, { airline: undefined, origin: "", destination: "" })] })]);
  assert.deepEqual([fallback?.airline, fallback?.origin, fallback?.destination], ["Unknown airline", "YYZ", "DXB"]);
  await assert.rejects(run([json(200, { needs_clarification: true, follow_up_questions: ["Which date?"] })]), /Which date\?/);
  await assert.rejects(run([json(200, { needs_clarification: true })]), /more search details/);
  await assert.rejects(run([json(200, {})]), /search id/);
  await assert.rejects(run([json(200, { search_id: "1" }), json(200, { status: "expired" })]), /search expired/);
  await assert.rejects(run([json(200, { search_id: "1" }), json(200, { status: "searching" })], { maxPolls: 1 }), /timed out/);
  await assert.rejects(run([json(429, { error: "Slow down.", retry_after_seconds: 120 })]), (e: LetsFGError) => e.status === 429 && e.retryAfterSeconds === 120 && e.message === "Slow down.");
  await assert.rejects(run([new Response("oops", { status: 502 })]), (e: LetsFGError) => e.status === 502 && /HTTP 502/.test(e.message));
  assert.throws(() => new LetsFGClient({ apiKey: " " }), /LETSFG_API_KEY/);
});

test("default sleep is used between polls when none is injected", async () => {
  const { fetchImpl } = stub([json(200, { search_id: "1" }), json(200, { status: "queued" }), json(200, { status: "completed", offers: [offer(700)] })]);
  assert.equal((await new LetsFGClient({ apiKey: "tok", fetchImpl, pollMs: 1 }).cheapest("YYZ", "DXB", "2026-11-10", party))?.priceCAD, 700);
});

test("the poller covers the direct route and both legs per city, spaced for the free tier", async () => {
  assert.deepEqual(routesFor({ origin: "YYZ", destination: "BOM", via: ["DXB", "YYZ", "BOM"] }), [["YYZ", "BOM"], ["YYZ", "DXB"], ["DXB", "BOM"]]);
  const sleeps: number[] = [];
  const seen: string[] = [];
  const client = { cheapest: async (o: string, d: string) => { seen.push(`${o}-${d}`); if (d === "DOH") return null; if (o === "DOH") throw new Error("boom"); return { origin: o, destination: d, priceCAD: 500, airline: "X", durationHours: 10, stops: 0 }; } };
  const outcome = await pollFares(client, { origin: "YYZ", destination: "BOM", via: ["DXB", "DOH"], date: "2026-11-10", party }, { spacingMs: 7, sleep: async (ms) => { sleeps.push(ms); }, now: () => new Date("2026-09-27T12:00:00Z") });
  assert.deepEqual(seen, ["YYZ-BOM", "YYZ-DXB", "DXB-BOM", "YYZ-DOH", "DOH-BOM"]);
  assert.deepEqual(sleeps, [7, 7, 7, 7]);
  assert.deepEqual(Object.keys(outcome.snapshot.offers), ["YYZ-BOM", "YYZ-DXB", "DXB-BOM"]);
  assert.deepEqual(outcome.failures, [{ route: "YYZ-DOH", error: "no offers" }, { route: "DOH-BOM", error: "boom" }]);
  assert.equal(outcome.snapshot.observedAt, "2026-09-27T12:00:00.000Z");
  assert.equal(outcome.snapshot.source, "LetsFG fare poll for 2026-11-10");
});

test("the poller stops at the first rate limit instead of burning the quota", async () => {
  let count = 0;
  const client = { cheapest: async () => { count++; throw new LetsFGError("rate limited", 429); } };
  const outcome = await pollFares(client, { origin: "YYZ", destination: "BOM", via: ["DXB"], date: "2026-11-10", party }, { sleep: async () => {} });
  assert.equal(count, 1);
  assert.equal(outcome.failures.length, 1);
  const thrown = { cheapest: async () => { throw "string failure"; } };
  assert.equal((await pollFares(thrown, { origin: "YYZ", destination: "BOM", via: [], date: "2026-11-10", party })).failures[0].error, "string failure");
  const real = await pollFares({ cheapest: async () => null }, { origin: "YYZ", destination: "BOM", via: ["DXB"], date: "2026-11-10", party }, { spacingMs: 1 });
  assert.equal(real.searched, 3);
});

test("poll CLI arguments default sensibly and validate the date", () => {
  const { plan, out, spacingMs } = parseArgs([], new Date("2026-09-27T00:00:00Z"));
  assert.equal(plan.date, "2026-10-27");
  assert.deepEqual([plan.origin, plan.destination, out, spacingMs], ["YYZ", "BOM", "data/fares-latest.json", 200_000]);
  assert.deepEqual(plan.via, ["DXB", "IST", "DOH", "SIN"]);
  assert.equal(parseArgs(["--origin", "yvr", "--destination", "del", "--date", "2026-12-01", "--out", "x.json", "--spacing", "1"]).plan.origin, "YVR");
  assert.throws(() => parseArgs(["--date", "tomorrow"]), /YYYY-MM-DD/);
});

test("the agent reads a polled snapshot and cites it as evidence", async () => {
  const polled: FareSnapshot = { ...bundledSnapshot(), source: "LetsFG fare poll for 2026-11-10", observedAt: "2026-09-27T12:00:00.000Z" };
  const result = await runOrchestrator({ prompt: GOLDEN_PROMPT }, () => {}, { model: new ScriptedModel(), jev: new HeuristicJevClient(), fares: polled });
  assert.equal(result.status, "completed");
  assert.equal(result.evidence.find((e) => e.id === "flight:direct:YYZ-BOM")?.source, "LetsFG fare poll for 2026-11-10");
  assert.match(result.verdict!.verifierNote, /fare snapshot observed 2026-09-27/);
  const partial: FareSnapshot = { ...polled, offers: { "YYZ-BOM": polled.offers["YYZ-BOM"] } };
  assert.match((await runOrchestrator({ prompt: GOLDEN_PROMPT }, () => {}, { model: new ScriptedModel(), jev: new HeuristicJevClient(), fares: partial })).error!, /No stopover pair/);
});
