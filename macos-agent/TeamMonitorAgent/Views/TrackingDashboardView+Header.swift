// TrackingDashboardView+Header.swift — top bar, stats bar, toast view

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Header bar

    var headerBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(Color(hex: "3b82f6")).frame(width: 30, height: 30)
                    Image(systemName: "person.fill").font(.system(size: 13)).foregroundColor(.white)
                }
                Text(auth.email.isEmpty ? "employee@company.com" : auth.email)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(hex: "3b82f6"))
            }
            Spacer()
            Button("✏  Manual Entry") { activeSheet = .manualEntry }
                .buttonStyle(TLHeaderButtonStyle())
            Button("📋  Reports") { activeSheet = .reports }
                .buttonStyle(TLHeaderButtonStyle())
            Button { loadTasks() } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(Color(hex: "3b82f6"))
                    .cornerRadius(5)
            }.buttonStyle(.plain)

            Button { activeSheet = .settings } label: {
                Image(systemName: "gearshape")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "6b7280"))
                    .frame(width: 28, height: 28)
                    .background(Color(hex: "f3f4f6"))
                    .cornerRadius(5)
                    .overlay(RoundedRectangle(cornerRadius: 5).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
            }.buttonStyle(.plain)

            Button("Sign Out") {
                Task {
                    if manager.isTracking { await manager.punchOut() }
                    APIService.shared.logout()
                    await MainActor.run { auth.isLoggedIn = false }
                }
            }
            .buttonStyle(.plain)
            .font(.system(size: 12))
            .foregroundColor(Color(hex: "9ca3af"))
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Stats bar

    var statsBar: some View {
        HStack(spacing: 0) {
            VStack(spacing: 3) {
                Text(formatHoursMinutes(manager.minutesSinceResume))
                    .font(.system(size: 18, weight: .light))
                    .foregroundColor(Color(hex: "374151"))
                Text("since last task resume")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "9ca3af"))
            }
            .frame(maxWidth: .infinity)
            Divider().frame(height: 42)
            VStack(spacing: 3) {
                Text(formatHoursMinutes(liveMinutes))
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(Color(hex: "111827"))
                Text("total current working day")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "9ca3af"))
            }
            .frame(maxWidth: .infinity)
            Divider().frame(height: 42)
            VStack(spacing: 3) {
                if !manager.isTracking {
                    Text(reminderCountdownText)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Color(hex: "f59e0b"))
                    Text("next reminder in")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "9ca3af"))
                } else {
                    Text(timerStatusText)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(timerStatusColor)
                    Text("Timer status")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "9ca3af"))
                }
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 14)
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Toast view

    func toastView(_ t: ToastMessage) -> some View {
        HStack(spacing: 10) {
            Image(systemName: t.isWarning ? "exclamationmark.triangle.fill" : "clock.fill")
                .foregroundColor(t.isWarning ? Color(hex: "f59e0b") : Color(hex: "3b82f6"))
            Text(t.text)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(hex: "1e293b"))
            Spacer()
            Button { withAnimation { toast = nil } } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(hex: "9ca3af"))
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(Color.white)
        .cornerRadius(10)
        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 4)
        .padding(.horizontal, 24)
    }
}
