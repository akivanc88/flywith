// Record a real orchestrator run of the launch-video request and write it as the
// landing-page replay (assets/data/agent-trace-replay.json). Offline by default:
// heuristic intake + template drafter. With TYPESAFE_API_KEY / ANTHROPIC_API_KEY set,
// `npm run record-replay -- --live` records Jev and Claude instead.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HeuristicJevClient, createJevClient } from "../src/jev.js";
import { TemplateModelClient, createModelClient } from "../src/model.js";
import { runOrchestrator } from "../src/orchestrator.js";
import type { TraceEvent } from "../src/trace.js";

export const REPLAY_PROMPT = "Toronto → Mumbai in November · 2 adults, 2 kids (4 & 7) + grandma · Canadian passports";

/** Replay pacing in ms before each event fires, tuned so the landing page reads like a live run. */
export function delayFor(event: TraceEvent): number {
  switch (event.type) {
    case "run.start": return 400;
    case "router.decision": return 600;
    case "orchestrator.text": return 800;
    case "subagent.start": return 500;
    case "subagent.tool": return 220;
    case "subagent.tool_result": return 300;
    case "subagent.done": return event.agent === "verifier" ? 1400 : 600;
    case "verdict": return 700;
    default: return 500;
  }
}

export async function recordReplay(live = false) {
  const events: TraceEvent[] = [];
  const model = live ? createModelClient() : new TemplateModelClient();
  const result = await runOrchestrator({ prompt: REPLAY_PROMPT }, (e) => events.push(e), { jev: live ? createJevClient() : new HeuristicJevClient(), model });
  if (result.status !== "completed") throw new Error(`Recording failed: ${result.error}`);
  return {
    note: `Recorded run of the FlyWith agent using the June 2026 fare snapshot. It is historical demonstration data, not current live availability. Field \`d\` is the replay delay in ms before the event fires. Regenerate with \`cd agent && npm run record-replay\`.`,
    prompt: REPLAY_PROMPT,
    events: events.map((event) => {
      const copy = structuredClone(event) as TraceEvent & { runId?: string };
      if (copy.type === "run.start") copy.runId = "recorded";
      return { d: delayFor(event), ...copy };
    }),
  };
}

/* c8 ignore start */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL("../../assets/data/agent-trace-replay.json", import.meta.url);
  const replay = await recordReplay(process.argv.includes("--live"));
  writeFileSync(out, `${JSON.stringify(replay, null, 2)}\n`);
  console.log(`Wrote ${replay.events.length} events to ${fileURLToPath(out)}`);
}
/* c8 ignore stop */
