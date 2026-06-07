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
        case .withKids: return "Traveling with Kids"
        case .withSeniors: return "Traveling with Seniors"
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
        case .withKids: return "Prioritizes airports with play areas, stroller access, and kid-friendly cities."
        case .withSeniors: return "Favors short terminal walks, wheelchair access, and restful stopover cities."
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
    let bookingURL: String
    let stops: [FlightStop]

    var durationFormatted: String {
        let h = durationMinutes / 60
        let m = durationMinutes % 60
        return m > 0 ? "\(h)h \(m)m" : "\(h)h"
    }
}

struct FlightStop: Identifiable {
    let id = UUID()
    let airportCode: String
    let cityName: String
    let layoverMinutes: Int
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
            averageTemperature: 38
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
            averageTemperature: 23
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
            averageTemperature: 29
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
            averageTemperature: 38
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
            averageTemperature: 25
        ),
    ]
}
