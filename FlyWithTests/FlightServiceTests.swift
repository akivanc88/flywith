import XCTest
@testable import FlyWith

// MARK: - Group 1: worth-it rubric v2

final class WorthItScoreTests: XCTestCase {

    private let neutral = StopoverScores(family: 3, seniors: 3, budget: 3, explorer: 3, overall: 3)

    private func makeRec(
        totalPrice: Double,
        directPrice: Double?,
        stopoverDays: Int,
        scores: StopoverScores = StopoverScores(family: 3, seniors: 3, budget: 3, explorer: 3, overall: 3),
        legHours: (Double, Double) = (8, 3),
        stops: Int = 0,
        visaFree: [String] = ["CA"],
        hotel: Int = 100,
        directHours: Double? = 20
    ) -> StopoverRecommendation {
        var rec = StopoverRecommendation(
            stopoverCity: StopoverCity(
                iataCode: "TST", cityName: "Test City", countryName: "Testland",
                emoji: "T", visaFreeCountries: visaFree,
                scores: scores,
                highlights: [], estimatedHotelPerNight: hotel,
                averageTemperature: 20, visaSummary: "",
                airportComfort: "", familyLogistics: "",
                accessibilityNotes: "", researchGap: ""
            ),
            leg1: makeLeg(price: totalPrice * 0.6, minutes: Int(legHours.0 * 60), stops: stops),
            leg2: makeLeg(price: totalPrice * 0.4, minutes: Int(legHours.1 * 60), stops: 0),
            stopoverDays: stopoverDays,
            totalPrice: totalPrice,
            directComparisonPrice: directPrice,
            badge: .topRated
        )
        rec.party = WorthItRubric.Party(adults: 2, children: 2, infants: 0, seniors: 0)
        rec.directHours = directHours
        return rec
    }

    private func makeLeg(price: Double, minutes: Int, stops: Int) -> FlightLeg {
        FlightLeg(
            origin: "A", originCity: "Alpha",
            destination: "B", destinationCity: "Beta",
            departureTime: Date(), arrivalTime: Date(),
            durationMinutes: minutes, airline: "AC",
            price: price, currency: "CAD",
            bookingURL: "https://letsfg.co", bookingSource: .demo,
            stops: (0..<stops).map { _ in FlightStop(airportCode: "DOH", cityName: "Doha", layoverMinutes: 90) }
        )
    }

    func testScoreIsAlwaysInRange() {
        let rec = makeRec(totalPrice: 5000, directPrice: 100, stopoverDays: 1,
                          scores: StopoverScores(family: 0, seniors: 0, budget: 0, explorer: 0, overall: 0), visaFree: [])
        XCTAssertGreaterThanOrEqual(rec.worthItScore, 0)
        XCTAssertLessThanOrEqual(rec.worthItScore, 100)
    }

    func testPerfectOptionScores100() {
        let perfect = StopoverScores(family: 5, seniors: 5, budget: 5, explorer: 5, overall: 5)
        let rec = makeRec(totalPrice: 500, directPrice: 1500, stopoverDays: 5, scores: perfect, legHours: (1, 1), hotel: 0)
        XCTAssertEqual(rec.worthItScore, 100)
    }

    func testWeightsSumTo100() {
        let w = WorthItRubric.weights
        XCTAssertEqual(w.fare + w.fatigue + w.visa + w.hotels + w.fit + w.stay, 100)
    }

    func testMissingBaselineScoresFareAndFatigueNeutral() {
        let rec = makeRec(totalPrice: 1000, directPrice: nil, stopoverDays: 3, directHours: nil)
        XCTAssertNil(rec.savings)
        XCTAssertFalse(rec.hasSavings)
        XCTAssertEqual(rec.rubric.pillars.fare, 0.5, "unknown baseline must score the fare axis neutral, not as savings")
        XCTAssertEqual(rec.rubric.pillars.fatigue, 0.5)
    }

    func testLongerLegsAndConnectionsLowerFatigue() {
        let short = makeRec(totalPrice: 1000, directPrice: 1000, stopoverDays: 3, legHours: (10, 3))
        let long = makeRec(totalPrice: 1000, directPrice: 1000, stopoverDays: 3, legHours: (19, 3))
        let connecting = makeRec(totalPrice: 1000, directPrice: 1000, stopoverDays: 3, legHours: (10, 3), stops: 1)
        XCTAssertEqual(short.rubric.pillars.fatigue, 1)
        XCTAssertLessThan(long.worthItScore, short.worthItScore)
        XCTAssertEqual(connecting.rubric.pillars.fatigue, 0.75, "1.25 relief (capped later) minus 0.5 for the connection")
    }

    func testVisaForPassportCounts() {
        var rec = makeRec(totalPrice: 1000, directPrice: 1000, stopoverDays: 3, visaFree: ["CA"])
        XCTAssertEqual(rec.rubric.pillars.visa, 1)
        rec.passport = "IN"
        XCTAssertEqual(rec.rubric.pillars.visa, 0)
    }

    func testProfileAndPartyChangeTheScore() {
        let scores = StopoverScores(family: 5, seniors: 2, budget: 3, explorer: 3, overall: 3)
        var rec = makeRec(totalPrice: 1000, directPrice: 1000, stopoverDays: 3, scores: scores)
        let forKids = rec.worthItScore
        rec.party = WorthItRubric.Party(adults: 2, children: 0, infants: 0, seniors: 2)
        rec.criteria = .withSeniors
        XCTAssertLessThan(rec.worthItScore, forKids)
        XCTAssertEqual(WorthItRubric.profiles(for: rec.party, criteria: .budgetFocused), [.seniors, .budget])
        XCTAssertEqual(WorthItRubric.profiles(for: rec.party, criteria: .explorer), [.seniors, .explorer])
        XCTAssertEqual(WorthItRubric.fitRating(scores, []), 3)
    }

    func testRoomsAndHotelTotalsCoverTheWholeParty() {
        XCTAssertEqual(WorthItRubric.rooms(for: .init(adults: 2, children: 2, infants: 1, seniors: 0)), 1)
        XCTAssertEqual(WorthItRubric.rooms(for: .init(adults: 2, children: 2, infants: 0, seniors: 1)), 2)
        XCTAssertEqual(WorthItRubric.nights(forDays: 5), 4)
        var rec = makeRec(totalPrice: 1000, directPrice: 1000, stopoverDays: 5, hotel: 145)
        rec.party = .init(adults: 2, children: 2, infants: 0, seniors: 1)
        XCTAssertEqual(rec.estimatedHotelTotal, 1160, "the agent's golden Dubai hotel estimate")
    }
}

// MARK: - Group 2: LetsFG agent offer mapping

final class LetsFGMappingTests: XCTestCase {

    private func makeOffer(
        price: Double,
        departureTime: String = "2026-09-15T21:00:00",
        arrivalTime: String = "2026-09-16T13:00:00",
        carrier: String = "EK",
        durationMinutes: Int = 960,
        segments: [LetsFGAgentSegment]? = nil,
        googleFlightsPrice: Double? = nil,
        bookingURL: String? = nil
    ) -> LetsFGAgentOffer {
        LetsFGAgentOffer(
            id: "ws_off_test",
            price: price,
            currency: "CAD",
            airline: carrier,
            airlineCode: carrier,
            origin: "YYZ",
            destination: "DXB",
            departureTime: departureTime,
            arrivalTime: arrivalTime,
            durationMinutes: durationMinutes,
            stops: segments?.count ?? 0,
            googleFlightsPrice: googleFlightsPrice,
            segments: segments,
            bookingURL: bookingURL
        )
    }

    private var service: FlightService { FlightService() }
    private var city: StopoverCity { StopoverCity.sampleCities[0] }

    func testPriceSumsCorrectly() {
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: makeOffer(price: 926),
            leg2: makeOffer(price: 277),
            directComparisonPrice: 1203
        )
        XCTAssertEqual(rec.totalPrice, 1203, accuracy: 0.01)
        XCTAssertEqual(rec.leg1.price, 926, accuracy: 0.01)
        XCTAssertEqual(rec.leg2.price, 277, accuracy: 0.01)
    }

    func testDirectComparisonUsesFetchedBaseline() {
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: makeOffer(price: 500),
            leg2: makeOffer(price: 300),
            directComparisonPrice: 950
        )
        XCTAssertEqual(rec.directComparisonPrice ?? .nan, 950, accuracy: 0.01)
        XCTAssertEqual(rec.savings ?? .nan, 150, accuracy: 0.01)
    }

    func testDurationMapsFromAgentOffer() {
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: makeOffer(price: 500, durationMinutes: 960),
            leg2: makeOffer(price: 200, durationMinutes: 210),
            directComparisonPrice: 700
        )
        XCTAssertEqual(rec.leg1.durationMinutes, 960)
        XCTAssertEqual(rec.leg2.durationMinutes, 210)
    }

    func testSegmentsMapToFlightStops() {
        let leg1 = makeOffer(
            price: 900,
            segments: [
                LetsFGAgentSegment(
                    airline: "BA", airlineCode: "BA",
                    origin: "YYZ", destination: "LHR",
                    departureTime: nil, arrivalTime: nil,
                    durationMinutes: nil
                ),
                LetsFGAgentSegment(
                    airline: "BA", airlineCode: "BA",
                    origin: "LHR", destination: "DXB",
                    departureTime: nil, arrivalTime: nil,
                    durationMinutes: nil
                )
            ]
        )
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: leg1,
            leg2: makeOffer(price: 300),
            directComparisonPrice: 1200
        )
        XCTAssertEqual(rec.leg1.stops.count, 1)
        XCTAssertEqual(rec.leg1.stops.first?.airportCode, "LHR")
    }

    func testCarrierMappedToAirline() {
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: makeOffer(price: 500, carrier: "QR"),
            leg2: makeOffer(price: 300, carrier: "TK"),
            directComparisonPrice: 800
        )
        XCTAssertEqual(rec.leg1.airline, "QR")
        XCTAssertEqual(rec.leg2.airline, "TK")
    }

    func testOfferSpecificBookingURLIsPreserved() {
        let leg = service.mapLeg(offer: makeOffer(price: 500, bookingURL: "https://letsfg.co/offers/abc"),
                                 origin: "YYZ", originCity: "Toronto", destination: "DXB", destinationCity: "Dubai")
        XCTAssertEqual(leg.bookingURL, "https://letsfg.co/offers/abc")
        XCTAssertEqual(leg.bookingSource, .letsfg)
    }

    func testMissingOrInvalidBookingURLDoesNotFabricateHomepageLink() {
        let missing = service.mapLeg(offer: makeOffer(price: 500), origin: "YYZ", originCity: "Toronto",
                                     destination: "DXB", destinationCity: "Dubai")
        let invalid = service.mapLeg(offer: makeOffer(price: 500, bookingURL: "javascript:alert(1)"),
                                     origin: "YYZ", originCity: "Toronto", destination: "DXB", destinationCity: "Dubai")
        XCTAssertNil(missing.bookingURL)
        XCTAssertNil(invalid.bookingURL)
    }

    func testLayoverIsComputedFromAdjacentSegments() {
        let segments = [
            LetsFGAgentSegment(airline: "BA", airlineCode: "BA", origin: "YYZ", destination: "LHR",
                               departureTime: "2026-09-15T18:00:00Z", arrivalTime: "2026-09-16T06:00:00Z", durationMinutes: 420),
            LetsFGAgentSegment(airline: "BA", airlineCode: "BA", origin: "LHR", destination: "DXB",
                               departureTime: "2026-09-16T08:30:00Z", arrivalTime: "2026-09-16T18:00:00Z", durationMinutes: 420)
        ]
        let leg = service.mapLeg(offer: makeOffer(price: 500, segments: segments), origin: "YYZ", originCity: "Toronto",
                                 destination: "DXB", destinationCity: "Dubai")
        XCTAssertEqual(leg.stops.first?.layoverMinutes, 150)
    }

    func testUnknownAndContradictoryLayoversStayUnknown() {
        let missingTimes = [
            LetsFGAgentSegment(airline: nil, airlineCode: nil, origin: "YYZ", destination: "LHR",
                               departureTime: nil, arrivalTime: nil, durationMinutes: nil),
            LetsFGAgentSegment(airline: nil, airlineCode: nil, origin: "LHR", destination: "DXB",
                               departureTime: nil, arrivalTime: nil, durationMinutes: nil)
        ]
        let leg = service.mapLeg(offer: makeOffer(price: 500, segments: missingTimes), origin: "YYZ", originCity: "Toronto",
                                 destination: "DXB", destinationCity: "Dubai")
        XCTAssertNil(leg.stops.first?.layoverMinutes)
    }
}

// MARK: - Group 3: Mock data fallback

final class MockFallbackTests: XCTestCase {

    func testUseMockDataWhenNoKeySet() {
        if ProcessInfo.processInfo.environment["LETSFG_API_KEY"] == nil &&
           ProcessInfo.processInfo.environment["KIWI_API_KEY"] == nil {
            XCTAssertTrue(FlightService().useMockData)
        }
    }

    func testLoadMockRecommendationsReturnsResults() {
        let service = FlightService()
        service.loadMockRecommendations(for: FlightSearch())
        XCTAssertFalse(service.recommendations.isEmpty)
        XCTAssertLessThanOrEqual(service.recommendations.count, 5)
    }

    func testMockRecommendationsHavePositivePrices() {
        let service = FlightService()
        service.loadMockRecommendations(for: FlightSearch())
        for rec in service.recommendations {
            XCTAssertGreaterThan(rec.leg1.price, 0)
            XCTAssertGreaterThan(rec.leg2.price, 0)
            XCTAssertEqual(rec.totalPrice, rec.leg1.price + rec.leg2.price, accuracy: 0.01)
        }
    }

    /// The launch video shows these demo-mode screens for YYZ → BOM, 2 adults + 2 children, Diaspora Family.
    func testLaunchVideoDemoScreensStayExact() {
        let service = FlightService()
        var query = FlightSearch()
        query.origin = "YYZ"; query.destination = "BOM"
        query.adultCount = 2; query.childCount = 2; query.criteria = .withKids
        service.loadMockRecommendations(for: query)
        let byCode = Dictionary(uniqueKeysWithValues: service.recommendations.map { ($0.stopoverCity.iataCode, $0) })
        XCTAssertEqual(byCode["DXB"]?.worthItScore, 59)
        XCTAssertEqual(byCode["SIN"]?.worthItScore, 55)
        XCTAssertEqual(byCode["SIN"]?.savings, -218)
        XCTAssertEqual(byCode["SIN"]?.estimatedHotelTotal, 360)
        XCTAssertEqual(byCode["DXB"]?.estimatedHotelTotal, 240)
        XCTAssertEqual(byCode["SIN"]?.worthItSummary, "Comfort upgrade")
        XCTAssertEqual(service.recommendations.first?.stopoverCity.iataCode, "SIN")
    }

    func testAddingGrandmaChangesTheScores() {
        let service = FlightService()
        var query = FlightSearch()
        query.adultCount = 2; query.childCount = 2
        service.loadMockRecommendations(for: query)
        let before = service.recommendations.map(\.worthItScore)
        query.seniorCount = 1
        service.loadMockRecommendations(for: query)
        XCTAssertNotEqual(service.recommendations.map(\.worthItScore), before)
        XCTAssertEqual(service.recommendations.first?.rooms, 2)
        XCTAssertEqual(query.totalPassengers, 5)
    }

    func testMockRecommendationsSortedByCriteria() {
        let service = FlightService()
        var query = FlightSearch()
        query.criteria = .budgetFocused
        service.loadMockRecommendations(for: query)
        let scores = service.recommendations.map { $0.stopoverCity.scores.score(for: .budgetFocused) }
        XCTAssertEqual(scores, scores.sorted(by: >))
    }
}

// MARK: - Group 4: LetsFG agent JSON decoding

final class LetsFGDecodingTests: XCTestCase {

    func testEncodeStructuredSearchRequest() throws {
        let request = LetsFGAgentSearchRequest(origin: "LHR", destination: "BCN", dateFrom: "2026-08-15", adults: 2, children: 1, infants: 1, currency: "CAD", limit: 20)
        let data = try JSONEncoder().encode(request)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        XCTAssertEqual(object?["origin"] as? String, "LHR")
        XCTAssertEqual(object?["destination"] as? String, "BCN")
        XCTAssertEqual(object?["date_from"] as? String, "2026-08-15")
        XCTAssertEqual(object?["adults"] as? Int, 2)
        XCTAssertEqual(object?["children"] as? Int, 1)
        XCTAssertEqual(object?["infants"] as? Int, 1)
        XCTAssertEqual(object?["currency"] as? String, "CAD")
        XCTAssertEqual(object?["limit"] as? Int, 20)
    }

    func testSearchRequestUsesPassengerCountsAndBoundsLimit() {
        var query = FlightSearch()
        query.adultCount = 3
        query.childCount = 2
        query.infantCount = 1
        query.resultLimit = 500
        let request = FlightService().makeLetsFGSearchRequest(origin: "YYZ", destination: "DXB", date: "2026-09-15", query: query)
        XCTAssertEqual(request.adults, 3)
        XCTAssertEqual(request.children, 2)
        XCTAssertEqual(request.infants, 1)
        XCTAssertEqual(request.currency, "CAD")
        XCTAssertEqual(request.limit, 50)
    }

    func testEncodeQuerySearchRequest() throws {
        let request = LetsFGAgentQuerySearchRequest(query: "London to Barcelona August 15 2026")
        let data = try JSONEncoder().encode(request)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: String]
        XCTAssertEqual(object?["query"], "London to Barcelona August 15 2026")
    }

    func testDecodeSearchStartResponse() throws {
        let json = """
        {
          "search_id": "ws_abc123",
          "status": "searching",
          "parsed": {
            "origin": "LHR",
            "destination": "BCN"
          }
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(LetsFGSearchStartResponse.self, from: json)
        XCTAssertEqual(response.searchId, "ws_abc123")
        XCTAssertEqual(response.status, "searching")
    }

    func testDecodeClarificationResponse() throws {
        let json = """
        {
          "status": "needs_clarification",
          "needs_clarification": true,
          "follow_up_questions": ["Which London airport?"]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(LetsFGSearchStartResponse.self, from: json)
        XCTAssertEqual(response.needsClarification, true)
        XCTAssertEqual(response.followUpQuestions?.first, "Which London airport?")
    }

    func testDecodeCompletedResultsWithGoogleFlightsPrice() throws {
        let json = """
        {
          "status": "completed",
          "total_results": 1,
          "cheapest_price": 89.50,
          "offers": [
            {
              "id": "ws_off_abc123",
              "price": 89.50,
              "currency": "EUR",
              "airline": "Ryanair",
              "airline_code": "FR",
              "origin": "STN",
              "destination": "BCN",
              "departure_time": "2026-06-15T06:25:00",
              "arrival_time": "2026-06-15T09:30:00",
              "duration_minutes": 125,
              "stops": 0,
              "google_flights_price": 109.00,
              "segments": []
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(LetsFGSearchResultsResponse.self, from: json)
        let offer = try XCTUnwrap(response.offers?.first)
        XCTAssertEqual(response.status, "completed")
        XCTAssertEqual(offer.price, 89.50, accuracy: 0.01)
        let googleFlightsPrice = try XCTUnwrap(offer.googleFlightsPrice)
        XCTAssertEqual(googleFlightsPrice, 109.00, accuracy: 0.01)
        XCTAssertEqual(offer.durationMinutes, 125)
    }

    func testDecodeRateLimitError() throws {
        let json = """
        {
          "error": "Agent rate limited (search limit).",
          "code": "AGENT_RATE_LIMITED",
          "retry_after_seconds": 393
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(LetsFGErrorResponse.self, from: json)
        XCTAssertEqual(response.code, "AGENT_RATE_LIMITED")
        XCTAssertEqual(response.retryAfterSeconds, 393)
    }
}
