export type DataStatus = "live" | "snapshot" | "estimated" | "editorial";
export type AgentName = "flight-search" | "family-logistics" | "stopover-value" | "verifier";
export type Passport = "CA" | "US" | "GB" | "AU" | "IN" | "OTHER";
export type Priority = "comfort" | "budget" | "explore" | "balanced";
export type ModelTier = "fast" | "strong";

export interface PlanRequest {
  prompt: string;
  origin?: string;
  destination?: string;
  adults?: number;
  children?: number;
  infants?: number;
  seniors?: number;
  rooms?: number;
  stopoverDays?: number;
  passport?: Passport;
  month?: number;
}

/** Party and trip facts after intake. Counts come from structured fields or deterministic parsing, never from the classifier. */
export interface ParsedRequest {
  prompt: string;
  origin: string;
  destination: string;
  adults: number;
  children: number;
  infants: number;
  seniors: number;
  childAges: number[];
  rooms: number;
  stopoverDays?: number;
  passport: Passport;
  month?: number;
  priority: Priority;
  mobilityAssistance: boolean;
}

export interface RouteDecision {
  engine: "jev" | "heuristic";
  model: string;
  intent: "plan_stopover" | "booking" | "off_topic";
  action: "run" | "clarify" | "reject";
  injectionProbability: number;
  subagents: AgentName[];
  tier: ModelTier;
  confidence: number;
  reasons: string[];
}

/** What the trace shows: the routing outcome without internal engine or model identifiers. */
export type PublicRouteDecision = Omit<RouteDecision, "engine" | "model">;

export interface EvidenceEntry {
  id: string;
  agent: AgentName | "intake-router";
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
  dataStatus: DataStatus;
  source: string;
  observedAt: string;
}

export interface VerdictOption {
  stopoverCity: string;
  iata: string;
  suggestedDays: number;
  flightTotalCAD: number;
  hotelEstimateCAD: number;
  deltaVsDirectCAD: number;
  worthItScore: number;
  visaVerdict: string;
  highlight: string;
  caution: string;
  dataStatus: DataStatus;
}

export interface Verdict {
  route: string;
  summary: string;
  directBaselineCAD: number;
  options: VerdictOption[];
  verifierNote: string;
}

export interface RunResult {
  runId: string;
  verdict?: Verdict;
  route?: RouteDecision;
  evidence: EvidenceEntry[];
  modelCalls: number;
  status: "completed" | "failed" | "cancelled" | "rejected";
  error?: string;
}

export type TraceEvent =
  | { type: "run.start"; runId: string; prompt: string }
  | { type: "router.decision"; decision: PublicRouteDecision }
  | { type: "orchestrator.text"; text: string }
  | { type: "subagent.start"; agent: AgentName; task: string }
  | { type: "subagent.tool"; agent: AgentName; tool: string; input: Record<string, unknown> }
  | { type: "subagent.tool_result"; agent: AgentName; tool: string; summary: string }
  | { type: "subagent.done"; agent: AgentName; report: string }
  | { type: "verdict"; verdict: Verdict }
  | { type: "run.error"; message: string }
  | { type: "run.done"; status: RunResult["status"] };

export interface SequencedTraceEvent { sequence: number; event: TraceEvent }
export type TraceEmitter = (event: TraceEvent) => void;
