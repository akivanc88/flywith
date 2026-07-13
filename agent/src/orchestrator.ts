import Anthropic from "@anthropic-ai/sdk";
import { getCityFacts, listStopoverCandidates, searchFlights } from "./data.js";
import type { DataStatus, EvidenceEntry, PlanRequest, RunResult, TraceEmitter, Verdict, VerdictOption } from "./trace.js";

const MODEL = "claude-opus-4-8";
const SNAPSHOT_DATE = "2026-06-01";
const IATA = /^[A-Z]{3}$/;

export interface AuditResult { approved: boolean; note: string; draftHash: string }
export interface ModelClient {
  draft(input: { request: ParsedRequest; options: VerdictOption[]; directBaselineCAD: number; evidence: EvidenceEntry[] }, signal: AbortSignal): Promise<Verdict>;
  verify(input: { draft: Verdict; draftHash: string; evidence: EvidenceEntry[] }, signal: AbortSignal): Promise<AuditResult>;
  correct?(input: { draft: Verdict; audit: AuditResult; evidence: EvidenceEntry[] }, signal: AbortSignal): Promise<Verdict>;
}

export interface OrchestratorOptions {
  model?: ModelClient;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxModelCalls?: number;
  runId?: string;
}

export interface ParsedRequest { origin: string; destination: string; adults: number; children: number; infants: number; rooms: number; stopoverNights: number; prompt: string }

export class ValidationError extends Error {}
export class VerificationError extends Error {}

function int(value: unknown, fallback: number, name: string, min = 0, max = 20): number {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new ValidationError(`${name} must be an integer from ${min} to ${max}.`);
  return result;
}

export function parsePlanRequest(request: PlanRequest): ParsedRequest {
  if (!request || typeof request.prompt !== "string" || request.prompt.trim().length < 3 || request.prompt.length > 4000) throw new ValidationError("prompt must contain 3 to 4000 characters.");
  const codes = request.prompt.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? [];
  const origin = (request.origin ?? codes[0] ?? "").toUpperCase();
  const destination = (request.destination ?? codes[1] ?? "").toUpperCase();
  if (!IATA.test(origin) || !IATA.test(destination) || origin === destination) throw new ValidationError("Provide distinct three-letter origin and destination IATA codes.");
  const adults = int(request.adults, 1, "adults", 1, 12);
  const children = int(request.children, 0, "children", 0, 12);
  const infants = int(request.infants, 0, "infants", 0, 12);
  return { prompt: request.prompt.trim(), origin, destination, adults, children, infants, rooms: int(request.rooms, Math.max(1, Math.ceil((adults + children) / 3)), "rooms", 1, 8), stopoverNights: int(request.stopoverNights, 2, "stopoverNights", 1, 14) };
}

export function calculateOption(flightTotalCAD: number, hotelNightlyCAD: number, nights: number, rooms: number, directBaselineCAD: number): Pick<VerdictOption, "hotelEstimateCAD" | "allInCAD" | "deltaVsDirectCAD" | "worthItScore"> {
  for (const [name, value] of Object.entries({ flightTotalCAD, hotelNightlyCAD, nights, rooms, directBaselineCAD })) if (!Number.isFinite(value) || value < 0) throw new ValidationError(`${name} must be non-negative and finite.`);
  const hotelEstimateCAD = hotelNightlyCAD * nights * rooms;
  const allInCAD = flightTotalCAD + hotelEstimateCAD;
  const deltaVsDirectCAD = allInCAD - directBaselineCAD;
  // Transparent rubric: 50 base + up to 20 for journey split + 5/day vacation - cost penalty/bonus, clamped 0...100.
  const worthItScore = Math.round(Math.max(0, Math.min(100, 50 + 20 + Math.min(nights, 4) * 5 - (deltaVsDirectCAD / Math.max(directBaselineCAD, 1)) * 50)));
  return { hotelEstimateCAD, allInCAD, deltaVsDirectCAD, worthItScore };
}

export function deriveDataStatus(entries: EvidenceEntry[]): DataStatus {
  const statuses = new Set(entries.map((e) => e.dataStatus));
  if (statuses.has("estimated")) return "estimated";
  if (statuses.has("snapshot")) return "snapshot";
  if (statuses.has("editorial")) return "editorial";
  return "live";
}

export function stableEvidence(entries: EvidenceEntry[]): EvidenceEntry[] {
  const seen = new Set<string>();
  return [...entries].sort((a, b) => a.id.localeCompare(b.id)).filter((e) => { const key = `${e.tool}:${JSON.stringify(e.input)}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

function hashDraft(draft: Verdict): string {
  const text = JSON.stringify(draft);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
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
  const model = options.model ?? new AnthropicModelClient();
  const maxCalls = Math.min(8, Math.max(2, options.maxModelCalls ?? 6));
  const call = async <T>(fn: () => Promise<T>): Promise<T> => { if (modelCalls >= maxCalls) throw new Error("Model call budget exhausted."); modelCalls++; return fn(); };
  emit({ type: "run.start", runId, message: "Planning the trip." });
  try {
    const parsed = parsePlanRequest(request);
    if (signal.aborted) throw abortError(signal);
    emit({ type: "stage.start", stage: "research", message: "Checking fare snapshots and family logistics." });
    const [flightData, logisticsData] = await Promise.all([
      Promise.resolve().then(() => {
        const direct = searchFlights(parsed.origin, parsed.destination);
        if (!direct.length) throw new ValidationError(`No snapshot offers for ${parsed.origin}-${parsed.destination}.`);
        const candidates = listStopoverCandidates().map((iata) => ({ iata, first: searchFlights(parsed.origin, iata), second: searchFlights(iata, parsed.destination) })).filter((x) => x.first.length && x.second.length);
        if (!candidates.length) throw new ValidationError("No complete stopover offers are available.");
        return { direct, candidates };
      }),
      Promise.resolve(listStopoverCandidates().map((iata) => getCityFacts(iata)).filter((x) => x !== undefined)),
    ]);
    const directBaselineCAD = Math.min(...flightData.direct.map((x) => x.priceCAD));
    evidence.push({ id: `flight:direct:${parsed.origin}-${parsed.destination}`, agent: "flight-search", tool: "search_flights", input: { origin: parsed.origin, destination: parsed.destination }, result: flightData.direct, dataStatus: "snapshot", source: "FlyWith June 2026 fare snapshot", observedAt: SNAPSHOT_DATE });
    const optionsList: VerdictOption[] = [];
    for (const candidate of flightData.candidates) {
      const facts = logisticsData.find((x) => x.iata === candidate.iata); if (!facts) continue;
      const flightTotalCAD = Math.min(...candidate.first.map((x) => x.priceCAD)) + Math.min(...candidate.second.map((x) => x.priceCAD));
      evidence.push({ id: `flight:stopover:${candidate.iata}`, agent: "flight-search", tool: "search_stopover", input: { origin: parsed.origin, via: candidate.iata, destination: parsed.destination }, result: { first: candidate.first, second: candidate.second }, dataStatus: "snapshot", source: "FlyWith June 2026 fare snapshot", observedAt: SNAPSHOT_DATE });
      evidence.push({ id: `logistics:${candidate.iata}`, agent: "family-logistics", tool: "get_city_facts", input: { cityIata: candidate.iata }, result: facts, dataStatus: "editorial", source: "FlyWith market research", observedAt: SNAPSHOT_DATE });
      const calc = calculateOption(flightTotalCAD, facts.hotelNightlyCAD, parsed.stopoverNights, parsed.rooms, directBaselineCAD);
      evidence.push({ id: `calculation:${candidate.iata}`, agent: "calculator", tool: "calculate_value", input: { flightTotalCAD, hotelNightlyCAD: facts.hotelNightlyCAD, nights: parsed.stopoverNights, rooms: parsed.rooms, directBaselineCAD }, result: calc, dataStatus: "estimated", source: "FlyWith deterministic scoring rubric v1", observedAt: new Date().toISOString() });
      optionsList.push({ stopoverCity: facts.city, iata: facts.iata, suggestedDays: parsed.stopoverNights, flightTotalCAD, ...calc, visaVerdict: facts.visa, highlight: facts.familyNotes, caution: facts.seniorNotes, dataStatus: "estimated" });
    }
    optionsList.sort((a, b) => b.worthItScore - a.worthItScore || a.iata.localeCompare(b.iata));
    const orderedEvidence = stableEvidence(evidence);
    emit({ type: "stage.done", stage: "research", message: `Compared ${optionsList.length} complete stopovers.` });
    emit({ type: "stage.start", stage: "draft", message: "Drafting a recommendation from the evidence." });
    let draft = await call(() => model.draft({ request: parsed, options: optionsList.slice(0, 3), directBaselineCAD, evidence: orderedEvidence }, signal));
    draft.dataStatus = deriveDataStatus(orderedEvidence.filter((e) => e.agent !== "family-logistics" || draft.options.some((o) => o.iata === (e.input.cityIata as string))));
    emit({ type: "stage.done", stage: "draft", message: "Draft ready for verification." });
    let draftHash = hashDraft(draft);
    emit({ type: "stage.start", stage: "verify", message: "Checking every load-bearing claim." });
    let audit = await call(() => model.verify({ draft, draftHash, evidence: orderedEvidence }, signal));
    if (!audit.approved || audit.draftHash !== draftHash) {
      if (!model.correct) throw new VerificationError(audit.note || "Verifier rejected the draft.");
      draft = await call(() => model.correct!({ draft, audit, evidence: orderedEvidence }, signal));
      draftHash = hashDraft(draft);
      audit = await call(() => model.verify({ draft, draftHash, evidence: orderedEvidence }, signal));
    }
    if (!audit.approved || audit.draftHash !== draftHash) throw new VerificationError("The corrected draft did not pass verification.");
    if (signal.aborted) throw abortError(signal);
    emit({ type: "stage.done", stage: "verify", message: "Recommendation approved." });
    if (terminal) throw new Error("Duplicate publication blocked."); terminal = true;
    emit({ type: "verdict", verdict: draft }); emit({ type: "run.done", status: "completed" });
    return { runId, verdict: draft, evidence: orderedEvidence, modelCalls, status: "completed" };
  } catch (error) {
    const cancelled = signal.aborted;
    const message = cancelled ? "The planning run was cancelled or timed out." : error instanceof ValidationError ? error.message : "The planning run could not be completed safely.";
    if (!terminal) { terminal = true; emit({ type: "run.error", message }); emit({ type: "run.done", status: cancelled ? "cancelled" : "failed" }); }
    return { runId, evidence: stableEvidence(evidence), modelCalls, status: cancelled ? "cancelled" : "failed", error: message };
  } finally { clearTimeout(timeout); options.signal?.removeEventListener("abort", onAbort); }
}

export class AnthropicModelClient implements ModelClient {
  constructor(private readonly client = new Anthropic()) {}
  private async json(system: string, value: unknown, signal: AbortSignal): Promise<any> {
    const response = await this.client.messages.create({ model: MODEL, max_tokens: 4096, system, messages: [{ role: "user", content: JSON.stringify(value) }] }, { signal });
    const text = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("").replace(/^```json\s*|\s*```$/g, "");
    return JSON.parse(text);
  }
  draft(input: Parameters<ModelClient["draft"]>[0], signal: AbortSignal): Promise<Verdict> { return this.json("Return only JSON matching the supplied verdict option data. Never change numbers. Write a concise summary; dataStatus is snapshot or estimated; verifierNote may be empty.", { route: `${input.request.origin} → ${input.request.destination}`, directBaselineCAD: input.directBaselineCAD, options: input.options, dataStatus: deriveDataStatus(input.evidence) }, signal); }
  verify(input: Parameters<ModelClient["verify"]>[0], signal: AbortSignal): Promise<AuditResult> { return this.json("Audit the exact draft against evidence. Return only JSON: {approved:boolean,note:string,draftHash:string}. Echo draftHash exactly. Reject changed numbers, unsupported claims, or dishonest status.", input, signal); }
  correct(input: Parameters<NonNullable<ModelClient["correct"]>>[0], signal: AbortSignal): Promise<Verdict> { return this.json("Correct only the verifier issues using evidence. Return the complete verdict JSON only; never invent facts or numbers.", input, signal); }
}
