// Styles.swift — design system tokens, button styles, Color(hex:) extension

import SwiftUI

// MARK: - Design System Tokens

enum DS {
    // Sidebar
    static let sidebarBg       = Color(hex: "0F172A")
    static let sidebarSurface  = Color(hex: "1E293B")
    static let sidebarBorder   = Color(hex: "2D3D55")
    static let sidebarText     = Color(hex: "94A3B8")
    static let sidebarTextSel  = Color(hex: "F1F5F9")

    // Content area
    static let bg              = Color(hex: "F8FAFC")
    static let surface         = Color.white
    static let border          = Color(hex: "E2E8F0")
    static let borderStrong    = Color(hex: "CBD5E1")

    // Text
    static let text            = Color(hex: "0F172A")
    static let textSecond      = Color(hex: "475569")
    static let textMuted       = Color(hex: "94A3B8")

    // Brand accent — indigo
    static let indigo          = Color(hex: "6366F1")
    static let indigoDark      = Color(hex: "4F46E5")
    static let indigoLight     = Color(hex: "EEF2FF")

    // Semantic
    static let emerald         = Color(hex: "10B981")
    static let emeraldLight    = Color(hex: "DCFCE7")
    static let amber           = Color(hex: "F59E0B")
    static let amberLight      = Color(hex: "FEF3C7")
    static let red             = Color(hex: "EF4444")
    static let redLight        = Color(hex: "FEE2E2")
}

// MARK: - Button Styles

/// Small header / toolbar action button
struct TLHeaderButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.white)
            .padding(.horizontal, 12)
            .frame(height: 28)
            .background(DS.indigo.opacity(configuration.isPressed ? 0.75 : 1.0))
            .cornerRadius(6)
            .animation(.easeInOut(duration: 0.1), value: configuration.isPressed)
    }
}

/// Sidebar navigation item button
struct SidebarNavItemStyle: ButtonStyle {
    let isSelected: Bool
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                RoundedRectangle(cornerRadius: 7)
                    .fill(
                        isSelected
                            ? DS.sidebarSurface
                            : (configuration.isPressed ? DS.sidebarSurface.opacity(0.5) : Color.clear)
                    )
            )
            .animation(.easeInOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Color(hex:) extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:  (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:  (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:  (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB,
                  red:     Double(r) / 255,
                  green:   Double(g) / 255,
                  blue:    Double(b) / 255,
                  opacity: Double(a) / 255)
    }
}
