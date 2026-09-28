// Fare data for the flight-search tools. The agent always reads a *snapshot*: either the
// bundled June 2026 recording (golden tests, offline default) or one produced by polling
// LetsFG on a schedule (scripts/poll-fares.ts). Polling keeps searches within the free
// tier's ~3 searches per 10 minutes; the agent never searches live per request.
import { readFileSync } from "node:fs";
import { BUNDLED_OFFERS, SNAPSHOT_DATE, SNAPSHOT_SOURCE, type FlightOffer } from "./data.js";

export interface FareSnapshot { source: string; observedAt: string; offers: Record<string, FlightOffer[]> }

export const bundledSnapshot = (): FareSnapshot => ({ source: SNAPSHOT_SOURCE, observedAt: SNAPSHOT_DATE, offers: BUNDLED_OFFERS });

export const routeKey = (origin: string, destination: string) => `${origin.toUpperCase()}-${destination.toUpperCase()}`;

export function faresFor(snapshot: FareSnapshot, origin: string, destination: string): FlightOffer[] {
  return snapshot.offers[routeKey(origin, destination)] ?? [];
}

function isOffer(o: unknown): o is FlightOffer {
  const x = o as FlightOffer;
  return !!x && typeof x.origin === "string" && typeof x.destination === "string" && typeof x.airline === "string"
    && [x.priceCAD, x.durationHours, x.stops].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) && x.priceCAD > 0 && x.durationHours > 0;
}

/** Parse and validate a snapshot file; malformed offers are dropped, a malformed file throws. */
export function parseSnapshot(json: string): FareSnapshot {
  const raw = JSON.parse(json) as Partial<FareSnapshot>;
  if (!raw || typeof raw.source !== "string" || typeof raw.observedAt !== "string" || Number.isNaN(Date.parse(raw.observedAt)) || !raw.offers || typeof raw.offers !== "object") {
    throw new Error("Fare snapshot must have source, observedAt (ISO date) and offers.");
  }
  const offers: Record<string, FlightOffer[]> = {};
  for (const [key, list] of Object.entries(raw.offers)) if (Array.isArray(list)) offers[key] = list.filter(isOffer);
  return { source: raw.source, observedAt: raw.observedAt, offers };
}

/** The snapshot the server should use: FLYWITH_FARE_SNAPSHOT when set, else the bundled one. */
export function loadSnapshot(env: NodeJS.ProcessEnv = process.env, read: (path: string) => string = (p) => readFileSync(p, "utf8")): FareSnapshot {
  return env.FLYWITH_FARE_SNAPSHOT ? parseSnapshot(read(env.FLYWITH_FARE_SNAPSHOT)) : bundledSnapshot();
}

// ---------------- LetsFG client ----------------

export class LetsFGError extends Error {
  constructor(message: string, readonly status?: number, readonly retryAfterSeconds?: number) { super(message); }
}

interface LetsFGOffer { price: number; currency: string; airline?: string; airline_code?: string; origin: string; destination: string; duration_minutes: number; stops: number }
export interface Party { adults: number; children: number; infants: number }

export interface LetsFGOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  pollMs?: number;
  maxPolls?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class LetsFGClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly auth: string;

  constructor(private readonly options: LetsFGOptions) {
    if (!options.apiKey.trim()) throw new LetsFGError("LETSFG_API_KEY is required to poll fares.");
    const token = options.apiKey.trim();
    this.auth = /^bearer /i.test(token) ? token : `Bearer ${token}`;
    this.baseUrl = (options.baseUrl ?? "https://letsfg.co").replace(/\/$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, { ...init, headers: { Authorization: this.auth, "Content-Type": "application/json" } });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new LetsFGError(typeof body.error === "string" ? body.error : `LetsFG returned HTTP ${response.status}.`, response.status, typeof body.retry_after_seconds === "number" ? body.retry_after_seconds : undefined);
    return body as T;
  }

  /** Cheapest offer for one route and date, in CAD per seat; null when the search finds nothing. */
  async cheapest(origin: string, destination: string, date: string, party: Party): Promise<FlightOffer | null> {
    const start = await this.request<{ search_id?: string; needs_clarification?: boolean; follow_up_questions?: string[] }>("/api/search", {
      method: "POST",
      body: JSON.stringify({ origin, destination, date_from: date, adults: Math.max(1, party.adults), children: party.children, infants: party.infants, currency: "CAD", limit: 20 }),
    });
    if (start.needs_clarification) throw new LetsFGError(start.follow_up_questions?.[0] ?? "LetsFG needs more search details.");
    if (!start.search_id) throw new LetsFGError("LetsFG did not return a search id.");
    for (let poll = 0; poll < (this.options.maxPolls ?? 18); poll++) {
      const result = await this.request<{ status: string; offers?: LetsFGOffer[] }>(`/api/results/${encodeURIComponent(start.search_id)}`);
      if (result.status === "completed") {
        const best = (result.offers ?? []).filter((o) => o.currency === "CAD" && o.price > 0 && o.duration_minutes > 0).sort((a, b) => a.price - b.price)[0];
        return best ? { origin: best.origin || origin, destination: best.destination || destination, priceCAD: Math.round(best.price), airline: best.airline ?? best.airline_code ?? "Unknown airline", durationHours: Math.round((best.duration_minutes / 60) * 10) / 10, stops: best.stops } : null;
      }
      if (["expired", "failed", "error", "cancelled"].includes(result.status)) throw new LetsFGError(`LetsFG search ${result.status}.`);
      await this.sleep(this.options.pollMs ?? 10_000);
    }
    throw new LetsFGError("LetsFG search timed out while polling for results.");
  }
}

// ---------------- Scheduled poller ----------------

export interface PollPlan { origin: string; destination: string; via: string[]; date: string; party: Party }
export interface PollOutcome { snapshot: FareSnapshot; searched: number; failures: { route: string; error: string }[] }

/** Direct route plus both legs through every stopover city; searches that cannot help are skipped. */
export function routesFor(plan: Pick<PollPlan, "origin" | "destination" | "via">): [string, string][] {
  const routes: [string, string][] = [[plan.origin, plan.destination]];
  for (const city of plan.via) if (city !== plan.origin && city !== plan.destination) routes.push([plan.origin, city], [city, plan.destination]);
  return routes;
}

/** Poll every route sequentially, spacing searches to respect the free tier; failures are recorded, not fatal. */
export async function pollFares(client: Pick<LetsFGClient, "cheapest">, plan: PollPlan, options: { spacingMs?: number; sleep?: (ms: number) => Promise<void>; now?: () => Date } = {}): Promise<PollOutcome> {
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const offers: Record<string, FlightOffer[]> = {};
  const failures: PollOutcome["failures"] = [];
  let searched = 0;
  for (const [from, to] of routesFor(plan)) {
    if (searched > 0) await sleep(options.spacingMs ?? 200_000);
    searched++;
    try {
      const offer = await client.cheapest(from, to, plan.date, plan.party);
      if (offer) offers[routeKey(from, to)] = [offer];
      else failures.push({ route: routeKey(from, to), error: "no offers" });
    } catch (error) {
      failures.push({ route: routeKey(from, to), error: error instanceof Error ? error.message : String(error) });
      if (error instanceof LetsFGError && error.status === 429) break;
    }
  }
  return { snapshot: { source: `LetsFG fare poll for ${plan.date}`, observedAt: (options.now?.() ?? new Date()).toISOString(), offers }, searched, failures };
}
