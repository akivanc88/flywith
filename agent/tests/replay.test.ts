import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { delayFor, recordReplay } from "../scripts/record-replay.js";
import { GOLDEN_OPTIONS } from "./fixtures.js";

const committed = JSON.parse(readFileSync(new URL("../../assets/data/agent-trace-replay.json", import.meta.url), "utf8"));

test("the landing-page replay is a real recording of the current agent", async () => {
  const fresh = await recordReplay();
  assert.deepEqual(committed, fresh, "replay is stale — run `npm run record-replay` and commit the result");
});

test("the replay shows the launch video's verdict and trace lines", () => {
  const verdict = committed.events.find((e: { type: string }) => e.type === "verdict").verdict;
  assert.deepEqual(verdict.options.map(({ iata, stopoverCity, suggestedDays, flightTotalCAD, hotelEstimateCAD, deltaVsDirectCAD, worthItScore }: Record<string, unknown>) => ({ iata, stopoverCity, suggestedDays, flightTotalCAD, hotelEstimateCAD, deltaVsDirectCAD, worthItScore })), GOLDEN_OPTIONS);
  const text = JSON.stringify(committed.events);
  for (const line of ["visa-free 30d (CA), stroller lanes, reliable wheelchair service", "YYZ→DXB $641 Emirates nonstop 12.5h · DXB→BOM $466 nonstop 3h", "SIN pair prices out at $1,500 — dropped", "APPROVED."]) assert.ok(text.includes(line), line);
  assert.match(committed.note, /not current live availability/);
});

test("replay pacing covers every event type", () => {
  for (const type of ["run.start", "router.decision", "orchestrator.text", "subagent.start", "subagent.tool", "subagent.tool_result", "verdict", "run.done"]) assert.ok(delayFor({ type } as never) > 0);
  assert.equal(delayFor({ type: "subagent.done", agent: "verifier", report: "" }), 1400);
  assert.equal(delayFor({ type: "subagent.done", agent: "flight-search", report: "" }), 600);
});

test("live recording uses the configured engines", async () => {
  const replay = await recordReplay(true);
  assert.equal(replay.events.at(-1).type, "run.done");
});

test("nothing user-facing names the models or vendors behind the scenes", async () => {
  const text = JSON.stringify(committed).toLowerCase();
  for (const word of ["claude", "anthropic", "opus", "haiku", "sonnet", "typesafe", "jev", "heuristic", "template drafter"]) assert.ok(!text.includes(word), word);
});
