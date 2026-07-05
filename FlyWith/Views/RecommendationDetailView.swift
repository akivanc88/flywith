import SwiftUI

struct RecommendationDetailView: View {
    let recommendation: StopoverRecommendation
    let fareSourceName: String
    let fareEvidenceNote: String
    @AppStorage(SavedTripStore.key) private var savedStopoverCodes = ""
    private var city: StopoverCity { recommendation.stopoverCity }
    private var isSaved: Bool { SavedTripStore.contains(city.iataCode, in: savedStopoverCodes) }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {

                // Hero
                ZStack(alignment: .bottomLeading) {
                    FWColor.mapGradient
                        .frame(height: 200)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(city.emoji + " " + city.cityName)
                            .font(.largeTitle).fontWeight(.bold).foregroundStyle(.white)
                        Text("\(recommendation.stopoverDays) days · \(city.countryName) · \(city.averageTemperature)°C in Sept")
                            .font(.subheadline).foregroundStyle(.white.opacity(0.85))
                    }
                    .padding(20)
                }
                .clipShape(RoundedRectangle(cornerRadius: FWRadius.xl2))
                .padding(.horizontal)

                FareSourceSection(sourceName: fareSourceName, note: fareEvidenceNote)
                    .padding(.horizontal)

                // Price breakdown
                FWSection("Worth-it verdict") {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .firstTextBaseline) {
                            Text("\(recommendation.worthItScore)%")
                                .font(.system(size: 40, weight: .heavy, design: .rounded))
                                .foregroundStyle(FWColor.success)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(recommendation.worthItSummary)
                                    .font(.headline)
                                Text("Scored for fare, hotel cost, stopover length, airport comfort, and family suitability.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        Divider()
                        InsightRow(icon: "figure.and.child.holdinghands", title: "Family logistics", bodyText: city.familyLogistics)
                        InsightRow(icon: "figure.roll", title: "Accessibility", bodyText: city.accessibilityNotes)
                        InsightRow(icon: "airplane.circle", title: "Airport comfort", bodyText: city.airportComfort)
                    }
                }
                .padding(.horizontal)

                FWSection("Total cost check") {
                    VStack(spacing: 10) {
                        PriceRow(label: "Leg 1: \(recommendation.leg1.origin) → \(recommendation.leg1.destination)", price: recommendation.leg1.price)
                        PriceRow(label: "Leg 2: \(recommendation.leg2.origin) → \(recommendation.leg2.destination)", price: recommendation.leg2.price)
                        PriceRow(label: "Estimated hotel base", price: recommendation.estimatedHotelTotal)
                        Divider()
                        PriceRow(label: "Flight + hotel estimate", price: recommendation.estimatedTripTotal, isBold: true)
                        PriceRow(label: "Direct comparison", price: recommendation.directComparisonPrice, style: .strikethrough)
                        HStack {
                            Text(recommendation.hasSavings ? "Fare savings before hotels" : "Fare premium before hotels")
                            Spacer()
                            Text("CAD \(Int(abs(recommendation.savings)))")
                                .fontWeight(.bold)
                                .foregroundStyle(recommendation.hasSavings ? FWColor.success : FWColor.brandAccent)
                        }
                        .font(.subheadline)
                    }
                }
                .padding(.horizontal)

                // Visa and gap
                FWSection("Visa and booking confidence") {
                    VStack(alignment: .leading, spacing: 10) {
                        InsightRow(icon: "doc.text.magnifyingglass", title: "Visa check", bodyText: city.visaSummary)
                        InsightRow(icon: "exclamationmark.triangle", title: "Known market gap", bodyText: city.researchGap)
                    }
                }
                .padding(.horizontal)

                // Scores
                FWSection("FlyWith scores") {
                    VStack(spacing: 10) {
                        ScoreRow(label: "Family friendly", score: city.scores.family)
                        ScoreRow(label: "Senior accessible", score: city.scores.seniors)
                        ScoreRow(label: "Budget rating", score: city.scores.budget)
                        ScoreRow(label: "Explorer appeal", score: city.scores.explorer)
                    }
                }
                .padding(.horizontal)

                // Highlights
                FWSection("Top things to do") {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(city.highlights, id: \.self) { item in
                            Label(item, systemImage: "checkmark.circle.fill")
                                .font(.subheadline)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(.horizontal)

                // Book buttons
                VStack(alignment: .leading, spacing: 12) {
                    Text("Book as two simple legs")
                        .font(.headline)
                    Text("Open each booking site in order, confirm dates and baggage, then compare the final total with Google Flights before purchase.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    BookButton(title: "Book Leg 1 on Kiwi", subtitle: "\(recommendation.leg1.origin) → \(recommendation.leg1.destination) · CAD \(Int(recommendation.leg1.price))", url: recommendation.leg1.bookingURL, color: FWColor.brandPrimary)
                    BookButton(title: "Book Leg 2 on Kiwi", subtitle: "\(recommendation.leg2.origin) → \(recommendation.leg2.destination) · CAD \(Int(recommendation.leg2.price))", url: recommendation.leg2.bookingURL, color: FWColor.booking)
                    Text("Can't find a better deal? Check Google Flights or Skyscanner.")
                        .font(.caption).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    Text("FlyWith does not sell tickets in v1. It explains the tradeoff, then hands off to booking sites.")
                        .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    HStack(spacing: 12) {
                        Link("Google Flights ↗", destination: URL(string: "https://flights.google.com")!)
                        Link("Skyscanner ↗", destination: URL(string: "https://www.skyscanner.com")!)
                    }
                    .font(.subheadline).fontWeight(.semibold).foregroundStyle(FWColor.brandPrimary)
                }
                .padding(.horizontal)
                .padding(.bottom, 32)
            }
            .padding(.top)
        }
        .navigationTitle(city.cityName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    savedStopoverCodes = SavedTripStore.toggled(city.iataCode, in: savedStopoverCodes)
                } label: {
                    Image(systemName: isSaved ? "heart.fill" : "heart")
                        .foregroundStyle(isSaved ? FWColor.brandAccent : FWColor.brandPrimary)
                }
                .accessibilityLabel(isSaved ? "Remove \(city.cityName) from saved trips" : "Save \(city.cityName)")
            }
        }
    }
}

struct FareSourceSection: View {
    let sourceName: String
    let note: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checklist.checked")
                .foregroundStyle(FWColor.brandPrimary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 3) {
                Text(sourceName)
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(FWColor.textStrong)
                Text(note)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(FWColor.surfaceGoldSoft)
        .clipShape(RoundedRectangle(cornerRadius: FWRadius.lg))
        .overlay(RoundedRectangle(cornerRadius: FWRadius.lg).stroke(FWColor.brandHighlight.opacity(0.35)))
    }
}

struct InsightRow: View {
    let icon: String
    let title: String
    let bodyText: String

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .foregroundStyle(FWColor.brandPrimary)
                .frame(width: 22)
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(FWColor.textStrong)
                Text(bodyText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct PriceRow: View {
    enum Style { case normal, strikethrough }
    let label: String
    let price: Double
    var isBold = false
    var style: Style = .normal

    var body: some View {
        HStack {
            Text(label).font(.subheadline)
            Spacer()
            Text("CAD \(Int(price))")
                .font(.subheadline)
                .fontWeight(isBold ? .bold : .regular)
                .strikethrough(style == .strikethrough, color: .secondary)
                .foregroundStyle(style == .strikethrough ? .secondary : .primary)
        }
    }
}

struct ScoreRow: View {
    let label: String
    let score: Double

    var body: some View {
        HStack {
            Text(label).font(.subheadline).frame(width: 140, alignment: .leading)
            ProgressView(value: score / 5).tint(score >= 4 ? FWColor.success : score >= 3 ? FWColor.brandHighlight : FWColor.error)
            Text(String(format: "%.1f", score)).font(.caption).fontWeight(.semibold).frame(width: 28, alignment: .trailing)
        }
    }
}

struct BookButton: View {
    let title: String
    let subtitle: String
    let url: String
    let color: Color

    var body: some View {
        Link(destination: URL(string: url) ?? URL(string: "https://letsfg.co")!) {
            VStack(spacing: 3) {
                Text(title).font(.subheadline).fontWeight(.bold)
                Text(subtitle).font(.caption).opacity(0.85)
            }
            .frame(maxWidth: .infinity).padding()
            .background(color).foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: FWRadius.xl))
        }
    }
}
