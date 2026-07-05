import Foundation

// MARK: - LetsFG Agent API Requests

struct LetsFGAgentSearchRequest: Encodable {
    let origin: String
    let destination: String
    let dateFrom: String

    enum CodingKeys: String, CodingKey {
        case origin, destination
        case dateFrom = "date_from"
    }
}

struct LetsFGAgentQuerySearchRequest: Encodable {
    let query: String
}

// MARK: - LetsFG Agent API Responses

struct LetsFGSearchStartResponse: Decodable {
    let searchId: String?
    let status: String
    let needsClarification: Bool?
    let followUpQuestions: [String]?

    enum CodingKeys: String, CodingKey {
        case status
        case searchId = "search_id"
        case needsClarification = "needs_clarification"
        case followUpQuestions = "follow_up_questions"
    }
}

struct LetsFGSearchResultsResponse: Decodable {
    let status: String
    let totalResults: Int?
    let cheapestPrice: Double?
    let offers: [LetsFGAgentOffer]?
    let progress: LetsFGSearchProgress?

    enum CodingKeys: String, CodingKey {
        case status, offers, progress
        case totalResults = "total_results"
        case cheapestPrice = "cheapest_price"
    }
}

struct LetsFGSearchProgress: Decodable {
    let checked: Int?
    let total: Int?
    let found: Int?
}

struct LetsFGAgentOffer: Decodable {
    let id: String
    let price: Double
    let currency: String
    let airline: String?
    let airlineCode: String?
    let origin: String
    let destination: String
    let departureTime: String
    let arrivalTime: String
    let durationMinutes: Int
    let stops: Int
    let googleFlightsPrice: Double?
    let segments: [LetsFGAgentSegment]?

    enum CodingKeys: String, CodingKey {
        case id, price, currency, airline, origin, destination, stops, segments
        case airlineCode = "airline_code"
        case departureTime = "departure_time"
        case arrivalTime = "arrival_time"
        case durationMinutes = "duration_minutes"
        case googleFlightsPrice = "google_flights_price"
    }
}

struct LetsFGAgentSegment: Decodable {
    let airline: String?
    let airlineCode: String?
    let origin: String?
    let destination: String?
    let departureTime: String?
    let arrivalTime: String?
    let durationMinutes: Int?

    enum CodingKeys: String, CodingKey {
        case airline, origin, destination
        case airlineCode = "airline_code"
        case departureTime = "departure_time"
        case arrivalTime = "arrival_time"
        case durationMinutes = "duration_minutes"
    }
}

struct LetsFGErrorResponse: Decodable {
    let error: String
    let code: String?
    let retryAfterSeconds: Int?

    enum CodingKeys: String, CodingKey {
        case error, code
        case retryAfterSeconds = "retry_after_seconds"
    }
}
