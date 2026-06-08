import SwiftUI

struct RecommendationsView: View {
    let search: FlightSearch
    @ObservedObject var service: FlightService

    var body: some View {
        Group {
            if service.isLoading {
                LoadingView()
            } else if service.recommendations.isEmpty {
                EmptyStateView(criteria: search.criteria)
            } else {
                resultsList
            }
        }
        .navigationTitle("Stopover Picks")
        .navigationBarTitleDisplayMode(.inline)
    }

    var resultsList: some View {
        ScrollView {
            VStack(spacing: 0) {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(search.origin) → \(search.destination)")
                            .font(.subheadline).fontWeight(.semibold)
                        Text("\(search.criteria.emoji) \(search.criteria.displayName)")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(service.recommendations.count) options")
                        .font(.caption).foregroundStyle(.secondary)
                }
                .padding()
                .background(Color(.systemGroupedBackground))

                DirectFlightBanner().padding()

                LazyVStack(spacing: 16) {
                    ForEach(service.recommendations) { rec in
                        NavigationLink(destination: RecommendationDetailView(recommendation: rec)) {
                            RecommendationCard(recommendation: rec, criteria: search.criteria)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal)
                .padding(.bottom, 32)
            }
        }
    }
}

// MARK: - Loading

struct LoadingView: View {
    @State private var dotCount = 0
    let timer = Timer.publish(every: 0.4, on: .main, in: .common).autoconnect()

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "airplane.circle.fill")
                .font(.system(size: 60)).foregroundStyle(FWColor.brandPrimary)
                .rotationEffect(.degrees(Double(dotCount) * 15))
                .animation(.easeInOut(duration: 0.4), value: dotCount)
            Text("Scanning routes\(String(repeating: ".", count: dotCount % 4))")
                .font(.headline)
            Text("Checking fares for 5 stopover cities\nvia Kiwi.com")
                .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onReceive(timer) { _ in dotCount += 1 }
    }
}

// MARK: - Recommendation Card

struct RecommendationCard: View {
    let recommendation: StopoverRecommendation
    let criteria: TravelerCriteria

    private var score: Double { recommendation.stopoverCity.scores.score(for: criteria) }
    private var city: StopoverCity { recommendation.stopoverCity }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 12) {
                Text(city.emoji).font(.system(size: 40))
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(city.cityName).font(.headline)
                        Text(recommendation.badge.rawValue)
                            .font(.caption2).fontWeight(.bold)
                            .padding(.horizontal, 8).padding(.vertical, 3)
                            .background(FWColor.surfaceAccentSoft)
                            .foregroundStyle(FWColor.brandAccent)
                            .clipShape(Capsule())
                    }
                    HStack(spacing: 4) {
                        ForEach(0..<5) { i in
                            Image(systemName: i < Int(score.rounded()) ? "star.fill" : "star")
                                .font(.system(size: 10)).foregroundStyle(FWColor.brandHighlight)
                        }
                        Text(String(format: "%.1f", score)).font(.caption).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    Text("CAD \(Int(recommendation.totalPrice))").font(.title3).fontWeight(.bold)
                    Text("total · \(recommendation.stopoverDays) days").font(.caption2).foregroundStyle(.secondary)
                }
            }
            .padding(16)

            Divider()

            HStack(spacing: 0) {
                LegSummary(leg: recommendation.leg1, label: "Leg 1")
                Divider()
                VStack(spacing: 4) {
                    Text("\(recommendation.stopoverDays) days").font(.caption2).fontWeight(.bold).foregroundStyle(FWColor.brandPrimary)
                    Text(city.cityName).font(.caption2).foregroundStyle(.secondary)
                }
                .frame(width: 60)
                Divider()
                LegSummary(leg: recommendation.leg2, label: "Leg 2")
            }
            .frame(height: 70)

            Divider()

            HStack {
                if recommendation.hasSavings {
                    Label("Save CAD \(Int(recommendation.savings)) vs direct", systemImage: "tag.fill")
                        .font(.caption).fontWeight(.semibold).foregroundStyle(FWColor.success)
                } else {
                    Label("Just CAD \(Int(-recommendation.savings)) more — with a \(recommendation.stopoverDays)-day bonus trip", systemImage: "sparkles")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(FWColor.surfaceSunken)
        }
        .background(.white)
        .clipShape(RoundedRectangle(cornerRadius: FWRadius.xl2))
        .fwShadow(.md)
    }
}

struct LegSummary: View {
    let leg: FlightLeg
    let label: String

    var body: some View {
        VStack(spacing: 3) {
            Text(label).font(.caption2).foregroundStyle(.secondary)
            HStack(spacing: 4) {
                Text(leg.origin).font(.caption).fontWeight(.bold)
                Image(systemName: "arrow.right").font(.system(size: 9))
                Text(leg.destination).font(.caption).fontWeight(.bold)
            }
            Text(leg.durationFormatted).font(.caption2).foregroundStyle(.secondary)
            Text("CAD \(Int(leg.price))").font(.caption2).fontWeight(.semibold).foregroundStyle(FWColor.brandPrimary)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Direct Flight Banner

struct DirectFlightBanner: View {
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "info.circle.fill").foregroundStyle(FWColor.brandHighlight)
            VStack(alignment: .leading, spacing: 2) {
                Text("Direct comparison: ~CAD $1,072")
                    .font(.subheadline).fontWeight(.semibold)
                Text("A quick connection with no destination. See if FlyWith can beat it — and give you a vacation too.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(FWColor.surfaceGoldSoft)
        .clipShape(RoundedRectangle(cornerRadius: FWRadius.lg))
        .overlay(RoundedRectangle(cornerRadius: FWRadius.lg).stroke(FWColor.brandHighlight.opacity(0.35)))
    }
}

// MARK: - Empty State

struct EmptyStateView: View {
    let criteria: TravelerCriteria

    var body: some View {
        VStack(spacing: 16) {
            Text("🛫").font(.system(size: 60))
            Text("No results found").font(.headline)
            Text("We couldn't find stopover options for this route. Try widening your dates or check directly on Skyscanner.")
                .font(.subheadline).foregroundStyle(.secondary)
                .multilineTextAlignment(.center).padding(.horizontal)
            Link("Open Skyscanner ↗", destination: URL(string: "https://www.skyscanner.com")!)
                .buttonStyle(.borderedProminent).tint(FWColor.brandPrimary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

#Preview { NavigationStack { RecommendationsView(search: FlightSearch(), service: FlightService()) } }
