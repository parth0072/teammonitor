// TaskPickerView.swift

import SwiftUI

struct TaskPickerView: View {
    let tasks:       [TaskItem]
    let jiraIssues:  [JiraIssue]
    let onPick:      (TaskItem?) -> Void
    let onPickJira:  ((JiraIssue) -> Void)?

    init(tasks: [TaskItem], jiraIssues: [JiraIssue] = [], onPick: @escaping (TaskItem?) -> Void, onPickJira: ((JiraIssue) -> Void)? = nil) {
        self.tasks      = tasks
        self.jiraIssues = jiraIssues
        self.onPick     = onPick
        self.onPickJira = onPickJira
    }

    private var activeTasks: [TaskItem] { tasks.filter { $0.status != "done" } }

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

            ScrollView {
                LazyVStack(spacing: 0) {
                    // ── TeamMonitor tasks ─────────────────────────────────
                    if !activeTasks.isEmpty {
                        if !jiraIssues.isEmpty {
                            sectionHeader("My Tasks")
                        }
                        ForEach(activeTasks) { task in
                            Button { onPick(task) } label: {
                                HStack(spacing: 12) {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(Color(hex: task.projectColor))
                                        .frame(width: 4, height: 34)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(task.name)
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundColor(Color(hex: "111827"))
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
                    }

                    // ── Jira issues ───────────────────────────────────────
                    if !jiraIssues.isEmpty {
                        sectionHeader("Jira Issues")
                        ForEach(jiraIssues) { issue in
                            Button { onPickJira?(issue) } label: {
                                HStack(spacing: 12) {
                                    RoundedRectangle(cornerRadius: 2)
                                        .fill(jiraStatusColor(issue.statusCategory))
                                        .frame(width: 4, height: 34)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(issue.summary)
                                            .font(.system(size: 13, weight: .medium))
                                            .foregroundColor(Color(hex: "111827"))
                                            .lineLimit(1)
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
                    }

                    // Empty state
                    if activeTasks.isEmpty && jiraIssues.isEmpty {
                        VStack(spacing: 8) {
                            Image(systemName: "checklist")
                                .font(.system(size: 28))
                                .foregroundColor(Color(hex: "d1d5db"))
                            Text("No tasks assigned to you")
                                .font(.system(size: 13))
                                .foregroundColor(Color(hex: "9ca3af"))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 40)
                    }
                }
            }
            .background(Color(hex: "f9fafb"))
        }
        .frame(width: 400, height: 420)
    }

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

    private func jiraStatusColor(_ category: String) -> Color {
        switch category {
        case "indeterminate": return Color(hex: "6366f1")   // in progress → indigo
        case "done":          return Color(hex: "10b981")   // done → emerald
        default:              return Color(hex: "6b7280")   // new/todo → gray
        }
    }
}
