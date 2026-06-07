import Foundation

// MARK: - Mock Data
// Used when KIWI_API_KEY is not set, so the app is fully demoable
// in Simulator without any API credentials.

extension FlightService {

    func loadMockRecommendations(for query: FlightSearch) {
        let leg1Date = query.departureDate
        let leg2Date = Calendar.current.date(byAdding: .day, value: query.minStopoverDays, to: leg1Date) ?? leg1Date

        recommendations = StopoverCity.sampleCities
            .sorted { $0.scores.score(for: query.criteria) > $1.scores.score(for: query.criteria) }
            .prefix(4)
            .map { city in mockRecommendation(city: city, query: query, leg1Date: leg1Date, leg2Date: leg2Date) }
    }

    private func mockRecommendation(
        city: StopoverCity,
        query: FlightSearch,
        leg1Date: Date,
        leg2Date: Date
    ) -> StopoverRecommendation {
        let mockPrices: [String: (leg1: Double, leg2: Double, direct: Double)] = [
            "DXB": (926,  277,  1072),
            "IST": (710,  356,  1072),
            "SIN": (980,  310,  1072),
            "DOH": (890,  240,  1072),
            "TBS": (620,  480,  1072),
        ]
        let prices = mockPrices[city.iataCode] ?? (850, 300, 1072)

        let leg1Depart = leg1Date.at(hour: 21, minute: 0)
        let leg1Arrive = leg1Depart.addingTimeInterval(TimeInterval((city.iataCode == "SIN" ? 22 : 16) * 3600))
        let leg2Depart = leg2Date.at(hour: 23, minute: 40)
        let leg2Arrive = leg2Depart.addingTimeInterval(TimeInterval(4 * 3600))

        let badge: RecommendationBadge = switch query.criteria {
        case .withKids:     city.iataCode == "SIN" ? .familyPick  : .topRated
        case .withSeniors:  city.iataCode == "DOH" ? .seniorFriendly : .topRated
        case .budgetFocused: city.iataCode == "TBS" ? .budgetGem  : .bestValue
        case .explorer:     city.iataCode == "TBS" ? .adventurersPick : .topRated
        }

        return StopoverRecommendation(
            stopoverCity: city,
            leg1: FlightLeg(
                origin: query.origin.isEmpty ? "YYZ" : query.origin,
                originCity: "Toronto",
                destination: city.iataCode,
                destinationCity: city.cityName,
                departureTime: leg1Depart,
                arrivalTime: leg1Arrive,
                durationMinutes: city.iataCode == "SIN" ? 1320 : 985,
                airline: mockAirline(for: city.iataCode),
                price: prices.leg1,
                currency: "CAD",
                bookingURL: "https://kiwi.com",
                stops: mockStops(for: city.iataCode)
            ),
            leg2: FlightLeg(
                origin: city.iataCode,
                originCity: city.cityName,
                destination: query.destination.isEmpty ? "BOM" : query.destination,
                destinationCity: "Mumbai",
                departureTime: leg2Depart,
                arrivalTime: leg2Arrive,
                durationMinutes: 195,
                airline: mockAirline(for: city.iataCode),
                price: prices.leg2,
                currency: "CAD",
                bookingURL: "https://kiwi.com",
                stops: []
            ),
            stopoverDays: query.minStopoverDays,
            totalPrice: prices.leg1 + prices.leg2,
            directComparisonPrice: prices.direct,
            badge: badge
        )
    }

    private func mockAirline(for iata: String) -> String {
        switch iata {
        case "DXB": return "QR"   // Qatar Airways via Doha
        case "IST": return "TK"   // Turkish Airlines
        case "SIN": return "SQ"   // Singapore Airlines
        case "DOH": return "QR"   // Qatar Airways
        case "TBS": return "W6"   // Wizz Air
        default:    return "AC"
        }
    }

    private func mockStops(for iata: String) -> [FlightStop] {
        switch iata {
        case "DXB": return [FlightStop(airportCode: "DOH", cityName: "Doha", layoverMinutes: 150)]
        case "TBS": return [FlightStop(airportCode: "WAW", cityName: "Warsaw", layoverMinutes: 90)]
        default:    return []
        }
    }
}

// MARK: - Date helpers

private extension Date {
    func at(hour: Int, minute: Int) -> Date {
        Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: self) ?? self
    }
}
