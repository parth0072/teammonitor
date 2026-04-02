// TrackingDashboardView+Actions.swift — timer hero, punch section, idle warning

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Timer Hero

    var timerHero: some View {
        VStack(spacing: 14) {

            // Top row: date + screenshot badge
            HStack(alignment: .center) {
                Text(Date(), format: .dateTime.weekday(.wide).month().day())
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(DS.textMuted)
                Spacer()
                if manager.isTracking {
                    HStack(spacing: 5) {
                        Image(systemName: "camera.fill")
                            .font(.system(size: 10))
                            .foregroundColor(manager.hasScreenPermission ? DS.indigo : DS.textMuted)
                        Text("\(manager.screenshotCount)")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(manager.hasScreenPermission ? DS.indigo : DS.textMuted)
                    }
                    .padding(.horizontal, 9).padding(.vertical, 4)
                    .background(manager.hasScreenPermission ? DS.indigoLight : DS.bg)
                    .cornerRadius(20)
                }
            }

            // Large timer display
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(liveMinutes == 0 ? "0m" : formatTimer(liveMinutes))
                    .font(.system(size: 46, weight: .bold, design: .rounded))
                    .foregroundColor(DS.text)
                    .monospacedDigit()
                Text("today")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(DS.textMuted)
                    .padding(.bottom, 4)
                Spacer()
            }

            // Status pill + current task chip
            HStack(spacing: 8) {
                // Status pill
                HStack(spacing: 5) {
                    Circle()
                        .fill(manager.isOnBreak  ? DS.amber   :
                              manager.isTracking ? DS.emerald : DS.textMuted)
                        .frame(width: 6, height: 6)
                    Text(manager.isOnBreak  ? "On Break"    :
                         manager.isTracking ? "Tracking"    : "Not Started")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(manager.isOnBreak  ? DS.amber   :
                                         manager.isTracking ? DS.emerald : DS.textMuted)
                }
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(manager.isOnBreak  ? DS.amberLight  :
                            manager.isTracking ? DS.emeraldLight : DS.bg)
                .cornerRadius(20)

                // Current task chip (tappable to switch task)
                if let task = manager.currentTask, manager.isTracking, !manager.isOnBreak {
                    Button { activeSheet = .taskPicker } label: {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color(hex: task.projectColor))
                                .frame(width: 7, height: 7)
                            Text(task.name)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(DS.textSecond)
                                .lineLimit(1)
                            Image(systemName: "chevron.right")
                                .font(.system(size: 9, weight: .semibold))
                                .foregroundColor(DS.textMuted)
                        }
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(DS.bg)
                        .cornerRadius(20)
                        .overlay(RoundedRectangle(cornerRadius: 20).stroke(DS.border, lineWidth: 1))
                    }.buttonStyle(.plain)
                } else if !manager.isTracking {
                    Text(manager.minutesSinceResume > 0
                         ? "Last active \(formatTimer(manager.minutesSinceResume)) ago"
                         : "Ready to start")
                        .font(.system(size: 12))
                        .foregroundColor(DS.textMuted)
                }

                Spacer()
            }
        }
        .padding(20)
        .background(DS.surface)
        .overlay(Rectangle().frame(height: 1).foregroundColor(DS.border), alignment: .bottom)
    }

    // MARK: – Punch Section

    var punchSection: some View {
        HStack(spacing: 10) {
            if manager.isOnBreak {
                // Resume
                Button { manager.resumeFromBreak() } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "play.fill").font(.system(size: 12))
                        Text("Resume Tracking").font(.system(size: 14, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .foregroundColor(.white)
                    .background(DS.emerald)
                    .cornerRadius(10)
                }.buttonStyle(.plain)

            } else if manager.isTracking {
                // Break
                Button { Task { await manager.takeBreak() } } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "pause.fill").font(.system(size: 11))
                        Text("Break").font(.system(size: 13, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .foregroundColor(DS.amber)
                    .background(DS.amberLight)
                    .cornerRadius(10)
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(DS.amber.opacity(0.35), lineWidth: 1))
                }.buttonStyle(.plain)

                // Punch Out
                Button { Task { await manager.punchOut() } } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "stop.fill").font(.system(size: 11))
                        Text("Punch Out").font(.system(size: 13, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity).frame(height: 46)
                    .foregroundColor(.white)
                    .background(DS.red)
                    .cornerRadius(10)
                }.buttonStyle(.plain)

            } else {
                // Start Tracking — gradient CTA
                Button {
                    if myTasks.isEmpty { Task { await manager.punchIn() } }
                    else { activeSheet = .taskPicker }
                } label: {
                    HStack(spacing: 9) {
                        Image(systemName: "play.fill").font(.system(size: 13))
                        Text(myTasks.isEmpty ? "Start Tracking" : "Start Tracking — Pick Task")
                            .font(.system(size: 15, weight: .bold))
                    }
                    .frame(maxWidth: .infinity).frame(height: 50)
                    .foregroundColor(.white)
                    .background(
                        LinearGradient(
                            colors: [DS.indigo, DS.indigoDark],
                            startPoint: .leading, endPoint: .trailing
                        )
                    )
                    .cornerRadius(12)
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(DS.surface)
        .overlay(Rectangle().frame(height: 1).foregroundColor(DS.border), alignment: .bottom)
    }

    // MARK: – Idle Warning

    @ViewBuilder
    var idleWarning: some View {
        if manager.showIdleWarning {
            HStack(spacing: 10) {
                Image(systemName: "clock.badge.exclamationmark.fill")
                    .font(.system(size: 14))
                    .foregroundColor(DS.amber)
                VStack(alignment: .leading, spacing: 1) {
                    Text("No activity — pausing in \(manager.idleWarningSecondsLeft)s")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: "92400E"))
                    Text("Move your mouse or press a key to stay active")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "B45309"))
                }
                Spacer()
                Button("I'm here") {
                    manager.showIdleWarning      = false
                    manager.idleWarningSecondsLeft = 0
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color(hex: "D97706"))
                .cornerRadius(6)
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(DS.amberLight)
            .overlay(Rectangle().frame(height: 1).foregroundColor(DS.amber.opacity(0.3)), alignment: .bottom)
        }
    }
}
