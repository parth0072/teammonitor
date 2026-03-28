// SettingsView.swift — app settings sheet
//
// Accessible from the gear icon in the header bar.

import SwiftUI
import UserNotifications

struct SettingsView: View {
    @ObservedObject private var manager = TrackingManager.shared
    @Environment(\.dismiss) private var dismiss

    @AppStorage("breakIntervalMinutes") var breakIntervalMinutes: Int = 60

    @State private var notificationStatus: String = "Checking…"
    @State private var testSent: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            HStack {
                Text("Settings")
                    .font(.system(size: 17, weight: .semibold))
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundColor(Color(hex: "9ca3af"))
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 24).padding(.top, 20).padding(.bottom, 16)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {

                    // MARK: Notifications
                    settingsSection("Notifications") {
                        VStack(alignment: .leading, spacing: 12) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Permission status")
                                        .font(.system(size: 13, weight: .medium))
                                    Text(notificationStatus)
                                        .font(.system(size: 12))
                                        .foregroundColor(notificationStatus == "Authorized"
                                            ? Color(hex: "16a34a") : Color(hex: "ef4444"))
                                }
                                Spacer()
                                Button("Open Settings") {
                                    NSWorkspace.shared.open(
                                        URL(string: "x-apple.systempreferences:com.apple.preference.notifications")!
                                    )
                                }
                                .font(.system(size: 11, weight: .semibold))
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(Color(hex: "f3f4f6")).cornerRadius(5)
                                .buttonStyle(.plain)
                            }

                            Divider()

                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Test notification")
                                        .font(.system(size: 13, weight: .medium))
                                    Text("Sends a test notification right now")
                                        .font(.system(size: 12))
                                        .foregroundColor(Color(hex: "6b7280"))
                                }
                                Spacer()
                                Button(testSent ? "Sent ✓" : "Send Test") {
                                    manager.sendNotification("🔔 This is a test notification from TeamMonitor.", isWarning: false)
                                    testSent = true
                                    DispatchQueue.main.asyncAfter(deadline: .now() + 3) { testSent = false }
                                }
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(testSent ? Color(hex: "16a34a") : Color(hex: "3b82f6"))
                                .cornerRadius(5)
                                .buttonStyle(.plain)
                                .animation(.easeInOut(duration: 0.2), value: testSent)
                            }
                        }
                    }

                    // MARK: Break Reminders
                    settingsSection("Break Reminders") {
                        HStack {
                            Text("Remind me every")
                                .font(.system(size: 13))
                            Spacer()
                            Picker("", selection: $breakIntervalMinutes) {
                                Text("30 min").tag(30)
                                Text("45 min").tag(45)
                                Text("1 hour").tag(60)
                                Text("90 min").tag(90)
                                Text("2 hours").tag(120)
                            }
                            .pickerStyle(.menu)
                            .frame(width: 110)
                        }
                    }

                    // MARK: Screen Recording
                    settingsSection("Screen Recording") {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Screenshot permission")
                                    .font(.system(size: 13, weight: .medium))
                                Text(manager.hasScreenPermission ? "Granted" : "Not granted — screenshots won't be captured")
                                    .font(.system(size: 12))
                                    .foregroundColor(manager.hasScreenPermission
                                        ? Color(hex: "16a34a") : Color(hex: "ef4444"))
                            }
                            Spacer()
                            if !manager.hasScreenPermission {
                                Button("Enable") { manager.openScreenRecordingSettings() }
                                    .font(.system(size: 11, weight: .semibold))
                                    .foregroundColor(Color(hex: "92400e"))
                                    .padding(.horizontal, 10).padding(.vertical, 5)
                                    .background(Color(hex: "fde68a")).cornerRadius(5)
                                    .buttonStyle(.plain)
                            }
                            Button("Re-check") { manager.recheckScreenPermission() }
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(Color(hex: "6b7280")).cornerRadius(5)
                                .buttonStyle(.plain)
                        }
                    }

                }
                .padding(24)
            }
        }
        .frame(width: 460)
        .background(Color(hex: "f9fafb"))
        .onAppear { checkNotificationStatus() }
    }

    // MARK: - Helpers

    private func checkNotificationStatus() {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                switch settings.authorizationStatus {
                case .authorized:  notificationStatus = "Authorized"
                case .denied:      notificationStatus = "Denied — enable in System Settings"
                case .notDetermined: notificationStatus = "Not requested yet"
                case .provisional: notificationStatus = "Provisional"
                case .ephemeral:   notificationStatus = "Ephemeral"
                @unknown default:  notificationStatus = "Unknown"
                }
            }
        }
    }

    @ViewBuilder
    private func settingsSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: "6b7280"))
                .textCase(.uppercase)
                .kerning(0.5)
            VStack(alignment: .leading, spacing: 0) {
                content()
                    .padding(14)
            }
            .background(Color.white)
            .cornerRadius(8)
            .overlay(RoundedRectangle(cornerRadius: 8).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
        }
    }
}
