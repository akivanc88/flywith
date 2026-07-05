import Anthropic from "@anthropic-ai/sdk";
import { runSubagent, SUBAGENTS } from "./subagents.js";
import type { EvidenceEntry, SubagentName, TraceEmitter } from "./trace.js";

const MODEL = "claude-opus-4-8";

// The orchestrator owns the plan. It decomposes the family's request,
// delegates to subagents (fanning out in parallel when Claude issues
// parallel delegate calls), and may not publish a verdict until the
// verifier subagent has audited the draft against the evidence log.

const ORCHESTRATOR_SYSTEM = `You are the FlyWith trip orchestrator — the decision layer that answers one question for diaspora families: "Is this stopover worth it for your family?"

You coordinate four subagents via the delegate tool:
- flight-search: prices the direct baseline and stopover leg pairs (live/route data)
- stopover-value: computes all-in cost incl. hotel estimates and a worth-it score
- family-logistics: visa friction, airport comfort, kid/senior practicality per city
- verifier: audits your draft verdict against the raw evidence log

Process:
1. Parse the family's request (route, who is traveling, passports if stated, priorities).
2. Delegate flight-search and family-logistics in parallel — they are independent.
3. Delegate stopover-value with the flight numbers from step 2.
4. Draft your verdict, then delegate it to the verifier. Include every number you used.
5. If the verifier flags UNSUPPORTED claims, fix them (re-delegate if needed) and re-verify.
6. Only after verifier approval, call publish_verdict exactly once with the final structured result.

Rules:
- Every price, visa rule, and score must originate from a subagent report — never from your own knowledge.
- Keep dataStatus honest per option: "verified" only if flights are verified AND no estimated figure is load-bearing; otherwise "estimated".
- Recommend at most 3 stopover options, best first. If no stopover beats the direct flight for this family, say so — handing off honestly is the product.`;

const delegateTool: Anthropic.Tool = {
  name: "delegate",
  description:
    "Delegate a task to a specialist subagent and receive its report. Issue multiple delegate calls in one turn to run independent subagents in parallel. Give each subagent full context in the task string — subagents do not see this conversation.",
  input_schema: {
    type: "object",
    properties: {
      agent: {
        type: "string",
        enum: Object.keys(SUBAGENTS),
        description: "Which subagent to run",
      },
      task: {
        type: "string",
        description: "Complete, self-contained task briefing for the subagent",
      },
    },
    required: ["agent", "task"],
    additionalProperties: false,
  },
  strict: true,
};

const publishVerdictTool: Anthropic.Tool = {
  name: "publish_verdict",
  description:
    "Publish the final structured verdict to the user interface. Call exactly once, only after the verifier subagent has approved the draft.",
  input_schema: {
    type: "object",
    properties: {
      route: { type: "string", description: "e.g. YYZ → BOM" },
      summary: { type: "string", description: "2-3 sentence plain-language verdict for the family" },
      directBaselineCAD: { type: "number" },
      options: {
        type: "array",
        items: {
          type: "object",
          properties: {
            stopoverCity: { type: "string" },
            iata: { type: "string" },
            suggestedDays: { type: "integer" },
            flightTotalCAD: { type: "number" },
            hotelEstimateCAD: { type: "number" },
            allInCAD: { type: "number" },
            deltaVsDirectCAD: { type: "number" },
            worthItScore: { type: "integer" },
            visaVerdict: { type: "string" },
            highlight: { type: "string" },
            caution: { type: "string" },
            dataStatus: { type: "string", enum: ["verified", "estimated"] },
          },
          required: [
            "stopoverCity", "iata", "suggestedDays", "flightTotalCAD", "hotelEstimateCAD",
            "allInCAD", "deltaVsDirectCAD", "worthItScore", "visaVerdict",
            "highlight", "caution", "dataStatus",
          ],
          additionalProperties: false,
        },
      },
      verifierNote: { type: "string", description: "One line on what the verifier confirmed or downgraded" },
    },
    required: ["route", "summary", "directBaselineCAD", "options", "verifierNote"],
    additionalProperties: false,
  },
  strict: true,
};

export async function runOrchestrator(prompt: string, emit: TraceEmitter): Promise<void> {
  const client = new Anthropic();
  const evidence: EvidenceEntry[] = [];
  let verdictPublished = false;

  emit({ type: "run.start", prompt });

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];

  for (let turn = 0; turn < 16; turn++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: ORCHESTRATOR_SYSTEM,
      thinking: { type: "adaptive", display: "summarized" },
      output_config: { effort: "high" },
      tools: [delegateTool, publishVerdictTool],
      messages,
    });

    for (const block of response.content) {
      if (block.type === "thinking" && block.thinking) {
        emit({ type: "orchestrator.thinking", text: block.thinking });
      } else if (block.type === "text" && block.text.trim()) {
        emit({ type: "orchestrator.text", text: block.text });
      }
    }

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") break;

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    // Parallel delegate calls fan out concurrently; all results return in a
    // single user message so the model keeps issuing parallel calls.
    const results = await Promise.all(
      toolUses.map(async (tu): Promise<Anthropic.ToolResultBlockParam> => {
        if (tu.name === "delegate") {
          const { agent, task } = tu.input as { agent: SubagentName; task: string };
          if (agent === "verifier") {
            // The verifier gets the raw evidence log alongside the draft.
            const evidenceLog = evidence
              .map((e) => `[${e.dataStatus}] ${e.agent}/${e.tool}(${JSON.stringify(e.input)}) → ${JSON.stringify(e.result)}`)
              .join("\n");
            const report = await runSubagent(
              client, agent,
              `DRAFT TO AUDIT:\n${task}\n\nEVIDENCE LOG:\n${evidenceLog}`,
              evidence, emit,
            );
            return { type: "tool_result", tool_use_id: tu.id, content: report };
          }
          const report = await runSubagent(client, agent, task, evidence, emit);
          return { type: "tool_result", tool_use_id: tu.id, content: report };
        }
        if (tu.name === "publish_verdict") {
          verdictPublished = true;
          emit({ type: "verdict", verdict: tu.input });
          return { type: "tool_result", tool_use_id: tu.id, content: "Verdict published to the user." };
        }
        return {
          type: "tool_result",
          tool_use_id: tu.id,
          content: `Unknown tool ${tu.name}`,
          is_error: true,
        };
      }),
    );

    messages.push({ role: "user", content: results });

    if (verdictPublished) {
      // One more turn lets the model close out naturally, but we can stop here.
      break;
    }
  }

  if (!verdictPublished) {
    emit({ type: "run.error", message: "Run ended without a published verdict." });
  }
  emit({ type: "run.done" });
}
