// Trace events streamed to clients over SSE. Every meaningful step of the
// orchestration emits one, so a UI can render the agent system working live.

export type TraceEvent =
  | { type: "run.start"; prompt: string }
  | { type: "orchestrator.thinking"; text: string }
  | { type: "orchestrator.text"; text: string }
  | { type: "subagent.start"; agent: SubagentName; task: string }
  | { type: "subagent.tool"; agent: SubagentName; tool: string; input: unknown }
  | { type: "subagent.tool_result"; agent: SubagentName; tool: string; summary: string }
  | { type: "subagent.done"; agent: SubagentName; report: string }
  | { type: "verdict"; verdict: unknown }
  | { type: "run.done" }
  | { type: "run.error"; message: string };

export type SubagentName =
  | "flight-search"
  | "stopover-value"
  | "family-logistics"
  | "verifier";

export type TraceEmitter = (event: TraceEvent) => void;

// Evidence collected from tool calls during a run. The verifier subagent
// audits the draft verdict against this log so nothing estimated gets
// presented as verified data.
export interface EvidenceEntry {
  agent: SubagentName;
  tool: string;
  input: unknown;
  result: unknown;
  dataStatus: "verified" | "estimated" | "editorial";
}
