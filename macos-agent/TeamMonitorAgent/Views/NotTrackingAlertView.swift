// NotTrackingAlertView.swift — modal popup shown after 5 min of no tracking

import SwiftUI

struct NotTrackingAlertView: View {
    @ObservedObject var manager: TrackingManager
    let onStart: () -> Void

    var body: some View {
        VStack(spacing: 28) {

            // Icon
            ZStack {
                Circle()
                    .fill(Color(hex: "fef3c7"))
                    .frame(width: 88, height: 88)
                VStack(spacing: 2) {
                    Image(systemName: "timer")
                        .font(.system(size: 38, weight: .semibold))
                        .foregroundColor(Color(hex: "d97706"))
                    Image(systemName: "exclamationmark")
                        .font(.system(size: 13, weight: .black))
                        .foregroundColor(Color(hex: "b45309"))
                }
            }

            // Text
            VStack(spacing: 10) {
                Text("Timer is not running!")
                    .font(.system(size: 22, weight: .bold))
                    .foregroundColor(Color(hex: "111827"))

                if manager.minutesNotTracking > 0 {
                    Text("You haven't been tracking for \(manager.minutesNotTracking) minute\(manager.minutesNotTracking == 1 ? "" : "s").\nDon't forget to log your time.")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "6b7280"))
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                } else {
                    Text("You haven't started tracking yet.\nTap Start to begin logging your time.")
                        .font(.system(size: 14))
                        .foregroundColor(Color(hex: "6b7280"))
                        .multilineTextAlignment(.center)
                        .lineSpacing(3)
                }
            }

            // Buttons
            VStack(spacing: 10) {
                Button(action: onStart) {
                    HStack(spacing: 8) {
                        Image(systemName: "play.fill")
                            .font(.system(size: 13))
                        Text("Start Tracking Now")
                            .font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(Color(hex: "16a34a"))
                    .cornerRadius(10)
                }
                .buttonStyle(.plain)

                Button {
                    manager.showNotTrackingAlert = false
                } label: {
                    Text("Remind me in 5 minutes")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "6b7280"))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Color(hex: "f3f4f6"))
                        .cornerRadius(10)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(36)
        .frame(width: 360)
        .background(Color.white)
        .interactiveDismissDisabled(true)
    }
}
