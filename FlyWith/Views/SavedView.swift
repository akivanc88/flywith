import SwiftUI

enum SavedTripStore {
    static let key = "savedStopoverCodes"

    static func codes(from rawValue: String) -> [String] {
        rawValue
            .split(separator: ",")
            .map { String($0).trimmingCharacters(in: .whitespacesAndNewlines).uppercased() }
            .filter { !$0.isEmpty }
    }

    static func contains(_ code: String, in rawValue: String) -> Bool {
        codes(from: rawValue).contains(code.uppercased())
    }

    static func toggled(_ code: String, in rawValue: String) -> String {
        let normalized = code.uppercased()
        var codes = codes(from: rawValue)
        if let index = codes.firstIndex(of: normalized) {
            codes.remove(at: index)
        } else {
            codes.append(normalized)
        }
        return codes.joined(separator: ",")
    }

    static func removing(_ code: String, from rawValue: String) -> String {
        codes(from: rawValue)
            .filter { $0 != code.uppercased() }
            .joined(separator: ",")
    }
}

struct SavedView: View {
    @AppStorage(SavedTripStore.key) private var savedStopoverCodes = ""

    private var savedCities: [StopoverCity] {
        let codes = SavedTripStore.codes(from: savedStopoverCodes)
        return codes.compactMap { code in
            StopoverCity.sampleCities.first { $0.iataCode == code }
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if savedCities.isEmpty {
                    emptyState
                } else {
                    savedList
                }
            }
            .navigationTitle("Saved")
        }
    }

    private var emptyState: some View {
        VStack(spacing: 16) {
            Image(systemName: "heart.slash")
                .font(.system(size: 48))
                .foregroundStyle(FWColor.textSubtle)
            Text("No saved trips yet").font(.headline)
            Text("Save a stopover from the detail screen to keep it here for later.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private var savedList: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                ForEach(savedCities, id: \.iataCode) { city in
                    SavedCityCard(city: city) {
                        savedStopoverCodes = SavedTripStore.removing(city.iataCode, from: savedStopoverCodes)
                    }
                }
            }
            .padding(16)
        }
        .background(FWColor.surfaceSunken)
    }
}

struct SavedCityCard: View {
    let city: StopoverCity
    let onRemove: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            Text(city.emoji)
                .font(.system(size: 38))
                .frame(width: 56, height: 56)
                .background(FWColor.surfaceAccentSoft)
                .clipShape(RoundedRectangle(cornerRadius: FWRadius.lg))

            VStack(alignment: .leading, spacing: 4) {
                Text(city.cityName)
                    .font(.headline)
                Text("\(city.countryName) · hotels from CAD \(city.estimatedHotelPerNight)/night")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(city.highlights.prefix(2).joined(separator: " · "))
                    .font(.caption)
                    .foregroundStyle(FWColor.textMuted)
                    .lineLimit(1)
            }

            Spacer()

            Button(action: onRemove) {
                Image(systemName: "heart.fill")
                    .foregroundStyle(FWColor.brandAccent)
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Remove \(city.cityName) from saved trips")
        }
        .padding(16)
        .background(FWColor.surfaceCard)
        .clipShape(RoundedRectangle(cornerRadius: FWRadius.xl))
        .fwShadow(.sm)
    }
}

struct SettingsView: View {
    @AppStorage("preferredCurrency") private var preferredCurrency = "CAD"

    var body: some View {
        NavigationStack {
            Form {
                Section("Preferences") {
                    Picker("Currency", selection: $preferredCurrency) {
                        Text("CAD").tag("CAD")
                        Text("USD").tag("USD")
                        Text("GBP").tag("GBP")
                        Text("EUR").tag("EUR")
                    }
                }
                Section("About") {
                    LabeledContent("Version", value: "1.0.0 (open source)")
                    Link("View on GitHub", destination: URL(string: "https://github.com/akivanc88/flywith")!)
                    Link("Report a bug", destination: URL(string: "https://github.com/akivanc88/flywith/issues")!)
                }
                Section("Data") {
                    Text("Flight prices are fetched from Kiwi.com when KIWI_API_KEY is configured. Without a key, the app uses local demo data. FlyWith is not affiliated with any airline or booking platform.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}
