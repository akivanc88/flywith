export type DataStatus = "live" | "snapshot" | "estimated" | "editorial";

export interface PlanRequest {
  prompt: string;
  origin?: string;
  destination?: string;
  adults?: number;
  children?: number;
  infants?: number;
  rooms?: number;
  stopoverNights?: number;
}

export interface EvidenceEntry {
  id: string;
  agent: "flight-search" | "family-logistics" | "calculator";
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
  allInCAD: number;
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
  dataStatus: DataStatus;
}

export interface RunResult {
  runId: string;
  verdict?: Verdict;
  evidence: EvidenceEntry[];
  modelCalls: number;
  status: "completed" | "failed" | "cancelled";
  error?: string;
}

export type TraceEvent =
  | { type: "run.start"; runId: string; message: string }
  | { type: "stage.start"; stage: string; message: string }
  | { type: "stage.done"; stage: string; message: string }
  | { type: "verdict"; verdict: Verdict }
  | { type: "run.error"; message: string }
  | { type: "run.done"; status: RunResult["status"] };

export interface SequencedTraceEvent { sequence: number; event: TraceEvent }
export type TraceEmitter = (event: TraceEvent) => void;
