// AppActivityRow.swift

import SwiftUI

struct AppActivityRow: View {
    let appName:  String
    let isActive: Bool

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(hex: "f1f5f9"))
                    .frame(width: 32, height: 32)
                Image(systemName: "app.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "64748b"))
            }
            Text(appName)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(hex: "111827"))
            Spacer()
            if isActive {
                Image(systemName: "play.fill")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "16a34a"))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .background(isActive ? Color(hex: "f0fdf4") : Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "f3f4f6")), alignment: .bottom)
    }
}
