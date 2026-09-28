import type { JevClient, JevRequest, JevResponse } from "../src/jev.js";
import { TemplateModelClient, type AuditInput, type DraftInput, type ModelClient, type Prose, type ProseAudit } from "../src/model.js";

/** The launch video's agent scenario, verbatim from the landing-page replay. */
export const GOLDEN_PROMPT = "Toronto → Mumbai in November · 2 adults, 2 kids (4 & 7) + grandma · Canadian passports";

/** The verdict the launch video shows for GOLDEN_PROMPT (numbers only — prose may vary by drafter). */
export const GOLDEN_OPTIONS = [
  { iata: "DXB", stopoverCity: "Dubai", suggestedDays: 5, flightTotalCAD: 1107, hotelEstimateCAD: 1160, deltaVsDirectCAD: 258, worthItScore: 86 },
  { iata: "IST", stopoverCity: "Istanbul", suggestedDays: 4, flightTotalCAD: 1066, hotelEstimateCAD: 570, deltaVsDirectCAD: 217, worthItScore: 81 },
  { iata: "DOH", stopoverCity: "Doha", suggestedDays: 3, flightTotalCAD: 1123, hotelEstimateCAD: 480, deltaVsDirectCAD: 274, worthItScore: 72 },
];

/** Scriptable model: records calls, approves or rejects audits in order, and can tamper with prose. */
export class ScriptedModel implements ModelClient {
  readonly name = "scripted";
  calls: string[] = [];
  private readonly template = new TemplateModelClient();
  constructor(private audits: boolean[] = [true], private readonly draftProse?: (input: DraftInput) => Prose) {}
  describe(): string { return "scripted model"; }
  async draft(input: DraftInput): Promise<Prose> { this.calls.push(`draft:${input.tier}`); return this.draftProse ? this.draftProse(input) : this.template.draft(input); }
  async audit(_input: AuditInput): Promise<ProseAudit> { this.calls.push("audit"); const approved = this.audits.shift() ?? false; return { approved, issues: approved ? [] : ["summary claim is unsupported"] }; }
  async correct(input: DraftInput & { issues: string[] }): Promise<Prose> { this.calls.push("correct"); return this.template.draft(input); }
}

/** Jev stand-in returning fixed answers (merged over a benign default). */
export class FixedJev implements JevClient {
  readonly engine = "jev" as const;
  requests: JevRequest[] = [];
  constructor(private readonly answers: JevResponse["answers"] = {}) {}
  async systemOne(request: JevRequest): Promise<JevResponse> {
    this.requests.push(request);
    return {
      model: "jev-1.13.0",
      answers: {
        intent: { type: "choice", choice: "plan_stopover", probabilities: { plan_stopover: 0.94, booking: 0.03, off_topic: 0.03 }, confidence: 0.94 },
        injection: { type: "noul", noul: 0.01 },
        has_children: { type: "noul", noul: 0.02 },
        has_infant: { type: "noul", noul: 0.02 },
        has_senior: { type: "noul", noul: 0.02 },
        needs_wheelchair: { type: "noul", noul: 0.02 },
        priority: { type: "choice", choice: "balanced", probabilities: { balanced: 0.9 }, confidence: 0.9 },
        ...this.answers,
      },
      usage: { input_tokens: 300, output_tokens: 20 },
    };
  }
}
