import test from "node:test";
import assert from "node:assert/strict";
import { CAPS, fitProfiles, fitRating, nightsFor, roomsFor, scoreOption, WEIGHTS, type RubricInput } from "../src/rubric.js";

const family = { adults: 2, children: 2, infants: 0, seniors: 0 };
const iosDXB = { kids: 4.9, seniors: 4.7, budget: 3.2, explorer: 3.8, overall: 4.6 };
const iosSIN = { kids: 5.0, seniors: 4.9, budget: 2.8, explorer: 3.5, overall: 4.7 };

function base(overrides: Partial<RubricInput> = {}): RubricInput {
  return { directFarePerSeat: 1000, stopoverFarePerSeat: 1000, directHours: 20, legs: [{ hours: 10, stops: 0 }], days: 3, hotelNightly: 100, rooms: 1, party: family, visaFeePerPerson: 0, ratings: iosDXB, profiles: ["kids"], ...overrides };
}

test("weights sum to 100 so a perfect option scores 100", () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
  const perfect = scoreOption(base({ stopoverFarePerSeat: 500, legs: [{ hours: 1, stops: 0 }], days: CAPS.stayDays, hotelNightly: 0, ratings: { kids: 5, seniors: 5, budget: 5, explorer: 5, overall: 5 } }));
  assert.equal(perfect.score, 100);
});

test("launch video app scenario: Dubai 59%, Singapore 55% (iOS demo data)", () => {
  const app = { directFarePerSeat: 1072, directHours: 19.5, days: 3, rooms: roomsFor(family), party: family, visaFeePerPerson: 0, profiles: fitProfiles(family, ["kids"]) };
  assert.equal(scoreOption({ ...app, stopoverFarePerSeat: 1203, legs: [{ hours: 985 / 60, stops: 1 }, { hours: 3.25, stops: 0 }], hotelNightly: 120, ratings: iosDXB }).score, 59);
  assert.equal(scoreOption({ ...app, stopoverFarePerSeat: 1290, legs: [{ hours: 22, stops: 0 }, { hours: 3.25, stops: 0 }], hotelNightly: 180, ratings: iosSIN }).score, 55);
});

test("fare pillar rewards savings and bottoms out at the premium cap", () => {
  assert.equal(scoreOption(base({ stopoverFarePerSeat: 800 })).pillars.fare, 1);
  assert.equal(scoreOption(base({ stopoverFarePerSeat: 1000 * (1 + CAPS.farePremium) })).pillars.fare, 0);
});

test("fatigue pillar measures relief vs the direct trip and penalises connections", () => {
  assert.equal(scoreOption(base({ legs: [{ hours: 12, stops: 0 }] })).pillars.fatigue, 1);
  assert.equal(scoreOption(base({ legs: [{ hours: 25, stops: 0 }] })).pillars.fatigue, 0);
  assert.equal(scoreOption(base({ legs: [{ hours: 12, stops: 1 }] })).pillars.fatigue, 0.5);
});

test("visa pillar: free, fee-based, and visa-required", () => {
  assert.equal(scoreOption(base()).pillars.visa, 1);
  assert.equal(scoreOption(base({ visaFeePerPerson: 100 })).pillars.visa, 0.5);
  assert.equal(scoreOption(base({ visaFeePerPerson: null })).pillars.visa, 0);
});

test("hotel pillar prices per traveller-night and stay pillar caps at five days", () => {
  assert.equal(scoreOption(base({ hotelNightly: 200, rooms: 2 })).pillars.hotels, 0);
  assert.equal(scoreOption(base({ days: 10 })).pillars.stay, 1);
});

test("rooms: four per room, at most two adults (seniors count as adults), infants share", () => {
  assert.equal(roomsFor({ adults: 2, children: 2, infants: 1, seniors: 0 }), 1);
  assert.equal(roomsFor({ adults: 2, children: 2, infants: 0, seniors: 1 }), 2);
  assert.equal(roomsFor({ adults: 1, children: 0, infants: 0, seniors: 0 }), 1);
  assert.equal(roomsFor({ adults: 2, children: 5, infants: 0, seniors: 0 }), 2);
  assert.equal(nightsFor(5), 4);
  assert.equal(nightsFor(1), 1);
});

test("fit follows who is travelling, then stated priorities, else overall", () => {
  assert.deepEqual(fitProfiles({ adults: 2, children: 0, infants: 1, seniors: 1 }, ["budget", "kids"]), ["kids", "seniors", "budget"]);
  assert.deepEqual(fitProfiles({ adults: 2, children: 0, infants: 0, seniors: 0 }), []);
  assert.equal(fitRating(iosDXB, []), 4.6);
  assert.ok(Math.abs(fitRating(iosDXB, ["kids", "seniors"]) - 4.8) < 1e-9);
});

test("rejects impossible inputs", () => {
  assert.throws(() => scoreOption(base({ days: -1 })), /days/);
  assert.throws(() => scoreOption(base({ stopoverFarePerSeat: Number.NaN })), /stopoverFarePerSeat/);
  assert.throws(() => scoreOption(base({ directFarePerSeat: 0 })), /positive/);
  assert.throws(() => scoreOption(base({ legs: [] })), /leg/);
  assert.throws(() => scoreOption(base({ party: { adults: 0, children: 0, infants: 1, seniors: 0 } })), /traveller/);
});
