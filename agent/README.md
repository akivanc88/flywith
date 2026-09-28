# FlyWith Agent

The engine behind the "Watch the agents decide" section and the launch video. A code-owned, bounded workflow:

```
intake router (classify · guardrail · pick drafting tier)
  → flight-search → family-logistics (only when kids, infants, seniors or mobility needs)
  → stopover-value (worth-it rubric v2)
  → draft → verifier (every number recomputed + prose audit) → ≤1 correction → publish
```

- **Intake router** (`src/intake.ts`, `src/jev.ts`) runs before any agent. A typed classifier answers intent, prompt-injection, who is travelling and priorities; counts, places, months and passports are parsed deterministically. It rejects injection, booking and off-topic requests, decides which subagents run, and picks the fast or strong drafting tier. Without a classifier key it uses an offline keyword fallback with the same typed contract.
- **Subagents** (`src/subagents.ts`) are code: they call deterministic tools, record evidence with provenance, and narrate trace events. No model selects tools or numbers.
- **Worth-it rubric v2** (`src/rubric.ts`, mirrored in the iOS app): fare 15 · fatigue 25 · visa 5 · hotels 10 · party fit 20 · stay 25. Calibrated so the launch video's scenarios reproduce exactly.
- **Verifier** recomputes every published number from evidence and rejects any figure in the prose the evidence doesn't contain; the model then audits the prose claims. Nothing publishes before both pass.
- **Drafting** (`src/model.ts`) only writes the summary and each option's highlight and caution, as schema-enforced JSON. Refusals and truncation fail closed. Without a model key a deterministic template drafter is used.

## Run

```bash
cd agent
npm ci
npm run dev          # fully offline: offline classifier + template drafter
```

Optional keys switch on the live services: `TYPESAFE_API_KEY` (intake classifier), `ANTHROPIC_API_KEY` (drafting and prose audit). `ALLOWED_ORIGINS` is a comma-separated CORS allowlist (default `http://localhost:8787`). Model choices are overridable with `FLYWITH_STRONG_MODEL`, `FLYWITH_FAST_MODEL`, `FLYWITH_REFUSAL_FALLBACK` (`off` disables) and `TYPESAFE_MODEL`.

## Fare data

The flight-search tools read a **fare snapshot**, never a per-request live search. By default that's the bundled June 2026 recording (it drives the golden tests and the landing replay). To use fresher fares, poll LetsFG on a schedule and point the server at the result:

```bash
LETSFG_API_KEY=... npm run poll-fares -- --date 2026-11-10   # ~30 min: 9 searches spaced 200s apart
FLYWITH_FARE_SNAPSHOT=data/fares-latest.json npm run dev
```

The poller covers the direct route and both legs through every stopover city, stops at the first rate limit, and records failed routes instead of failing the run. Evidence and the verifier note cite the snapshot's source and observation time. `.github/workflows/poll-fares.yml` runs the poll daily (repo secret `LETSFG_API_KEY`) and uploads the snapshot as an artifact.

## HTTP and SSE API

`POST /api/plan` with `{"prompt": "...", "adults"?, "children"?, "infants"?, "seniors"?, "stopoverDays"?, "passport"?, "month"?}` returns `202 {"runId", "eventsUrl"}`. `GET eventsUrl` streams `{ "sequence", "event" }` items (SSE IDs support `Last-Event-ID` reconnects), heartbeats, and exactly one terminal `run.done`. Disconnecting the last listener cancels the run. Events: `run.start`, `router.decision`, `orchestrator.text`, `subagent.start|tool|tool_result|done`, `verdict`, `run.error`, `run.done`. Trace events never include private reasoning or internal model identifiers.

## Data truthfulness

`live` (observed during the run), `snapshot` (recorded June 2026 fares — never called live), `estimated` (hotel totals, scores), `editorial` (visa, accessibility and fit research). Every evidence item carries its source and observation date; options are `estimated` because hotel estimates are load-bearing.

## Checks

```bash
npm run typecheck
npm test               # unit tests; fails below 100% lines/functions or 95% branches
npm run eval           # offline evals → evals/results/{router,scenarios}/baseline/
npm run record-replay  # re-record assets/data/agent-trace-replay.json (a test fails if it drifts)
npm run build
npm audit --omit=dev --audit-level=high
```

`npm run eval:live` runs the same evals against the live classifier and drafter. It makes paid calls, so run it only with the owner's approval. End-to-end browser journeys live in `../e2e` (`npm test` there; `PW_CHANNEL=chrome` to use an installed Chrome).

### Evals

- **Router** (`evals/router-cases.json`, 36 labelled prompts): action, seniors, children, family-logistics and tier, reported as precision / recall / specificity per signal. Covers both directions, including negations ("no kids this time"), benign look-alikes ("ignore the cheapest option") and injection attempts.
- **Scenarios** (`evals/scenario-cases.json`, 12 end-to-end runs): the launch-video golden verdict, adults-only, budget, visa-blocked passports, seniors, guardrails, unsupported routes, clarification, fixed stay length and season. Every run also checks that the verdict is published only after the verifier finishes.

Offline baseline: router 35/36 (the one miss, "grandma is staying home", needs the live classifier), scenarios 12/12.
