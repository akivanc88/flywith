// Poll LetsFG for the direct route and every stopover leg, then write a fare snapshot the
// agent server can load with FLYWITH_FARE_SNAPSHOT. Searches are spaced (default 200s) to
// stay within the free tier's ~3 searches per 10 minutes, so a full poll of YYZ→BOM with four
// stopover cities (9 searches) takes about half an hour.
//
//   LETSFG_API_KEY=... npm run poll-fares -- --date 2026-11-10 [--origin YYZ] [--destination BOM] [--out data/fares-latest.json] [--spacing 200]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { listStopoverCandidates } from "../src/data.js";
import { LetsFGClient, pollFares, type PollPlan } from "../src/fares.js";

export function parseArgs(argv: string[], today = new Date()): { plan: PollPlan; out: string; spacingMs: number } {
  const arg = (name: string) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
  const inThirtyDays = new Date(today.getTime() + 30 * 86_400_000).toISOString().slice(0, 10);
  const date = arg("date") ?? inThirtyDays;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD.");
  const origin = (arg("origin") ?? "YYZ").toUpperCase();
  const destination = (arg("destination") ?? "BOM").toUpperCase();
  return {
    plan: { origin, destination, via: listStopoverCandidates(), date, party: { adults: 1, children: 0, infants: 0 } },
    out: arg("out") ?? "data/fares-latest.json",
    spacingMs: Number(arg("spacing") ?? 200) * 1000,
  };
}

/* c8 ignore start */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { plan, out, spacingMs } = parseArgs(process.argv.slice(2));
  const client = new LetsFGClient({ apiKey: process.env.LETSFG_API_KEY ?? "" });
  console.log(`Polling ${plan.origin}→${plan.destination} via ${plan.via.join(", ")} for ${plan.date} (${spacingMs / 1000}s between searches)…`);
  const outcome = await pollFares(client, plan, { spacingMs });
  const path = resolve(out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(outcome.snapshot, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(outcome.snapshot.offers).length}/${outcome.searched} routes to ${path}`);
  for (const f of outcome.failures) console.log(`  ${f.route}: ${f.error}`);
  if (!outcome.snapshot.offers[`${plan.origin}-${plan.destination}`]) process.exitCode = 1;
}
/* c8 ignore stop */
