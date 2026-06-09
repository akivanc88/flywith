import Foundation

// MARK: - LetsFG Request Models

struct LetsFGPassengers: Encodable {
    let adults: Int
    let children: Int
    let infants: Int
}

struct LetsFGSearchSegment: Encodable {
    let origin: String
    let destination: String
    let date: String  // "yyyy-MM-dd"
}

struct LetsFGMultiSearchRequest: Encodable {
    let segments: [LetsFGSearchSegment]
    let passengers: LetsFGPassengers
    let currency: String
    let limit: Int
}

struct LetsFGSingleSearchRequest: Encodable {
    let origin: String
    let destination: String
    let date: String  // "yyyy-MM-dd"
    let passengers: LetsFGPassengers
    let currency: String
    let limit: Int
}

// MARK: - LetsFG Response Models

struct LetsFGMultiSearchResponse: Decodable {
    let results: [LetsFGDestinationResult]
}

struct LetsFGDestinationResult: Decodable {
    let destination: String
    let offers: [LetsFGFlightOffer]
}

struct LetsFGSingleSearchResponse: Decodable {
    let results: [LetsFGFlightOffer]
}

struct LetsFGFlightOffer: Decodable {
    let price: Double
    let currency: String
    let outbound: LetsFGItinerary
    let conditions: LetsFGConditions?
    let bookingUrl: String

    enum CodingKeys: String, CodingKey {
        case price, currency, outbound, conditions
        case bookingUrl = "booking_url"
    }
}

struct LetsFGItinerary: Decodable {
    let routeStr: String
    let totalDurationSeconds: Int
    let stopovers: [LetsFGStopover]
    let departureAt: String   // ISO 8601
    let arrivalAt: String     // ISO 8601
    let carrier: String

    enum CodingKeys: String, CodingKey {
        case routeStr = "route_str"
        case totalDurationSeconds = "total_duration_seconds"
        case stopovers, carrier
        case departureAt = "departure_at"
        case arrivalAt = "arrival_at"
    }
}

struct LetsFGStopover: Decodable {
    let airportCode: String
    let cityName: String
    let layoverSeconds: Int

    enum CodingKeys: String, CodingKey {
        case airportCode = "airport_code"
        case cityName = "city_name"
        case layoverSeconds = "layover_seconds"
    }
}

struct LetsFGConditions: Decodable {
    let refundable: Bool?
    let changeable: Bool?
}
