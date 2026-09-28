// FlyWith worth-it rubric v2 — shared with the iOS app (FlyWith/Models/WorthItRubric in FlightModels.swift).
// Six pillars, each normalised to 0...1 and weighted to a 0...100 score:
//   fare 15 · fatigue 25 · visa 5 · hotels 10 · party fit 20 · stay 25
// Weights and caps were calibrated so the promo scenarios reproduce the launch video
// (app: Dubai 59 / Singapore 55; agents: Dubai 86 / Istanbul 81 / Doha 72). Changing any
// constant here must keep tests/rubric.test.ts and FlyWithTests green.

export const RUBRIC_VERSION = "worth-it rubric v2";
export const WEIGHTS = { fare: 15, fatigue: 25, visa: 5, hotels: 10, fit: 20, stay: 25 } as const;
export const CAPS = { farePremium: 0.6, fatigueRelief: 0.4, connectionPenalty: 0.5, visaFeeCAD: 200, hotelPerTravellerNightCAD: 100, stayDays: 5 } as const;

export interface Leg { hours: number; stops: number }
export interface Party { adults: number; children: number; infants: number; seniors: number }
export interface Ratings { kids: number; seniors: number; budget: number; explorer: number; overall: number }
export type FitProfile = "kids" | "seniors" | "budget" | "explorer";

export interface RubricInput {
  directFarePerSeat: number;
  stopoverFarePerSeat: number;
  directHours: number;
  legs: Leg[];
  days: number;
  hotelNightly: number;
  rooms: number;
  party: Party;
  visaFeePerPerson: number | null; // 0 = visa-free, null = visa required before travel
  ratings: Ratings;
  profiles: FitProfile[];
}

export interface RubricResult {
  score: number;
  pillars: { fare: number; fatigue: number; visa: number; hotels: number; fit: number; stay: number };
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const payingTravellers = (p: Party) => p.adults + p.children + p.seniors;

/** A room holds four people and at most two adults (seniors count as adults); infants share a cot. */
export function roomsFor(p: Party): number {
  return Math.max(1, Math.ceil(payingTravellers(p) / 4), Math.ceil((p.adults + p.seniors) / 2));
}

/** Nights spent in hotels for a stopover of `days` days (arrival day to departure day). */
export function nightsFor(days: number): number { return Math.max(1, days - 1); }

/** Which rating families matter for this party: who is travelling first, then the stated priority. */
export function fitProfiles(p: Party, extra: FitProfile[] = []): FitProfile[] {
  const out: FitProfile[] = [];
  if (p.children + p.infants > 0) out.push("kids");
  if (p.seniors > 0) out.push("seniors");
  for (const x of extra) if (!out.includes(x)) out.push(x);
  return out;
}

export function fitRating(r: Ratings, profiles: FitProfile[]): number {
  if (!profiles.length) return r.overall;
  return profiles.reduce((sum, key) => sum + r[key], 0) / profiles.length;
}

function assertInput(i: RubricInput): void {
  const nums: Record<string, number> = { directFarePerSeat: i.directFarePerSeat, stopoverFarePerSeat: i.stopoverFarePerSeat, directHours: i.directHours, days: i.days, hotelNightly: i.hotelNightly, rooms: i.rooms };
  for (const [name, v] of Object.entries(nums)) if (!Number.isFinite(v) || v < 0) throw new RangeError(`${name} must be non-negative and finite.`);
  if (i.directFarePerSeat === 0 || i.directHours === 0) throw new RangeError("Direct baseline fare and hours must be positive.");
  if (!i.legs.length) throw new RangeError("At least one leg is required.");
  if (payingTravellers(i.party) < 1) throw new RangeError("At least one paying traveller is required.");
}

export function scoreOption(i: RubricInput): RubricResult {
  assertInput(i);
  const premium = (i.stopoverFarePerSeat - i.directFarePerSeat) / i.directFarePerSeat;
  const longest = Math.max(...i.legs.map((l) => l.hours));
  const connections = i.legs.reduce((sum, l) => sum + l.stops, 0);
  const pillars = {
    fare: 1 - clamp(premium / CAPS.farePremium),
    fatigue: clamp(clamp((i.directHours - longest) / i.directHours) / CAPS.fatigueRelief - CAPS.connectionPenalty * connections),
    visa: i.visaFeePerPerson === null ? 0 : 1 - clamp(i.visaFeePerPerson / CAPS.visaFeeCAD),
    hotels: 1 - clamp((i.hotelNightly * i.rooms) / payingTravellers(i.party) / CAPS.hotelPerTravellerNightCAD),
    fit: clamp(fitRating(i.ratings, i.profiles) / 5),
    stay: clamp(i.days / CAPS.stayDays),
  };
  const raw = (Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[]).reduce((sum, k) => sum + WEIGHTS[k] * pillars[k], 0);
  return { score: Math.round(raw), pillars };
}
