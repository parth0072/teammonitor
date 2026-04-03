// TrackingDashboardView+Actions.swift — timer hero, punch section, idle warning

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Timer Hero

    var timerHero: some View {
        VStack(spacing: 0) {
            // Top row: date + camera badge
            HStack(alignment: .center, spacing: 8) {
                Text(Date(), format: .dateTime.weekday(.wide).month().day())
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(DS.textMuted)
                Spacer()
                HStack(spacing: 4) {
                    Image(systemName: "camera.fill").font(.system(size: 9))
                        .foregroundColor(manager.hasScreenPermission ? DS.indigo : DS.textMuted)
                    Text("\(manager.screenshotCount)")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(manager.hasScreenPermission ? DS.indigo : DS.textMuted)
                }
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(manager.hasScreenPermission ? DS.indigoLight : DS.bg)
                .cornerRadius(20)
            }
            .padding(.horizontal, 20).padding(.top, 16).padding(.bottom, 10)

            // Timer + status row
            HStack(alignment: .center, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    Text(liveMinutes == 0 ? "0m" : formatTimer(liveMinutes))
                        .font(.system(size: 38, weight: .bold, design: .rounded))
                        .foregroundColor(DS.text)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                        .animation(.spring(response: 0.4, dampingFraction: 0.8), value: liveMinutes)
                    Text("today")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(DS.textMuted)
                        .padding(.bottom, 2)
                }
                Spacer()
                statusPill
            }
            .padding(.horizontal, 20)

            // Task chip (below timer)
            if let task = manager.currentTask, manager.isTracking, !manager.isOnBreak {
                HStack(spacing: 8) {
                    Button { activeSheet = .taskPicker } label: {
                        HStack(spacing: 6) {
                            Circle().fill(Color(hex: task.projectColor)).frame(width: 7, height: 7)
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
                    }
                    .buttonStyle(.plain)
                    Spacer()
                }
                .padding(.horizontal, 20).padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
            } else if !manager.isTracking && manager.trackedMinutes == 0 {
                HStack {
                    Text("Ready to start — tap Start Tracking below")
                        .font(.system(size: 11))
                        .foregroundColor(DS.textMuted)
                    Spacer()
                }
                .padding(.horizontal, 20).padding(.top, 6)
            }

            Spacer().frame(height: 14)
        }
        .background(DS.surface)
        .overlay(Rectangle().frame(height: 1).foregroundColor(DS.border), alignment: .bottom)
    }

    // MARK: – Stats Bar

    var statsBar: some View {
        HStack(spacing: 0) {
            statCard(
                icon: "clock.fill",
                value: liveMinutes > 0 ? formatTimer(liveMinutes) : "—",
                label: "Today",
                color: DS.indigo
            )
            Divider().frame(height: 36)
            statCard(
                icon: "camera.fill",
                value: "\(manager.screenshotCount)",
                label: "Screenshots",
                color: manager.hasScreenPermission ? DS.indigo : DS.textMuted
            )
            Divider().frame(height: 36)
            statCard(
                icon: manager.isTracking ? "record.circle.fill" : "stop.circle",
                value: manager.isOnBreak ? "Break" : (manager.isTracking ? "Live" : "Idle"),
                label: "Status",
                color: manager.isOnBreak ? DS.amber : (manager.isTracking ? DS.emerald : DS.textMuted)
            )
            Divider().frame(height: 36)
            statCard(
                icon: "checklist",
                value: "\(myTasks.count)",
                label: "My Tasks",
                color: DS.indigo
            )
        }
        .padding(.vertical, 10)
        .background(DS.bg)
        .overlay(Rectangle().frame(height: 1).foregroundColor(DS.border), alignment: .bottom)
    }

    private func statCard(icon: String, value: String, label: String, color: Color) -> some View {
        VStack(spacing: 3) {
            HStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 10)).foregroundColor(color)
                Text(value)
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundColor(DS.text)
                    .monospacedDigit()
            }
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .foregroundColor(DS.textMuted)
                .textCase(.uppercase)
                .tracking(0.5)
        }
        .frame(maxWidth: .infinity)
    }

    // Animated status pill
    @ViewBuilder
    private var statusPill: some View {
        HStack(spacing: 5) {
            ZStack {
                if manager.isTracking && !manager.isOnBreak {
                    Circle()
                        .fill(DS.emerald.opacity(0.25))
                        .frame(width: 12, height: 12)
                        .scaleEffect(pulseScale)
                        .animation(
                            .easeInOut(duration: 1.2).repeatForever(autoreverses: true),
                            value: pulseScale
                        )
                }
                Circle()
                    .fill(manager.isOnBreak  ? DS.amber   :
                          manager.isTracking ? DS.emerald : DS.textMuted)
                    .frame(width: 6, height: 6)
            }
            Text(manager.isOnBreak  ? "On Break"    :
                 manager.isTracking ? "Tracking"    : "Not Started")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(manager.isOnBreak  ? DS.amber   :
                                 manager.isTracking ? DS.emerald : DS.textMuted)
        }
        .padding(.horizontal, 10).padding(.vertical, 5)
        .background(
            manager.isOnBreak  ? DS.amberLight  :
            manager.isTracking ? DS.emeraldLight : DS.bg
        )
        .cornerRadius(20)
        .animation(.easeInOut(duration: 0.3), value: manager.isTracking)
        .animation(.easeInOut(duration: 0.3), value: manager.isOnBreak)
    }

    // Pulse scale state — driven by onAppear in the view that uses it
    var pulseScale: CGFloat { manager.isTracking && !manager.isOnBreak ? 2.2 : 1.0 }

    // MARK: – Punch Section

    var punchSection: some View {
        HStack(spacing: 10) {
            if manager.isOnBreak {
                PunchButton(
                    label: "Resume Tracking",
                    icon: "play.fill",
                    color: DS.emerald,
                    style: .solid
                ) { manager.resumeFromBreak() }

            } else if manager.isTracking {
                PunchButton(
                    label: "Break",
                    icon: "pause.fill",
                    color: DS.amber,
                    style: .outline
                ) { Task { await manager.takeBreak() } }

                PunchButton(
                    label: "Punch Out",
                    icon: "stop.fill",
                    color: DS.red,
                    style: .solid
                ) { Task { await manager.punchOut() } }

            } else {
                PunchButton(
                    label: myTasks.isEmpty ? "Start Tracking" : "Start Tracking",
                    icon: "play.fill",
                    color: DS.indigo,
                    style: .gradient
                ) {
                    if myTasks.isEmpty && jiraIssues.isEmpty { Task { await manager.punchIn() } }
                    else { activeSheet = .taskPicker }
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .background(DS.surface)
        .overlay(Rectangle().frame(height: 1).foregroundColor(DS.border), alignment: .bottom)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: manager.isTracking)
        .animation(.spring(response: 0.3, dampingFraction: 0.7), value: manager.isOnBreak)
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
                    manager.showIdleWarning       = false
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
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

// MARK: – Reusable Punch Button

private enum PunchStyle { case solid, outline, gradient }

private struct PunchButton: View {
    let label: String
    let icon:  String
    let color: Color
    let style: PunchStyle
    let action: () -> Void

    @State private var pressed = false

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: style == .gradient ? 13 : 11))
                Text(label).font(.system(size: style == .gradient ? 15 : 13, weight: .bold))
            }
            .frame(maxWidth: .infinity)
            .frame(height: style == .gradient ? 50 : 46)
            .foregroundColor(style == .outline ? color : .white)
            .background(buttonBackground)
            .cornerRadius(style == .gradient ? 12 : 10)
            .overlay(
                style == .outline
                ? RoundedRectangle(cornerRadius: 10).stroke(color.opacity(0.4), lineWidth: 1.5)
                : nil
            )
            .shadow(
                color: color.opacity(style == .outline ? 0 : 0.3),
                radius: pressed ? 4 : 10, x: 0, y: pressed ? 2 : 5
            )
            .scaleEffect(pressed ? 0.97 : 1.0)
        }
        .buttonStyle(.plain)
        .onLongPressGesture(minimumDuration: 0, maximumDistance: 50,
            pressing: { p in withAnimation(.spring(response: 0.2, dampingFraction: 0.6)) { pressed = p } },
            perform: {}
        )
    }

    @ViewBuilder
    private var buttonBackground: some View {
        switch style {
        case .gradient:
            LinearGradient(
                colors: [color, color.opacity(0.75)],
                startPoint: .leading, endPoint: .trailing
            )
        case .solid:
            color
        case .outline:
            color.opacity(0.08)
        }
    }
}
