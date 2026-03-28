// TrackingDashboardView+Actions.swift — task button, action buttons, idle warning

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Big punch button

    var taskButton: some View {
        Button {
            if manager.isOnBreak {
                manager.resumeFromBreak()
            } else if !manager.isTracking {
                if myTasks.isEmpty {
                    Task { await manager.punchIn() }
                } else {
                    activeSheet = .taskPicker
                }
            }
        } label: {
            VStack(spacing: 5) {
                if manager.isTracking {
                    if manager.isOnBreak {
                        HStack(spacing: 6) {
                            Image(systemName: "pause.circle.fill").font(.system(size: 13))
                            Text("On Break — Timer Paused")
                                .font(.system(size: 13, weight: .semibold))
                        }
                        .foregroundColor(.white.opacity(0.9))
                        Text("Tap Resume to continue tracking")
                            .font(.system(size: 15)).foregroundColor(.white.opacity(0.75))
                    } else if let task = manager.currentTask {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color(hex: task.projectColor))
                                .frame(width: 8, height: 8)
                            Text(task.projectName)
                                .font(.system(size: 12, weight: .semibold))
                            Image(systemName: "play.fill").font(.system(size: 10))
                        }
                        .foregroundColor(.white.opacity(0.85))
                        Text(task.name)
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundColor(.white)
                    } else {
                        HStack(spacing: 5) {
                            Text("Tracking — no task selected")
                                .font(.system(size: 13, weight: .semibold))
                            Image(systemName: "play.fill").font(.system(size: 10))
                        }
                        .foregroundColor(.white.opacity(0.85))
                        Text("Timer running")
                            .font(.system(size: 17)).foregroundColor(.white)
                    }
                } else {
                    Text("▶  Click to Punch In")
                        .font(.system(size: 17)).foregroundColor(.white)
                    if !myTasks.isEmpty {
                        Text("Tap to choose a task")
                            .font(.system(size: 11)).foregroundColor(.white.opacity(0.7))
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 22)
            .background(
                manager.isOnBreak  ? Color(hex: "f59e0b") :
                manager.isTracking ? Color(hex: "16a34a") : Color(hex: "3b82f6")
            )
        }
        .buttonStyle(.plain)
    }

    // MARK: – Action buttons

    var actionButtons: some View {
        Group {
            if manager.isOnBreak {
                Button { manager.resumeFromBreak() } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "play.fill").font(.system(size: 12))
                        Text("Resume Tracking").font(.system(size: 14, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity).frame(height: 44)
                    .background(Color(hex: "22c55e"))
                }
                .buttonStyle(.plain)
            } else {
                HStack(spacing: 8) {
                    Button { } label: {
                        Image(systemName: "info.circle").font(.system(size: 13))
                            .foregroundColor(Color(hex: "374151"))
                            .frame(width: 34, height: 30)
                            .background(Color.white)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color(hex: "d1d5db"), lineWidth: 1))
                    }.buttonStyle(.plain)

                    Button { activeSheet = .reports } label: {
                        HStack(spacing: 5) {
                            Image(systemName: "doc.text").font(.system(size: 11))
                            Text("Report").font(.system(size: 12))
                        }
                        .foregroundColor(Color(hex: "374151"))
                        .padding(.horizontal, 10).frame(height: 30)
                        .background(Color.white)
                        .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color(hex: "d1d5db"), lineWidth: 1))
                    }.buttonStyle(.plain)

                    if manager.isTracking {
                        HStack(spacing: 4) {
                            Image(systemName: "camera.fill").font(.system(size: 10))
                                .foregroundColor(manager.hasScreenPermission ? Color(hex: "3b82f6") : Color(hex: "9ca3af"))
                            Text("\(manager.screenshotCount) screenshots").font(.system(size: 11))
                                .foregroundColor(manager.hasScreenPermission ? Color(hex: "374151") : Color(hex: "9ca3af"))
                        }
                        .padding(.horizontal, 8).frame(height: 30)
                        .background(Color(hex: "f1f5f9")).cornerRadius(4)

                        Button {
                            manager.captureScreenshotNow()
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "camera.viewfinder").font(.system(size: 10))
                                Text("Capture").font(.system(size: 11))
                            }
                            .foregroundColor(Color(hex: "3b82f6"))
                            .padding(.horizontal, 8).frame(height: 30)
                            .background(Color.white)
                            .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color(hex: "3b82f6"), lineWidth: 1))
                        }.buttonStyle(.plain)
                    }

                    Spacer()

                    if manager.isTracking {
                        Button { Task { await manager.takeBreak() } } label: {
                            HStack(spacing: 5) {
                                Image(systemName: "pause.fill").font(.system(size: 9))
                                Text("Take a break").font(.system(size: 12))
                            }
                            .foregroundColor(.white).padding(.horizontal, 12).frame(height: 30)
                            .background(Color(hex: "f59e0b")).cornerRadius(4)
                        }.buttonStyle(.plain)

                        Button { Task { await manager.punchOut() } } label: {
                            HStack(spacing: 5) {
                                Image(systemName: "stop.fill").font(.system(size: 9))
                                Text("Punch Out").font(.system(size: 12))
                            }
                            .foregroundColor(.white).padding(.horizontal, 12).frame(height: 30)
                            .background(Color(hex: "ef4444")).cornerRadius(4)
                        }.buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            }
        }
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Idle warning

    @ViewBuilder
    var idleWarning: some View {
        if manager.isTracking {
            HStack {
                Spacer()
                Text("Your timeout is set to 5 minutes")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "d97706"))
                Spacer()
            }
            .padding(.vertical, 7).background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
        }
    }
}
