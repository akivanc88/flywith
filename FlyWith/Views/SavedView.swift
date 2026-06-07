import SwiftUI

struct SavedView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "heart.slash").font(.system(size: 48)).foregroundStyle(.secondary)
                Text("No saved trips yet").font(.headline)
                Text("Tap the heart on any stopover recommendation to save it for later.")
                    .font(.subheadline).foregroundStyle(.secondary)
                    .multilineTextAlignment(.center).padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Saved")
        }
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
                    Link("View on GitHub", destination: URL(string: "https://github.com/your-handle/flywith")!)
                    Link("Report a bug", destination: URL(string: "https://github.com/your-handle/flywith/issues")!)
                }
                Section("Data") {
                    Text("Flight prices are fetched live from Kiwi.com (Tequila API). FlyWith is not affiliated with any airline or booking platform.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Settings")
        }
    }
}
