import test from "node:test";
import assert from "node:assert/strict";
import { calculateOption, deriveDataStatus, parsePlanRequest, runOrchestrator, stableEvidence, type AuditResult, type ModelClient } from "../src/orchestrator.js";
import type { EvidenceEntry, Verdict } from "../src/trace.js";

class MockModel implements ModelClient {
  calls: string[] = [];
  constructor(private approvals: boolean[] = [true]) {}
  async draft(input: Parameters<ModelClient["draft"]>[0]): Promise<Verdict> { this.calls.push("draft"); return { route: `${input.request.origin} → ${input.request.destination}`, summary: "A snapshot-based comparison.", directBaselineCAD: input.directBaselineCAD, options: input.options, verifierNote: "", dataStatus: "estimated" }; }
  async verify(input: Parameters<ModelClient["verify"]>[0]): Promise<AuditResult> { this.calls.push("verify"); return { approved: this.approvals.shift() ?? false, note: "Evidence checked.", draftHash: input.draftHash }; }
  async correct(input: Parameters<NonNullable<ModelClient["correct"]>>[0]): Promise<Verdict> { this.calls.push("correct"); return { ...input.draft, summary: "Corrected snapshot-based comparison." }; }
}

test("validates and defaults structured requests", () => {
  assert.deepEqual(parsePlanRequest({ prompt: "YYZ to BOM" }), { prompt: "YYZ to BOM", origin: "YYZ", destination: "BOM", adults: 1, children: 0, infants: 0, rooms: 1, stopoverNights: 2 });
  assert.throws(() => parsePlanRequest({ prompt: "YYZ to YYZ" }), /distinct/);
  assert.throws(() => parsePlanRequest({ prompt: "YYZ to BOM", children: -1 }), /children/);
});

test("calculator is deterministic and score is bounded", () => {
  assert.deepEqual(calculateOption(1000, 100, 2, 1, 1200), { hotelEstimateCAD: 200, allInCAD: 1200, deltaVsDirectCAD: 0, worthItScore: 80 });
  assert.equal(calculateOption(10000, 100, 2, 1, 100).worthItScore, 0);
});

test("evidence is stable, deduplicated, and provenance drives status", () => {
  const base = { agent: "flight-search" as const, result: [], source: "test", observedAt: "2026-01-01" };
  const entries: EvidenceEntry[] = [
    { ...base, id: "b", tool: "search", input: { b: 2 }, dataStatus: "snapshot" },
    { ...base, id: "a", tool: "search", input: { a: 1 }, dataStatus: "live" },
    { ...base, id: "c", tool: "search", input: { a: 1 }, dataStatus: "live" },
  ];
  assert.deepEqual(stableEvidence(entries).map((x) => x.id), ["a", "b"]);
  assert.equal(deriveDataStatus(entries), "snapshot");
});

test("runs bounded DAG, publishes once only after exact-draft approval", async () => {
  const model = new MockModel(); const events: string[] = [];
  const result = await runOrchestrator({ prompt: "YYZ to BOM", adults: 2, children: 2 }, (e) => events.push(e.type), { model });
  assert.equal(result.status, "completed"); assert.equal(result.modelCalls, 2);
  assert.deepEqual(model.calls, ["draft", "verify"]);
  assert.equal(events.filter((x) => x === "verdict").length, 1);
  assert.deepEqual(events.slice(-2), ["verdict", "run.done"]);
  assert.equal(result.verdict?.dataStatus, "estimated");
});

test("allows one correction and re-verifies", async () => {
  const model = new MockModel([false, true]);
  const result = await runOrchestrator({ prompt: "YYZ to BOM" }, () => {}, { model, maxModelCalls: 4 });
  assert.equal(result.status, "completed"); assert.deepEqual(model.calls, ["draft", "verify", "correct", "verify"]);
});

test("fails closed when correction or model-call ceiling cannot approve", async () => {
  const model = new MockModel([false, false]); const events: string[] = [];
  const result = await runOrchestrator({ prompt: "YYZ to BOM" }, (e) => events.push(e.type), { model, maxModelCalls: 3 });
  assert.equal(result.status, "failed"); assert.equal(events.includes("verdict"), false); assert.deepEqual(events.slice(-2), ["run.error", "run.done"]);
});

test("honors cancellation and emits one terminal event", async () => {
  const controller = new AbortController(); controller.abort(new Error("stop")); const events: string[] = [];
  const result = await runOrchestrator({ prompt: "YYZ to BOM" }, (e) => events.push(e.type), { model: new MockModel(), signal: controller.signal });
  assert.equal(result.status, "cancelled"); assert.equal(events.filter((x) => x === "run.done").length, 1);
});
