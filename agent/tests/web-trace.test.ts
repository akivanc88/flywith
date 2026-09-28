import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const trace = require("../../assets/js/agent-trace.js") as {
  unwrap(m: unknown): { type?: string };
  describeEvent(e: unknown, live?: boolean): { cls?: string; tag?: string; text?: string; status?: [string, boolean] } | null;
  optionLines(o: Record<string, unknown>): { title: string; score: string; lines: [string, string][]; status: string };
  signedMoney(n: number): string;
  safeStatus(s: string): string;
};

test("live SSE envelopes are unwrapped; recorded events pass through", () => {
  assert.deepEqual(trace.unwrap({ sequence: 3, event: { type: "run.done" } }), { type: "run.done" });
  assert.deepEqual(trace.unwrap({ type: "verdict" }), { type: "verdict" });
  assert.equal(trace.unwrap(null), null);
});

test("every event the agent emits renders a feed line or status", () => {
  const replay = JSON.parse(readFileSync(new URL("../../assets/data/agent-trace-replay.json", import.meta.url), "utf8"));
  for (const event of replay.events) assert.ok(trace.describeEvent(event), event.type);
  assert.match(trace.describeEvent({ type: "router.decision", decision: { action: "run", subagents: ["flight-search", "verifier"], tier: "strong" } })!.text!, /✈ flight-search · ✓ verifier · deep drafting/);
  assert.match(trace.describeEvent({ type: "router.decision", decision: { tier: "fast" } })!.text!, /fast drafting/);
  assert.match(trace.describeEvent({ type: "router.decision", decision: { action: "reject" } })!.text!, /screened/);
  assert.equal(trace.describeEvent({ type: "router.decision" })!.tag, "🧭 intake-router");
  assert.equal(trace.describeEvent({ type: "subagent.tool", agent: "mystery", tool: "t", input: {} })!.tag, "mystery → t");
});

test("private reasoning and unknown events are never rendered", () => {
  assert.equal(trace.describeEvent({ type: "orchestrator.thinking", text: "secret" }), null);
  assert.equal(trace.describeEvent({ type: "something.new" }), null);
  assert.equal(trace.describeEvent(null), null);
});

test("terminal status reflects live vs replay and failed runs", () => {
  assert.deepEqual(trace.describeEvent({ type: "run.done", status: "completed" }, true)!.status, ["live run complete", false]);
  assert.match(trace.describeEvent({ type: "run.done" })!.status![0], /snapshot replay complete/);
  assert.deepEqual(trace.describeEvent({ type: "run.done", status: "rejected" })!.status, ["run rejected", false]);
  assert.equal(trace.describeEvent({ type: "run.error", message: "nope" })!.cls, "err");
});

test("verdict cards format per-seat money and fall back to a safe status", () => {
  const view = trace.optionLines({ stopoverCity: "Dubai", suggestedDays: 5, worthItScore: 86, flightTotalCAD: 1107, deltaVsDirectCAD: 258, hotelEstimateCAD: 1160, highlight: "h", caution: "c", visaVerdict: "v", dataStatus: "<script>" });
  assert.equal(view.title, "Dubai · 5 days");
  assert.equal(view.score, "86");
  assert.equal(view.lines[0][1], "$1,107/seat flights (+$258 vs direct) · hotel est. $1,160");
  assert.equal(view.status, "editorial");
  assert.equal(trace.signedMoney(-40), "−$40");
  assert.equal(trace.safeStatus("estimated"), "estimated");
});
