import XCTest
@testable import FlyWith

// MARK: - Group 1: worthItScore (pure computation, no mocking)

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
                emoji: "🧪", visaFreeCountries: [],
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
        // fareComponent = max(0, min(30, (1072 - 772 + 300)/20)) = min(30, 30) = 30
        // with zero comfort and zero stopover days, score == 30
        let scores = StopoverScores(family: 0, seniors: 0, budget: 0, explorer: 0, overall: 0)
        let rec = makeRec(totalPrice: 772, directPrice: 1072, stopoverDays: 0, scores: scores)
        XCTAssertEqual(rec.worthItScore, 30)
    }
}

// MARK: - Group 2: LetsFG response → StopoverRecommendation mapping

final class LetsFGMappingTests: XCTestCase {

    private func makeOffer(
        price: Double,
        departureISO: String = "2026-09-15T21:00:00Z",
        arrivalISO: String = "2026-09-16T13:00:00Z",
        carrier: String = "EK",
        durationSec: Int = 57600,
        stopovers: [LetsFGStopover] = [],
        bookingUrl: String = "https://letsfg.co/book/abc"
    ) -> LetsFGFlightOffer {
        LetsFGFlightOffer(
            price: price,
            currency: "CAD",
            outbound: LetsFGItinerary(
                routeStr: "YYZ-DXB",
                totalDurationSeconds: durationSec,
                stopovers: stopovers,
                departureAt: departureISO,
                arrivalAt: arrivalISO,
                carrier: carrier
            ),
            conditions: nil,
            bookingUrl: bookingUrl
        )
    }

    private var service: FlightService { FlightService() }
    private var city: StopoverCity { StopoverCity.sampleCities[0] }

    func testPriceSumsCorrectly() {
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: makeOffer(price: 926),
            leg2: makeOffer(price: 277)
        )
        XCTAssertEqual(rec.totalPrice, 1203, accuracy: 0.01)
        XCTAssertEqual(rec.leg1.price, 926, accuracy: 0.01)
        XCTAssertEqual(rec.leg2.price, 277, accuracy: 0.01)
    }

    func testDurationConvertsFromSeconds() {
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: makeOffer(price: 500, durationSec: 57600),  // 960 min
            leg2: makeOffer(price: 200, durationSec: 12600)   // 210 min
        )
        XCTAssertEqual(rec.leg1.durationMinutes, 960)
        XCTAssertEqual(rec.leg2.durationMinutes, 210)
    }

    func testStopoversMappedToFlightStops() {
        let lhr = LetsFGStopover(airportCode: "LHR", cityName: "London", layoverSeconds: 5400)
        let leg1 = makeOffer(price: 900, stopovers: [lhr])
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: leg1,
            leg2: makeOffer(price: 300)
        )
        XCTAssertEqual(rec.leg1.stops.count, 1)
        XCTAssertEqual(rec.leg1.stops.first?.airportCode, "LHR")
        XCTAssertEqual(rec.leg1.stops.first?.layoverMinutes, 90)  // 5400s / 60
    }

    func testBookingURLPropagates() {
        let url = "https://letsfg.co/book/test999"
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: makeOffer(price: 500),
            leg2: makeOffer(price: 300, bookingUrl: url)
        )
        XCTAssertEqual(rec.leg2.bookingURL, url)
    }

    func testCarrierMappedToAirline() {
        let rec = service.buildLetsFGRecommendation(
            query: FlightSearch(),
            stopover: city,
            leg1: makeOffer(price: 500, carrier: "QR"),
            leg2: makeOffer(price: 300, carrier: "TK")
        )
        XCTAssertEqual(rec.leg1.airline, "QR")
        XCTAssertEqual(rec.leg2.airline, "TK")
    }
}

// MARK: - Group 3: Mock data fallback

final class MockFallbackTests: XCTestCase {

    func testUseMockDataWhenNoKeySet() {
        // In the test environment both env vars are absent by default
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

// MARK: - Group 4: JSON decoding of LetsFG model structs

final class LetsFGDecodingTests: XCTestCase {

    func testDecodeMultiSearchResponse() throws {
        let json = """
        {
          "results": [
            {
              "destination": "DXB",
              "offers": [
                {
                  "price": 926.50,
                  "currency": "CAD",
                  "booking_url": "https://letsfg.co/book/abc",
                  "outbound": {
                    "route_str": "YYZ-DXB",
                    "total_duration_seconds": 57600,
                    "stopovers": [],
                    "departure_at": "2026-09-15T21:00:00Z",
                    "arrival_at": "2026-09-16T13:00:00Z",
                    "carrier": "EK"
                  }
                }
              ]
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(LetsFGMultiSearchResponse.self, from: json)
        XCTAssertEqual(response.results.count, 1)
        XCTAssertEqual(response.results[0].destination, "DXB")
        XCTAssertEqual(response.results[0].offers[0].price, 926.50, accuracy: 0.01)
        XCTAssertEqual(response.results[0].offers[0].outbound.carrier, "EK")
        XCTAssertEqual(response.results[0].offers[0].outbound.totalDurationSeconds, 57600)
    }

    func testDecodeStopoverSnakeCaseKeys() throws {
        let json = """
        {
          "airport_code": "LHR",
          "city_name": "London",
          "layover_seconds": 5400
        }
        """.data(using: .utf8)!

        let stopover = try JSONDecoder().decode(LetsFGStopover.self, from: json)
        XCTAssertEqual(stopover.airportCode, "LHR")
        XCTAssertEqual(stopover.cityName, "London")
        XCTAssertEqual(stopover.layoverSeconds, 5400)
    }

    func testDecodeSingleSearchResponse() throws {
        let json = """
        {
          "results": [
            {
              "price": 277.00,
              "currency": "CAD",
              "booking_url": "https://letsfg.co/book/xyz",
              "outbound": {
                "route_str": "DXB-BOM",
                "total_duration_seconds": 12600,
                "stopovers": [],
                "departure_at": "2026-09-20T23:40:00Z",
                "arrival_at": "2026-09-21T03:10:00Z",
                "carrier": "EK"
              }
            }
          ]
        }
        """.data(using: .utf8)!

        let response = try JSONDecoder().decode(LetsFGSingleSearchResponse.self, from: json)
        let offer = try XCTUnwrap(response.results.first)
        XCTAssertEqual(offer.price, 277.00, accuracy: 0.01)
        XCTAssertEqual(offer.outbound.routeStr, "DXB-BOM")
    }

    func testDecodeOfferWithConditions() throws {
        let json = """
        {
          "price": 500.00,
          "currency": "CAD",
          "booking_url": "https://letsfg.co/book/cond",
          "outbound": {
            "route_str": "YYZ-IST",
            "total_duration_seconds": 43200,
            "stopovers": [],
            "departure_at": "2026-09-15T08:00:00Z",
            "arrival_at": "2026-09-16T02:00:00Z",
            "carrier": "TK"
          },
          "conditions": {
            "refundable": true,
            "changeable": false
          }
        }
        """.data(using: .utf8)!

        let offer = try JSONDecoder().decode(LetsFGFlightOffer.self, from: json)
        XCTAssertEqual(offer.conditions?.refundable, true)
        XCTAssertEqual(offer.conditions?.changeable, false)
    }
}
