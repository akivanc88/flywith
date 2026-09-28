import Foundation

// MARK: - Travel Profile

enum TravelerCriteria: String, CaseIterable, Identifiable {
    case withKids = "withKids"
    case withSeniors = "withSeniors"
    case budgetFocused = "budgetFocused"
    case explorer = "explorer"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .withKids: return "Diaspora Family"
        case .withSeniors: return "Parents & Seniors"
        case .budgetFocused: return "Budget Traveler"
        case .explorer: return "Adventure Seeker"
        }
    }

    var icon: String {
        switch self {
        case .withKids: return "figure.and.child.holdinghands"
        case .withSeniors: return "figure.walk"
        case .budgetFocused: return "dollarsign.circle"
        case .explorer: return "map"
        }
    }

    var emoji: String {
        switch self {
        case .withKids: return "👨‍👩‍👧‍👦"
        case .withSeniors: return "👴"
        case .budgetFocused: return "💸"
        case .explorer: return "🧭"
        }
    }

    var description: String {
        switch self {
        case .withKids: return "Prioritizes lower fatigue, stroller logistics, kid-friendly airports, and easy first nights."
        case .withSeniors: return "Favors assisted travel, shorter walks, calmer airports, and recovery time."
        case .budgetFocused: return "Maximizes savings. Targets free-visa cities and cheap stopover hotels."
        case .explorer: return "Off-the-beaten-path stopovers most travelers would never book deliberately."
        }
    }
}

// MARK: - Search

struct FlightSearch {
    var origin: String = ""
    var destination: String = ""
    var departureDate: Date = Calendar.current.date(byAdding: .day, value: 30, to: Date()) ?? Date()
    var adultCount: Int = 2
    var childCount: Int = 0
    var infantCount: Int = 0
    var seniorCount: Int = 0
    var passport: String = "CA"
    var criteria: TravelerCriteria = .withKids
    var minStopoverDays: Int = 3
    var maxStopoverDays: Int = 7
    var resultLimit: Int = 20

    var totalPassengers: Int { adultCount + childCount + infantCount + seniorCount }
    var party: WorthItRubric.Party { .init(adults: adultCount, children: childCount, infants: infantCount, seniors: seniorCount) }
}

// MARK: - Stopover City

struct StopoverCity: Identifiable {
    let id = UUID()
    let iataCode: String
    let cityName: String
    let countryName: String
    let emoji: String
    let visaFreeCountries: [String]
    let scores: StopoverScores
    let highlights: [String]
    let estimatedHotelPerNight: Int   // CAD
    let averageTemperature: Int       // °C in September
    let visaSummary: String
    let airportComfort: String
    let familyLogistics: String
    let accessibilityNotes: String
    let researchGap: String
}

struct StopoverScores {
    let family: Double      // 0–5
    let seniors: Double
    let budget: Double
    let explorer: Double
    let overall: Double

    func score(for criteria: TravelerCriteria) -> Double {
        switch criteria {
        case .withKids: return family
        case .withSeniors: return seniors
        case .budgetFocused: return budget
        case .explorer: return explorer
        }
    }
}

// MARK: - Flight Leg

struct FlightLeg: Identifiable {
    let id = UUID()
    let origin: String
    let originCity: String
    let destination: String
    let destinationCity: String
    let departureTime: Date
    let arrivalTime: Date
    let durationMinutes: Int
    let airline: String
    let price: Double           // CAD
    let currency: String
    let bookingURL: String?
    let bookingSource: BookingSource
    let stops: [FlightStop]

    var durationFormatted: String {
        let h = durationMinutes / 60
        let m = durationMinutes % 60
        return m > 0 ? "\(h)h \(m)m" : "\(h)h"
    }
}

enum BookingSource: String {
    case letsfg = "LetsFG"
    case kiwi = "Kiwi"
    case demo = "Demo fare"

    var actionLabel: String {
        switch self {
        case .letsfg: return "Compare/book with LetsFG"
        case .kiwi: return "Book on Kiwi"
        case .demo: return "Demo fare — compare elsewhere"
        }
    }
}

struct FlightStop: Identifiable {
    let id = UUID()
    let airportCode: String
    let cityName: String
    let layoverMinutes: Int?
}

// MARK: - Stopover Recommendation

struct StopoverRecommendation: Identifiable {
    let id = UUID()
    let stopoverCity: StopoverCity
    let leg1: FlightLeg
    let leg2: FlightLeg
    let stopoverDays: Int
    let totalPrice: Double      // CAD
    /// nil when no direct fare could be fetched; the UI must say so rather
    /// than fabricate a baseline from the stopover total.
    let directComparisonPrice: Double?
    let badge: RecommendationBadge
    /// Who is travelling and how they search; drives the profile-aware rubric.
    var party = WorthItRubric.Party(adults: 2, children: 0, infants: 0, seniors: 0)
    var criteria: TravelerCriteria = .withKids
    var passport: String = "CA"
    /// Door-to-door hours of the direct baseline itinerary, when known.
    var directHours: Double? = nil

    var savings: Double? { directComparisonPrice.map { $0 - totalPrice } }
    var hasSavings: Bool { (savings ?? 0) > 0 }
    var costPerStopoverDay: Double { totalPrice / Double(stopoverDays) }

    var rooms: Int { WorthItRubric.rooms(for: party) }

    /// Hotel estimate for the whole party: nightly rate × nights × rooms.
    var estimatedHotelTotal: Double {
        Double(stopoverCity.estimatedHotelPerNight * WorthItRubric.nights(forDays: stopoverDays) * rooms)
    }

    var estimatedTripTotal: Double {
        totalPrice + estimatedHotelTotal
    }

    var rubric: WorthItRubric.Result {
        WorthItRubric.score(WorthItRubric.Input(
            directFarePerSeat: directComparisonPrice,
            stopoverFarePerSeat: totalPrice,
            directHours: directHours,
            legs: [leg1, leg2].map { WorthItRubric.Leg(hours: Double($0.durationMinutes) / 60, stops: $0.stops.count) },
            days: stopoverDays,
            hotelNightly: Double(stopoverCity.estimatedHotelPerNight),
            rooms: rooms,
            party: party,
            visaFeePerPerson: stopoverCity.visaFreeCountries.contains(passport) ? 0 : nil,
            ratings: stopoverCity.scores,
            profiles: WorthItRubric.profiles(for: party, criteria: criteria)
        ))
    }

    /// Worth-it rubric v2: fatigue, visas, hotels and fare for whoever is travelling (see WorthItRubric).
    var worthItScore: Int { rubric.score }

    var worthItSummary: String {
        if worthItScore >= 80 {
            return "Strong family stopover"
        } else if worthItScore >= 65 {
            return "Worth comparing"
        } else if hasSavings {
            return "Cheap but check logistics"
        } else {
            return "Comfort upgrade"
        }
    }
}

// MARK: - Worth-it rubric v2
// Shared with the agent backend (agent/src/rubric.ts): six pillars normalised to 0...1,
// weighted fare 15 · fatigue 25 · visa 5 · hotels 10 · fit 20 · stay 25. Calibrated so the
// launch video's demo screens hold (Dubai 59%, Singapore 55% for a Diaspora Family).

enum WorthItRubric {
    struct Party: Equatable { var adults: Int; var children: Int; var infants: Int; var seniors: Int }
    struct Leg: Equatable { var hours: Double; var stops: Int }
    enum Profile: Equatable { case kids, seniors, budget, explorer }

    struct Input {
        var directFarePerSeat: Double?
        var stopoverFarePerSeat: Double
        var directHours: Double?
        var legs: [Leg]
        var days: Int
        var hotelNightly: Double
        var rooms: Int
        var party: Party
        /// 0 = visa-free, nil = visa arranged in advance or unknown for this passport.
        var visaFeePerPerson: Double?
        var ratings: StopoverScores
        var profiles: [Profile]
    }

    struct Pillars: Equatable { var fare, fatigue, visa, hotels, fit, stay: Double }
    struct Result: Equatable { var score: Int; var pillars: Pillars }

    static let weights = Pillars(fare: 15, fatigue: 25, visa: 5, hotels: 10, fit: 20, stay: 25)
    static let farePremiumCap = 0.6, fatigueReliefCap = 0.4, connectionPenalty = 0.5
    static let visaFeeCap = 200.0, hotelPerTravellerNightCap = 100.0, stayDaysCap = 5.0

    static func payingTravellers(_ p: Party) -> Int { p.adults + p.children + p.seniors }

    /// Four people per room, at most two adults (seniors count as adults); infants share a cot.
    static func rooms(for p: Party) -> Int {
        let people = payingTravellers(p)
        return max(1, Int((Double(people) / 4).rounded(.up)), Int((Double(p.adults + p.seniors) / 2).rounded(.up)))
    }

    static func nights(forDays days: Int) -> Int { max(1, days - 1) }

    static func profiles(for p: Party, criteria: TravelerCriteria) -> [Profile] {
        var out: [Profile] = []
        if p.children + p.infants > 0 { out.append(.kids) }
        if p.seniors > 0 { out.append(.seniors) }
        let stated: Profile = switch criteria {
        case .withKids: .kids
        case .withSeniors: .seniors
        case .budgetFocused: .budget
        case .explorer: .explorer
        }
        if !out.contains(stated) { out.append(stated) }
        return out
    }

    static func fitRating(_ r: StopoverScores, _ profiles: [Profile]) -> Double {
        guard !profiles.isEmpty else { return r.overall }
        let total = profiles.reduce(0.0) { sum, p in
            sum + (p == .kids ? r.family : p == .seniors ? r.seniors : p == .budget ? r.budget : r.explorer)
        }
        return total / Double(profiles.count)
    }

    private static func clamp(_ x: Double) -> Double { max(0, min(1, x)) }

    static func score(_ i: Input) -> Result {
        let travellers = Double(max(1, payingTravellers(i.party)))
        // Unknown baselines score neutral rather than implying savings or relief.
        let fare = i.directFarePerSeat.map { $0 > 0 ? 1 - clamp((i.stopoverFarePerSeat - $0) / $0 / farePremiumCap) : 0.5 } ?? 0.5
        let longest = i.legs.map(\.hours).max() ?? 0
        let connections = Double(i.legs.reduce(0) { $0 + $1.stops })
        let fatigue = i.directHours.map { $0 > 0 ? clamp(clamp(($0 - longest) / $0) / fatigueReliefCap - connectionPenalty * connections) : 0.5 } ?? 0.5
        let visa = i.visaFeePerPerson.map { 1 - clamp($0 / visaFeeCap) } ?? 0
        let hotels = 1 - clamp(i.hotelNightly * Double(i.rooms) / travellers / hotelPerTravellerNightCap)
        let fit = clamp(fitRating(i.ratings, i.profiles) / 5)
        let stay = clamp(Double(i.days) / stayDaysCap)
        let p = Pillars(fare: fare, fatigue: fatigue, visa: visa, hotels: hotels, fit: fit, stay: stay)
        let w = weights
        let raw = w.fare * p.fare + w.fatigue * p.fatigue + w.visa * p.visa + w.hotels * p.hotels + w.fit * p.fit + w.stay * p.stay
        return Result(score: Int(raw.rounded()), pillars: p)
    }
}

enum RecommendationBadge: String {
    case bestValue = "Best Value"
    case familyPick = "Family Pick"
    case seniorFriendly = "Senior Friendly"
    case budgetGem = "Budget Gem"
    case adventurersPick = "Explorer's Pick"
    case topRated = "Top Rated"
}

// MARK: - Sample Data

extension StopoverCity {
    static let sampleCities: [StopoverCity] = [
        StopoverCity(
            iataCode: "DXB",
            cityName: "Dubai",
            countryName: "UAE",
            emoji: "🇦🇪",
            visaFreeCountries: ["CA", "US", "GB", "AU"],
            scores: StopoverScores(family: 4.9, seniors: 4.7, budget: 3.2, explorer: 3.8, overall: 4.6),
            highlights: ["Burj Khalifa", "Dubai Mall & Aquarium", "Desert safari", "Kid-friendly beaches", "World-class malls"],
            estimatedHotelPerNight: 120,
            averageTemperature: 38,
            visaSummary: "Visa-free or visa-on-arrival for many Canadian, US, UK, and Australian passport holders. Confirm rules before booking.",
            airportComfort: "Large hub with strong family amenities, lounges, stroller-friendly terminals, and predictable ground transport.",
            familyLogistics: "Best for families who want an easy, polished first stop with malls, beaches, short taxi rides, and familiar food options.",
            accessibilityNotes: "Good wheelchair and assistance infrastructure, but heat and long terminal distances should be planned around.",
            researchGap: "Generic flight tools show the fare; they rarely explain whether Dubai is actually easier with kids or older parents."
        ),
        StopoverCity(
            iataCode: "IST",
            cityName: "Istanbul",
            countryName: "Turkey",
            emoji: "🇹🇷",
            visaFreeCountries: ["CA", "US", "GB"],
            scores: StopoverScores(family: 4.0, seniors: 3.8, budget: 4.9, explorer: 4.5, overall: 4.5),
            highlights: ["Hagia Sophia", "Grand Bazaar", "Bosphorus cruise", "Turkish cuisine", "Free e-visa"],
            estimatedHotelPerNight: 60,
            averageTemperature: 23,
            visaSummary: "Visa rules vary by nationality and itinerary. Turkish Airlines stopover benefits may require airline-operated segments.",
            airportComfort: "Modern airport with good services, but the city transfer is long enough that arrival timing matters.",
            familyLogistics: "Excellent value if the family can handle city traffic and wants culture, food, and a slower break before South Asia.",
            accessibilityNotes: "Airport assistance is strong; old-city sightseeing can involve hills, crowds, and uneven walking surfaces.",
            researchGap: "Reddit users repeatedly ask how stopover rules work because airline program terms are hard to compare."
        ),
        StopoverCity(
            iataCode: "SIN",
            cityName: "Singapore",
            countryName: "Singapore",
            emoji: "🇸🇬",
            visaFreeCountries: ["CA", "US", "GB", "AU"],
            scores: StopoverScores(family: 5.0, seniors: 4.9, budget: 2.8, explorer: 3.5, overall: 4.7),
            highlights: ["Changi Airport slides (kids love it!)", "Gardens by the Bay", "Universal Studios", "Hawker centres", "Safe & clean"],
            estimatedHotelPerNight: 180,
            averageTemperature: 29,
            visaSummary: "Often visa-free for Canadian, US, UK, and Australian passport holders for short stays. Confirm before ticketing.",
            airportComfort: "One of the easiest airports for kids, seniors, short rests, food, and clean facilities.",
            familyLogistics: "Premium but low-stress: ideal when comfort and predictability matter more than absolute lowest total cost.",
            accessibilityNotes: "Strong accessibility, safe transit, clean public spaces, and easy medical/pharmacy access.",
            researchGap: "Most competitors do not quantify why a more expensive stopover can still be the better family choice."
        ),
        StopoverCity(
            iataCode: "DOH",
            cityName: "Doha",
            countryName: "Qatar",
            emoji: "🇶🇦",
            visaFreeCountries: ["CA", "US", "GB"],
            scores: StopoverScores(family: 4.3, seniors: 4.8, budget: 3.0, explorer: 3.6, overall: 4.3),
            highlights: ["Museum of Islamic Art", "Souq Waqif", "Luxury malls", "Desert dunes", "World-class airport"],
            estimatedHotelPerNight: 100,
            averageTemperature: 38,
            visaSummary: "Short-stay entry is available to many nationalities, but eligibility depends on passport and itinerary.",
            airportComfort: "High-quality hub with calm lounges, clear transfers, and strong airline service patterns.",
            familyLogistics: "Good rest stop for families who value a controlled, simple stopover over packed sightseeing.",
            accessibilityNotes: "Strong airport accessibility; outdoor plans should account for heat and limited walkability.",
            researchGap: "Airline stopover pages promote perks, but travelers still need a neutral comparison against other hubs."
        ),
        StopoverCity(
            iataCode: "TBS",
            cityName: "Tbilisi",
            countryName: "Georgia",
            emoji: "🇬🇪",
            visaFreeCountries: ["CA", "US", "GB", "AU"],
            scores: StopoverScores(family: 3.5, seniors: 3.2, budget: 5.0, explorer: 5.0, overall: 4.2),
            highlights: ["Ancient cave city Vardzia", "Incredible wine country", "Medieval old town", "Only $30/night hotels", "Almost zero tourists"],
            estimatedHotelPerNight: 35,
            averageTemperature: 25,
            visaSummary: "Generous entry rules for many passports, but route availability and separate-ticket risk need extra review.",
            airportComfort: "Smaller airport and lower costs, with fewer premium recovery options than major Gulf or Asian hubs.",
            familyLogistics: "Best for adventurous families with older kids or budget travelers comfortable with less standardized infrastructure.",
            accessibilityNotes: "Less ideal for travelers needing high-confidence wheelchair, medical, or lounge support.",
            researchGap: "Explore-style tools can surface cheap places, but they do not screen out logistics that matter for families."
        ),
    ]
}

extension StopoverRecommendation {
    /// Copy carrying the search's party, profile and passport so the rubric scores for who is travelling.
    func scored(for query: FlightSearch, directHours: Double? = nil) -> StopoverRecommendation {
        var copy = self
        copy.party = query.party
        copy.criteria = query.criteria
        copy.passport = query.passport
        copy.directHours = directHours ?? self.directHours
        return copy
    }
}
