import Foundation
import Combine

// MARK: - Flight Service
// Integrates with Kiwi.com Tequila API for live pricing.
// Set KIWI_API_KEY in your Xcode scheme environment variables.
// Without an API key, mock data is used automatically so the app
// works in Simulator out of the box after cloning.

final class FlightService: ObservableObject {

    private let kiwiBase = "https://api.tequila.kiwi.com"

    private let kiwiAPIKey: String = ProcessInfo.processInfo.environment["KIWI_API_KEY"] ?? ""

    /// True when no API key is present — app runs entirely on local sample data.
    var useMockData: Bool { kiwiAPIKey.isEmpty }

    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var recommendations: [StopoverRecommendation] = []

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Search

    func search(_ query: FlightSearch) {
        isLoading = true
        errorMessage = nil
        recommendations = []

        // Use mock data if no API key is configured (simulator-friendly)
        if useMockData {
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
                guard let self else { return }
                self.loadMockRecommendations(for: query)
                self.isLoading = false
            }
            return
        }

        let candidates = scoredCities(for: query.criteria)
        let group = DispatchGroup()
        var results: [StopoverRecommendation] = []

        for city in candidates.prefix(5) {
            group.enter()
            fetchStopoverPair(query: query, stopover: city) { result in
                if let rec = result { results.append(rec) }
                group.leave()
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            self.recommendations = results.sorted {
                $0.stopoverCity.scores.score(for: query.criteria) >
                $1.stopoverCity.scores.score(for: query.criteria)
            }
            self.isLoading = false
        }
    }

    // MARK: - Kiwi API

    private func fetchStopoverPair(
        query: FlightSearch,
        stopover: StopoverCity,
        completion: @escaping (StopoverRecommendation?) -> Void
    ) {
        let fmt = DateFormatter()
        fmt.dateFormat = "dd/MM/yyyy"

        let leg1Date = fmt.string(from: query.departureDate)
        let leg2Date = fmt.string(from: Calendar.current.date(
            byAdding: .day, value: query.minStopoverDays, to: query.departureDate
        ) ?? query.departureDate)

        guard
            let url1 = kiwiSearchURL(from: query.origin, to: stopover.iataCode, date: leg1Date, query: query),
            let url2 = kiwiSearchURL(from: stopover.iataCode, to: query.destination, date: leg2Date, query: query)
        else { completion(nil); return }

        let pub1 = kiwiPublisher(url: url1).map { $0.data.first }
        let pub2 = kiwiPublisher(url: url2).map { $0.data.first }

        Publishers.Zip(pub1, pub2)
            .receive(on: DispatchQueue.main)
            .sink(receiveCompletion: { _ in }) { l1, l2 in
                guard let l1, let l2 else { completion(nil); return }
                completion(self.buildRecommendation(query: query, stopover: stopover, leg1: l1, leg2: l2))
            }
            .store(in: &cancellables)
    }

    private func kiwiSearchURL(from: String, to: String, date: String, query: FlightSearch) -> URL? {
        var c = URLComponents(string: "\(kiwiBase)/v2/search")!
        c.queryItems = [
            .init(name: "fly_from", value: from),
            .init(name: "fly_to", value: to),
            .init(name: "date_from", value: date),
            .init(name: "date_to", value: date),
            .init(name: "adults", value: "\(query.adultCount)"),
            .init(name: "children", value: "\(query.childCount)"),
            .init(name: "infants", value: "\(query.infantCount)"),
            .init(name: "curr", value: "CAD"),
            .init(name: "sort", value: "price"),
            .init(name: "limit", value: "1"),
        ]
        return c.url
    }

    private func kiwiPublisher(url: URL) -> AnyPublisher<KiwiSearchResponse, Error> {
        var req = URLRequest(url: url)
        req.setValue(kiwiAPIKey, forHTTPHeaderField: "apikey")
        return URLSession.shared.dataTaskPublisher(for: req)
            .map(\.data)
            .decode(type: KiwiSearchResponse.self, decoder: JSONDecoder())
            .eraseToAnyPublisher()
    }

    private func buildRecommendation(
        query: FlightSearch,
        stopover: StopoverCity,
        leg1: KiwiItinerary,
        leg2: KiwiItinerary
    ) -> StopoverRecommendation {
        let badge: RecommendationBadge = switch query.criteria {
        case .withKids: .familyPick
        case .withSeniors: .seniorFriendly
        case .budgetFocused: .budgetGem
        case .explorer: .adventurersPick
        }

        return StopoverRecommendation(
            stopoverCity: stopover,
            leg1: FlightLeg(
                origin: query.origin, originCity: leg1.cityFrom,
                destination: stopover.iataCode, destinationCity: stopover.cityName,
                departureTime: Date(timeIntervalSince1970: TimeInterval(leg1.dTimeUTC)),
                arrivalTime: Date(timeIntervalSince1970: TimeInterval(leg1.aTimeUTC)),
                durationMinutes: leg1.duration.total / 60,
                airline: leg1.airlines.first ?? "",
                price: leg1.price, currency: "CAD",
                bookingURL: leg1.deep_link,
                stops: leg1.route.dropLast().map {
                    FlightStop(airportCode: $0.flyTo, cityName: $0.cityTo, layoverMinutes: 0)
                }
            ),
            leg2: FlightLeg(
                origin: stopover.iataCode, originCity: stopover.cityName,
                destination: query.destination, destinationCity: leg2.cityTo,
                departureTime: Date(timeIntervalSince1970: TimeInterval(leg2.dTimeUTC)),
                arrivalTime: Date(timeIntervalSince1970: TimeInterval(leg2.aTimeUTC)),
                durationMinutes: leg2.duration.total / 60,
                airline: leg2.airlines.first ?? "",
                price: leg2.price, currency: "CAD",
                bookingURL: leg2.deep_link,
                stops: leg2.route.dropLast().map {
                    FlightStop(airportCode: $0.flyTo, cityName: $0.cityTo, layoverMinutes: 0)
                }
            ),
            stopoverDays: query.minStopoverDays,
            totalPrice: leg1.price + leg2.price,
            directComparisonPrice: 1072,  // TODO: fetch live direct price
            badge: badge
        )
    }

    // MARK: - Scoring

    private func scoredCities(for criteria: TravelerCriteria) -> [StopoverCity] {
        StopoverCity.sampleCities.sorted {
            $0.scores.score(for: criteria) > $1.scores.score(for: criteria)
        }
    }
}

// MARK: - Kiwi Response Models

private struct KiwiSearchResponse: Codable {
    let data: [KiwiItinerary]
}

private struct KiwiItinerary: Codable {
    let price: Double
    let deep_link: String
    let dTimeUTC: Int
    let aTimeUTC: Int
    let cityFrom: String
    let cityTo: String
    let airlines: [String]
    let duration: KiwiDuration
    let route: [KiwiRoute]
}

private struct KiwiDuration: Codable {
    let total: Int
}

private struct KiwiRoute: Codable {
    let flyFrom: String
    let flyTo: String
    let cityFrom: String
    let cityTo: String
}
