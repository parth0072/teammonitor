// BreakReminderView.swift

import SwiftUI

struct BreakReminderView: View {
    let minutesWorked: Int
    let onSnooze:  () -> Void
    let onDismiss: () -> Void

    private var workedText: String {
        let h = minutesWorked / 60, m = minutesWorked % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m) min"
    }

    var body: some View {
        VStack(spacing: 28) {
            ZStack {
                Circle().fill(Color(hex: "fef3c7")).frame(width: 72, height: 72)
                Image(systemName: "cup.and.saucer.fill")
                    .font(.system(size: 32)).foregroundColor(Color(hex: "f59e0b"))
            }
            VStack(spacing: 8) {
                Text("Time for a Break!")
                    .font(.system(size: 22, weight: .bold)).foregroundColor(Color(hex: "111827"))
                Text("You've been working for \(workedText).\nStep away for 5–10 minutes to recharge.")
                    .font(.system(size: 14)).foregroundColor(Color(hex: "6b7280"))
                    .multilineTextAlignment(.center).lineSpacing(3)
            }
            HStack(spacing: 8) {
                Image(systemName: "lightbulb.fill").foregroundColor(Color(hex: "10b981")).font(.system(size: 12))
                Text("Short breaks improve focus and reduce eye strain.")
                    .font(.system(size: 12)).foregroundColor(Color(hex: "059669"))
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "ecfdf5")).cornerRadius(8)
            VStack(spacing: 10) {
                Button(action: onDismiss) {
                    Text("I'll take a break now")
                        .font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
                        .frame(maxWidth: .infinity).frame(height: 42)
                        .background(Color(hex: "10b981")).cornerRadius(10)
                }.buttonStyle(.plain)
                Button(action: onSnooze) {
                    Text("Snooze 15 min")
                        .font(.system(size: 13, weight: .medium)).foregroundColor(Color(hex: "6b7280"))
                        .frame(maxWidth: .infinity).frame(height: 38)
                        .background(Color(hex: "f1f5f9")).cornerRadius(10)
                }.buttonStyle(.plain)
            }
        }
        .padding(32).frame(width: 360).background(Color.white)
    }
}
