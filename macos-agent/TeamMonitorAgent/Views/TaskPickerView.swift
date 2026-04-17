// TaskPickerView.swift

import SwiftUI

struct TaskPickerView: View {
    let tasks:          [TaskItem]
    let jiraIssues:     [JiraIssue]
    let recentTaskIds:  [Int]
    let recentJiraKeys: [String]
    let onPick:         (TaskItem?) -> Void
    let onPickJira:     ((JiraIssue) -> Void)?

    @State private var searchText: String = ""

    init(tasks: [TaskItem], jiraIssues: [JiraIssue] = [],
         recentTaskIds: [Int] = [], recentJiraKeys: [String] = [],
         onPick: @escaping (TaskItem?) -> Void,
         onPickJira: ((JiraIssue) -> Void)? = nil) {
        self.tasks          = tasks
        self.jiraIssues     = jiraIssues
        self.recentTaskIds  = recentTaskIds
        self.recentJiraKeys = recentJiraKeys
        self.onPick         = onPick
        self.onPickJira     = onPickJira
    }

    // MARK: - Derived lists

    private var activeTasks: [TaskItem] { tasks.filter { $0.status != "done" } }

    // Recent Jira issues in use-recency order (most recent first), capped at 3
    private var recentJira: [JiraIssue] {
        recentJiraKeys.prefix(3).compactMap { key in
            jiraIssues.first { $0.key == key }
        }
    }

    // Recent tasks in use-recency order, capped at 3
    private var recentTasks: [TaskItem] {
        recentTaskIds.prefix(3).compactMap { id in
            activeTasks.first { $0.id == id }
        }
    }

    // Jira issues not already in recent section
    private var remainingJira: [JiraIssue] {
        let recentKeys = Set(recentJira.map(\.key))
        return jiraIssues.filter { !recentKeys.contains($0.key) }
    }

    // Tasks not already in recent section
    private var remainingTasks: [TaskItem] {
        let recentIds = Set(recentTasks.map(\.id))
        return activeTasks.filter { !recentIds.contains($0.id) }
    }

    private var hasRecent: Bool { !recentJira.isEmpty || !recentTasks.isEmpty }

    // MARK: - Search

    private var filteredTasks: [TaskItem] {
        guard !searchText.isEmpty else { return activeTasks }
        return activeTasks.filter {
            $0.name.localizedCaseInsensitiveContains(searchText) ||
            $0.projectName.localizedCaseInsensitiveContains(searchText)
        }
    }

    private var filteredJira: [JiraIssue] {
        guard !searchText.isEmpty else { return jiraIssues }
        return jiraIssues.filter {
            $0.summary.localizedCaseInsensitiveContains(searchText) ||
            $0.key.localizedCaseInsensitiveContains(searchText) ||
            $0.projectName.localizedCaseInsensitiveContains(searchText)
        }
    }

    // MARK: - Body

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                Text("Choose a Task to Work On")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: "111827"))
                Spacer()
                Button("Skip (no task)") { onPick(nil) }
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "9ca3af"))
                    .buttonStyle(.plain)
            }
            .padding(20)
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            // Search bar
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "9ca3af"))
                TextField("Search tasks or Jira issues…", text: $searchText)
                    .font(.system(size: 13))
                    .textFieldStyle(.plain)
                if !searchText.isEmpty {
                    Button { searchText = "" } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 13))
                            .foregroundColor(Color(hex: "9ca3af"))
                    }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 9)
            .background(Color(hex: "f9fafb"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if searchText.isEmpty {
                        searchEmptyContent
                    } else {
                        searchResultsContent
                    }
                }
            }
            .background(Color(hex: "f9fafb"))
        }
        .frame(width: 440, height: 480)
    }

    // MARK: - No-search layout: Recent → Jira → Tasks

    @ViewBuilder
    private var searchEmptyContent: some View {
        // ── Recently used ─────────────────────────────────────────────────
        if hasRecent {
            sectionHeader("Recently Used")
            // Jira recents first
            ForEach(recentJira) { issue in
                jiraRow(issue, isRecent: true)
            }
            // Then task recents
            ForEach(recentTasks) { task in
                taskRow(task, isRecent: true)
            }
        }

        // ── Jira issues ───────────────────────────────────────────────────
        if !jiraIssues.isEmpty {
            sectionHeader(hasRecent ? "Jira Issues" : "Jira Issues  ·  Most Recently Updated")
            ForEach(remainingJira) { issue in
                jiraRow(issue, isRecent: false)
            }
        }

        // ── Internal tasks ────────────────────────────────────────────────
        if !activeTasks.isEmpty {
            sectionHeader("My Tasks")
            ForEach(remainingTasks) { task in
                taskRow(task, isRecent: false)
            }
        }

        // Empty state
        if !hasRecent && jiraIssues.isEmpty && activeTasks.isEmpty {
            emptyState(searching: false)
        }
    }

    // MARK: - Search layout: Jira results first, then task results

    @ViewBuilder
    private var searchResultsContent: some View {
        if !filteredJira.isEmpty {
            sectionHeader("Jira Issues")
            ForEach(filteredJira) { issue in
                jiraRow(issue, isRecent: false)
            }
        }
        if !filteredTasks.isEmpty {
            sectionHeader("My Tasks")
            ForEach(filteredTasks) { task in
                taskRow(task, isRecent: false)
            }
        }
        if filteredJira.isEmpty && filteredTasks.isEmpty {
            emptyState(searching: true)
        }
    }

    // MARK: - Row builders

    private func taskRow(_ task: TaskItem, isRecent: Bool) -> some View {
        Button { onPick(task) } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(Color(hex: task.projectColor))
                    .frame(width: 4, height: 34)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(task.name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(hex: "111827"))
                        if isRecent {
                            Text("RECENT")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(Color(hex: "6366f1"))
                                .padding(.horizontal, 5).padding(.vertical, 2)
                                .background(Color(hex: "ede9fe"))
                                .cornerRadius(4)
                        }
                    }
                    Text(task.projectName)
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "6b7280"))
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "d1d5db"))
            }
            .padding(.horizontal, 20).padding(.vertical, 10)
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "f3f4f6")), alignment: .bottom)
        }
        .buttonStyle(.plain)
    }

    private func jiraRow(_ issue: JiraIssue, isRecent: Bool) -> some View {
        Button { onPickJira?(issue) } label: {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(jiraStatusColor(issue.statusCategory))
                    .frame(width: 4, height: 34)
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(issue.summary)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Color(hex: "111827"))
                            .lineLimit(1)
                        if isRecent {
                            Text("RECENT")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(Color(hex: "6366f1"))
                                .padding(.horizontal, 5).padding(.vertical, 2)
                                .background(Color(hex: "ede9fe"))
                                .cornerRadius(4)
                        }
                    }
                    HStack(spacing: 6) {
                        Text(issue.key)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Color(hex: "6366f1"))
                        Text("·")
                            .font(.system(size: 11))
                            .foregroundColor(Color(hex: "9ca3af"))
                        Text(issue.projectName)
                            .font(.system(size: 11))
                            .foregroundColor(Color(hex: "6b7280"))
                    }
                }
                Spacer()
                Text(issue.status)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(jiraStatusColor(issue.statusCategory))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(jiraStatusColor(issue.statusCategory).opacity(0.1))
                    .cornerRadius(4)
            }
            .padding(.horizontal, 20).padding(.vertical, 10)
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "f3f4f6")), alignment: .bottom)
        }
        .buttonStyle(.plain)
    }

    // MARK: - Helpers

    private func sectionHeader(_ title: String) -> some View {
        HStack {
            Text(title.uppercased())
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(Color(hex: "9ca3af"))
                .tracking(0.8)
            Spacer()
        }
        .padding(.horizontal, 20).padding(.vertical, 8)
        .background(Color(hex: "f9fafb"))
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    private func emptyState(searching: Bool) -> some View {
        VStack(spacing: 8) {
            Image(systemName: searching ? "magnifyingglass" : "checklist")
                .font(.system(size: 28))
                .foregroundColor(Color(hex: "d1d5db"))
            Text(searching
                 ? "No results for \"\(searchText)\""
                 : "No tasks assigned to you")
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "9ca3af"))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    private func jiraStatusColor(_ category: String) -> Color {
        switch category {
        case "indeterminate": return Color(hex: "6366f1")
        case "done":          return Color(hex: "10b981")
        default:              return Color(hex: "6b7280")
        }
    }
}
