# FlyWith Design System — Claude Prompt

Use this prompt when starting a new Claude session to establish the FlyWith design system before building any UI components, screens, or landing page sections.

---

## The Prompt

```
You are the design system lead for FlyWith — an open-source iOS app and web product that helps families find smarter long-haul flight routes with extended stopovers (3–7 days) instead of rushed connections.

Before we build anything, I want to establish a complete design system. Use the following brief to define every design token, component pattern, and interaction principle. Output it as a structured design system document I can reference in future sessions.

---

## Brand Positioning

FlyWith sits at the intersection of three reference products:
- **Google Flights** — clean, data-dense, trustworthy, fast to scan
- **Skyscanner** — friendly, approachable, colorful, optimistic about travel
- **Airwander** — stopover-first thinking, adventurous, "the journey IS the destination"

FlyWith's unique angle: **family-first adventure travel**. Our primary users are parents booking long-haul trips (Canada/US → India, UK → Southeast Asia, etc.) who want to turn a brutal 20-hour journey into a multi-city family memory. Secondary users: budget solo travelers and seniors traveling with adult children.

**Brand personality:** Warm, confident, adventurous, practical. Not luxury. Not budget-airline sterile. Think: a well-traveled parent who knows all the tricks.

**Tagline:** "Turn connections into adventures."

---

## Design System Requirements

### 1. Color System

Define a complete token set:

**Primary palette** — Build around a deep petrol teal anchor (trustworthy, aviation, distinctive) with a warm coral/sunset accent (adventure, warmth, family). Reference: Skyscanner uses cyan + white; Google Flights uses blue + white; we want something warmer and more ownable. Avoid indigo/purple as the dominant brand direction.

- `--color-brand-primary`: deep petrol teal (like vintage airline livery and a night flight path)
- `--color-brand-accent`: warm coral/sunset orange (evokes adventure, sunsets, family warmth)
- `--color-brand-highlight`: golden amber (visa-free badges, savings callouts)
- Semantic tokens: success (green), warning (amber), error (red), info (blue)
- Neutral scale: 50–950 (gray ramp for text, borders, surfaces)
- Dark mode variants for all tokens

**Gradient system:** Define 3 signature gradients:
- Hero gradient (sky/sunset feel for landing pages and hero sections)
- Card gradient (subtle depth for flight cards)
- Map gradient (for route visualization backgrounds)

### 2. Typography

FlyWith users are scanning data quickly (prices, times, cities) but also want to feel inspired. Define:

- **Display font:** Something with personality — a geometric sans or humanist that feels modern and travel-forward. Suggest a Google Fonts pairing. Size scale: display-2xl through display-sm.
- **Body font:** Highly legible at small sizes — for flight times, prices, airport codes. System font stack or a clean geometric sans.
- **Mono font:** For airport codes (YYZ, BOM, DXB) — these should feel like departure boards, crisp and distinct.
- **Type scale:** xs (10px) through 5xl (48px+), with line-height and letter-spacing tokens
- **Weight tokens:** regular (400), medium (500), semibold (600), bold (700), extrabold (800)

### 3. Spacing & Layout

- **Base unit:** 4px
- **Spacing scale:** 0, 1 (4px), 2 (8px), 3 (12px), 4 (16px), 5 (20px), 6 (24px), 8 (32px), 10 (40px), 12 (48px), 16 (64px), 20 (80px), 24 (96px)
- **Border radius tokens:** none, sm (4px), md (8px), lg (12px), xl (16px), 2xl (20px), full (9999px)
- **Shadow tokens:** sm, md, lg, xl, colored (brand-tinted shadow for CTAs)
- **Grid:** 12-column, max-width 1280px, gutters 24px desktop / 16px mobile
- **Z-index scale:** base, raised, dropdown, sticky, modal, toast

### 4. Component Library

Define the anatomy, variants, and states for each component:

#### Flight Card
The most important component. Used everywhere — search results, recommendations, saved trips.
- **Variants:** compact (list view), expanded (detail view), winner (FlyWith pick with badge), comparison (side-by-side)
- **Anatomy:** airline logo, route string (YYZ → DXB), timeline visualization with stops, layover pill, price block, book CTA, savings badge
- **States:** default, hover, selected, loading skeleton, error
- **Special:** "extended layover" variant shows the stopover city prominently with a destination photo strip, score badges (family, budget, explorer), and two separate leg booking buttons

#### Stopover City Card
Shows a layover destination as a mini travel card.
- **Anatomy:** city photo (full bleed), city name + country flag, score pills (family 4.9★, visa-free, airport rating), "5 days" duration badge, quick highlights (3 bullet max)
- **Variants:** grid (2-up, 3-up), horizontal scroll (mobile), featured (hero-width)

#### Search Form
Primary entry point — origin, destination, dates, traveler count, criteria selector.
- **Style:** Floating card over hero, Google Flights-like simplicity, but with an extra "who's traveling" row (family, seniors, budget, explorer) shown as pill toggles
- **Mobile:** Full-screen sheet with step-by-step flow

#### Criteria Selector
The FlyWith-unique component. Lets users declare their travel profile.
- **Options:** 👨‍👩‍👧‍👦 Family, 👴 Seniors, 💸 Budget, 🧭 Explorer
- **Style:** Icon + label pill buttons, multi-select allowed, selected state uses brand accent
- **Behavior:** Selection immediately re-ranks the stopover city recommendations

#### Price Comparison Table
Shows quick-connection vs. extended-layover pricing with a clear visual hierarchy.
- **Style:** Clean table, highlighted rows for FlyWith picks, strikethrough pricing where relevant, savings delta shown in green

#### Route Timeline
Visual representation of the flight path.
- **Simple:** Horizontal line with city dots, flight duration labels, plane icon
- **Extended:** Shows the stopover city as an enlarged node with a mini city card

#### Score Badge
Compact trust indicator for stopover city quality.
- **Variants:** family (raspberry), seniors (denim/teal), budget (green), explorer (orange), visa-free (gold)
- **Size:** xs (icon only), sm (icon + number), md (icon + label + number)

#### CTA Buttons
- **Primary:** Brand teal fill, white text, rounded-xl, hover lifts with shadow
- **Secondary:** White fill, border, hover fills lightly
- **Ghost:** No border, text only, for tertiary actions
- **Booking CTA:** Special variant — teal/green, "Book Leg 1 ↗" style, always opens in new tab
- **App Store buttons:** Dark pill with store icon

#### Navigation
- **Desktop:** Sticky top nav, logo left, links center, CTA right, blurred glass background on scroll
- **Mobile:** Hamburger → full-screen overlay with large touch targets

#### Badges & Pills
- Visa status (green = free, yellow = on arrival, red = required)
- Flight class (economy, premium economy, business)
- Route type (direct, 1-stop, multi-stop)
- FlyWith pick badge (star icon + "FlyWith Pick" text, brand accent color)

#### Empty States
For: no results, no saved trips, API error, no API key (mock mode indicator).
- Each should have an illustration concept (travel-themed), headline, body, and action CTA

#### Loading States
- Flight card skeleton (shimmer)
- "Checking fares..." state with animated plane along a route line
- Full-page loader for initial search

### 5. Iconography

- **Style:** Rounded, friendly, 2px stroke weight. Not sharp/corporate. Similar to Skyscanner's icon style.
- **Key icons:** Plane (departure/arrival), Globe (destinations), Family (group), Clock (layover duration), Star (saved/favorite), Visa stamp, Suitcase, Map pin, Dollar/currency, Calendar, Filter, Swap (origin/destination swap)
- **Airport codes:** Always uppercase, monospace font, slightly larger than surrounding text
- **Flags:** Use emoji flags (🇨🇦🇮🇳🇦🇪) as the primary flag representation — fast, universal, no assets needed

### 6. Illustration & Photography Style

- **Hero illustrations:** Isometric travel scenes — families at airports, city skylines, planes over maps. Warm color palette matching brand. NOT stock photo generic.
- **City photography:** Full-bleed, golden hour / blue hour shots. Iconic landmarks but from interesting angles. Overlay with gradient for text legibility.
- **Empty state illustrations:** Friendly, slightly whimsical. A family looking at a globe, a plane drawing a route, etc.
- **Photo overlay treatment:** All city photos use a bottom-to-top gradient overlay (brand color tinted, 60% opacity) for text legibility

### 7. Motion & Animation

- **Principles:** Purposeful, not decorative. Motion should communicate state changes, guide attention, or reward exploration.
- **Durations:** instant (0ms), fast (100ms), normal (200ms), slow (300ms), deliberate (500ms)
- **Easing:** ease-out for entrances, ease-in for exits, ease-in-out for transitions
- **Key animations:**
  - Plane icon travels along route line during search loading
  - Criteria selection causes cards to re-order with a smooth reflow
  - Price savings badge counts up when revealed
  - City card photo has subtle parallax on hover (desktop)
  - Flight card expands with accordion animation

### 8. iOS-Specific Tokens (SwiftUI)

Map all web tokens to SwiftUI equivalents:
- Colors: Use custom teal/coral/gold token values as the base, define custom Color assets in Assets.xcassets
- Typography: SF Pro (system font) with custom size scale using `.font(.system(size:weight:design:))`
- Spacing: Use a `Spacing` enum with static constants matching the web scale
- Corner radius: Use a `CornerRadius` enum
- Shadows: SwiftUI `.shadow()` modifier tokens
- Component examples in SwiftUI: FlightCard view, CriteriaSelector, StopoverCityCard

### 9. Accessibility

- All colors must pass WCAG 2.1 AA (4.5:1 for body text, 3:1 for large text and UI components)
- Touch targets minimum 44×44pt (iOS HIG) / 48×48px (web)
- Focus indicators: 2px brand-primary outline, 2px offset
- Reduced motion: All animations respect `prefers-reduced-motion` / `UIAccessibility.isReduceMotionEnabled`
- Font sizes: Support Dynamic Type on iOS (use `.scaledFont` or relative sizes)

### 10. Voice & Tone in UI Copy

Apply consistently across all components:
- **Prices:** Always show currency code (CAD $849, not just $849)
- **Durations:** "5 days" not "5d", "3h 15m" not "3:15"
- **Savings framing:** "5 bonus days in Dubai for just $258 more" — frame as gain, not cost
- **Visa copy:** "No visa needed 🎉" not "Visa: Not required"
- **Loading copy:** Conversational — "Hunting down the best layovers..." not "Loading..."
- **Empty states:** Empathetic and action-oriented — "No trips saved yet — start exploring above"
- **Error states:** Honest, never blame the user — "Couldn't fetch live prices right now. Here's what we know."

---

## Output Format

Please produce:

1. **Design Token File** — CSS custom properties for all color, typography, spacing, and effect tokens
2. **Component Specs** — For each component: anatomy diagram (text-based), variants table, states, and key CSS/SwiftUI implementation notes
3. **Usage Guidelines** — When to use each component, common mistakes to avoid
4. **iOS SwiftUI Token File** — Swift enum/struct definitions for all tokens
5. **Brand Voice Cheat Sheet** — One-page quick reference for UI copy patterns

Format the token file as production-ready CSS variables. Format the SwiftUI file as copy-paste Swift code. Format component specs as structured markdown.
```

---

## Usage Notes

- Paste this prompt at the start of any new Claude session before asking for UI work
- After Claude outputs the design system, save the CSS token file as `FlyWith/Web/design-tokens.css` and the Swift token file as `FlyWith/FlyWith/DesignSystem/Tokens.swift`
- Reference it in future prompts with: *"Using the FlyWith design system we established, build me a..."*
- Update this prompt as the design evolves — treat it as a living document
