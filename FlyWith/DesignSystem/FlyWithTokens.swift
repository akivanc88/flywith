import SwiftUI

extension Color {
    init(hex: UInt, alpha: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: alpha
        )
    }
}

enum FWColor {
    static let brandPrimary = Color(hex: 0x0C6B6E)
    static let brandPrimaryHover = Color(hex: 0x0E5557)
    static let brandAccent = Color(hex: 0xFF6B4A)
    static let brandAccentHover = Color(hex: 0xED5535)
    static let brandHighlight = Color(hex: 0xF5AD2A)
    static let brandInk = Color(hex: 0x062A2C)

    static let textStrong = Color(hex: 0x0F1716)
    static let textBody = Color(hex: 0x333C3B)
    static let textMuted = Color(hex: 0x64716F)
    static let textSubtle = Color(hex: 0x94A09E)

    static let surfacePage = Color(hex: 0xFFFFFF)
    static let surfaceSunken = Color(hex: 0xF8FAF9)
    static let surfaceCard = Color(hex: 0xFFFFFF)
    static let surfaceInverse = Color(hex: 0x062A2C)
    static let surfaceBrandSoft = Color(hex: 0xECFBFA)
    static let surfaceAccentSoft = Color(hex: 0xFFF2EE)
    static let surfaceGoldSoft = Color(hex: 0xFEF7E7)

    static let borderSubtle = Color(hex: 0xE3E8E7)
    static let borderDefault = Color(hex: 0xCBD3D2)

    static let success = Color(hex: 0x047857)
    static let warning = Color(hex: 0x874810)
    static let error = Color(hex: 0xDC2626)
    static let info = Color(hex: 0x2563EB)
    static let booking = Color(hex: 0x059669)

    static let scoreFamily = Color(hex: 0xDB4D77)
    static let scoreSeniors = Color(hex: 0x4F86A6)
    static let scoreBudget = Color(hex: 0x10B981)
    static let scoreExplorer = Color(hex: 0xF97316)
    static let scoreVisa = Color(hex: 0xEF9612)

    static let heroGradient = LinearGradient(
        colors: [Color(hex: 0x0D5E60), Color(hex: 0x0B4446), Color(hex: 0x062A2C)],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static let mapGradient = LinearGradient(
        colors: [Color(hex: 0x0C5B5E), Color(hex: 0x0A3F41), Color(hex: 0x082F31)],
        startPoint: .top,
        endPoint: .bottom
    )
}

enum FWFont {
    static func display(_ size: CGFloat, _ weight: Font.Weight = .heavy) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }

    static func body(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .default)
    }

    static func code(_ size: CGFloat = 16) -> Font {
        .system(size: size, weight: .bold, design: .monospaced)
    }

    static let h1 = display(30, .bold)
    static let h2 = display(24, .bold)
    static let title = body(18, .semibold)
    static let bodyBase = body(14)
    static let caption = body(12)
}

enum FWSpacing {
    static let x1: CGFloat = 4
    static let x2: CGFloat = 8
    static let x3: CGFloat = 12
    static let x4: CGFloat = 16
    static let x5: CGFloat = 20
    static let x6: CGFloat = 24
    static let x8: CGFloat = 32
    static let x10: CGFloat = 40
    static let x12: CGFloat = 48
    static let x16: CGFloat = 64
    static let x20: CGFloat = 80
    static let x24: CGFloat = 96
}

enum FWRadius {
    static let sm: CGFloat = 4
    static let md: CGFloat = 8
    static let lg: CGFloat = 12
    static let xl: CGFloat = 16
    static let xl2: CGFloat = 20
    static let full: CGFloat = 9999
}

struct FWShadow {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat

    static let sm = FWShadow(color: .black.opacity(0.06), radius: 3, x: 0, y: 1)
    static let md = FWShadow(color: .black.opacity(0.07), radius: 8, x: 0, y: 3)
    static let lg = FWShadow(color: .black.opacity(0.10), radius: 18, x: 0, y: 8)
    static let brand = FWShadow(color: FWColor.brandPrimary.opacity(0.30), radius: 16, x: 0, y: 8)
}

extension View {
    func fwShadow(_ shadow: FWShadow) -> some View {
        self.shadow(color: shadow.color, radius: shadow.radius, x: shadow.x, y: shadow.y)
    }
}

struct FWPanel<Content: View>: View {
    private let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        content
            .padding(FWSpacing.x4)
            .background(FWColor.surfaceCard)
            .clipShape(RoundedRectangle(cornerRadius: FWRadius.xl))
            .overlay(
                RoundedRectangle(cornerRadius: FWRadius.xl)
                    .stroke(FWColor.borderSubtle, lineWidth: 1)
            )
            .fwShadow(.sm)
    }
}

struct FWSection<Content: View>: View {
    let title: String
    private let content: Content

    init(_ title: String, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        FWPanel {
            VStack(alignment: .leading, spacing: FWSpacing.x3) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(FWColor.textStrong)
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
