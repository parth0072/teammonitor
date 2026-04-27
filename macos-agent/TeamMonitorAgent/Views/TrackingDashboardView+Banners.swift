// TrackingDashboardView+Banners.swift — status, permission, reminder, offline, update banners

import SwiftUI

// Persisted: user tapped "Enable" — don't auto-re-show on every launch.
// Reset automatically when permission is actually granted.
private let kScreenPermDismissed = "tm_screen_perm_dismissed"

extension TrackingDashboardView {

    // MARK: – Status / error banner

    @ViewBuilder
    var statusBanner: some View {
        let msg = manager.statusMessage
        // Only surface error-level messages — all other statuses are shown in the timer hero
        if msg.hasPrefix("Error") || msg.hasPrefix("Failed") {
            HStack(spacing: 8) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(DS.red)
                Text(msg)
                    .font(.system(size: 12))
                    .foregroundColor(DS.red)
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 6)
            .background(DS.red.opacity(0.08))
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    // MARK: – Screen recording permission banner

    @ViewBuilder
    var screenPermissionBanner: some View {
        // If permission is now granted, clear the dismissed flag so the banner
        // won't silently hide a future revocation.
        let dismissed = !manager.hasScreenPermission &&
                        UserDefaults.standard.bool(forKey: kScreenPermDismissed)

        if !manager.hasScreenPermission && !dismissed {
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
                    UserDefaults.standard.set(true, forKey: kScreenPermDismissed)
                    manager.openScreenRecordingSettings()
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: "92400e"))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color(hex: "fde68a")).cornerRadius(5).buttonStyle(.plain)

                Button("Re-check") {
                    UserDefaults.standard.set(false, forKey: kScreenPermDismissed)
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
        // Show when not tracking (punched out) OR on break
        if manager.showStartReminder && (!manager.isTracking || manager.isOnBreak) {
            let onBreak = manager.isOnBreak
            HStack(spacing: 10) {
                Image(systemName: onBreak ? "pause.circle.fill" : "timer")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(onBreak ? DS.amber : Color(hex: "7c3aed"))
                VStack(alignment: .leading, spacing: 1) {
                    Text(onBreak ? "Still on break" : "Timer is not running")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(onBreak ? Color(hex: "92400e") : Color(hex: "4c1d95"))
                    Text(onBreak
                         ? "You've been on break for \(manager.minutesNotTracking) min. Ready to resume?"
                         : "You haven't tracked for \(manager.minutesNotTracking) min. Don't forget to log your time!")
                        .font(.system(size: 11))
                        .foregroundColor(onBreak ? Color(hex: "b45309") : Color(hex: "6d28d9"))
                }
                Spacer()
                if onBreak {
                    Button("Resume") {
                        manager.showStartReminder = false
                        manager.resumeFromBreak()
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(DS.amber).cornerRadius(6).buttonStyle(.plain)
                } else {
                    Button("Start Now") {
                        manager.showStartReminder = false
                        activeSheet = .taskPicker
                    }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 12).padding(.vertical, 5)
                    .background(Color(hex: "7c3aed")).cornerRadius(6).buttonStyle(.plain)
                }

                Button("✕") { manager.showStartReminder = false }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(onBreak ? DS.amber.opacity(0.6) : Color(hex: "7c3aed").opacity(0.5))
                    .frame(width: 24, height: 24).buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(onBreak ? Color(hex: "fef3c7") : Color(hex: "ede9fe"))
            .overlay(Rectangle().frame(height: 1)
                .foregroundColor(onBreak ? Color(hex: "fde68a") : Color(hex: "ddd6fe")),
                     alignment: .bottom)
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    // MARK: – Idle-paused banner

    @ViewBuilder
    var idleBanner: some View {
        if manager.isTracking && manager.isIdle {
            HStack(spacing: 10) {
                Image(systemName: "pause.circle.fill")
                    .font(.system(size: 14))
                    .foregroundColor(DS.amber)
                VStack(alignment: .leading, spacing: 1) {
                    Text("Timer paused — you're idle")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: "92400E"))
                    Text("Move your mouse or press a key to resume")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "B45309"))
                }
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "fef3c7"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "fde68a")), alignment: .bottom)
            .transition(.move(edge: .top).combined(with: .opacity))
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
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}
