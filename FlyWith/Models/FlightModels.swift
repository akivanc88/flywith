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
    var criteria: TravelerCriteria = .withKids
    var minStopoverDays: Int = 3
    var maxStopoverDays: Int = 7
    var resultLimit: Int = 20

    var totalPassengers: Int { adultCount + childCount + infantCount }
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
    let directComparisonPrice: Double
    let badge: RecommendationBadge

    var savings: Double { directComparisonPrice - totalPrice }
    var hasSavings: Bool { savings > 0 }
    var costPerStopoverDay: Double { totalPrice / Double(stopoverDays) }

    var estimatedHotelTotal: Double {
        Double(stopoverCity.estimatedHotelPerNight * max(stopoverDays - 1, 1))
    }

    var estimatedTripTotal: Double {
        totalPrice + estimatedHotelTotal
    }

    var comfortScore: Double {
        let city = stopoverCity
        return (city.scores.family * 0.35) + (city.scores.seniors * 0.25) + (city.scores.overall * 0.25) + (city.scores.budget * 0.15)
    }

    var worthItScore: Int {
        let fareComponent = max(0, min(30, (directComparisonPrice - totalPrice + 300) / 20))
        let comfortComponent = comfortScore * 10
        let stopoverComponent = min(Double(stopoverDays), 7) * 2
        return Int(min(100, max(0, fareComponent + comfortComponent + stopoverComponent)))
    }

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
