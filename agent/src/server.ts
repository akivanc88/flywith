import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runOrchestrator } from "./orchestrator.js";
import type { ModelClient } from "./model.js";
import type { JevClient } from "./jev.js";
import { loadSnapshot, type FareSnapshot } from "./fares.js";
import type { PlanRequest, RunResult, SequencedTraceEvent, TraceEvent } from "./trace.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 16 * 1024;

interface RunState { id: string; events: SequencedTraceEvent[]; listeners: Set<(event: SequencedTraceEvent) => void>; controller: AbortController; complete: boolean; result?: RunResult }
export interface ServerOptions { model?: ModelClient; jev?: JevClient; allowedOrigins?: string[]; timeoutMs?: number; heartbeatMs?: number; retentionMs?: number; fares?: FareSnapshot }

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers }); res.end(JSON.stringify(body)); }
function cors(req: IncomingMessage, allowed: string[]): Record<string, string> { const origin = req.headers.origin; return origin && allowed.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {}; }

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error("Request body is too large."), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw Object.assign(new Error("Malformed JSON body."), { status: 400 }); }
}

export function createAgentServer(options: ServerOptions = {}): http.Server {
  const runs = new Map<string, RunState>();
  const allowed = options.allowedOrigins ?? (process.env.ALLOWED_ORIGINS ?? "http://localhost:8787").split(",").map((x) => x.trim());
  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost"); const headers = cors(req, allowed);
    if (req.method === "OPTIONS") { const origin = req.headers.origin; if (!origin || !allowed.includes(origin)) return json(res, 403, { error: "Origin not allowed." }); res.writeHead(204, { ...headers, "Access-Control-Allow-Methods": "POST, GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }); return res.end(); }
    if (url.pathname === "/" && req.method === "GET") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(readFileSync(path.join(here, "..", "demo.html"), "utf8")); }
    if (url.pathname === "/api/plan") {
      if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { error: "Method not allowed." }, headers); }
      try {
        const body = await readJson(req) as PlanRequest;
        const id = crypto.randomUUID(); const state: RunState = { id, events: [], listeners: new Set(), controller: new AbortController(), complete: false }; runs.set(id, state);
        const emit = (event: TraceEvent) => { const item = { sequence: state.events.length + 1, event }; state.events.push(item); for (const listener of state.listeners) listener(item); };
        setImmediate(async () => { state.result = await runOrchestrator(body, emit, { model: options.model, jev: options.jev, fares: options.fares, signal: state.controller.signal, timeoutMs: options.timeoutMs, runId: id }); state.complete = true; setTimeout(() => runs.delete(id), options.retentionMs ?? 5 * 60_000).unref(); });
        return json(res, 202, { runId: id, eventsUrl: `/api/plan/${id}/events` }, headers);
      } catch (error) { const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 400; return json(res, status, { error: error instanceof Error ? error.message : "Invalid request." }, headers); }
    }
    const match = url.pathname.match(/^\/api\/plan\/([0-9a-f-]+)\/events$/i);
    if (match) {
      if (req.method !== "GET") { res.setHeader("Allow", "GET"); return json(res, 405, { error: "Method not allowed." }, headers); }
      const state = runs.get(match[1]); if (!state) return json(res, 404, { error: "Run not found." }, headers);
      res.writeHead(200, { ...headers, "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
      res.flushHeaders();
      let ended = false;
      let heartbeat: NodeJS.Timeout | undefined;
      const cleanup = () => { if (heartbeat) clearInterval(heartbeat); state.listeners.delete(send); };
      const send = (item: SequencedTraceEvent) => {
        if (ended || res.destroyed || res.writableEnded) return;
        res.write(`id: ${item.sequence}\ndata: ${JSON.stringify(item)}\n\n`);
        if (item.event.type === "run.done") { ended = true; cleanup(); res.end(); }
      };
      const after = Number(req.headers["last-event-id"] ?? 0); state.events.filter((x) => x.sequence > after).forEach(send);
      if (ended) return;
      if (state.complete) return res.end();
      state.listeners.add(send); heartbeat = setInterval(() => { if (!res.destroyed && !res.writableEnded) res.write(": heartbeat\n\n"); }, options.heartbeatMs ?? 15_000);
      req.on("close", () => { if (ended) return; ended = true; cleanup(); if (!state.complete && state.listeners.size === 0) state.controller.abort(new Error("Client disconnected.")); });
      return;
    }
    json(res, 404, { error: "Not found." }, headers);
  });
}

/** Start the server. Without API keys it runs fully offline: heuristic intake and the template drafter. */
export function startServer(env: NodeJS.ProcessEnv = process.env, log: (line: string) => void = console.log): http.Server {
  const port = Number(env.PORT ?? 8787);
  const fares = loadSnapshot(env);
  const server = createAgentServer({ fares });
  server.listen(port, () => {
    log(`FlyWith agent server: http://localhost:${port}`);
    log(`fares: ${fares.source} (observed ${fares.observedAt.slice(0, 10)})`);
    log(`intake: ${env.TYPESAFE_API_KEY ? "live classifier" : "offline classifier"} · drafting: ${env.ANTHROPIC_API_KEY ? "live model" : "offline template"}`);
  });
  return server;
}

/* c8 ignore next 3 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}
