// Code-owned orchestration:
// intake (Jev router + injection guardrail + model tier) → flight-search ∥ family-logistics
// → stopover-value (deterministic rubric) → draft (Claude or template) → verifier
// (every number recomputed + prose audit) → at most one correction → publish.
import { createJevClient, type JevClient } from "./jev.js";
import { bundledSnapshot, type FareSnapshot } from "./fares.js";
import { runIntake, ValidationError } from "./intake.js";
import { createModelClient, RefusalError, type ModelClient, type Prose } from "./model.js";
import { auditNumbers, familyLogistics, flightSearch, stopoverValue, verifierReport, type Context } from "./subagents.js";
import type { EvidenceEntry, ParsedRequest, PlanRequest, RunResult, TraceEmitter, Verdict, VerdictOption } from "./trace.js";

export { ValidationError } from "./intake.js";

export interface OrchestratorOptions {
  model?: ModelClient;
  jev?: JevClient;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxModelCalls?: number;
  /** Fare snapshot the flight-search tools read; defaults to the bundled June 2026 recording. */
  fares?: FareSnapshot;
  runId?: string;
}

export class VerificationError extends Error {}

export function stableEvidence(entries: EvidenceEntry[]): EvidenceEntry[] {
  const seen = new Set<string>();
  return [...entries].sort((a, b) => a.id.localeCompare(b.id)).filter((e) => { const key = `${e.tool}:${JSON.stringify(e.input)}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

export function mergeProse(options: VerdictOption[], prose: Prose): VerdictOption[] {
  return options.map((o) => {
    const p = prose.options.find((x) => x.iata === o.iata);
    return p ? { ...o, highlight: p.highlight, caution: p.caution } : o;
  });
}

function abortError(signal: AbortSignal): Error { return signal.reason instanceof Error ? signal.reason : new Error("Run cancelled."); }

export async function runOrchestrator(request: PlanRequest, emit: TraceEmitter, options: OrchestratorOptions = {}): Promise<RunResult> {
  const runId = options.runId ?? crypto.randomUUID();
  const evidence: EvidenceEntry[] = [];
  let modelCalls = 0;
  let terminal = false;
  const controller = new AbortController();
  const onAbort = () => controller.abort(options.signal?.reason);
  options.signal?.addEventListener("abort", onAbort, { once: true });
  if (options.signal?.aborted) controller.abort(options.signal.reason);
  const timeout = setTimeout(() => controller.abort(new Error("Run timed out.")), options.timeoutMs ?? 60_000);
  const signal = controller.signal;
  const model = options.model ?? createModelClient();
  const jev = options.jev ?? createJevClient();
  const maxCalls = Math.min(8, Math.max(2, options.maxModelCalls ?? 6));
  // A model call that ignores its signal must not keep the run alive past cancellation or timeout.
  const aborted = new Promise<never>((_, reject) => signal.addEventListener("abort", () => reject(abortError(signal)), { once: true }));
  aborted.catch(() => {});
  const call = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (modelCalls >= maxCalls) throw new VerificationError("Model call budget exhausted.");
    modelCalls++;
    const value = await Promise.race([fn(), aborted]);
    if (signal.aborted) throw abortError(signal);
    return value;
  };
  const finish = (status: RunResult["status"], message: string) => {
    if (!terminal) { terminal = true; emit({ type: "run.error", message }); emit({ type: "run.done", status }); }
  };
  emit({ type: "run.start", runId, prompt: typeof request?.prompt === "string" ? request.prompt.slice(0, 4000) : "" });
  let route: RunResult["route"];
  try {
    const intake = await runIntake(request, jev, signal);
    route = intake.decision;
    { const { engine: _engine, model: _model, ...shown } = route; emit({ type: "router.decision", decision: shown }); }
    if (route.action === "reject" || !intake.parsed) {
      finish("rejected", route.reasons.find((r) => r.startsWith("blocked") || r.includes("not")) ?? "This request is outside what FlyWith plans.");
      return { runId, route, evidence, modelCalls, status: "rejected", error: route.reasons.join("; ") };
    }
    const parsed: ParsedRequest = intake.parsed;
    evidence.push({ id: "intake:route", agent: "intake-router", tool: "systemone", input: { prompt: parsed.prompt }, result: route, dataStatus: "estimated", source: route.engine === "jev" ? "intake classifier (live)" : "intake classifier (offline)", observedAt: new Date(0).toISOString() });
    if (signal.aborted) throw abortError(signal);
    const fares = options.fares ?? bundledSnapshot();
    const ctx: Context = { request: parsed, emit, evidence, fares };
    const family = route.subagents.includes("family-logistics");
    emit({ type: "orchestrator.text", text: family ? "Searching the recorded fare snapshot, then checking family logistics for every candidate." : "Searching the recorded fare snapshot; no family logistics needed for this party." });
    const flights = flightSearch(ctx);
    const facts = family ? familyLogistics(ctx, flights.pairs.map((p) => p.iata)) : new Map();
    if (!flights.pairs.length) throw new ValidationError("No stopover pair is within 50% of the direct fare for this route.");
    const scored = stopoverValue(ctx, flights, facts);
    if (signal.aborted) throw abortError(signal);

    const tier = route.tier;
    const draftInput = { request: parsed, options: scored, directBaselineCAD: flights.baseline.priceCAD, tier };
    let prose = await call(() => model.draft(draftInput, signal));
    const build = (p: Prose): Verdict => ({ route: `${parsed.origin} → ${parsed.destination}`, summary: p.summary, directBaselineCAD: flights.baseline.priceCAD, options: mergeProse(scored, p), verifierNote: "" });
    let verdict = build(prose);
    const [best, ...rest] = verdict.options;
    emit({ type: "orchestrator.text", text: `Draft: ${best.stopoverCity} first for this ${parsed.children + parsed.infants > 0 ? "family" : "trip"}${rest.length ? `, then ${rest.map((o) => o.stopoverCity).join(" and ")}` : ""}. Sending the draft and the full evidence log to the verifier before anything reaches the user.` });

    emit({ type: "subagent.start", agent: "verifier", task: "Audit the draft verdict — every fare, visa rule, hotel figure and score — against the raw evidence log." });
    const ordered = stableEvidence(evidence);
    let numbers = auditNumbers(verdict, ordered, parsed);
    let proseAudit = numbers.approved ? await call(() => model.audit({ verdict, evidence: ordered, tier }, signal)) : undefined;
    if (!numbers.approved || proseAudit?.approved === false) {
      const issues = [...numbers.issues, ...(proseAudit?.issues ?? [])];
      emit({ type: "subagent.tool_result", agent: "verifier", tool: "audit_draft", summary: `Correction requested: ${issues.join("; ")}` });
      prose = await call(() => model.correct({ ...draftInput, issues }, signal));
      verdict = build(prose);
      numbers = auditNumbers(verdict, ordered, parsed);
      proseAudit = numbers.approved ? await call(() => model.audit({ verdict, evidence: ordered, tier }, signal)) : undefined;
    }
    const report = verifierReport(numbers, proseAudit?.approved);
    emit({ type: "subagent.done", agent: "verifier", report });
    if (!numbers.approved || proseAudit?.approved === false) throw new VerificationError("The draft did not pass verification.");
    verdict.verifierNote = `Fares match ${fares === options.fares ? `the fare snapshot observed ${fares.observedAt.slice(0, 10)}` : "the recorded June 2026 snapshot"}; ${numbers.checks} numeric checks passed; hotel figures are estimates and every option is labeled accordingly.`;
    if (terminal) throw new Error("Duplicate publication blocked.");
    terminal = true;
    emit({ type: "verdict", verdict });
    emit({ type: "run.done", status: "completed" });
    return { runId, route, verdict, evidence: ordered, modelCalls, status: "completed" };
  } catch (error) {
    const cancelled = signal.aborted;
    const message = cancelled ? "The planning run was cancelled or timed out." : error instanceof ValidationError ? error.message : error instanceof RefusalError ? "The model declined this request." : "The planning run could not be completed safely.";
    finish(cancelled ? "cancelled" : "failed", message);
    return { runId, route, evidence: stableEvidence(evidence), modelCalls, status: cancelled ? "cancelled" : "failed", error: message };
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener("abort", onAbort);
  }
}
