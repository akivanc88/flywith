// TypeSafe Jev ("System One") client. Jev answers typed questions about a state with
// probabilities and never generates text: POST https://api.typesafe.ai/v1/systemone.
// HttpJevClient talks to the real API; HeuristicJevClient is the offline fallback used
// when TYPESAFE_API_KEY is unset, and is labelled as such in every trace.

import { KNOWN_AIRPORTS, PLACE_CODES } from "./data.js";

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string };

export interface JevRequest { model: string; state: unknown; questions: Record<string, JevQuestion> }

export interface JevAnswer {
  type: JevQuestion["type"];
  choice?: string;
  score?: number;
  noul?: number;
  probabilities?: Record<string, number>;
  confidence?: number;
}

export interface JevResponse { model: string; answers: Record<string, JevAnswer>; usage?: { input_tokens: number; output_tokens: number } }

export interface JevClient { readonly engine: "jev" | "heuristic"; systemOne(request: JevRequest, signal?: AbortSignal): Promise<JevResponse> }

export class JevError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface HttpJevOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const RETRYABLE = new Set([429, 529]);

export class HttpJevClient implements JevClient {
  readonly engine = "jev" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly timeoutMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly random: () => number;

  constructor(private readonly options: HttpJevOptions) {
    if (!options.apiKey) throw new JevError("TYPESAFE_API_KEY is required for the Jev client.");
    this.baseUrl = (options.baseUrl ?? "https://api.typesafe.ai").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxRetries = options.maxRetries ?? 3;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.random = options.random ?? Math.random;
  }

  async systemOne(request: JevRequest, signal?: AbortSignal): Promise<JevResponse> {
    for (let attempt = 0; ; attempt++) {
      const timeout = AbortSignal.timeout(this.timeoutMs);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const response = await this.fetchImpl(`${this.baseUrl}/v1/systemone`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: combined,
      });
      if (response.ok) return parseResponse(await response.json());
      if (RETRYABLE.has(response.status) && attempt < this.maxRetries) {
        // Exponential backoff with full jitter, as TypeSafe recommends for 429/529.
        await this.sleep(Math.round(this.random() * 250 * 2 ** attempt));
        continue;
      }
      throw new JevError(`Jev request failed with HTTP ${response.status}.`, response.status);
    }
  }
}

function parseResponse(body: unknown): JevResponse {
  if (!body || typeof body !== "object" || typeof (body as JevResponse).model !== "string" || !(body as JevResponse).answers || typeof (body as JevResponse).answers !== "object") {
    throw new JevError("Jev returned an unexpected response shape.");
  }
  return body as JevResponse;
}

// ---------------- Offline heuristic fallback ----------------

/** A mention negated nearby ("no kids", "without the kids") does not count as present. */
const NEGATED: Record<string, RegExp> = { has_children: /\b(no|without( the)?) (kids|children|child)\b/i };

const KEYWORDS: Record<string, RegExp> = {
  has_children: /\b(kids?|child(ren)?|son|daughter|toddlers?|little ones|year old|ages? \d|\(\d+\s*(&|and)\s*\d+\))/i,
  has_infant: /\b(infants?|baby|babies|newborn|lap child)\b/i,
  has_senior: /\b(grand(ma|pa|mother|father|parents?)|nani|nana|dadi|seniors?|elderly|parents? in their (70|80)s|aged? (6[5-9]|[789]\d))\b/i,
  needs_wheelchair: /\b(wheel ?chairs?|mobility|walker|can'?t walk (far|long)|limited walking|cane)\b/i,
  injection: /\b(ignore (all |any )?(previous|prior|above|your) (instructions|rules|guidance)|ignore all prior|disregard (the|your|all)|system prompt|you are now|developer mode|jailbreak|reveal (your|the) (prompt|instructions)|override (the|your) (rules|instructions))\b/i,
};

const INTENT: Record<string, RegExp> = {
  booking: /\b(book|buy|purchase|reserve|pay for|charge my)\b.*\b(tickets?|flights?|seats?)\b|\b(cancel|refund|change) my (booking|ticket|flight)\b/i,
  plan_stopover: /\b(stopover|layover|fly(ing)?|flights?|trip|travel(l?ing)?|route|holiday|vacation)\b|→|->|\bto\s+[A-Z][A-Za-z]+/,
};

const PRIORITY: Record<string, RegExp> = {
  budget: /\b(cheap(est)?|budget|save money|lowest (fare|price)|tight on money)\b/i,
  explore: /\b(explore|adventure|off the beaten|hidden gems?|culture|sightseeing)\b/i,
  comfort: /\b(comfort(able)?|easy|less tiring|rest(ful)?|jet ?lag|exhausting|brutal)\b/i,
};

function countPlaces(text: string): number {
  const lower = text.toLowerCase();
  return Object.keys(PLACE_CODES).filter((name) => new RegExp(`\\b${name}\\b`).test(lower)).length + (text.match(/\b[A-Z]{3}\b/g) ?? []).filter((c) => KNOWN_AIRPORTS.has(c)).length;
}

function stateText(state: unknown): string {
  if (typeof state === "string") return state;
  if (state && typeof state === "object" && typeof (state as { request?: unknown }).request === "string") return (state as { request: string }).request;
  return JSON.stringify(state ?? "");
}

function pickChoice(keys: string[], scores: Record<string, number>): JevAnswer {
  const raw = keys.map((k) => Math.max(0.02, scores[k] ?? 0.02));
  const total = raw.reduce((a, b) => a + b, 0);
  const probabilities = Object.fromEntries(keys.map((k, i) => [k, +(raw[i] / total).toFixed(3)]));
  const choice = keys.reduce((best, k) => (probabilities[k] > probabilities[best] ? k : best), keys[0]);
  return { type: "choice", choice, probabilities, confidence: probabilities[choice] };
}

/** Deterministic keyword classifier with the same typed contract as Jev. Used offline and in tests. */
export class HeuristicJevClient implements JevClient {
  readonly engine = "heuristic" as const;

  async systemOne(request: JevRequest): Promise<JevResponse> {
    const text = stateText(request.state);
    const answers: Record<string, JevAnswer> = {};
    for (const [id, question] of Object.entries(request.questions)) {
      if (question.type === "noul") {
        const re = KEYWORDS[id];
        answers[id] = { type: "noul", noul: re && re.test(text) && !NEGATED[id]?.test(text) ? 0.93 : 0.04 };
      } else if (question.type === "choice") {
        const keys = Object.keys(question.criteria);
        const table = id === "intent" ? INTENT : id === "priority" ? PRIORITY : {};
        const scores: Record<string, number> = {};
        for (const key of keys) if (table[key]?.test(text)) scores[key] = 0.9;
        if (id === "intent" && scores.booking) scores.plan_stopover = 0.3;
        if (id === "intent" && !scores.plan_stopover && countPlaces(text) >= 2) scores.plan_stopover = 0.85;
        if (id === "intent" && !scores.booking && !scores.plan_stopover) scores.off_topic = 0.9;
        if (id === "priority" && !Object.keys(scores).length) scores.balanced = 0.9;
        answers[id] = pickChoice(keys, scores);
      } else {
        answers[id] = { type: "score", score: 0, probabilities: { "0": 1 }, confidence: 0.5 };
      }
    }
    return { model: "heuristic-v1", answers };
  }
}

export function createJevClient(env: NodeJS.ProcessEnv = process.env): JevClient {
  return env.TYPESAFE_API_KEY ? new HttpJevClient({ apiKey: env.TYPESAFE_API_KEY, baseUrl: env.TYPESAFE_API_BASE }) : new HeuristicJevClient();
}
