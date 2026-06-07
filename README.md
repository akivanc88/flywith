# ✈️ FlyWith

> **Turn your next long-haul connection into a mini-vacation — often for the same price or less.**

FlyWith is an open-source iOS app + web landing page that finds smarter flight routes with extended stopovers (3–7 days), personalized to your travel profile — family with kids, traveling with seniors, budget-focused, or adventure seeker.

## The problem

Google Flights shows you `Toronto → Mumbai from $849`. What it doesn't tell you: that's a 24-hour sprint through two airports with tight connections — brutal for families, exhausting for seniors.

**FlyWith says:** spend $1,107 and fly with 5 days in Dubai on the way. Or $1,066 and fly with 4 days in Istanbul. Real prices, real flights, real vacation.

## Live demo

Prices fetched June 2026 via Kiwi.com:

| Route | Cost | Bonus days |
|---|---|---|
| YYZ → ORD → CDG → BOM (cheapest) | CAD $849 | — |
| YYZ → CDG → BOM (comfortable) | CAD $1,072 | — |
| **FlyWith: YYZ → DXB (5 days) → BOM** | **CAD $1,107** | **5 days Dubai 🇦🇪** |
| **FlyWith: YYZ → IST (4 days) → BOM** | **CAD $1,066** | **4 days Istanbul 🇹🇷** |
| YYZ → DXB → BOM (Emirates direct) | CAD $1,407 | — |

## Features

- 🔍 **Smart stopover search** — finds optimal stopover cities based on your profile
- 👨‍👩‍👧‍👦 **Family mode** — airports with play areas, stroller access, kid-friendly cities
- 👴 **Senior mode** — short terminal walks, wheelchair access, restful destinations
- 💸 **Budget mode** — free-visa cities, cheap hotels, maximum savings
- 🧭 **Explorer mode** — off-the-beaten-path stopovers you'd never book deliberately
- 📊 **Price transparency** — total cost of both legs vs. direct alternatives, always shown
- 🔗 **Fallback links** — when we can't beat Google Flights, we link out to Skyscanner/Kiwi

## Tech stack

| Layer | Technology |
|---|---|
| iOS app | Swift 5.9, SwiftUI |
| Flight data | Kiwi.com Tequila API |
| Web landing | Plain HTML/CSS/JS (no framework) |
| Hosting | GitHub Pages |

## Setup

### iOS app

1. Clone this repo
2. Open `FlyWith/FlyWith.xcodeproj` in Xcode
3. Set your API key in the scheme environment variables:
   - `KIWI_API_KEY` — free at [tequila.kiwi.com](https://tequila.kiwi.com)
4. Run on simulator or device (iOS 17+)

### Web landing page

```bash
# Open index.html directly, or serve locally:
python3 -m http.server 8080
```

Deploy to GitHub Pages — it's a single HTML file, no build step required.

## Project structure

```
flywith/
├── index.html                        # Web landing page (GitHub Pages)
└── FlyWith/
    └── FlyWith/
        ├── App/
        │   └── FlyWithApp.swift
        ├── Models/
        │   └── FlightModels.swift    # Data models + sample data
        ├── Views/
        │   ├── ContentView.swift
        │   ├── SearchView.swift
        │   ├── CriteriaSelectorView.swift
        │   ├── RecommendationsView.swift
        │   ├── RecommendationDetailView.swift
        │   └── SavedView.swift
        └── Services/
            ├── FlightService.swift   # Kiwi API integration
            └── MockData.swift        # Sample data for simulator (no API key needed)
```

## Roadmap

- [ ] Airport autocomplete (Kiwi `/locations` endpoint)
- [x] Mock data mode for simulator without API key
- [ ] Hotel cost estimation for stopover city
- [ ] Visa requirement database
- [ ] Apple Maps integration for city highlights
- [ ] Push notifications for price drops
- [ ] Android version

## Contributing

PRs welcome. If you've ever suffered through a brutal layover eating airport food for 8 hours — you know why this exists.

1. Fork the repo
2. `git checkout -b feature/my-feature`
3. Submit a PR

## License

MIT
