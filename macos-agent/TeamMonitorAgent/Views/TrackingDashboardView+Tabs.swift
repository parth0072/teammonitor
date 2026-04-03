// TrackingDashboardView+Tabs.swift — tab content views (navigation handled by sidebar)

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Content router

    @ViewBuilder
    var tabContent: some View {
        switch selectedTab {
        case .tasks:    tasksTabContent
        case .activity: activityTabContent
        }
    }

    // MARK: – Tasks tab

    var tasksTabContent: some View {
        VStack(spacing: 0) {
            // Search + new task toolbar
            HStack(spacing: 8) {
                HStack(spacing: 6) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 12))
                        .foregroundColor(DS.textMuted)
                    TextField("Search tasks…", text: $searchText)
                        .font(.system(size: 13)).textFieldStyle(.plain)
                        .foregroundColor(DS.text)
                }
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(DS.bg)
                .cornerRadius(8)
                .overlay(RoundedRectangle(cornerRadius: 8).stroke(DS.border, lineWidth: 1))

                Button { loadTasks() } label: {
                    Image(systemName: tasksLoading ? "arrow.clockwise" : "arrow.clockwise")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(DS.textMuted)
                        .rotationEffect(.degrees(tasksLoading ? 360 : 0))
                        .animation(tasksLoading ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: tasksLoading)
                        .padding(7)
                        .background(DS.bg)
                        .cornerRadius(8)
                        .overlay(RoundedRectangle(cornerRadius: 8).stroke(DS.border, lineWidth: 1))
                }
                .buttonStyle(.plain)
                .help("Refresh tasks & Jira issues")
                .disabled(tasksLoading)

                Button {
                    activeSheet = .newTask
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 11, weight: .bold))
                        Text("New Task").font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 12).padding(.vertical, 7)
                    .background(
                        LinearGradient(colors: [DS.indigo, DS.indigoDark],
                                       startPoint: .leading, endPoint: .trailing)
                    )
                    .cornerRadius(8)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(DS.surface)
            .overlay(Rectangle().frame(height: 1).foregroundColor(DS.border), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    let filtered = myTasks.filter {
                        searchText.isEmpty
                        || $0.name.localizedCaseInsensitiveContains(searchText)
                        || $0.projectName.localizedCaseInsensitiveContains(searchText)
                    }

                    if tasksLoading {
                        VStack(spacing: 12) {
                            LottieOrIcon(lottieName: "lf_loading", icon: "arrow.clockwise",
                                         iconColor: DS.indigo, size: 72)
                            Text("Loading tasks…")
                                .font(.system(size: 12))
                                .foregroundColor(DS.textMuted)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 48)
                    } else if let err = tasksError {
                        VStack(spacing: 12) {
                            LottieOrIcon(lottieName: "lf_error", icon: "exclamationmark.triangle.fill",
                                         iconColor: DS.amber, size: 72)
                            Text("Could not load tasks")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(DS.text)
                            Text(err)
                                .font(.system(size: 11))
                                .foregroundColor(DS.textMuted)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)
                            Button { loadTasks() } label: {
                                HStack(spacing: 5) {
                                    Image(systemName: "arrow.clockwise").font(.system(size: 11))
                                    Text("Retry")
                                }
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 16).padding(.vertical, 7)
                                .background(DS.indigo).cornerRadius(7)
                            }.buttonStyle(.plain)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 48)
                    } else if filtered.isEmpty && !jiraConnected {
                        VStack(spacing: 10) {
                            LottieOrIcon(lottieName: "empty_tasks", icon: "checklist",
                                         iconColor: DS.indigo, size: 90)
                            Text(myTasks.isEmpty ? "No tasks yet" : "No tasks match search")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(DS.text)
                            if myTasks.isEmpty {
                                Text("Ask your admin to assign tasks,\nor create one with + New Task")
                                    .font(.system(size: 12))
                                    .foregroundColor(DS.textMuted)
                                    .multilineTextAlignment(.center)
                            }
                            Button { loadTasks() } label: {
                                HStack(spacing: 5) {
                                    Image(systemName: "arrow.clockwise").font(.system(size: 11))
                                    Text("Refresh")
                                }
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(DS.indigo)
                                .padding(.horizontal, 14).padding(.vertical, 6)
                                .background(DS.indigoLight)
                                .cornerRadius(7)
                            }.buttonStyle(.plain)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 40)
                    } else {
                        ForEach(Array(filtered.enumerated()), id: \.element.id) { idx, task in
                            TaskRow2(
                                task: task,
                                isActive: manager.currentTask?.id == task.id && manager.isTracking,
                                onStart: { Task { await manager.punchIn(task: task) } }
                            )
                            .transition(.asymmetric(
                                insertion: .move(edge: .top).combined(with: .opacity),
                                removal: .opacity
                            ))
                        }
                    }

                    // Jira issues section
                    if jiraConnected {
                        jiraSectionHeader
                        if jiraLoading {
                            ProgressView().padding(.vertical, 16).frame(maxWidth: .infinity)
                        } else if jiraIssues.isEmpty {
                            Text("No open Jira issues assigned to you")
                                .font(.system(size: 12))
                                .foregroundColor(DS.textMuted)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 16)
                                .background(DS.surface)
                        } else {
                            let filteredJira = jiraIssues.filter {
                                searchText.isEmpty
                                || $0.summary.localizedCaseInsensitiveContains(searchText)
                                || $0.key.localizedCaseInsensitiveContains(searchText)
                                || $0.projectName.localizedCaseInsensitiveContains(searchText)
                            }
                            ForEach(filteredJira) { issue in
                                JiraIssueRow(issue: issue)
                            }
                        }
                    }
                }
            }
            .background(DS.surface)
        }
    }

    // MARK: – Jira section header

    var jiraSectionHeader: some View {
        HStack(spacing: 6) {
            ZStack {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(hex: "0052CC"))
                    .frame(width: 18, height: 18)
                Text("J")
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(.white)
            }
            Text("Jira — My Issues")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: "0052CC"))
            Spacer()
            Button { loadJiraIssues(forceRefresh: true) } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 10))
                    .foregroundColor(DS.textMuted)
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(DS.indigoLight)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "BFDBFE")), alignment: .bottom)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "BFDBFE")), alignment: .top)
    }

    // MARK: – Activity tab

    var activityTabContent: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Recent App Activity")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(DS.textSecond)
                Spacer()
                if !manager.isTracking {
                    Text("Punch in to start")
                        .font(.system(size: 11))
                        .foregroundColor(DS.textMuted)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(DS.surface)
            .overlay(Rectangle().frame(height: 1).foregroundColor(DS.border), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if manager.recentApps.isEmpty {
                        VStack(spacing: 10) {
                            LottieOrIcon(
                                lottieName: manager.isTracking ? "lf_tracking" : "empty_tasks",
                                icon: manager.isTracking ? "record.circle" : "desktopcomputer",
                                iconColor: manager.isTracking ? DS.emerald : DS.indigo,
                                size: 80
                            )
                            Text(manager.isTracking ? "Monitoring app usage…" : "Punch in to start monitoring")
                                .font(.system(size: 13))
                                .foregroundColor(DS.textMuted)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 48)
                    } else {
                        ForEach(manager.recentApps, id: \.self) { app in
                            AppActivityRow(appName: app, isActive: app == manager.currentApp)
                        }
                    }
                }
            }
            .background(DS.surface)
        }
    }
}

// MARK: – Jira Issue Row

struct JiraIssueRow: View {
    let issue: JiraIssue

    private var statusColor: Color {
        switch issue.statusCategory {
        case "indeterminate": return Color(hex: "3B82F6")
        case "done":          return Color(hex: "10B981")
        default:              return Color(hex: "64748B")
        }
    }
    private var statusBg: Color {
        switch issue.statusCategory {
        case "indeterminate": return Color(hex: "EFF6FF")
        case "done":          return Color(hex: "DCFCE7")
        default:              return Color(hex: "F1F5F9")
        }
    }
    private var priorityIcon: String {
        switch issue.priority {
        case "Highest": return "🔴"
        case "High":    return "🟠"
        case "Medium":  return "🟡"
        case "Low":     return "🔵"
        default:        return "⚪"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: "0052CC"))
                .frame(width: 3, height: 36)
            VStack(alignment: .leading, spacing: 3) {
                Text(issue.summary)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(DS.text).lineLimit(1)
                HStack(spacing: 6) {
                    Text(issue.key).font(.system(size: 11, weight: .bold)).foregroundColor(Color(hex: "0052CC"))
                    Text("·").font(.system(size: 11)).foregroundColor(DS.border)
                    Text(issue.projectName).font(.system(size: 11)).foregroundColor(DS.textMuted)
                }
            }
            Spacer()
            HStack(spacing: 6) {
                Text(priorityIcon).font(.system(size: 11))
                Text(issue.status)
                    .font(.system(size: 10, weight: .semibold)).foregroundColor(statusColor)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(statusBg).cornerRadius(8)
                Button {
                    if let url = URL(string: issue.url) { NSWorkspace.shared.open(url) }
                } label: {
                    Image(systemName: "arrow.up.right.square").font(.system(size: 11)).foregroundColor(DS.textMuted)
                }.buttonStyle(.plain).help("Open \(issue.key) in Jira")
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(DS.surface)
        .overlay(Rectangle().frame(height: 1).foregroundColor(DS.bg), alignment: .bottom)
    }
}
