// Recorded June 2026 fare snapshot (per seat, CAD) plus editorial city research.
// Fares mirror the repo README; city facts come from FlyWith market research. The
// party-fit ratings are editorial judgments (0-5) calibrated against the launch
// video's verdict for the canonical Toronto → Mumbai family (see rubric.ts).
import type { Ratings } from "./rubric.js";
import type { Passport } from "./trace.js";

export const SNAPSHOT_DATE = "2026-06-01";
export const SNAPSHOT_SOURCE = "FlyWith June 2026 fare snapshot";

export interface FlightOffer { origin: string; destination: string; priceCAD: number; airline: string; durationHours: number; stops: number }

/** Visa entry for one passport: fee per person in CAD (0 = free), or null when a visa must be arranged in advance. */
export interface VisaRule { feeCAD: number | null; label: string }
export interface CityNote { text: string; for: "kids" | "seniors" | "all" }

export interface CityFacts {
  iata: string;
  city: string;
  country: string;
  visa: Partial<Record<Passport, VisaRule>>;
  hotelNightlyCAD: number;
  ratings: Ratings;
  maxDays: number;
  maxDaysWithKids: number;
  goodMonths: number[];
  notes: CityNote[];
  highlightKids: string;
  highlightSeniors: string;
  caution: string;
}

export const BUNDLED_OFFERS: Record<string, FlightOffer[]> = {
  "YYZ-BOM": [
    { origin: "YYZ", destination: "BOM", priceCAD: 849, airline: "United + Air France", durationHours: 24, stops: 2 },
    { origin: "YYZ", destination: "BOM", priceCAD: 1072, airline: "Air France", durationHours: 19.5, stops: 1 },
    { origin: "YYZ", destination: "BOM", priceCAD: 1407, airline: "Emirates", durationHours: 18.5, stops: 1 },
  ],
  "YYZ-DXB": [{ origin: "YYZ", destination: "DXB", priceCAD: 641, airline: "Emirates", durationHours: 12.5, stops: 0 }],
  "DXB-BOM": [{ origin: "DXB", destination: "BOM", priceCAD: 466, airline: "Emirates", durationHours: 3, stops: 0 }],
  "YYZ-IST": [{ origin: "YYZ", destination: "IST", priceCAD: 598, airline: "Turkish Airlines", durationHours: 9.5, stops: 0 }],
  "IST-BOM": [{ origin: "IST", destination: "BOM", priceCAD: 468, airline: "Turkish Airlines", durationHours: 6.5, stops: 0 }],
  "YYZ-DOH": [{ origin: "YYZ", destination: "DOH", priceCAD: 702, airline: "Qatar Airways", durationHours: 12, stops: 0 }],
  "DOH-BOM": [{ origin: "DOH", destination: "BOM", priceCAD: 421, airline: "Qatar Airways", durationHours: 3.5, stops: 0 }],
  "YYZ-SIN": [{ origin: "YYZ", destination: "SIN", priceCAD: 1120, airline: "Singapore Airlines", durationHours: 20, stops: 1 }],
  "SIN-BOM": [{ origin: "SIN", destination: "BOM", priceCAD: 380, airline: "Singapore Airlines", durationHours: 5.5, stops: 0 }],
};

const CITIES: CityFacts[] = [
  {
    iata: "DXB", city: "Dubai", country: "United Arab Emirates", hotelNightlyCAD: 145,
    visa: { CA: { feeCAD: 0, label: "visa-free 30d" }, US: { feeCAD: 0, label: "visa-free 30d" }, GB: { feeCAD: 0, label: "visa-free 30d" }, AU: { feeCAD: 0, label: "visa-free 30d" }, IN: { feeCAD: null, label: "pre-arranged visa" } },
    ratings: { kids: 4.9, seniors: 4.8, budget: 3.2, explorer: 3.8, overall: 4.6 },
    maxDays: 6, maxDaysWithKids: 5, goodMonths: [11, 12, 1, 2, 3],
    notes: [{ text: "stroller lanes", for: "kids" }, { text: "reliable wheelchair service", for: "seniors" }, { text: "summer heat caveat", for: "all" }],
    highlightKids: "Longest leg drops to a 12.5h nonstop — nap-schedule friendly, with stroller lanes at DXB",
    highlightSeniors: "DXB's wheelchair service is dependable for older travellers",
    caution: "Summer heat (Jun–Sep) is hard on young kids and seniors — plan indoor days",
  },
  {
    iata: "IST", city: "Istanbul", country: "Türkiye", hotelNightlyCAD: 95,
    visa: { CA: { feeCAD: 85, label: "e-Visa ~$85/person" }, US: { feeCAD: 0, label: "visa-free 90d" }, GB: { feeCAD: 0, label: "visa-free 90d" }, AU: { feeCAD: 85, label: "e-Visa ~$85/person" }, IN: { feeCAD: null, label: "sticker visa" } },
    ratings: { kids: 4.6, seniors: 4.56, budget: 4.9, explorer: 4.5, overall: 4.5 },
    maxDays: 5, maxDaysWithKids: 4, goodMonths: [4, 5, 6, 9, 10, 11],
    notes: [{ text: "free Touristanbul tours", for: "all" }, { text: "cobblestones fight strollers", for: "kids" }, { text: "hills tire seniors", for: "seniors" }],
    highlightKids: "Cheapest way to turn the journey into a holiday — both legs nonstop",
    highlightSeniors: "Turkish Airlines wheelchair service is dependable",
    caution: "Old-town cobblestones and hills are a fight with a stroller or a cane",
  },
  {
    iata: "DOH", city: "Doha", country: "Qatar", hotelNightlyCAD: 120,
    visa: { CA: { feeCAD: 0, label: "visa-free" }, US: { feeCAD: 0, label: "visa-free" }, GB: { feeCAD: 0, label: "visa-free" }, AU: { feeCAD: 0, label: "visa-free" }, IN: { feeCAD: 0, label: "visa on arrival" } },
    ratings: { kids: 3.0, seniors: 4.44, budget: 3.0, explorer: 3.6, overall: 4.3 },
    maxDays: 4, maxDaysWithKids: 3, goodMonths: [10, 11, 12, 1, 2, 3, 4],
    notes: [{ text: "compact airport rated best for comfort", for: "all" }, { text: "flat senior-friendly city", for: "seniors" }],
    highlightKids: "Calm, compact airport with play areas",
    highlightSeniors: "Flat, accessible city — easiest on older travellers",
    caution: "Two to three days is the ceiling before Doha runs quiet for young kids",
  },
  {
    iata: "SIN", city: "Singapore", country: "Singapore", hotelNightlyCAD: 210,
    visa: { CA: { feeCAD: 0, label: "visa-free 90d" }, US: { feeCAD: 0, label: "visa-free 90d" }, GB: { feeCAD: 0, label: "visa-free 90d" }, AU: { feeCAD: 0, label: "visa-free 90d" }, IN: { feeCAD: null, label: "visa required" } },
    ratings: { kids: 5.0, seniors: 4.9, budget: 2.8, explorer: 3.5, overall: 4.7 },
    maxDays: 5, maxDaysWithKids: 5, goodMonths: [2, 3, 4, 5, 6, 7, 8, 9],
    notes: [{ text: "Changi slides and playgrounds", for: "kids" }, { text: "fully accessible transit", for: "seniors" }],
    highlightKids: "Changi Airport slides and the easiest first night in Asia",
    highlightSeniors: "Fully accessible transit and spotless public spaces",
    caution: "Premium hotels; humid climate — pace outdoor time",
  },
];

/** City names travellers type, mapped to IATA codes (longest match wins). */
export const PLACE_CODES: Record<string, string> = {
  toronto: "YYZ", pearson: "YYZ", mumbai: "BOM", bombay: "BOM", dubai: "DXB", istanbul: "IST", doha: "DOH", singapore: "SIN",
  delhi: "DEL", "new delhi": "DEL", vancouver: "YVR", montreal: "YUL", london: "LHR", "new york": "JFK", chennai: "MAA", bangalore: "BLR", bengaluru: "BLR", hyderabad: "HYD",
};
export const KNOWN_AIRPORTS = new Set([...Object.values(PLACE_CODES), "ORD", "CDG"]);

export function getCityFacts(iata: string): CityFacts | undefined {
  return CITIES.find((c) => c.iata === iata.toUpperCase());
}

export function listStopoverCandidates(): string[] {
  return CITIES.map((c) => c.iata);
}
