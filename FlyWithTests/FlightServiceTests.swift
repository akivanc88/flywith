import XCTest
@testable import FlyWith

// MARK: - Group 1: worthItScore

final class WorthItScoreTests: XCTestCase {

    private func makeRec(
        totalPrice: Double,
        directPrice: Double,
        stopoverDays: Int,
        scores: StopoverScores = StopoverScores(family: 3, seniors: 3, budget: 3, explorer: 3, overall: 3)
    ) -> StopoverRecommendation {
        StopoverRecommendation(
            stopoverCity: StopoverCity(
                iataCode: "TST", cityName: "Test City", countryName: "Testland",
                emoji: "T", visaFreeCountries: [],
                scores: scores,
                highlights: [], estimatedHotelPerNight: 100,
                averageTemperature: 20, visaSummary: "",
                airportComfort: "", familyLogistics: "",
                accessibilityNotes: "", researchGap: ""
            ),
            leg1: makeLeg(price: totalPrice * 0.6),
            leg2: makeLeg(price: totalPrice * 0.4),
            stopoverDays: stopoverDays,
            totalPrice: totalPrice,
            directComparisonPrice: directPrice,
            badge: .topRated
        )
    }

    private func makeLeg(price: Double) -> FlightLeg {
        FlightLeg(
            origin: "A", originCity: "Alpha",
            destination: "B", destinationCity: "Beta",
            departureTime: Date(), arrivalTime: Date(),
            durationMinutes: 120, airline: "AC",
            price: price, currency: "CAD",
            bookingURL: "https://letsfg.co", stops: []
        )
    }

    func testScoreIsAlwaysInRange() {
        let rec = makeRec(totalPrice: 5000, directPrice: 100, stopoverDays: 1,
                          scores: StopoverScores(family: 0, seniors: 0, budget: 0, explorer: 0, overall: 0))
        XCTAssertGreaterThanOrEqual(rec.worthItScore, 0)
        XCTAssertLessThanOrEqual(rec.worthItScore, 100)
    }

    func testHighSavingsHighComfortMaxesScore() {
        let scores = StopoverScores(family: 5, seniors: 5, budget: 5, explorer: 5, overall: 5)
        let rec = makeRec(totalPrice: 500, directPrice: 1500, stopoverDays: 7, scores: scores)
        XCTAssertGreaterThanOrEqual(rec.worthItScore, 80)
    }

    func testLowSavingsLowComfortLowScore() {
        let scores = StopoverScores(family: 1, seniors: 1, budget: 1, explorer: 1, overall: 1)
        let rec = makeRec(totalPrice: 2000, directPrice: 1000, stopoverDays: 1, scores: scores)
        XCTAssertLessThan(rec.worthItScore, 40)
    }

    func testZeroSavingsStillProducesPartialScore() {
        let scores = StopoverScores(family: 4, seniors: 4, budget: 4, explorer: 4, overall: 4)
        let rec = makeRec(totalPrice: 1072, directPrice: 1072, stopoverDays: 5, scores: scores)
        XCTAssertGreaterThan(rec.worthItScore, 0)
        XCTAssertLessThan(rec.worthItScore, 100)
    }

    func testFareComponentCapsAt30() {
        let scores = StopoverScores(family: 0, seniors: 0, budget: 0, explorer: 0, overall: 0)
        let rec = makeRec(totalPrice: 772, directPrice: 1072, stopoverDays: 0, scores: scores)
        XCTAssertEqual(rec.worthItScore, 30)
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
        googleFlightsPrice: Double? = nil
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
            segments: segments
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
        XCTAssertEqual(rec.directComparisonPrice, 950, accuracy: 0.01)
        XCTAssertEqual(rec.savings, 150, accuracy: 0.01)
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
        let request = LetsFGAgentSearchRequest(origin: "LHR", destination: "BCN", dateFrom: "2026-08-15")
        let data = try JSONEncoder().encode(request)
        let object = try JSONSerialization.jsonObject(with: data) as? [String: String]
        XCTAssertEqual(object?["origin"], "LHR")
        XCTAssertEqual(object?["destination"], "BCN")
        XCTAssertEqual(object?["date_from"], "2026-08-15")
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
        XCTAssertEqual(offer.googleFlightsPrice, 109.00, accuracy: 0.01)
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
