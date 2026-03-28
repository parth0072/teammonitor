// IdleAlertView.swift

import SwiftUI

struct IdleAlertView: View {
    @ObservedObject var manager: TrackingManager

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "clock.badge.questionmark.fill")
                .font(.system(size: 52)).foregroundColor(Color(hex: "f59e0b"))
            VStack(spacing: 8) {
                Text("You were away")
                    .font(.system(size: 20, weight: .semibold)).foregroundColor(Color(hex: "111827"))
                Text("No activity was detected for \(manager.idleAlertMinutes) minute\(manager.idleAlertMinutes == 1 ? "" : "s").\nWhat would you like to do with this time?")
                    .font(.system(size: 14)).foregroundColor(Color(hex: "6b7280")).multilineTextAlignment(.center)
            }
            HStack(spacing: 12) {
                Button { manager.resumeAfterIdle(countTime: false) } label: {
                    Text("Discard idle time").font(.system(size: 13, weight: .medium)).foregroundColor(.white)
                        .padding(.horizontal, 20).padding(.vertical, 10)
                        .background(Color(hex: "ef4444")).cornerRadius(8)
                }.buttonStyle(.plain)
                Button { manager.resumeAfterIdle(countTime: true) } label: {
                    Text("Count as work time").font(.system(size: 13, weight: .medium)).foregroundColor(.white)
                        .padding(.horizontal, 20).padding(.vertical, 10)
                        .background(Color(hex: "16a34a")).cornerRadius(8)
                }.buttonStyle(.plain)
            }
        }
        .padding(36).frame(width: 380).background(Color.white)
        .interactiveDismissDisabled(true)
    }
}
