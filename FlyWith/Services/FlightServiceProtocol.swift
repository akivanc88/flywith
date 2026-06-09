import Foundation
import Combine

protocol FlightServiceProtocol: ObservableObject {
    var isLoading: Bool { get }
    var errorMessage: String? { get }
    var recommendations: [StopoverRecommendation] { get }
    func search(_ query: FlightSearch)
}
