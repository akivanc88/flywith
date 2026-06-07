import SwiftUI

struct ContentView: View {
    var body: some View {
        TabView {
            SearchView()
                .tabItem {
                    Label("Search", systemImage: "airplane")
                }
            SavedView()
                .tabItem {
                    Label("Saved", systemImage: "heart")
                }
            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gear")
                }
        }
        .accentColor(.indigo)
    }
}

#Preview {
    ContentView()
}
