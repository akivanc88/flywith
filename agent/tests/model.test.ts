import test from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicModelClient, createModelClient, modelConfig, RefusalError, TemplateModelClient, type DraftInput } from "../src/model.js";
import { parsePlanRequest } from "../src/intake.js";
import { GOLDEN_PROMPT } from "./fixtures.js";
import type { VerdictOption } from "../src/trace.js";

const option: VerdictOption = { stopoverCity: "Dubai", iata: "DXB", suggestedDays: 5, flightTotalCAD: 1107, hotelEstimateCAD: 1160, deltaVsDirectCAD: 258, worthItScore: 86, visaVerdict: "visa-free", highlight: "h", caution: "c", dataStatus: "estimated" };
const input = (tier: DraftInput["tier"] = "strong"): DraftInput => ({ request: parsePlanRequest({ prompt: GOLDEN_PROMPT }), options: [option], directBaselineCAD: 849, tier });

function fakeClient(reply: { stop_reason: string; text?: string; model?: string }) {
  const requests: Record<string, unknown>[] = [];
  const client = { beta: { messages: { create: async (body: Record<string, unknown>) => { requests.push(body); return { model: reply.model ?? body.model, stop_reason: reply.stop_reason, content: [{ type: "thinking", thinking: "" }, { type: "text", text: reply.text ?? "" }] }; } } } } as unknown as Anthropic;
  return { client, requests };
}

test("model config: Opus 5.5 strong, Haiku 4.5 fast, Opus 5 refusal fallback, all overridable", () => {
  assert.deepEqual(modelConfig({}), { strong: "claude-opus-5-5", fast: "claude-haiku-4-5", refusalFallback: "claude-opus-5" });
  assert.deepEqual(modelConfig({ FLYWITH_STRONG_MODEL: "a", FLYWITH_FAST_MODEL: "b", FLYWITH_REFUSAL_FALLBACK: "off" }), { strong: "a", fast: "b", refusalFallback: undefined });
  assert.equal(modelConfig({ FLYWITH_REFUSAL_FALLBACK: "claude-opus-4-8" }).refusalFallback, "claude-opus-4-8");
});

test("strong tier drafts with schema-enforced JSON, medium effort and a refusal fallback", async () => {
  const prose = { summary: "s", options: [{ iata: "DXB", highlight: "h2", caution: "c2" }] };
  const { client, requests } = fakeClient({ stop_reason: "end_turn", text: JSON.stringify(prose) });
  const model = new AnthropicModelClient(client, modelConfig({}));
  assert.deepEqual(await model.draft(input(), new AbortController().signal), prose);
  const body = requests[0] as { model: string; output_config: { effort?: string; format: { type: string } }; fallbacks: { model: string }[]; betas: string[]; messages: { content: string }[]; thinking?: unknown };
  assert.equal(body.model, "claude-opus-5-5");
  assert.equal(body.output_config.effort, "medium");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.deepEqual(body.fallbacks, [{ model: "claude-opus-5" }]);
  assert.deepEqual(body.betas, ["server-side-fallback-2026-06-01"]);
  assert.equal(body.thinking, undefined, "Opus 5.5 rejects disabled thinking; the field must be omitted");
  assert.equal(JSON.parse(body.messages[0].content).party.seniors, 1);
  assert.equal(model.describe("strong"), "claude-opus-5-5");
});

test("fast tier uses Haiku without effort or fallbacks", async () => {
  const { client, requests } = fakeClient({ stop_reason: "end_turn", text: JSON.stringify({ approved: true, issues: [] }) });
  const model = new AnthropicModelClient(client, modelConfig({}));
  const audit = await model.audit({ verdict: { route: "r", summary: "s", directBaselineCAD: 1, options: [], verifierNote: "" }, evidence: [], tier: "fast" }, new AbortController().signal);
  assert.equal(audit.approved, true);
  const body = requests[0] as { model: string; output_config: { effort?: string }; fallbacks?: unknown };
  assert.equal(body.model, "claude-haiku-4-5");
  assert.equal(body.output_config.effort, undefined);
  assert.equal(body.fallbacks, undefined);
});

test("correct() passes verifier issues back to the model", async () => {
  const { client, requests } = fakeClient({ stop_reason: "end_turn", text: JSON.stringify({ summary: "fixed", options: [] }) });
  await new AnthropicModelClient(client, modelConfig({ FLYWITH_REFUSAL_FALLBACK: "off" })).correct({ ...input(), issues: ["bad number"] }, new AbortController().signal);
  assert.deepEqual(JSON.parse((requests[0] as { messages: { content: string }[] }).messages[0].content).verifierIssues, ["bad number"]);
  assert.equal((requests[0] as { fallbacks?: unknown }).fallbacks, undefined);
});

test("refusals and truncation fail loudly instead of parsing partial output", async () => {
  await assert.rejects(new AnthropicModelClient(fakeClient({ stop_reason: "refusal" }).client, modelConfig({})).draft(input(), new AbortController().signal), RefusalError);
  await assert.rejects(new AnthropicModelClient(fakeClient({ stop_reason: "max_tokens", text: "{" }).client, modelConfig({})).draft(input(), new AbortController().signal), /truncated/);
});

test("template drafter writes grounded prose from the options", async () => {
  const template = new TemplateModelClient();
  const cheaper = { ...option, iata: "IST", stopoverCity: "Istanbul", deltaVsDirectCAD: 217 };
  const prose = await template.draft({ ...input(), options: [option, cheaper] });
  assert.match(prose.summary, /Dubai adds 5 days for \$258 more per seat; Istanbul is the budget pick at \+\$217/);
  const runnerUp = await template.draft({ ...input(), options: [{ ...option, deltaVsDirectCAD: 100 }, cheaper] });
  assert.match(runnerUp.summary, /Istanbul is the runner-up/);
  const single = await template.draft({ ...input(), request: parsePlanRequest({ prompt: "YYZ to BOM" }), options: [option] });
  assert.match(single.summary, /for this trip\. Dubai adds 5 days for \$258 more per seat\.$/);
  assert.deepEqual(await template.audit(), { approved: true, issues: [] });
  assert.equal((await template.correct({ ...input(), issues: [] })).options[0].iata, "DXB");
  assert.equal(template.describe(), "template drafter");
});

test("createModelClient uses Claude only when a key is configured", () => {
  assert.equal(createModelClient({}).name, "template");
  assert.equal(createModelClient({ ANTHROPIC_API_KEY: "sk-ant-test" }).name, "anthropic");
});
