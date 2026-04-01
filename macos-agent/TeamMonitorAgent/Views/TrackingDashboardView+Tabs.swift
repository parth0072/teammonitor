// TrackingDashboardView+Tabs.swift — tab bar and all tab content views

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Tab bar

    var tabBar: some View {
        HStack(spacing: 0) {
            ForEach([DashTab.tasks, .activity, .notes], id: \.self) { tab in
                Button { selectedTab = tab } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 12, weight: selectedTab == tab ? .semibold : .regular))
                        .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : Color(hex: "6b7280"))
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .overlay(
                            Rectangle().frame(height: 2)
                                .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : .clear),
                            alignment: .bottom
                        )
                }.buttonStyle(.plain)
            }
            Spacer()
            HStack(spacing: 4) {
                Text("Status").font(.system(size: 12)).foregroundColor(Color(hex: "6b7280"))
                Picker("", selection: $workStatus) {
                    Text("WFO").tag("WFO")
                    Text("WFH").tag("WFH")
                    Text("Remote").tag("Remote")
                }
                .pickerStyle(.menu).frame(width: 80).font(.system(size: 12))
            }
            .padding(.trailing, 12)
        }
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Tab content router

    @ViewBuilder
    var tabContent: some View {
        switch selectedTab {
        case .tasks:    tasksTabContent
        case .activity: activityTabContent
        case .notes:    notesTabContent
        }
    }

    // MARK: – Tasks tab

    var tasksTabContent: some View {
        VStack(spacing: 0) {
            // ── search + new task toolbar ──
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 12))
                    .foregroundColor(Color(hex: "9ca3af"))
                TextField("Search tasks…", text: $searchText)
                    .font(.system(size: 12)).textFieldStyle(.plain)
                Spacer()
                Button {
                    activeSheet = .newTask
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 11, weight: .bold))
                        Text("New Task").font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color(hex: "3b82f6")).cornerRadius(6)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "f9fafb"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    let filtered = myTasks.filter {
                        searchText.isEmpty
                        || $0.name.localizedCaseInsensitiveContains(searchText)
                        || $0.projectName.localizedCaseInsensitiveContains(searchText)
                    }

                    // ── TeamMonitor tasks ──
                    if tasksLoading {
                        ProgressView().padding(.vertical, 36).frame(maxWidth: .infinity)
                    } else if let err = tasksError {
                        VStack(spacing: 10) {
                            Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 28))
                                .foregroundColor(Color(hex: "f59e0b"))
                            Text("Could not load tasks")
                                .font(.system(size: 13, weight: .semibold)).foregroundColor(Color(hex: "374151"))
                            Text(err)
                                .font(.system(size: 11)).foregroundColor(Color(hex: "9ca3af"))
                                .multilineTextAlignment(.center).padding(.horizontal, 24)
                            Button("Retry") { loadTasks() }
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 16).padding(.vertical, 6)
                                .background(Color(hex: "3b82f6")).cornerRadius(6).buttonStyle(.plain)
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 36)
                    } else if filtered.isEmpty && !jiraConnected {
                        VStack(spacing: 10) {
                            Image(systemName: "checklist").font(.system(size: 30))
                                .foregroundColor(Color(hex: "d1d5db"))
                            Text(myTasks.isEmpty ? "No tasks assigned yet" : "No tasks match search")
                                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
                            if myTasks.isEmpty {
                                Text("Ask your admin to create a project and assign tasks, or tap + New Task")
                                    .font(.system(size: 11)).foregroundColor(Color(hex: "c4c9d4"))
                                    .multilineTextAlignment(.center).padding(.horizontal, 24)
                            }
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 36)
                    } else {
                        ForEach(filtered) { task in
                            TaskRow2(
                                task: task,
                                isActive: manager.currentTask?.id == task.id && manager.isTracking,
                                onStart: { Task { await manager.punchIn(task: task) } }
                            )
                        }
                    }

                    // ── Jira issues section ──
                    if jiraConnected {
                        jiraSectionHeader
                        if jiraLoading {
                            ProgressView().padding(.vertical, 16).frame(maxWidth: .infinity)
                        } else if jiraIssues.isEmpty {
                            Text("No open Jira issues assigned to you")
                                .font(.system(size: 12)).foregroundColor(Color(hex: "9ca3af"))
                                .frame(maxWidth: .infinity).padding(.vertical, 16)
                                .background(Color.white)
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
            .background(Color.white)
        }
    }

    // ── Jira section header ────────────────────────────────────────────────────

    var jiraSectionHeader: some View {
        HStack(spacing: 6) {
            // Jira logo (simple "J" badge)
            ZStack {
                RoundedRectangle(cornerRadius: 4)
                    .fill(Color(hex: "0052cc"))
                    .frame(width: 18, height: 18)
                Text("J")
                    .font(.system(size: 11, weight: .black))
                    .foregroundColor(.white)
            }
            Text("Jira — My Issues")
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: "0052cc"))
            Spacer()
            Button {
                loadJiraIssues()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 10))
                    .foregroundColor(Color(hex: "9ca3af"))
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .background(Color(hex: "eff6ff"))
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "bfdbfe")), alignment: .bottom)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "bfdbfe")), alignment: .top)
    }

    // MARK: – Jira Issue Row

    // Defined as a nested struct inside the extension so it can access the same file scope
}

struct JiraIssueRow: View {
    let issue: JiraIssue

    private var statusColor: Color {
        switch issue.statusCategory {
        case "indeterminate": return Color(hex: "3b82f6")
        case "done":          return Color(hex: "10b981")
        default:              return Color(hex: "64748b")
        }
    }
    private var statusBg: Color {
        switch issue.statusCategory {
        case "indeterminate": return Color(hex: "eff6ff")
        case "done":          return Color(hex: "dcfce7")
        default:              return Color(hex: "f1f5f9")
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
            // Jira color bar
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: "0052cc"))
                .frame(width: 4, height: 36)

            VStack(alignment: .leading, spacing: 3) {
                Text(issue.summary)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(hex: "111827"))
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(issue.key)
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color(hex: "0052cc"))
                    Text("·")
                        .font(.system(size: 11)).foregroundColor(Color(hex: "d1d5db"))
                    Text(issue.projectName)
                        .font(.system(size: 11)).foregroundColor(Color(hex: "6b7280"))
                }
            }

            Spacer()

            HStack(spacing: 6) {
                Text(priorityIcon).font(.system(size: 12))

                Text(issue.status)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(statusColor)
                    .padding(.horizontal, 7).padding(.vertical, 3)
                    .background(statusBg)
                    .cornerRadius(8)

                // Open in browser
                Button {
                    if let url = URL(string: issue.url) {
                        NSWorkspace.shared.open(url)
                    }
                } label: {
                    Image(systemName: "arrow.up.right.square")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "9ca3af"))
                }
                .buttonStyle(.plain)
                .help("Open \(issue.key) in Jira")
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "f3f4f6")), alignment: .bottom)
    }
}

extension TrackingDashboardView {
    // MARK: – Activity tab

    var activityTabContent: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Recent App Activity").font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "374151"))
                Spacer()
                if !manager.isTracking {
                    Text("Punch in to start tracking")
                        .font(.system(size: 11)).foregroundColor(Color(hex: "9ca3af"))
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(Color(hex: "f9fafb"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if manager.recentApps.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "desktopcomputer").font(.system(size: 30))
                                .foregroundColor(Color(hex: "d1d5db"))
                            Text(manager.isTracking ? "Monitoring app usage…" : "Punch in to start monitoring")
                                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 36)
                    } else {
                        ForEach(manager.recentApps, id: \.self) { app in
                            AppActivityRow(appName: app, isActive: app == manager.currentApp)
                        }
                    }
                }
            }
            .background(Color.white)
        }
    }

    // MARK: – Notes tab

    var notesTabContent: some View {
        VStack {
            Image(systemName: "note.text").font(.system(size: 30))
                .foregroundColor(Color(hex: "d1d5db")).padding(.top, 36)
            Text("Work notes coming soon")
                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
            Spacer()
        }
        .frame(maxWidth: .infinity).background(Color.white)
    }
}
