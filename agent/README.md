# FlyWith Agent

FlyWith's agent backend uses a code-owned, bounded workflow:

`parse → flight + logistics research → deterministic calculation → draft → verify → optional one correction → publish`

The model cannot select tools or publish. Code validates inputs, collects and orders evidence, calculates every price and score, and publishes only when a verifier approves the exact current draft. A run normally uses two model calls and is capped at six by default (eight is the absolute supported ceiling). Runs also have cancellation and wall-clock limits.

## Run

```bash
cd agent
npm ci
export ANTHROPIC_API_KEY=sk-ant-...
export ALLOWED_ORIGINS=http://localhost:8787,https://your-app.example
npm run dev
```

`ANTHROPIC_API_KEY` is required by the production model adapter. `ALLOWED_ORIGINS` is a comma-separated exact allowlist and defaults only to `http://localhost:8787`.

## HTTP and SSE API

Create a run with a size-limited JSON request:

```http
POST /api/plan
Content-Type: application/json

{"prompt":"YYZ to BOM, two adults and two kids","adults":2,"children":2}
```

The response is `202 Accepted`:

```json
{"runId":"opaque-uuid","eventsUrl":"/api/plan/opaque-uuid/events"}
```

Connect an `EventSource` (or other SSE client) to `GET eventsUrl`. Each event is `{ "sequence": number, "event": TraceEvent }`; SSE IDs support reconnect via `Last-Event-ID`. The stream sends heartbeats and exactly one terminal `run.done`. Disconnecting the final listener cancels unfinished work.

## Data truthfulness

- `live`: observed from a live source during the run.
- `snapshot`: recorded source data; current bundled fares are a June 2026 snapshot and are never described as live.
- `estimated`: deterministic derived values such as hotel totals and worth-it scores.
- `editorial`: researched qualitative guidance such as visa and accessibility notes.

Each evidence item includes its source and observation date. The verdict status is derived from all load-bearing evidence. The deterministic score rubric is: 50 base + 20 for splitting the journey + 5 per stopover night (up to four), minus 50 points per 100% cost premium, clamped to 0–100.

## Checks

```bash
npm run typecheck
npm test
npm run build
npm audit --audit-level=high
```

Provider prompt caching and further model-cost tuning remain follow-up work after SDK/model compatibility is verified.
