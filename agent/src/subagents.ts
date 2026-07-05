import Anthropic from "@anthropic-ai/sdk";
import { searchFlights, getCityFacts, listStopoverCandidates } from "./data.js";
import type { EvidenceEntry, SubagentName, TraceEmitter } from "./trace.js";

const MODEL = "claude-opus-4-8";

// Each subagent is an isolated Messages-API loop with its own system prompt
// and its own tool subset. The orchestrator delegates a task string; the
// subagent works it with tools and returns a plain-text report. Context
// isolation is the point: the flight agent never sees visa editorial, the
// logistics agent never sees fares, and the verifier sees only the draft
// plus the evidence log.

interface SubagentDef {
  system: string;
  tools: Anthropic.Tool[];
  effort: "low" | "medium" | "high";
}

const flightSearchTools: Anthropic.Tool[] = [
  {
    name: "search_flights",
    description:
      "Search one-way flight offers between two IATA airport codes. Call it once per leg you need priced — direct baseline, leg 1 to a stopover city, and leg 2 onward. Returns offers with price in CAD, airline, duration, and stop count.",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string", description: "Origin IATA code, e.g. YYZ" },
        destination: { type: "string", description: "Destination IATA code, e.g. BOM" },
      },
      required: ["origin", "destination"],
      additionalProperties: false,
    },
    strict: true,
  },
  {
    name: "list_stopover_candidates",
    description:
      "List the stopover cities (IATA codes) this system has route and city coverage for. Call this first to know which stopover pairs are worth pricing.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
    strict: true,
  },
];

const valueTools: Anthropic.Tool[] = [
  {
    name: "estimate_hotel_cost",
    description:
      "Estimate total hotel cost in CAD for a stopover stay. Call it when computing the true all-in cost of a stopover option. Returns nightly rate and total; this is an ESTIMATE, not a bookable price.",
    input_schema: {
      type: "object",
      properties: {
        cityIata: { type: "string", description: "Stopover city IATA code" },
        nights: { type: "integer", description: "Number of hotel nights" },
        rooms: { type: "integer", description: "Rooms needed (families with kids usually 1, with grandparents 2)" },
      },
      required: ["cityIata", "nights", "rooms"],
      additionalProperties: false,
    },
    strict: true,
  },
];

const logisticsTools: Anthropic.Tool[] = [
  {
    name: "get_city_facts",
    description:
      "Get editorial city facts for a stopover candidate: visa friction by passport, airport comfort, family logistics, and senior accessibility notes. Call it for every city you assess.",
    input_schema: {
      type: "object",
      properties: {
        cityIata: { type: "string", description: "City IATA code, e.g. DXB" },
      },
      required: ["cityIata"],
      additionalProperties: false,
    },
    strict: true,
  },
];

export const SUBAGENTS: Record<SubagentName, SubagentDef> = {
  "flight-search": {
    effort: "low",
    system: `You are the flight-search subagent for FlyWith, a family stopover advisor.
Given a route and travel context, price the direct baseline and the best stopover pairs.
Use list_stopover_candidates first, then search_flights for the direct route and for each promising leg pair in parallel.
Report back: the direct baseline options, and for each stopover candidate the leg prices, combined total, airlines, and flight times.
Numbers only from tool results — never invent a fare. Keep the report compact and factual.`,
    tools: flightSearchTools,
  },
  "stopover-value": {
    effort: "low",
    system: `You are the stopover-value subagent for FlyWith.
Given flight prices and a family profile, compute the all-in cost of each stopover option: flights plus estimated hotel (use estimate_hotel_cost), and the delta vs the direct baseline.
Then score each option 0-100 on "worth it for this family": weigh bonus vacation days, fatigue reduction (splitting a 20h journey), and cost delta.
Report the math explicitly so it can be audited. Label hotel figures as estimates.`,
    tools: valueTools,
  },
  "family-logistics": {
    effort: "low",
    system: `You are the family-logistics subagent for FlyWith.
Given a family profile (kids? seniors? passports?) and stopover candidates, assess practical friction: visa requirements for the passports involved, airport comfort, stroller/wheelchair reality, first-night ease.
Use get_city_facts for every candidate. Flag any visa showstoppers loudly.
Report per-city: visa verdict for this family, comfort highlights, and one honest caution.`,
    tools: logisticsTools,
  },
  verifier: {
    effort: "medium",
    system: `You are the verifier subagent for FlyWith. You audit a draft recommendation against an evidence log of raw tool results.
For every factual claim in the draft (prices, visa rules, scores, hotel costs), check it appears in the evidence log.
Classify each claim: VERIFIED (matches a tool result exactly), ESTIMATED (derived from an estimate-status tool result), or UNSUPPORTED (no evidence — must be removed or reworded).
FlyWith's core promise is that editorial estimates are never presented as verified live data. Be strict.
Report: a pass/fail per claim and required corrections. If everything checks out, say APPROVED.`,
    tools: [],
  },
};

// Executes one tool call locally and tags the evidence entry.
function executeTool(
  agent: SubagentName,
  name: string,
  input: Record<string, unknown>,
): { result: unknown; dataStatus: EvidenceEntry["dataStatus"] } {
  switch (name) {
    case "search_flights": {
      const offers = searchFlights(String(input.origin), String(input.destination));
      return { result: offers, dataStatus: "verified" };
    }
    case "list_stopover_candidates":
      return { result: listStopoverCandidates(), dataStatus: "verified" };
    case "estimate_hotel_cost": {
      const facts = getCityFacts(String(input.cityIata));
      if (!facts) return { result: { error: `Unknown city ${input.cityIata}` }, dataStatus: "verified" };
      const nights = Number(input.nights);
      const rooms = Number(input.rooms);
      const total = facts.hotelNightlyCAD * nights * rooms;
      return {
        result: { city: facts.city, nightlyCAD: facts.hotelNightlyCAD, nights, rooms, totalCAD: total, note: "estimate, not a bookable rate" },
        dataStatus: "estimated",
      };
    }
    case "get_city_facts": {
      const facts = getCityFacts(String(input.cityIata));
      return { result: facts ?? { error: `Unknown city ${input.cityIata}` }, dataStatus: "editorial" };
    }
    default:
      return { result: { error: `Unknown tool ${name}` }, dataStatus: "verified" };
  }
}

export async function runSubagent(
  client: Anthropic,
  agent: SubagentName,
  task: string,
  evidence: EvidenceEntry[],
  emit: TraceEmitter,
): Promise<string> {
  const def = SUBAGENTS[agent];
  emit({ type: "subagent.start", agent, task });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];

  for (let turn = 0; turn < 8; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: def.system,
      thinking: { type: "adaptive" },
      output_config: { effort: def.effort },
      tools: def.tools.length > 0 ? def.tools : undefined,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      const report = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      emit({ type: "subagent.done", agent, report });
      return report;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
      emit({ type: "subagent.tool", agent, tool: tu.name, input: tu.input });
      const { result, dataStatus } = executeTool(agent, tu.name, tu.input as Record<string, unknown>);
      evidence.push({ agent, tool: tu.name, input: tu.input, result, dataStatus });
      const serialized = JSON.stringify(result);
      emit({
        type: "subagent.tool_result",
        agent,
        tool: tu.name,
        summary: serialized.length > 200 ? serialized.slice(0, 200) + "…" : serialized,
      });
      return { type: "tool_result", tool_use_id: tu.id, content: serialized };
    });

    messages.push({ role: "user", content: results });
  }

  const timeout = `Subagent ${agent} hit its turn limit before finishing.`;
  emit({ type: "subagent.done", agent, report: timeout });
  return timeout;
}
