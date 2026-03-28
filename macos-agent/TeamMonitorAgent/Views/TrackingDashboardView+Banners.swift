// TrackingDashboardView+Banners.swift — status, permission, reminder, offline banners

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Status / error banner

    @ViewBuilder
    var statusBanner: some View {
        let msg = manager.statusMessage
        if !msg.isEmpty && msg != "Ready" && msg != "Tracking active"
            && msg != "Tracking resumed" && msg != "Session ended. Have a great day!" {
            HStack(spacing: 8) {
                Image(systemName: msg.hasPrefix("Error") ? "exclamationmark.triangle.fill" : "info.circle.fill")
                    .foregroundColor(msg.hasPrefix("Error") ? .red : .blue)
                Text(msg)
                    .font(.system(size: 12))
                    .foregroundColor(msg.hasPrefix("Error") ? .red : Color(hex: "374151"))
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 6)
            .background(msg.hasPrefix("Error") ? Color.red.opacity(0.08) : Color.blue.opacity(0.06))
        }
    }

    // MARK: – Screen recording permission banner

    @ViewBuilder
    var screenPermissionBanner: some View {
        if !manager.hasScreenPermission {
            HStack(spacing: 10) {
                Image(systemName: "camera.slash.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "92400e"))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Screen Recording disabled")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: "92400e"))
                    Text("Screenshots won't be captured. Enable in System Settings → Privacy & Security → Screen Recording.")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "b45309"))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Button("Enable") {
                    manager.openScreenRecordingSettings()
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: "92400e"))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color(hex: "fde68a")).cornerRadius(5).buttonStyle(.plain)

                Button("Re-check") {
                    manager.recheckScreenPermission()
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color(hex: "b45309")).cornerRadius(5).buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "fef3c7"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "fde68a")), alignment: .bottom)
        }
    }

    // MARK: – Start Timer Reminder banner

    @ViewBuilder
    var startTimerReminderBanner: some View {
        if showStartReminder && !manager.isTracking {
            HStack(spacing: 10) {
                Image(systemName: "timer")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color(hex: "7c3aed"))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Timer is not running")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color(hex: "4c1d95"))
                    Text("You haven't started tracking yet. Tap Start to begin.")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "6d28d9"))
                }
                Spacer()
                Button("Start Now") {
                    showStartReminder = false
                    if myTasks.isEmpty {
                        Task { await manager.punchIn() }
                    } else {
                        activeSheet = .taskPicker
                    }
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 12).padding(.vertical, 5)
                .background(Color(hex: "7c3aed")).cornerRadius(6).buttonStyle(.plain)

                Button("✕") { showStartReminder = false }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(hex: "7c3aed").opacity(0.5))
                    .frame(width: 24, height: 24).buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "ede9fe"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "ddd6fe")), alignment: .bottom)
        }
    }

    // MARK: – Offline banner

    @ViewBuilder
    var offlineBanner: some View {
        if manager.isOffline {
            HStack(spacing: 8) {
                Image(systemName: "wifi.slash").font(.system(size: 12))
                    .foregroundColor(Color(hex: "92400e"))
                Text("No internet — screenshots and sync paused")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(Color(hex: "92400e"))
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 6)
            .background(Color(hex: "fef3c7"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "fde68a")), alignment: .bottom)
        }
    }
}
