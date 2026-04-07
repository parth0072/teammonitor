// ForceUpdateView.swift – shown when admin requires a newer app version

import SwiftUI
import AppKit

struct ForceUpdateView: View {
    let requiredVersion: String
    let downloadURL:     String?

    var body: some View {
        VStack(spacing: 0) {
            // Top accent bar
            Rectangle()
                .fill(LinearGradient(
                    colors: [Color(hex: "6366f1"), Color(hex: "8b5cf6")],
                    startPoint: .leading, endPoint: .trailing))
                .frame(height: 4)

            VStack(spacing: 24) {
                // Icon
                ZStack {
                    Circle()
                        .fill(Color(hex: "6366f1").opacity(0.12))
                        .frame(width: 80, height: 80)
                    Image(systemName: "arrow.down.circle.fill")
                        .font(.system(size: 40))
                        .foregroundColor(Color(hex: "6366f1"))
                }
                .padding(.top, 32)

                VStack(spacing: 8) {
                    Text("Update Required")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundColor(Color(hex: "111827"))
                    Text("Your administrator requires version \(requiredVersion) or later.\nPlease update TeamMonitor to continue.")
                        .font(.system(size: 13))
                        .foregroundColor(Color(hex: "6b7280"))
                        .multilineTextAlignment(.center)
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)
                }

                // Current vs required
                HStack(spacing: 24) {
                    versionChip(label: "Current", version: currentVersion, color: "ef4444")
                    Image(systemName: "arrow.right")
                        .font(.system(size: 13))
                        .foregroundColor(Color(hex: "9ca3af"))
                    versionChip(label: "Required", version: requiredVersion, color: "16a34a")
                }
                .padding(.horizontal, 24)

                // Download button
                if let urlStr = downloadURL, let url = URL(string: urlStr) {
                    Button {
                        NSWorkspace.shared.open(url)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.down.circle.fill")
                                .font(.system(size: 15))
                            Text("Download Latest Version")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(
                            LinearGradient(
                                colors: [Color(hex: "6366f1"), Color(hex: "4f46e5")],
                                startPoint: .leading, endPoint: .trailing)
                        )
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 24)
                } else {
                    // Fallback to GitHub releases
                    Button {
                        NSWorkspace.shared.open(URL(string: "https://github.com/parth0072/teammonitor/releases")!)
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.down.circle.fill")
                                .font(.system(size: 15))
                            Text("Download Latest Version")
                                .font(.system(size: 14, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 13)
                        .background(
                            LinearGradient(
                                colors: [Color(hex: "6366f1"), Color(hex: "4f46e5")],
                                startPoint: .leading, endPoint: .trailing)
                        )
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 24)
                }

                Text("Contact your administrator if you need help.")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "9ca3af"))
                    .padding(.bottom, 28)
            }
        }
        .frame(width: 380)
        .background(Color.white)
        .cornerRadius(14)
        .shadow(color: .black.opacity(0.15), radius: 30, x: 0, y: 10)
    }

    private var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
    }

    private func versionChip(label: String, version: String, color: String) -> some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "6b7280"))
                .textCase(.uppercase)
            Text("v\(version)")
                .font(.system(size: 15, weight: .bold))
                .foregroundColor(Color(hex: color))
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color(hex: color).opacity(0.08))
        .cornerRadius(8)
        .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: color).opacity(0.25), lineWidth: 1))
    }
}

// MARK: - Version Comparison Helper

/// Returns true when `required` is strictly newer than `current`.
/// Compares semver components (major.minor.patch).
func isUpdateRequired(current: String, required: String) -> Bool {
    func parts(_ v: String) -> [Int] {
        v.split(separator: ".").compactMap { Int($0) }
    }
    let c = parts(current)
    let r = parts(required)
    let len = max(c.count, r.count)
    for i in 0..<len {
        let cv = i < c.count ? c[i] : 0
        let rv = i < r.count ? r[i] : 0
        if rv > cv { return true }
        if rv < cv { return false }
    }
    return false
}
