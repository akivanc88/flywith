# Contributing to FlyWith

Thanks for wanting to help. FlyWith exists because too many people have eaten terrible airport sandwiches for 8 hours when they could have been in Istanbul. Let's fix that together.

## What we're building

- An iOS app (Swift / SwiftUI) that finds extended-stopover routes personalized to the traveler
- A web landing page that explains the concept and drives App Store downloads
- Open-source, MIT licensed, no ads

## Getting started

1. Fork and clone the repo
2. Open `FlyWith/FlyWith.xcodeproj` in Xcode (requires Xcode 15+, iOS 17 SDK)
3. Build and run — **no API key needed**. The app ships with mock data that works out of the box in Simulator
4. To test live Kiwi prices, get a free API key at [tequila.kiwi.com](https://tequila.kiwi.com) and set `KIWI_API_KEY` in your Xcode scheme:
   - Product → Scheme → Edit Scheme → Run → Arguments → Environment Variables

## Code style

- Swift: follow Swift API Design Guidelines, no third-party dependencies in the app target
- Views: one file per screen, kept under ~250 lines
- Use `@StateObject` in the view that owns the object, `@ObservedObject` everywhere else
- Format with `swift-format` (`.swift-format` config in the repo root, coming soon)

## How to contribute

1. Check [open issues](https://github.com/your-handle/flywith/issues) before starting — especially items tagged `good first issue`
2. For significant new features, open an issue first to discuss the approach
3. Branch off `main`: `git checkout -b feature/your-feature`
4. Write your changes, make sure the Xcode build succeeds
5. Open a PR with a short description of what you changed and why

## Good first issues

| Area | Task |
|---|---|
| Data | Add more stopover cities to `StopoverCity.sampleCities` |
| UI | Add a "copy prices to clipboard" button on the detail view |
| UX | Improve the empty state when no stopover beats the direct price |
| Landing page | Add a screenshot carousel of the iOS app |
| Docs | Write a step-by-step Xcode setup guide with screenshots |

## What we won't merge

- Third-party dependencies in the main app target (keep it vanilla Swift)
- Hardcoded API keys of any kind
- UI that significantly changes the brand feel without prior discussion

## Code of conduct

Be kind. We're all just trying to take better trips.
