// Code-owned subagents. Each one calls deterministic tools, records evidence with
// provenance, and narrates its work as trace events. No model selects tools or numbers.
import { getCityFacts, listStopoverCandidates, SNAPSHOT_DATE, type CityFacts, type FlightOffer } from "./data.js";
import { bundledSnapshot, faresFor, type FareSnapshot } from "./fares.js";
import { fitProfiles, nightsFor, RUBRIC_VERSION, scoreOption, type FitProfile, type Party } from "./rubric.js";
import { ValidationError } from "./intake.js";
import type { AgentName, EvidenceEntry, ParsedRequest, TraceEmitter, Verdict, VerdictOption } from "./trace.js";

/** Stopover pairs costing more than this share above the direct fare are dropped before scoring. */
export const MAX_PREMIUM = 0.5;

/** Per-run state. `fares` defaults to the bundled June 2026 snapshot. */
export interface Context { request: ParsedRequest; emit: TraceEmitter; evidence: EvidenceEntry[]; fares?: FareSnapshot }
export interface Pair { iata: string; first: FlightOffer; second: FlightOffer; perSeat: number }
export interface FlightReport { direct: FlightOffer[]; baseline: FlightOffer; pairs: Pair[]; dropped: Pair[] }

const money = (n: number) => `$${Math.round(n).toLocaleString("en-CA")}`;
const hours = (n: number) => `${n}h`;
const stops = (n: number) => (n === 0 ? "nonstop" : `${n} stop${n > 1 ? "s" : ""}`);
export const partyOf = (r: ParsedRequest): Party => ({ adults: r.adults, children: r.children, infants: r.infants, seniors: r.seniors });
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function tool(ctx: Context, agent: AgentName, name: string, input: Record<string, unknown>): void { ctx.emit({ type: "subagent.tool", agent, tool: name, input }); }
function result(ctx: Context, agent: AgentName, name: string, summary: string): void { ctx.emit({ type: "subagent.tool_result", agent, tool: name, summary }); }

export function describePair(p: Pair): string {
  return `${p.first.origin}→${p.iata} ${money(p.first.priceCAD)} ${p.first.airline} ${stops(p.first.stops)} ${hours(p.first.durationHours)} · ${p.iata}→${p.second.destination} ${money(p.second.priceCAD)} ${stops(p.second.stops)} ${hours(p.second.durationHours)}`;
}

export function flightSearch(ctx: Context): FlightReport {
  const { origin, destination } = ctx.request;
  ctx.emit({ type: "subagent.start", agent: "flight-search", task: `Price ${origin}→${destination} direct baseline and stopover leg pairs via candidate cities${ctx.request.month ? ` for ${MONTH_NAMES[ctx.request.month - 1]}` : ""}.` });
  tool(ctx, "flight-search", "list_stopover_candidates", {});
  const candidates = listStopoverCandidates().filter((c) => c !== origin && c !== destination);
  result(ctx, "flight-search", "list_stopover_candidates", JSON.stringify(candidates));
  tool(ctx, "flight-search", "search_flights", { origin, destination });
  const fares = ctx.fares ?? bundledSnapshot();
  const direct = faresFor(fares, origin, destination);
  if (!direct.length) throw new ValidationError(`No fare snapshot covers ${origin}→${destination} yet. Try Toronto (YYZ) to Mumbai (BOM).`);
  result(ctx, "flight-search", "search_flights", direct.map((o) => `${money(o.priceCAD)} ${o.airline} (${stops(o.stops)}, ${hours(o.durationHours)})`).join(" · "));
  const baseline = direct.reduce((a, b) => (b.priceCAD < a.priceCAD ? b : a));
  ctx.evidence.push({ id: `flight:direct:${origin}-${destination}`, agent: "flight-search", tool: "search_flights", input: { origin, destination }, result: direct, dataStatus: "snapshot", source: fares.source, observedAt: fares.observedAt });
  const pairs: Pair[] = [];
  const dropped: Pair[] = [];
  for (const iata of candidates) {
    tool(ctx, "flight-search", "search_flights", { origin, destination: iata });
    tool(ctx, "flight-search", "search_flights", { origin: iata, destination });
    const first = faresFor(fares, origin, iata)[0];
    const second = faresFor(fares, iata, destination)[0];
    if (!first || !second) { result(ctx, "flight-search", "search_flights", `${iata}: no complete leg pair in the snapshot`); continue; }
    const pair = { iata, first, second, perSeat: first.priceCAD + second.priceCAD };
    result(ctx, "flight-search", "search_flights", describePair(pair));
    ctx.evidence.push({ id: `flight:stopover:${iata}`, agent: "flight-search", tool: "search_flights", input: { origin, via: iata, destination }, result: { first, second }, dataStatus: "snapshot", source: fares.source, observedAt: fares.observedAt });
    ((pair.perSeat - baseline.priceCAD) / baseline.priceCAD > MAX_PREMIUM ? dropped : pairs).push(pair);
  }
  const listed = pairs.map((p) => `${p.iata} ${money(p.perSeat)} (${p.first.priceCAD}+${p.second.priceCAD})`).join(" · ");
  const droppedText = dropped.map((p) => ` ${p.iata} pair prices out at ${money(p.perSeat)} — dropped.`).join("");
  ctx.emit({ type: "subagent.done", agent: "flight-search", report: `Direct baseline: ${money(baseline.priceCAD)} (${stops(baseline.stops)}, ${hours(baseline.durationHours)} door-to-door). Stopover pairs per seat: ${listed || "none"}.${droppedText}` });
  return { direct, baseline, pairs, dropped };
}

export function visaFor(city: CityFacts, passport: ParsedRequest["passport"]) {
  return city.visa[passport] ?? { feeCAD: null, label: "check visa rules" };
}

function relevantNotes(city: CityFacts, r: ParsedRequest): string[] {
  const kids = r.children + r.infants > 0;
  const seniors = r.seniors > 0 || r.mobilityAssistance;
  return city.notes.filter((n) => n.for === "all" || (n.for === "kids" && kids) || (n.for === "seniors" && seniors)).map((n) => n.text);
}

export function familyLogistics(ctx: Context, iatas: string[]): Map<string, CityFacts> {
  const r = ctx.request;
  const who = [r.children + r.infants > 0 ? `${r.children + r.infants === 1 ? "a child" : `${r.children + r.infants} young kids`}` : "", r.seniors > 0 ? (r.seniors === 1 ? "a senior" : `${r.seniors} seniors`) : "", r.mobilityAssistance ? "wheelchair assistance" : ""].filter(Boolean).join(" and ");
  ctx.emit({ type: "subagent.start", agent: "family-logistics", task: `Assess stopover candidates for ${r.passport === "OTHER" ? "the travellers'" : r.passport} passports${who ? `, ${who}` : ""}: visa friction, airport comfort, stroller/wheelchair reality.` });
  const facts = new Map<string, CityFacts>();
  const lines: string[] = [];
  for (const iata of iatas) {
    tool(ctx, "family-logistics", "get_city_facts", { cityIata: iata });
    const city = getCityFacts(iata);
    if (!city) continue;
    facts.set(iata, city);
    const visa = visaFor(city, r.passport);
    const notes = relevantNotes(city, r);
    result(ctx, "family-logistics", "get_city_facts", `${iata}: ${visa.label} (${r.passport})${notes.length ? `, ${notes.join(", ")}` : ""}`);
    ctx.evidence.push({ id: `logistics:${iata}`, agent: "family-logistics", tool: "get_city_facts", input: { cityIata: iata }, result: city, dataStatus: "editorial", source: "FlyWith market research", observedAt: SNAPSHOT_DATE });
    const season = r.month ? (city.goodMonths.includes(r.month) ? `${MONTH_NAMES[r.month - 1]} weather is good` : `${MONTH_NAMES[r.month - 1]} is off-season`) : "";
    lines.push(`${iata}: ${[visa.label, ...notes, season].filter(Boolean).join(", ")}.`);
  }
  const blockers = [...facts.values()].filter((c) => visaFor(c, r.passport).feeCAD === null).map((c) => c.iata);
  ctx.emit({ type: "subagent.done", agent: "family-logistics", report: `${lines.join(" ")} ${blockers.length ? `Visa needed in advance for ${blockers.join(", ")}.` : "No showstoppers."}` });
  return facts;
}

export function suggestedDays(city: CityFacts, r: ParsedRequest): number {
  const cap = r.children + r.infants > 0 ? city.maxDaysWithKids : city.maxDays;
  return Math.min(r.stopoverDays ?? cap, cap);
}

export function profilesFor(r: ParsedRequest): FitProfile[] {
  const extra: FitProfile[] = r.priority === "budget" ? ["budget"] : r.priority === "explore" ? ["explorer"] : [];
  if (r.mobilityAssistance && r.seniors === 0) extra.push("seniors");
  return fitProfiles(partyOf(r), extra);
}

export function stopoverValue(ctx: Context, flights: FlightReport, facts: Map<string, CityFacts>): VerdictOption[] {
  const r = ctx.request;
  const party = partyOf(r);
  ctx.emit({ type: "subagent.start", agent: "stopover-value", task: `Compute all-in costs and worth-it scores. Direct ${money(flights.baseline.priceCAD)}/seat (${hours(flights.baseline.durationHours)}, ${stops(flights.baseline.stops)}). Pairs per seat: ${flights.pairs.map((p) => `${p.iata} ${money(p.perSeat)}`).join(" · ")}. Party needs ${r.rooms} hotel room${r.rooms > 1 ? "s" : ""}.` });
  const options: VerdictOption[] = [];
  const lines: string[] = [];
  for (const pair of flights.pairs) {
    let city = facts.get(pair.iata);
    if (!city) {
      tool(ctx, "stopover-value", "get_city_facts", { cityIata: pair.iata });
      city = getCityFacts(pair.iata);
      if (!city) continue;
      result(ctx, "stopover-value", "get_city_facts", `${pair.iata}: ${visaFor(city, r.passport).label} (${r.passport})`);
      ctx.evidence.push({ id: `logistics:${pair.iata}`, agent: "stopover-value", tool: "get_city_facts", input: { cityIata: pair.iata }, result: city, dataStatus: "editorial", source: "FlyWith market research", observedAt: SNAPSHOT_DATE });
    }
    const days = suggestedDays(city, r);
    const nights = nightsFor(days);
    tool(ctx, "stopover-value", "estimate_hotel_cost", { cityIata: pair.iata, nights, rooms: r.rooms });
    const hotel = city.hotelNightlyCAD * nights * r.rooms;
    result(ctx, "stopover-value", "estimate_hotel_cost", `${money(city.hotelNightlyCAD)}/night × ${nights} × ${r.rooms} room${r.rooms > 1 ? "s" : ""} = ${money(hotel)} (estimate)`);
    const visa = visaFor(city, r.passport);
    const scored = scoreOption({
      directFarePerSeat: flights.baseline.priceCAD, stopoverFarePerSeat: pair.perSeat, directHours: flights.baseline.durationHours,
      legs: [{ hours: pair.first.durationHours, stops: pair.first.stops }, { hours: pair.second.durationHours, stops: pair.second.stops }],
      days, hotelNightly: city.hotelNightlyCAD, rooms: r.rooms, party, visaFeePerPerson: visa.feeCAD, ratings: city.ratings, profiles: profilesFor(r),
    });
    ctx.evidence.push({ id: `calculation:${pair.iata}`, agent: "stopover-value", tool: "estimate_hotel_cost", input: { cityIata: pair.iata, nights, rooms: r.rooms, nightlyCAD: city.hotelNightlyCAD }, result: { hotelEstimateCAD: hotel, worthItScore: scored.score, pillars: scored.pillars }, dataStatus: "estimated", source: RUBRIC_VERSION, observedAt: SNAPSHOT_DATE });
    const delta = pair.perSeat - flights.baseline.priceCAD;
    const kids = r.children + r.infants > 0;
    const highlight = kids ? city.highlightKids + (r.seniors > 0 ? `; ${city.highlightSeniors}` : "") : r.seniors > 0 || r.mobilityAssistance ? city.highlightSeniors : city.highlightKids;
    options.push({ stopoverCity: city.city, iata: city.iata, suggestedDays: days, flightTotalCAD: pair.perSeat, hotelEstimateCAD: hotel, deltaVsDirectCAD: delta, worthItScore: scored.score, visaVerdict: `${visa.label} for ${r.passport === "OTHER" ? "your" : r.passport} passports`, highlight, caution: city.caution, dataStatus: "estimated" });
    lines.push(`${city.iata}: ${delta >= 0 ? "+" : "−"}${money(Math.abs(delta))}/seat in flights + ~${money(hotel)} hotels buys ${days} days (longest leg ${hours(Math.max(pair.first.durationHours, pair.second.durationHours))} vs ${hours(flights.baseline.durationHours)} direct) — score ${scored.score}.`);
  }
  options.sort((a, b) => b.worthItScore - a.worthItScore || a.iata.localeCompare(b.iata));
  ctx.emit({ type: "subagent.done", agent: "stopover-value", report: `${lines.join(" ")} All hotel figures are estimates.` });
  return options.slice(0, 3);
}

// ---------------- Deterministic verifier: audits every number ----------------

export interface NumberAudit { approved: boolean; checks: number; issues: string[] }

const NUMBER_IN_TEXT = /\$?\d[\d,]*(?:\.\d+)?/g;

/** Recompute every published number from evidence and reject any figure in prose that the evidence does not contain. */
export function auditNumbers(verdict: Verdict, evidence: EvidenceEntry[], request: ParsedRequest): NumberAudit {
  const issues: string[] = [];
  let checks = 0;
  const check = (ok: boolean, message: string) => { checks++; if (!ok) issues.push(message); };
  const direct = evidence.find((e) => e.id.startsWith("flight:direct:"));
  const directOffers = (direct?.result ?? []) as FlightOffer[];
  const baseline = directOffers.length ? Math.min(...directOffers.map((o) => o.priceCAD)) : NaN;
  check(verdict.directBaselineCAD === baseline, `direct baseline ${verdict.directBaselineCAD} does not match the cheapest searched fare ${baseline}`);
  const allowed = new Set<number>([baseline, ...directOffers.map((o) => o.priceCAD), ...directOffers.map((o) => o.durationHours)]);
  for (const o of verdict.options) {
    const flight = evidence.find((e) => e.id === `flight:stopover:${o.iata}`)?.result as { first: FlightOffer; second: FlightOffer } | undefined;
    const calc = evidence.find((e) => e.id === `calculation:${o.iata}`) as EvidenceEntry | undefined;
    const city = getCityFacts(o.iata);
    check(!!flight && !!calc && !!city, `${o.iata}: missing evidence`);
    if (!flight || !calc || !city) continue;
    const perSeat = flight.first.priceCAD + flight.second.priceCAD;
    check(o.flightTotalCAD === perSeat, `${o.iata}: flight total ${o.flightTotalCAD} ≠ ${perSeat} from search_flights`);
    check(o.deltaVsDirectCAD === perSeat - baseline, `${o.iata}: delta ${o.deltaVsDirectCAD} ≠ ${perSeat - baseline}`);
    const input = calc.input as { nights: number; rooms: number; nightlyCAD: number };
    check(input.nights === nightsFor(o.suggestedDays) && input.rooms === request.rooms, `${o.iata}: hotel nights/rooms do not match the suggested stay`);
    check(o.hotelEstimateCAD === input.nightlyCAD * input.nights * input.rooms, `${o.iata}: hotel estimate ${o.hotelEstimateCAD} does not derive from estimate_hotel_cost`);
    const rescored = scoreOption({
      directFarePerSeat: baseline, stopoverFarePerSeat: perSeat, directHours: directOffers.find((d) => d.priceCAD === baseline)!.durationHours,
      legs: [{ hours: flight.first.durationHours, stops: flight.first.stops }, { hours: flight.second.durationHours, stops: flight.second.stops }],
      days: o.suggestedDays, hotelNightly: city.hotelNightlyCAD, rooms: request.rooms, party: partyOf(request), visaFeePerPerson: visaFor(city, request.passport).feeCAD, ratings: city.ratings, profiles: profilesFor(request),
    }).score;
    check(o.worthItScore === rescored, `${o.iata}: score ${o.worthItScore} ≠ recomputed ${rescored}`);
    check(o.dataStatus === "estimated", `${o.iata}: hotel estimates are load-bearing, so dataStatus must be "estimated"`);
    for (const n of [perSeat, perSeat - baseline, o.hotelEstimateCAD, o.worthItScore, o.suggestedDays, input.nights, input.rooms, input.nightlyCAD, flight.first.priceCAD, flight.second.priceCAD, flight.first.durationHours, flight.second.durationHours, visaFor(city, request.passport).feeCAD ?? 0, city.hotelNightlyCAD]) allowed.add(n);
    for (const note of city.notes) for (const m of note.text.match(NUMBER_IN_TEXT) ?? []) allowed.add(Number(m.replace(/[$,]/g, "")));
    for (const text of [city.highlightKids, city.highlightSeniors, city.caution, ...Object.values(city.visa).map((v) => v!.label)]) for (const m of text.match(NUMBER_IN_TEXT) ?? []) allowed.add(Number(m.replace(/[$,]/g, "")));
  }
  const prose = [verdict.summary, ...verdict.options.flatMap((o) => [o.highlight, o.caution, o.visaVerdict])].join(" ");
  for (const m of prose.match(NUMBER_IN_TEXT) ?? []) {
    const value = Number(m.replace(/[$,]/g, ""));
    check(allowed.has(value), `prose mentions ${m}, which no evidence supports`);
  }
  return { approved: issues.length === 0, checks, issues };
}

export function verifierReport(audit: NumberAudit, proseApproved: boolean | undefined): string {
  if (!audit.approved) return `REJECTED — ${audit.issues.join("; ")}.`;
  const prose = proseApproved === undefined ? "Prose checked for unsupported figures." : proseApproved ? "Claims in the prose match the evidence." : "Prose claims need correction.";
  return `All ${audit.checks} numeric checks pass: fares match search_flights exactly — VERIFIED. Hotel totals derive from estimate_hotel_cost — ESTIMATED, and the draft labels them as estimates. Scores recompute under ${RUBRIC_VERSION}. ${prose} Because hotel estimates are load-bearing, every option is marked dataStatus: estimated, not verified. ${proseApproved === false ? "NEEDS CORRECTION." : "APPROVED."}`;
}
