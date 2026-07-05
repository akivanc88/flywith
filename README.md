# ✈️ FlyWith

> **Decide whether a long-haul stopover is actually worth it for your family.**

FlyWith is an open-source iOS app + promotional website for diaspora families planning long-haul travel. It finds smarter flight routes with extended stopovers (3–7 days), then explains the tradeoff in plain language: fare, hotel estimate, visa friction, airport comfort, family logistics, senior accessibility, and booking confidence.

FlyWith is **not** trying to replace Google Flights, Skyscanner, or Kiwi. It is a decision layer on top of flight search: "Is this stopover worth it for my family?"

## The problem

Google Flights shows you `Toronto → Mumbai from $849`. What it doesn't tell you: that's a 24-hour sprint through two airports with tight connections — brutal for families, exhausting for seniors.

**FlyWith says:** spend $1,107 and fly with 5 days in Dubai on the way. Or $1,066 and fly with 4 days in Istanbul. Real prices, real flights, real vacation.

## Live demo

Prices fetched June 2026:

| Route | Cost | Bonus days |
|---|---|---|
| YYZ → ORD → CDG → BOM (cheapest) | CAD $849 | — |
| YYZ → CDG → BOM (comfortable) | CAD $1,072 | — |
| **FlyWith: YYZ → DXB (5 days) → BOM** | **CAD $1,107** | **5 days Dubai 🇦🇪** |
| **FlyWith: YYZ → IST (4 days) → BOM** | **CAD $1,066** | **4 days Istanbul 🇹🇷** |
| YYZ → DXB → BOM (Emirates direct) | CAD $1,407 | — |

## Features

- 🔍 **Smart stopover search** — finds optimal stopover cities based on your profile
- ✅ **Worth-it score** — ranks routes by family value, not cheapest fare alone
- 👨‍👩‍👧‍👦 **Diaspora family mode** — lower fatigue, stroller logistics, kid-friendly airports, easy first nights
- 👴 **Parents & seniors mode** — assisted travel, short walks, wheelchair access, calmer stopovers
- 💸 **Budget mode** — free-visa cities, cheap hotels, maximum savings
- 🧭 **Explorer mode** — off-the-beaten-path stopovers you'd never book deliberately
- 📊 **Trip transparency** — flight cost, hotel estimate, visa caveats, airport comfort, and family logistics
- 🔗 **Fallback links** — when we can't beat Google Flights, we link out to Skyscanner/Kiwi

## Tech stack

| Layer | Technology |
|---|---|
| iOS app | Swift 5.9, SwiftUI |
| Flight data | LetsFG API (primary) / Kiwi.com Tequila API (legacy fallback) |
| Web landing | Plain HTML/CSS/JS (no framework) |
| Hosting | GitHub Pages |

## Setup

### iOS app

1. Clone this repo
2. Open `FlyWith/FlyWith.xcodeproj` in Xcode
3. Set your API key in the scheme environment variables:
   - `LETSFG_API_KEY` — register for a Bearer token at [letsfg.co/for-agents](https://letsfg.co/for-agents) (preferred, free 90-day token)
   - `KIWI_API_KEY` — legacy fallback, free at [tequila.kiwi.com](https://tequila.kiwi.com)
   - If neither key is set, the app uses built-in mock data and works fully in Simulator
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
            ├── FlightService.swift          # LetsFG + Kiwi API integration
            ├── FlightServiceProtocol.swift  # Protocol for testability
            └── MockData.swift               # Sample data for simulator (no API key needed)
```

## Roadmap

- [ ] Airport autocomplete (Kiwi `/locations` endpoint)
- [x] Mock data mode for simulator without API key
- [x] Worth-it scoring for family stopover recommendations
- [x] Research-backed product direction for diaspora family travel
- [ ] Hotel cost estimation for stopover city
- [ ] Visa requirement database
- [ ] Apple Maps integration for city highlights
- [ ] Push notifications for price drops
- [ ] Android version

## Product research

The repo includes the real-application transition plan:

- [`docs/market-research.md`](docs/market-research.md) — competitor map, Reddit/customer signals, supply feasibility, and validation plan.
- [`docs/real-app-roadmap.md`](docs/real-app-roadmap.md) — MVP boundary, data model direction, API research, and launch readiness gates.

The current app still runs with mock data when no `LETSFG_API_KEY` or `KIWI_API_KEY` is configured. The goal is to replace mock fare and city facts cautiously, source by source, without pretending editorial estimates are verified live data.

## Contributing

PRs welcome. If you've ever suffered through a brutal layover eating airport food for 8 hours — you know why this exists.

1. Fork the repo
2. `git checkout -b feature/my-feature`
3. Submit a PR

## License

MIT
