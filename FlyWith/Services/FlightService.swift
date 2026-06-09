import Foundation
import Combine

// MARK: - Flight Service
// Primary backend: LetsFG API (set LETSFG_API_KEY in Xcode scheme).
// Legacy fallback: Kiwi.com Tequila API (set KIWI_API_KEY).
// Neither key set: mock data, works in Simulator out of the box.
//
// LETSFG_API_KEY: 90-day Bearer token from letsfg.co/developers.
// Rotate before expiry. Never commit to version control.

final class FlightService: ObservableObject, FlightServiceProtocol {

    // MARK: - Backend selection

    private let letsfgAPIKey: String = ProcessInfo.processInfo.environment["LETSFG_API_KEY"] ?? ""
    private let kiwiAPIKey: String   = ProcessInfo.processInfo.environment["KIWI_API_KEY"] ?? ""

    private enum SearchBackend { case letsfg, kiwi, mock }
    private var activeBackend: SearchBackend {
        if !letsfgAPIKey.isEmpty { return .letsfg }
        if !kiwiAPIKey.isEmpty   { return .kiwi }
        return .mock
    }

    var useMockData: Bool { activeBackend == .mock }

    @Published var isLoading = false
    @Published var errorMessage: String?
    @Published var recommendations: [StopoverRecommendation] = []

    private var cancellables = Set<AnyCancellable>()

    // MARK: - Search

    func search(_ query: FlightSearch) {
        cancellables.removeAll()
        isLoading = true
        errorMessage = nil
        recommendations = []

        switch activeBackend {
        case .mock:
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.2) { [weak self] in
                guard let self else { return }
                self.loadMockRecommendations(for: query)
                self.isLoading = false
            }
        case .kiwi:
            searchWithKiwi(query)
        case .letsfg:
            searchWithLetsFG(query)
        }
    }

    // MARK: - LetsFG Backend

    private let letsfgBase = "https://letsfg.co/developers/api/v1"
    private static let iso8601 = ISO8601DateFormatter()

    func searchWithLetsFG(_ query: FlightSearch) {
        let candidates = scoredCities(for: query.criteria)
        let cities = Array(candidates.prefix(5))

        let isoDate = isoDateString(from: query.departureDate)
        let leg2Date = isoDateString(from: Calendar.current.date(
            byAdding: .day, value: query.minStopoverDays, to: query.departureDate
        ) ?? query.departureDate)

        let passengers = LetsFGPassengers(
            adults: query.adultCount,
            children: query.childCount,
            infants: query.infantCount
        )

        let segments = cities.map {
            LetsFGSearchSegment(origin: query.origin, destination: $0.iataCode, date: isoDate)
        }
        let multiReq = LetsFGMultiSearchRequest(
            segments: segments,
            passengers: passengers,
            currency: "CAD",
            limit: 1
        )

        letsfgPublisher(endpoint: "/flights/multi-search", body: multiReq, responseType: LetsFGMultiSearchResponse.self)
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] result in
                    if case .failure(let error) = result {
                        self?.errorMessage = "Flight search failed: \(error.localizedDescription)"
                        self?.isLoading = false
                    }
                },
                receiveValue: { [weak self] response in
                    guard let self else { return }
                    var leg1Map: [String: LetsFGFlightOffer] = [:]
                    for (index, destResult) in response.results.enumerated() {
                        let iata = destResult.destination.isEmpty
                            ? (index < cities.count ? cities[index].iataCode : "")
                            : destResult.destination
                        if let offer = destResult.offers.first {
                            leg1Map[iata] = offer
                        }
                    }
                    self.fetchLeg2ForAll(
                        cities: cities,
                        destination: query.destination,
                        date: leg2Date,
                        passengers: passengers,
                        leg1Map: leg1Map,
                        query: query
                    )
                }
            )
            .store(in: &cancellables)
    }

    private func fetchLeg2ForAll(
        cities: [StopoverCity],
        destination: String,
        date: String,
        passengers: LetsFGPassengers,
        leg1Map: [String: LetsFGFlightOffer],
        query: FlightSearch
    ) {
        let leg2Publishers = cities.map { city -> AnyPublisher<(StopoverCity, LetsFGFlightOffer)?, Never> in
            guard leg1Map[city.iataCode] != nil else {
                return Just(nil).eraseToAnyPublisher()
            }
            let req = LetsFGSingleSearchRequest(
                origin: city.iataCode,
                destination: destination,
                date: date,
                passengers: passengers,
                currency: "CAD",
                limit: 1
            )
            return letsfgPublisher(endpoint: "/flights/search", body: req, responseType: LetsFGSingleSearchResponse.self)
                .map { res -> (StopoverCity, LetsFGFlightOffer)? in
                    guard let offer = res.results.first else { return nil }
                    return (city, offer)
                }
                .replaceError(with: nil)
                .eraseToAnyPublisher()
        }

        Publishers.MergeMany(leg2Publishers)
            .collect()
            .receive(on: DispatchQueue.main)
            .sink { [weak self] pairs in
                guard let self else { return }
                self.recommendations = pairs
                    .compactMap { pair -> StopoverRecommendation? in
                        guard let (city, leg2Offer) = pair,
                              let leg1Offer = leg1Map[city.iataCode]
                        else { return nil }
                        return self.buildLetsFGRecommendation(
                            query: query, stopover: city,
                            leg1: leg1Offer, leg2: leg2Offer
                        )
                    }
                    .sorted {
                        $0.stopoverCity.scores.score(for: query.criteria) >
                        $1.stopoverCity.scores.score(for: query.criteria)
                    }
                self.isLoading = false
            }
            .store(in: &cancellables)
    }

    func buildLetsFGRecommendation(
        query: FlightSearch,
        stopover: StopoverCity,
        leg1: LetsFGFlightOffer,
        leg2: LetsFGFlightOffer
    ) -> StopoverRecommendation {
        let badge: RecommendationBadge = switch query.criteria {
        case .withKids:      .familyPick
        case .withSeniors:   .seniorFriendly
        case .budgetFocused: .budgetGem
        case .explorer:      .adventurersPick
        }

        return StopoverRecommendation(
            stopoverCity: stopover,
            leg1: mapLeg(offer: leg1,
                         origin: query.origin, originCity: "",
                         destination: stopover.iataCode, destinationCity: stopover.cityName),
            leg2: mapLeg(offer: leg2,
                         origin: stopover.iataCode, originCity: stopover.cityName,
                         destination: query.destination, destinationCity: ""),
            stopoverDays: query.minStopoverDays,
            totalPrice: leg1.price + leg2.price,
            directComparisonPrice: 1072,  // TODO: fetch live direct price
            badge: badge
        )
    }

    func mapLeg(
        offer: LetsFGFlightOffer,
        origin: String,
        originCity: String,
        destination: String,
        destinationCity: String
    ) -> FlightLeg {
        let itin = offer.outbound
        let depart = FlightService.iso8601.date(from: itin.departureAt) ?? Date()
        let arrive = FlightService.iso8601.date(from: itin.arrivalAt) ?? Date()
        return FlightLeg(
            origin: origin,
            originCity: originCity,
            destination: destination,
            destinationCity: destinationCity,
            departureTime: depart,
            arrivalTime: arrive,
            durationMinutes: itin.totalDurationSeconds / 60,
            airline: itin.carrier,
            price: offer.price,
            currency: offer.currency,
            bookingURL: offer.bookingUrl,
            stops: itin.stopovers.map {
                FlightStop(airportCode: $0.airportCode, cityName: $0.cityName,
                           layoverMinutes: $0.layoverSeconds / 60)
            }
        )
    }

    private func letsfgPublisher<B: Encodable, R: Decodable>(
        endpoint: String,
        body: B,
        responseType: R.Type
    ) -> AnyPublisher<R, Error> {
        guard let url = URL(string: letsfgBase + endpoint) else {
            return Fail(error: URLError(.badURL)).eraseToAnyPublisher()
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(letsfgAPIKey)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(body)
        return URLSession.shared.dataTaskPublisher(for: req)
            .tryMap { data, response -> Data in
                guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                guard (200..<300).contains(http.statusCode) else {
                    throw LetsFGAPIError.httpError(statusCode: http.statusCode)
                }
                return data
            }
            .decode(type: R.self, decoder: JSONDecoder())
            .eraseToAnyPublisher()
    }

    private func isoDateString(from date: Date) -> String {
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.locale = Locale(identifier: "en_US_POSIX")
        return fmt.string(from: date)
    }

    // MARK: - Kiwi Backend

    private func searchWithKiwi(_ query: FlightSearch) {
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

    private let kiwiBase = "https://api.tequila.kiwi.com"

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
        case .withKids:      .familyPick
        case .withSeniors:   .seniorFriendly
        case .budgetFocused: .budgetGem
        case .explorer:      .adventurersPick
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

// MARK: - LetsFG Error

private enum LetsFGAPIError: Error, LocalizedError {
    case httpError(statusCode: Int)

    var errorDescription: String? {
        switch self {
        case .httpError(let code): return "LetsFG API returned HTTP \(code)"
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
