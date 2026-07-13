import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const replayUrl = new URL("../assets/data/agent-trace-replay.json", import.meta.url);
const replay = JSON.parse(await readFile(replayUrl, "utf8"));

assert.match(replay.note, /snapshot/i, "replay metadata must identify snapshot data");
assert.match(replay.note, /not current live/i, "replay metadata must disclaim live availability");
assert.ok(Array.isArray(replay.events) && replay.events.length > 0, "replay must contain events");
assert.equal(
  replay.events.some((event) => event.type === "orchestrator.thinking"),
  false,
  "replay must not expose model thinking",
);

const terminalEvents = replay.events.filter(
  (event) => event.type === "run.done" || event.type === "run.error",
);
assert.equal(terminalEvents.length, 1, "replay must contain exactly one terminal event");
assert.equal(terminalEvents[0].type, "run.done", "successful replay must end with run.done");
assert.equal(replay.events.at(-1), terminalEvents[0], "terminal event must be last");

const verdicts = replay.events.filter((event) => event.type === "verdict");
assert.equal(verdicts.length, 1, "replay must publish exactly one verdict");
const allowedStatuses = new Set(["live", "snapshot", "estimated", "editorial"]);
for (const option of verdicts[0].verdict?.options ?? []) {
  assert.ok(allowedStatuses.has(option.dataStatus), `invalid data status: ${option.dataStatus}`);
}

console.log(`Validated ${replay.events.length} replay events.`);
