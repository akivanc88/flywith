import test from "node:test";
import assert from "node:assert/strict";
import { parsePlanRequest } from "../src/intake.js";
import { getCityFacts } from "../src/data.js";
import { auditNumbers, familyLogistics, flightSearch, profilesFor, stopoverValue, suggestedDays, verifierReport, visaFor, type Context } from "../src/subagents.js";
import type { EvidenceEntry, TraceEvent, Verdict } from "../src/trace.js";
import { GOLDEN_OPTIONS, GOLDEN_PROMPT } from "./fixtures.js";

function ctx(prompt = GOLDEN_PROMPT, overrides = {}): Context & { events: TraceEvent[] } {
  const events: TraceEvent[] = [];
  return { request: { ...parsePlanRequest({ prompt }), ...overrides }, emit: (e) => events.push(e), evidence: [] as EvidenceEntry[], events };
}

function golden() {
  const c = ctx();
  const flights = flightSearch(c);
  const facts = familyLogistics(c, flights.pairs.map((p) => p.iata));
  const options = stopoverValue(c, flights, facts);
  const verdict: Verdict = { route: "YYZ → BOM", summary: "Dubai adds 5 days for $258 more per seat.", directBaselineCAD: 849, options, verifierNote: "" };
  return { c, flights, options, verdict };
}

test("flight-search prices the baseline and pairs, dropping pairs over the premium cap", () => {
  const { c, flights } = golden();
  assert.equal(flights.baseline.priceCAD, 849);
  assert.deepEqual(flights.pairs.map((p) => [p.iata, p.perSeat]), [["DXB", 1107], ["IST", 1066], ["DOH", 1123]]);
  assert.deepEqual(flights.dropped.map((p) => p.iata), ["SIN"]);
  const summaries = c.events.flatMap((e) => (e.type === "subagent.tool_result" ? [e.summary] : []));
  assert.ok(summaries.includes("YYZ→DXB $641 Emirates nonstop 12.5h · DXB→BOM $466 nonstop 3h"), "the video's search_flights line");
  assert.ok(summaries.includes("DXB: visa-free 30d (CA), stroller lanes, reliable wheelchair service, summer heat caveat"), "the video's get_city_facts line");
  const done = c.events.find((e) => e.type === "subagent.done" && e.agent === "flight-search");
  assert.match(JSON.stringify(done), /SIN pair prices out at \$1,500 — dropped/);
});

test("flight-search explains unsupported routes and incomplete pairs", () => {
  assert.throws(() => flightSearch(ctx("Toronto to Delhi")), /No fare snapshot covers YYZ→DEL/);
  const c = ctx("Mumbai to Dubai", {});
  const flights = { ...c };
  assert.throws(() => flightSearch(flights), /No fare snapshot/);
});

test("stopover-value reproduces the launch video's numbers", () => {
  const { options } = golden();
  assert.deepEqual(options.map(({ iata, stopoverCity, suggestedDays: d, flightTotalCAD, hotelEstimateCAD, deltaVsDirectCAD, worthItScore }) => ({ iata, stopoverCity, suggestedDays: d, flightTotalCAD, hotelEstimateCAD, deltaVsDirectCAD, worthItScore })), GOLDEN_OPTIONS);
  assert.ok(options.every((o) => o.dataStatus === "estimated"));
  assert.match(options[0].highlight, /wheelchair/);
});

test("family-logistics narrows notes to who is travelling and flags visa blockers", () => {
  const indian = ctx("YYZ to BOM, two adults, Indian passports", { children: 0, seniors: 0 });
  familyLogistics(indian, ["DXB", "XXX"]);
  const report = indian.events.find((e) => e.type === "subagent.done");
  assert.match(JSON.stringify(report), /Visa needed in advance for DXB/);
  const result = indian.events.find((e) => e.type === "subagent.tool_result");
  assert.match(JSON.stringify(result), /DXB: pre-arranged visa \(IN\), summer heat caveat"/);
  const wheelchair = ctx("YYZ to BOM", { mobilityAssistance: true, month: 7, passport: "OTHER" });
  familyLogistics(wheelchair, ["DXB"]);
  assert.match(JSON.stringify(wheelchair.events), /wheelchair assistance/);
  assert.match(JSON.stringify(wheelchair.events), /July is off-season/);
  assert.match(JSON.stringify(wheelchair.events), /the travellers' passports/);
  const baby = ctx("YYZ to BOM with a baby");
  familyLogistics(baby, ["IST"]);
  assert.match(JSON.stringify(baby.events), /a child/);
  const seniors = ctx("YYZ to BOM with my grandparents");
  familyLogistics(seniors, ["DOH"]);
  assert.match(JSON.stringify(seniors.events), /2 seniors/);
});

test("stay length follows the request, capped by what the city sustains", () => {
  const doha = getCityFacts("DOH")!;
  assert.equal(suggestedDays(doha, parsePlanRequest({ prompt: GOLDEN_PROMPT })), 3);
  assert.equal(suggestedDays(doha, parsePlanRequest({ prompt: "YYZ to BOM" })), 4);
  assert.equal(suggestedDays(doha, parsePlanRequest({ prompt: "YYZ to BOM", stopoverDays: 2 })), 2);
  assert.deepEqual(visaFor(doha, "OTHER"), { feeCAD: null, label: "check visa rules" });
});

test("profiles blend party, priority and mobility needs", () => {
  const r = parsePlanRequest({ prompt: "YYZ to BOM" });
  assert.deepEqual(profilesFor({ ...r, priority: "budget" }), ["budget"]);
  assert.deepEqual(profilesFor({ ...r, priority: "explore" }), ["explorer"]);
  assert.deepEqual(profilesFor({ ...r, mobilityAssistance: true }), ["seniors"]);
  assert.deepEqual(profilesFor(r), []);
});

test("adults-only runs look up city facts inside stopover-value", () => {
  const c = ctx("YYZ to BOM, two adults");
  const flights = flightSearch(c);
  const options = stopoverValue(c, { ...flights, pairs: [...flights.pairs, { ...flights.pairs[0], iata: "ZZZ" }] }, new Map());
  assert.equal(options.length, 3);
  assert.ok(c.evidence.some((e) => e.id === "logistics:DXB" && e.agent === "stopover-value"));
  assert.doesNotMatch(options[0].highlight, /wheelchair/);
  const senior = ctx("YYZ to BOM with grandma");
  const seniorOptions = stopoverValue(senior, flightSearch(senior), new Map());
  assert.equal(seniorOptions[0].highlight, getCityFacts(seniorOptions[0].iata)!.highlightSeniors);
  const cheap = ctx("YYZ to BOM", { rooms: 1 });
  const cheapFlights = flightSearch(cheap);
  const saving = stopoverValue(cheap, { ...cheapFlights, baseline: { ...cheapFlights.baseline, priceCAD: 1200 } }, new Map());
  assert.match(JSON.stringify(cheap.events.at(-1)), /−\$/);
  assert.ok(saving.length > 0);
});

test("verifier recomputes every number and approves the honest draft", () => {
  const { c, verdict } = golden();
  const audit = auditNumbers(verdict, c.evidence, c.request);
  assert.equal(audit.approved, true, audit.issues.join("\n"));
  assert.ok(audit.checks >= 25);
  assert.match(verifierReport(audit, true), /APPROVED\.$/);
  assert.match(verifierReport(audit, undefined), /Prose checked/);
  assert.match(verifierReport(audit, false), /NEEDS CORRECTION/);
});

test("verifier rejects tampered numbers, status, prose and missing evidence", () => {
  const { c, verdict } = golden();
  const tamper = (fn: (v: Verdict) => void) => { const v = structuredClone(verdict); fn(v); return auditNumbers(v, c.evidence, c.request); };
  assert.match(tamper((v) => { v.options[0].worthItScore = 99; }).issues.join(), /score 99/);
  assert.match(tamper((v) => { v.options[0].flightTotalCAD = 1000; }).issues.join(), /flight total/);
  assert.match(tamper((v) => { v.options[0].deltaVsDirectCAD = 1; }).issues.join(), /delta/);
  assert.match(tamper((v) => { v.options[0].hotelEstimateCAD = 1; }).issues.join(), /hotel estimate/);
  assert.match(tamper((v) => { v.options[0].suggestedDays = 2; }).issues.join(), /nights\/rooms/);
  assert.match(tamper((v) => { v.options[0].dataStatus = "live"; }).issues.join(), /dataStatus/);
  assert.match(tamper((v) => { v.directBaselineCAD = 700; }).issues.join(), /direct baseline/);
  assert.match(tamper((v) => { v.summary = "Only $99 more!"; }).issues.join(), /\$99/);
  assert.match(tamper((v) => { v.options[0].iata = "SIN"; }).issues.join(), /SIN: missing evidence/);
  const report = verifierReport(tamper((v) => { v.options[0].worthItScore = 99; }), undefined);
  assert.match(report, /^REJECTED/);
  assert.equal(auditNumbers(verdict, [], c.request).approved, false);
});
