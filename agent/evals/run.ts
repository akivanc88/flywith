// FlyWith eval runner. Two flows, both through the real entry points:
//   router    — runIntake() on labeled prompts; confusion metrics per signal.
//   scenarios — runOrchestrator() end to end; programmatic checks on the published verdict.
// Offline by default (deterministic, free). `--live` uses the live classifier and drafter
// when their keys are set; it makes paid calls, so run it only with the owner's approval.
// Output: evals/results/<flow>/<variant>/{results.jsonl,traces/,summary.json}.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createJevClient, HeuristicJevClient, type JevClient } from "../src/jev.js";
import { runIntake } from "../src/intake.js";
import { createModelClient, TemplateModelClient, type ModelClient } from "../src/model.js";
import { runOrchestrator } from "../src/orchestrator.js";
import type { PlanRequest, RunResult, TraceEvent } from "../src/trace.js";

interface RouterCase { id: string; tags: string[]; prompt: string; expect: { action: "run" | "reject"; seniors?: boolean; children?: boolean; family?: boolean; tier?: "fast" | "strong" } }
interface ScenarioCase { id: string; tags: string[]; prompt: string; request?: Partial<PlanRequest>; expect: Record<string, unknown> }

const here = new URL(".", import.meta.url);
const load = <T>(name: string): T => JSON.parse(readFileSync(new URL(name, here), "utf8"));

export interface Binary { tp: number; fp: number; tn: number; fn: number }
export const emptyBinary = (): Binary => ({ tp: 0, fp: 0, tn: 0, fn: 0 });
export function tally(b: Binary, expected: boolean, actual: boolean): void { if (expected && actual) b.tp++; else if (!expected && actual) b.fp++; else if (!expected && !actual) b.tn++; else b.fn++; }
export function rates(b: Binary) {
  const div = (a: number, c: number) => (c === 0 ? null : +(a / c).toFixed(3));
  return { precision: div(b.tp, b.tp + b.fp), recall: div(b.tp, b.tp + b.fn), specificity: div(b.tn, b.tn + b.fp), n: b.tp + b.fp + b.tn + b.fn };
}
/** 95% Wilson interval for a pass rate. */
export function wilson(pass: number, n: number): [number, number] {
  if (n === 0) return [0, 0];
  const z = 1.96, p = pass / n, d = 1 + (z * z) / n, c = p + (z * z) / (2 * n), m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [+((c - m) / d).toFixed(3), +((c + m) / d).toFixed(3)];
}

export async function evalRouter(cases: RouterCase[], jev: JevClient) {
  const signals = { reject: emptyBinary(), seniors: emptyBinary(), children: emptyBinary(), family: emptyBinary(), strongTier: emptyBinary() };
  const rows = [];
  for (const c of cases) {
    const started = performance.now();
    const { parsed, decision } = await runIntake({ prompt: c.prompt }, jev).catch((error: Error) => ({ parsed: undefined, decision: { action: "error", error: error.message } as never }));
    const actual = { action: decision.action, seniors: (parsed?.seniors ?? 0) > 0, children: (parsed?.children ?? 0) + (parsed?.infants ?? 0) > 0, family: decision.subagents?.includes("family-logistics") ?? false, tier: decision.tier };
    tally(signals.reject, c.expect.action === "reject", actual.action === "reject");
    const grade: Record<string, number> = { action: Number(actual.action === c.expect.action) };
    if (c.expect.action === "run") {
      for (const key of ["seniors", "children", "family"] as const) { tally(signals[key], !!c.expect[key], actual[key]); grade[key] = Number(actual[key] === !!c.expect[key]); }
      tally(signals.strongTier, c.expect.tier === "strong", actual.tier === "strong");
      grade.tier = Number(actual.tier === c.expect.tier);
    }
    grade.pass = Number(Object.values(grade).every((v) => v === 1));
    rows.push({ prompt_id: c.id, prompt: c.prompt, tags: c.tags, status: "ok", grade, expected: c.expect, actual, reasons: decision.reasons, latency_s: +((performance.now() - started) / 1000).toFixed(4) });
  }
  const passed = rows.filter((r) => r.grade.pass).length;
  return { rows, summary: { cases: rows.length, pass: passed, passRate: +(passed / rows.length).toFixed(3), ci95: wilson(passed, rows.length), signals: Object.fromEntries(Object.entries(signals).map(([k, b]) => [k, rates(b)])) } };
}

export function gradeScenario(c: ScenarioCase, result: RunResult, events: TraceEvent[]): Record<string, number> {
  const e = c.expect as Record<string, any>;
  const options = result.verdict?.options ?? [];
  const byIata = Object.fromEntries(options.map((o) => [o.iata, o]));
  const grade: Record<string, number> = { status: Number(result.status === e.status) };
  if (e.order) grade.order = Number(JSON.stringify(options.map((o) => o.iata)) === JSON.stringify(e.order));
  for (const [key, field] of [["scores", "worthItScore"], ["days", "suggestedDays"], ["delta", "deltaVsDirectCAD"], ["hotel", "hotelEstimateCAD"]] as const) {
    if (e[key]) grade[key] = Number(Object.entries(e[key]).every(([iata, v]) => (byIata[iata] as any)?.[field] === v));
  }
  if (e.excludes) grade.excludes = Number(e.excludes.every((i: string) => !byIata[i]));
  if (e.top) grade.top = Number(options[0]?.iata === e.top);
  if (e.notTop) grade.notTop = Number(options.length > 0 && options[0].iata !== e.notTop);
  if (e.maxDays) grade.maxDays = Number(Object.entries(e.maxDays).every(([iata, v]) => (byIata[iata]?.suggestedDays ?? 0) <= (v as number)));
  if (e.rooms) grade.rooms = Number(events.some((ev) => ev.type === "subagent.tool" && ev.tool === "estimate_hotel_cost" && ev.input.rooms === e.rooms));
  if (e.cheapestListed) grade.cheapestListed = Number([...options].sort((a, b) => a.deltaVsDirectCAD - b.deltaVsDirectCAD)[0]?.iata === e.cheapestListed);
  if (e.highlightMentions) grade.highlightMentions = Number(options.length > 0 && new RegExp(e.highlightMentions, "i").test(options[0].highlight));
  if (e.errorMatches) grade.errorMatches = Number(new RegExp(e.errorMatches).test(result.error ?? ""));
  if (e.allDays) grade.allDays = Number(options.length > 0 && options.every((o) => o.suggestedDays === e.allDays));
  if (e.traceMentions) grade.traceMentions = Number(JSON.stringify(events).includes(e.traceMentions));
  grade.verifiedBeforePublish = Number(!result.verdict || events.findIndex((ev) => ev.type === "verdict") > events.findIndex((ev) => ev.type === "subagent.done" && ev.agent === "verifier"));
  grade.pass = Number(Object.values(grade).every((v) => v === 1));
  return grade;
}

export async function evalScenarios(cases: ScenarioCase[], jev: JevClient, model: ModelClient) {
  const rows = [];
  const traces: Record<string, TraceEvent[]> = {};
  for (const c of cases) {
    const events: TraceEvent[] = [];
    const started = performance.now();
    const result = await runOrchestrator({ prompt: c.prompt, ...c.request }, (e) => events.push(e), { jev, model });
    const grade = gradeScenario(c, result, events);
    traces[c.id] = events;
    rows.push({ prompt_id: c.id, prompt: c.prompt, tags: c.tags, status: "ok", grade, run_status: result.status, model_calls: result.modelCalls, latency_s: +((performance.now() - started) / 1000).toFixed(4) });
  }
  const passed = rows.filter((r) => r.grade.pass).length;
  return { rows, traces, summary: { cases: rows.length, pass: passed, passRate: +(passed / rows.length).toFixed(3), ci95: wilson(passed, rows.length) } };
}

function write(flow: string, variant: string, rows: object[], summary: object, traces: Record<string, unknown> = {}) {
  const dir = new URL(`results/${flow}/${variant}/`, here);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(new URL("traces/", dir), { recursive: true });
  writeFileSync(new URL("results.jsonl", dir), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(new URL("summary.json", dir), JSON.stringify(summary, null, 2) + "\n");
  for (const [id, trace] of Object.entries(traces)) writeFileSync(new URL(`traces/${id}_rep0.json`, dir), JSON.stringify(trace, null, 2));
  return fileURLToPath(dir);
}

/* c8 ignore start */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const live = process.argv.includes("--live");
  const variant = live ? "live" : "baseline";
  const jev = live ? createJevClient() : new HeuristicJevClient();
  const model = live ? createModelClient() : new TemplateModelClient();
  const router = await evalRouter(load<RouterCase[]>("router-cases.json"), jev);
  const scenarios = await evalScenarios(load<ScenarioCase[]>("scenario-cases.json"), jev, model);
  console.log(`router    ${router.summary.pass}/${router.summary.cases} pass (95% CI ${router.summary.ci95.join("–")}) → ${write("router", variant, router.rows, router.summary)}`);
  console.log(`          ${JSON.stringify(router.summary.signals)}`);
  console.log(`scenarios ${scenarios.summary.pass}/${scenarios.summary.cases} pass (95% CI ${scenarios.summary.ci95.join("–")}) → ${write("scenarios", variant, scenarios.rows, scenarios.summary, scenarios.traces)}`);
  const failed = [...router.rows, ...scenarios.rows].filter((r) => !r.grade.pass).map((r) => r.prompt_id);
  if (failed.length) console.log(`failing: ${failed.join(", ")}`);
  if (process.argv.includes("--strict") && failed.length) process.exit(1);
}
/* c8 ignore stop */
