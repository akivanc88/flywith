import Foundation
import Combine

// MARK: - Flight Service
// Primary backend: LetsFG Agent API (set LETSFG_API_KEY in Xcode scheme).
// Legacy fallback: Kiwi.com Tequila API (set KIWI_API_KEY).
// Neither key set: mock data, works in Simulator out of the box.
//
// LETSFG_API_KEY: 90-day Bearer token from letsfg.co/for-agents.
// Rotate before expiry. Never commit to version control.

final class FlightService: ObservableObject, FlightServiceProtocol {

    // MARK: - Backend selection

    private let letsfgAPIKey: String
    private let kiwiAPIKey: String
    private let urlSession: URLSession
    private let pollingQueue: DispatchQueue
    private let pollingInterval: DispatchQueue.SchedulerTimeType.Stride

    init(
        letsfgAPIKey: String = ProcessInfo.processInfo.environment["LETSFG_API_KEY"] ?? "",
        kiwiAPIKey: String = ProcessInfo.processInfo.environment["KIWI_API_KEY"] ?? "",
        urlSession: URLSession = .shared,
        pollingQueue: DispatchQueue = .global(),
        pollingInterval: DispatchQueue.SchedulerTimeType.Stride = .seconds(10)
    ) {
        self.letsfgAPIKey = letsfgAPIKey
        self.kiwiAPIKey = kiwiAPIKey
        self.urlSession = urlSession
        self.pollingQueue = pollingQueue
        self.pollingInterval = pollingInterval
    }

    private enum SearchBackend { case letsfg, kiwi, mock }
    private var activeBackend: SearchBackend {
        if !letsfgAPIKey.isEmpty { return .letsfg }
        if !kiwiAPIKey.isEmpty   { return .kiwi }
        return .mock
    }

    var useMockData: Bool { activeBackend == .mock }

    var fareSourceName: String {
        switch activeBackend {
        case .letsfg: return "LetsFG live fares"
        case .kiwi: return "Kiwi live fares"
        case .mock: return "Demo fares"
        }
    }

    var fareEvidenceNote: String {
        switch activeBackend {
        case .letsfg, .kiwi:
            if activeBackend == .letsfg {
                return "Live LetsFG search is enabled. One stopover is checked per search to stay within agent API limits; compare final booking totals with Google Flights."
            }
            return "Live fare search is enabled. Compare the same dates in Google Flights before booking."
        case .mock:
            return "Demo mode is active because no flight API key is configured. These prices cannot prove savings against Google Flights."
        }
    }

    private var letsfgAuthorizationHeader: String {
        let trimmed = letsfgAPIKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.lowercased().hasPrefix("bearer ") {
            return trimmed
        }
        return "Bearer \(trimmed)"
    }

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

    private let letsfgBase = "https://letsfg.co"
    private static let iso8601 = ISO8601DateFormatter()

    func searchWithLetsFG(_ query: FlightSearch) {
        let candidates = scoredCities(for: query.criteria)
        // LetsFG agent tokens allow 3 searches per 10 minutes. One stopover candidate
        // uses exactly 3 searches: direct baseline, leg 1, and leg 2.
        let cities = Array(candidates.prefix(1))

        let isoDate = isoDateString(from: query.departureDate)
        let leg2Date = isoDateString(from: Calendar.current.date(
            byAdding: .day, value: query.minStopoverDays, to: query.departureDate
        ) ?? query.departureDate)

        guard let city = cities.first else {
            errorMessage = "No eligible stopover city was found."
            isLoading = false
            return
        }

        // Subscribe to all three cold publishers together so no request waits for
        // the direct baseline to finish before it starts.
        let direct = fetchLetsFGOffer(origin: query.origin, destination: query.destination, date: isoDate, query: query)
            .catch { _ in Just<LetsFGAgentOffer?>(nil).setFailureType(to: Error.self) }
            .eraseToAnyPublisher()
        let leg1 = fetchLetsFGOffer(origin: query.origin, destination: city.iataCode, date: isoDate, query: query)
        let leg2 = fetchLetsFGOffer(origin: city.iataCode, destination: query.destination, date: leg2Date, query: query)
        Publishers.Zip3(direct, leg1, leg2)
            .map { [weak self] directOffer, leg1Offer, leg2Offer -> [StopoverRecommendation?] in
                guard let self, let leg1Offer, let leg2Offer else { return [nil] }
                let comparisonPrice = directOffer?.googleFlightsPrice ?? directOffer?.price
                return [self.buildLetsFGRecommendation(query: query, stopover: city, leg1: leg1Offer,
                                                       leg2: leg2Offer, directComparisonPrice: comparisonPrice)]
            }
            .receive(on: DispatchQueue.main)
            .sink(
                receiveCompletion: { [weak self] completion in
                    if case .failure(let error) = completion {
                        if (error as? URLError)?.code == .cancelled {
                            self?.errorMessage = "LetsFG search was cancelled."
                        } else if error is DecodingError {
                            self?.errorMessage = "LetsFG returned an unexpected response. Please try again later."
                        } else {
                            self?.errorMessage = "LetsFG search failed: \(error.localizedDescription)"
                        }
                        self?.isLoading = false
                    }
                },
                receiveValue: { [weak self] recommendations in
                    guard let self else { return }
                    self.recommendations = recommendations
                        .compactMap { $0 }
                        .sorted {
                            $0.stopoverCity.scores.score(for: query.criteria) >
                            $1.stopoverCity.scores.score(for: query.criteria)
                        }
                    if self.recommendations.isEmpty {
                        self.errorMessage = "LetsFG live search returned no stopover pairs. Try different dates or fewer filters."
                    }
                    self.isLoading = false
                }
            )
            .store(in: &cancellables)
    }

    func buildLetsFGRecommendation(
        query: FlightSearch,
        stopover: StopoverCity,
        leg1: LetsFGAgentOffer,
        leg2: LetsFGAgentOffer,
        directComparisonPrice: Double?
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
            directComparisonPrice: directComparisonPrice,
            badge: badge
        )
    }

    func mapLeg(
        offer: LetsFGAgentOffer,
        origin: String,
        originCity: String,
        destination: String,
        destinationCity: String
    ) -> FlightLeg {
        let depart = parseLetsFGDate(offer.departureTime)
        let arrive = parseLetsFGDate(offer.arrivalTime)
        return FlightLeg(
            origin: origin,
            originCity: originCity,
            destination: destination,
            destinationCity: destinationCity,
            departureTime: depart,
            arrivalTime: arrive,
            durationMinutes: offer.durationMinutes,
            airline: offer.airlineCode ?? offer.airline ?? "",
            price: offer.price,
            currency: offer.currency,
            bookingURL: usableBookingURL(offer.bookingURL),
            bookingSource: .letsfg,
            stops: (offer.segments ?? []).dropLast().compactMap { segment in
                guard let airportCode = segment.destination else { return nil }
                return FlightStop(
                    airportCode: airportCode,
                    cityName: segment.destination ?? airportCode,
                    layoverMinutes: layoverMinutes(after: segment, in: offer.segments ?? [])
                )
            }
        )
    }

    private func fetchLetsFGOffer(
        origin: String,
        destination: String,
        date: String,
        query: FlightSearch
    ) -> AnyPublisher<LetsFGAgentOffer?, Error> {
        let request = makeLetsFGSearchRequest(origin: origin, destination: destination, date: date, query: query)

        return letsfgPostPublisher(endpoint: "/api/search", body: request, responseType: LetsFGSearchStartResponse.self)
            .flatMap { [weak self] start -> AnyPublisher<LetsFGAgentOffer?, Error> in
                guard let self else { return Fail(error: URLError(.cancelled)).eraseToAnyPublisher() }
                return self.handleLetsFGSearchStart(start)
            }
            .eraseToAnyPublisher()
    }

    func makeLetsFGSearchRequest(origin: String, destination: String, date: String, query: FlightSearch) -> LetsFGAgentSearchRequest {
        LetsFGAgentSearchRequest(
            origin: origin,
            destination: destination,
            dateFrom: date,
            adults: max(1, query.adultCount),
            children: max(0, query.childCount),
            infants: max(0, query.infantCount),
            currency: "CAD",
            limit: min(50, max(1, query.resultLimit))
        )
    }

    private func handleLetsFGSearchStart(_ start: LetsFGSearchStartResponse) -> AnyPublisher<LetsFGAgentOffer?, Error> {
        if start.needsClarification == true {
            let question = start.followUpQuestions?.first ?? "LetsFG needs more search details."
            return Fail(error: LetsFGAPIError.clarificationNeeded(question)).eraseToAnyPublisher()
        }
        guard let searchId = start.searchId else {
            return Fail(error: LetsFGAPIError.missingSearchId).eraseToAnyPublisher()
        }
        return pollLetsFGResults(searchId: searchId, attemptsRemaining: 18)
    }

    private func pollLetsFGResults(searchId: String, attemptsRemaining: Int) -> AnyPublisher<LetsFGAgentOffer?, Error> {
        letsfgGetPublisher(endpoint: "/api/results/\(searchId)", responseType: LetsFGSearchResultsResponse.self)
            .flatMap { [weak self] response -> AnyPublisher<LetsFGAgentOffer?, Error> in
                guard let self else { return Fail(error: URLError(.cancelled)).eraseToAnyPublisher() }
                switch response.status {
                case "completed":
                    let bestOffer = (response.offers ?? []).sorted { $0.price < $1.price }.first
                    return Just(bestOffer).setFailureType(to: Error.self).eraseToAnyPublisher()
                case "expired":
                    return Fail(error: LetsFGAPIError.searchExpired).eraseToAnyPublisher()
                case "failed", "error", "cancelled":
                    return Fail(error: LetsFGAPIError.searchFailed(status: response.status)).eraseToAnyPublisher()
                default:
                    guard attemptsRemaining > 0 else {
                        return Fail(error: LetsFGAPIError.pollingTimedOut).eraseToAnyPublisher()
                    }
                    return Just(())
                        .delay(for: self.pollingInterval, scheduler: self.pollingQueue)
                        .setFailureType(to: Error.self)
                        .flatMap { self.pollLetsFGResults(searchId: searchId, attemptsRemaining: attemptsRemaining - 1) }
                        .eraseToAnyPublisher()
                }
            }
            .eraseToAnyPublisher()
    }

    private func letsfgPostPublisher<B: Encodable, R: Decodable>(
        endpoint: String,
        body: B,
        responseType: R.Type
    ) -> AnyPublisher<R, Error> {
        guard let url = URL(string: letsfgBase + endpoint) else {
            return Fail(error: URLError(.badURL)).eraseToAnyPublisher()
        }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue(letsfgAuthorizationHeader, forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONEncoder().encode(body)
        return urlSession.dataTaskPublisher(for: req)
            .tryMap { data, response -> Data in
                guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                guard (200..<300).contains(http.statusCode) else {
                    throw Self.letsfgError(statusCode: http.statusCode, data: data)
                }
                return data
            }
            .decode(type: R.self, decoder: JSONDecoder())
            .eraseToAnyPublisher()
    }

    private func letsfgGetPublisher<R: Decodable>(
        endpoint: String,
        responseType: R.Type
    ) -> AnyPublisher<R, Error> {
        guard let url = URL(string: letsfgBase + endpoint) else {
            return Fail(error: URLError(.badURL)).eraseToAnyPublisher()
        }
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue(letsfgAuthorizationHeader, forHTTPHeaderField: "Authorization")
        return urlSession.dataTaskPublisher(for: req)
            .tryMap { data, response -> Data in
                guard let http = response as? HTTPURLResponse else { throw URLError(.badServerResponse) }
                guard (200..<300).contains(http.statusCode) else {
                    throw Self.letsfgError(statusCode: http.statusCode, data: data)
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

    private func parseLetsFGDate(_ rawValue: String) -> Date {
        if let date = FlightService.iso8601.date(from: rawValue) {
            return date
        }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return fmt.date(from: rawValue) ?? Date()
    }

    private func usableBookingURL(_ rawValue: String?) -> String? {
        guard let rawValue,
              let url = URL(string: rawValue),
              let scheme = url.scheme?.lowercased(),
              scheme == "https" || scheme == "http",
              url.host != nil else { return nil }
        return rawValue
    }

    private func layoverMinutes(after segment: LetsFGAgentSegment, in segments: [LetsFGAgentSegment]) -> Int? {
        guard let index = segments.firstIndex(where: {
            $0.origin == segment.origin && $0.destination == segment.destination &&
            $0.departureTime == segment.departureTime && $0.arrivalTime == segment.arrivalTime
        }),
        segments.indices.contains(index + 1),
        let arrivalRaw = segment.arrivalTime,
        let nextDepartureRaw = segments[index + 1].departureTime else { return nil }

        let arrival = parseOptionalLetsFGDate(arrivalRaw)
        let departure = parseOptionalLetsFGDate(nextDepartureRaw)
        guard let arrival, let departure else { return nil }
        let minutes = Int(departure.timeIntervalSince(arrival) / 60)
        return minutes >= 0 ? minutes : nil
    }

    private func parseOptionalLetsFGDate(_ rawValue: String) -> Date? {
        if let date = FlightService.iso8601.date(from: rawValue) { return date }
        let fmt = DateFormatter()
        fmt.locale = Locale(identifier: "en_US_POSIX")
        fmt.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
        return fmt.date(from: rawValue)
    }

    private static func letsfgError(statusCode: Int, data: Data) -> Error {
        if let apiError = try? JSONDecoder().decode(LetsFGErrorResponse.self, from: data) {
            return LetsFGAPIError.apiError(
                statusCode: statusCode,
                message: apiError.error,
                code: apiError.code,
                retryAfterSeconds: apiError.retryAfterSeconds
            )
        }
        return LetsFGAPIError.httpError(statusCode: statusCode)
    }

    // MARK: - Kiwi Backend

    private func searchWithKiwi(_ query: FlightSearch) {
        let candidates = scoredCities(for: query.criteria)
        let group = DispatchGroup()
        var results: [StopoverRecommendation] = []
        var directComparisonPrice: Double?

        group.enter()
        fetchDirectKiwiPrice(query: query) { price in
            directComparisonPrice = price
            group.leave()
        }

        for city in candidates.prefix(5) {
            group.enter()
            fetchStopoverPair(query: query, stopover: city) { result in
                if let rec = result { results.append(rec) }
                group.leave()
            }
        }

        group.notify(queue: .main) { [weak self] in
            guard let self else { return }
            self.recommendations = results
                .map { rec in
                    self.withDirectComparison(rec, directPrice: directComparisonPrice)
                }
                .sorted {
                    $0.stopoverCity.scores.score(for: query.criteria) >
                    $1.stopoverCity.scores.score(for: query.criteria)
                }
            self.isLoading = false
        }
    }

    private let kiwiBase = "https://api.tequila.kiwi.com"

    private func fetchDirectKiwiPrice(
        query: FlightSearch,
        completion: @escaping (Double?) -> Void
    ) {
        let fmt = DateFormatter()
        fmt.dateFormat = "dd/MM/yyyy"
        let date = fmt.string(from: query.departureDate)

        // A true direct baseline: without max_stopovers=0 the cheapest 2-stop
        // itinerary would masquerade as the "direct" fare and skew savings.
        guard let url = kiwiSearchURL(from: query.origin, to: query.destination, date: date, query: query, maxStopovers: 0) else {
            completion(nil)
            return
        }

        kiwiPublisher(url: url)
            .map { $0.data.first?.price }
            .replaceError(with: nil)
            .receive(on: DispatchQueue.main)
            .sink { price in
                completion(price)
            }
            .store(in: &cancellables)
    }

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

    private func kiwiSearchURL(from: String, to: String, date: String, query: FlightSearch, maxStopovers: Int? = nil) -> URL? {
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
        if let maxStopovers {
            c.queryItems?.append(.init(name: "max_stopovers", value: "\(maxStopovers)"))
        }
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
                bookingSource: .kiwi,
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
                bookingSource: .kiwi,
                stops: leg2.route.dropLast().map {
                    FlightStop(airportCode: $0.flyTo, cityName: $0.cityTo, layoverMinutes: 0)
                }
            ),
            stopoverDays: query.minStopoverDays,
            totalPrice: leg1.price + leg2.price,
            directComparisonPrice: nil,
            badge: badge
        )
    }

    private func withDirectComparison(
        _ recommendation: StopoverRecommendation,
        directPrice: Double?
    ) -> StopoverRecommendation {
        StopoverRecommendation(
            stopoverCity: recommendation.stopoverCity,
            leg1: recommendation.leg1,
            leg2: recommendation.leg2,
            stopoverDays: recommendation.stopoverDays,
            totalPrice: recommendation.totalPrice,
            directComparisonPrice: directPrice,
            badge: recommendation.badge
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
    case apiError(statusCode: Int, message: String, code: String?, retryAfterSeconds: Int?)
    case clarificationNeeded(String)
    case missingSearchId
    case searchExpired
    case searchFailed(status: String)
    case pollingTimedOut

    var errorDescription: String? {
        switch self {
        case .httpError(let code): return "LetsFG API returned HTTP \(code)"
        case .apiError(_, let message, _, let retryAfterSeconds):
            if let retryAfterSeconds {
                let minutes = max(1, Int(ceil(Double(retryAfterSeconds) / 60.0)))
                return "\(message) Try again in about \(minutes) minutes."
            }
            return message
        case .clarificationNeeded(let question): return question
        case .missingSearchId: return "LetsFG did not return a search id"
        case .searchExpired: return "LetsFG search expired before results were ready"
        case .searchFailed(let status): return "LetsFG reported the search as \(status)"
        case .pollingTimedOut: return "LetsFG search timed out while waiting for results"
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
