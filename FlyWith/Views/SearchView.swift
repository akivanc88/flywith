import SwiftUI

struct SearchView: View {
    @StateObject private var service = FlightService()
    @State private var search = FlightSearch()
    @State private var showCriteria = false
    @State private var showResults = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 0) {

                    // Header
                    FWColor.heroGradient
                    .frame(height: 180)
                    .overlay {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("✈️ FlyWith")
                                .font(.caption).fontWeight(.semibold).foregroundStyle(.white.opacity(0.7))
                            Text("Turn connections into adventures")
                                .font(.title2).fontWeight(.bold).foregroundStyle(.white)
                            Text("Find routes with smart stopovers — often cheaper than rushing through.")
                                .font(.caption).foregroundStyle(.white.opacity(0.8))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 20)
                    }

                    // Search form
                    VStack(spacing: 16) {
                        FWPanel {
                            VStack(spacing: 12) {
                                RoutePickerRow(label: "From", icon: "airplane.departure", value: $search.origin, placeholder: "e.g. Toronto (YYZ)")
                                Divider()
                                RoutePickerRow(label: "To", icon: "airplane.arrival", value: $search.destination, placeholder: "e.g. Mumbai (BOM)")
                            }
                        }

                        FWPanel {
                            DatePicker("Departure", selection: $search.departureDate, in: Date()..., displayedComponents: .date)
                        }

                        FWPanel {
                            VStack(spacing: 12) {
                                Stepper("Adults: \(search.adultCount)", value: $search.adultCount, in: 1...6)
                                Stepper("Children: \(search.childCount)", value: $search.childCount, in: 0...5)
                                Stepper("Infants: \(search.infantCount)", value: $search.infantCount, in: 0...3)
                            }
                        }

                        FWPanel {
                            VStack(spacing: 10) {
                                HStack {
                                    Text("Stopover duration")
                                        .font(.subheadline).fontWeight(.medium)
                                    Spacer()
                                    Text("\(search.minStopoverDays)–\(search.maxStopoverDays) days")
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                                HStack(spacing: 12) {
                                    Stepper("Min: \(search.minStopoverDays)d", value: $search.minStopoverDays, in: 1...search.maxStopoverDays)
                                    Stepper("Max: \(search.maxStopoverDays)d", value: $search.maxStopoverDays, in: search.minStopoverDays...14)
                                }
                            }
                        }

                        Button { showCriteria = true } label: {
                            HStack {
                                Image(systemName: search.criteria.icon)
                                    .font(.title3).foregroundStyle(FWColor.brandPrimary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Travel profile").font(.caption).foregroundStyle(.secondary)
                                    Text(search.criteria.displayName).font(.subheadline).fontWeight(.semibold)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(.secondary)
                            }
                            .padding()
                            .background(.ultraThinMaterial)
                            .clipShape(RoundedRectangle(cornerRadius: FWRadius.lg))
                        }
                        .buttonStyle(.plain)

                        NavigationLink(destination: RecommendationsView(search: search, service: service), isActive: $showResults) { EmptyView() }

                        Button {
                            service.search(search)
                            showResults = true
                        } label: {
                            HStack {
                                if service.isLoading {
                                    ProgressView().tint(.white)
                                } else {
                                    Image(systemName: "sparkles")
                                }
                                Text(service.isLoading ? "Scanning routes..." : "Find smart stopovers")
                                    .fontWeight(.bold)
                            }
                            .frame(maxWidth: .infinity)
                            .padding()
                            .background(FWColor.brandPrimary)
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: FWRadius.xl))
                        }
                        .disabled(search.origin.isEmpty || search.destination.isEmpty || service.isLoading)

                        if let err = service.errorMessage {
                            Text(err).font(.caption).foregroundStyle(FWColor.error)
                        }
                    }
                    .padding(16)
                }
            }
            .navigationTitle("").navigationBarHidden(true)
            .sheet(isPresented: $showCriteria) {
                CriteriaSelectorView(selected: $search.criteria)
            }
        }
    }
}

struct RoutePickerRow: View {
    let label: String
    let icon: String
    @Binding var value: String
    let placeholder: String

    var body: some View {
        HStack {
            Image(systemName: icon).foregroundStyle(FWColor.brandPrimary).frame(width: 28)
            VStack(alignment: .leading, spacing: 2) {
                Text(label).font(.caption).foregroundStyle(.secondary)
                TextField(placeholder, text: $value)
                    .font(.subheadline).fontWeight(.medium)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.characters)
            }
        }
    }
}

#Preview { SearchView() }
