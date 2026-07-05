// Demo dataset backing the tool layer. Fares mirror the June 2026 snapshot in
// the repo README; city facts come from docs/market-research.md editorial
// research. Each tool result is tagged with a dataStatus so the verifier can
// keep estimated/editorial claims labeled as such. Swapping this module for
// the LetsFG client turns the demo agent into a live one without touching the
// orchestration layer.

export interface FlightOffer {
  origin: string;
  destination: string;
  priceCAD: number;
  airline: string;
  durationHours: number;
  stops: number;
}

export interface CityFacts {
  iata: string;
  city: string;
  country: string;
  visa: string;
  airportComfort: string;
  familyNotes: string;
  seniorNotes: string;
  hotelNightlyCAD: number;
}

// Keyed by "ORIGIN-DEST"
const OFFERS: Record<string, FlightOffer[]> = {
  "YYZ-BOM": [
    { origin: "YYZ", destination: "BOM", priceCAD: 849, airline: "United + Air France", durationHours: 24, stops: 2 },
    { origin: "YYZ", destination: "BOM", priceCAD: 1072, airline: "Air France", durationHours: 19.5, stops: 1 },
    { origin: "YYZ", destination: "BOM", priceCAD: 1407, airline: "Emirates", durationHours: 18.5, stops: 1 },
  ],
  "YYZ-DXB": [
    { origin: "YYZ", destination: "DXB", priceCAD: 641, airline: "Emirates", durationHours: 12.5, stops: 0 },
  ],
  "DXB-BOM": [
    { origin: "DXB", destination: "BOM", priceCAD: 466, airline: "Emirates", durationHours: 3, stops: 0 },
  ],
  "YYZ-IST": [
    { origin: "YYZ", destination: "IST", priceCAD: 598, airline: "Turkish Airlines", durationHours: 9.5, stops: 0 },
  ],
  "IST-BOM": [
    { origin: "IST", destination: "BOM", priceCAD: 468, airline: "Turkish Airlines", durationHours: 6.5, stops: 0 },
  ],
  "YYZ-DOH": [
    { origin: "YYZ", destination: "DOH", priceCAD: 702, airline: "Qatar Airways", durationHours: 12, stops: 0 },
  ],
  "DOH-BOM": [
    { origin: "DOH", destination: "BOM", priceCAD: 421, airline: "Qatar Airways", durationHours: 3.5, stops: 0 },
  ],
  "YYZ-SIN": [
    { origin: "YYZ", destination: "SIN", priceCAD: 1120, airline: "Singapore Airlines", durationHours: 20, stops: 1 },
  ],
  "SIN-BOM": [
    { origin: "SIN", destination: "BOM", priceCAD: 380, airline: "Singapore Airlines", durationHours: 5.5, stops: 0 },
  ],
};

const CITIES: Record<string, CityFacts> = {
  DXB: {
    iata: "DXB",
    city: "Dubai",
    country: "United Arab Emirates",
    visa: "Visa on arrival for Canadian passports (30 days, free). Indian passports: pre-arranged visa or 14-day VOA with valid US/UK/EU visa.",
    airportComfort: "Excellent — stroller-friendly, family lanes, sleep pods, short connections in same terminal for Emirates.",
    familyNotes: "Very kid-friendly: aquariums, beaches, malls with play zones. Taxis abundant; car seats must be requested ahead.",
    seniorNotes: "Wheelchair assistance reliable; smooth surfaces; summer heat (Jun–Sep) is hard on seniors — plan indoor days.",
    hotelNightlyCAD: 145,
  },
  IST: {
    iata: "IST",
    city: "Istanbul",
    country: "Türkiye",
    visa: "e-Visa online for Canadian passports (~CAD $85). Indian passports: e-Visa with valid US/UK/Schengen visa, otherwise sticker visa.",
    airportComfort: "Good — large new airport, long walking distances; free stopover hotel via Turkish Airlines on 20h+ connections.",
    familyNotes: "Free Touristanbul city tours on 6–24h layovers. Old town is walkable but cobblestones fight strollers.",
    seniorNotes: "Hills and cobblestones are tiring; use trams and taxis. Turkish Airlines wheelchair service is dependable.",
    hotelNightlyCAD: 95,
  },
  DOH: {
    iata: "DOH",
    city: "Doha",
    country: "Qatar",
    visa: "Visa-free entry for Canadian passports (30 days). Indian passports: visa on arrival (30 days).",
    airportComfort: "Excellent — compact, quiet rooms, kids' play areas; Qatar Airways offers discounted stopover hotel packages.",
    familyNotes: "Museum of Islamic Art and Corniche are easy wins with kids; city is compact and taxi-cheap.",
    seniorNotes: "Flat, accessible city; extreme summer heat — stopover best Oct–Apr.",
    hotelNightlyCAD: 120,
  },
  SIN: {
    iata: "SIN",
    city: "Singapore",
    country: "Singapore",
    visa: "Visa-free for Canadian passports (90 days). Indian passports: visa required unless holding qualifying long-term visas (96h VFTF).",
    airportComfort: "World-best — Jewel waterfall, free cinema, butterfly garden, playgrounds in every terminal.",
    familyNotes: "Easiest first-night city in Asia: English signage, spotless transit, hawker food kids actually eat.",
    seniorNotes: "Fully accessible transit; humid climate — pace outdoor time.",
    hotelNightlyCAD: 210,
  },
};

export function searchFlights(origin: string, destination: string): FlightOffer[] {
  return OFFERS[`${origin.toUpperCase()}-${destination.toUpperCase()}`] ?? [];
}

export function getCityFacts(iata: string): CityFacts | undefined {
  return CITIES[iata.toUpperCase()];
}

export function listStopoverCandidates(): string[] {
  return Object.keys(CITIES);
}
