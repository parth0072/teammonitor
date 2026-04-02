// TaskRow.swift

import SwiftUI

struct TaskRow2: View {
    let task:     TaskItem
    let isActive: Bool
    let onStart:  () -> Void

    private var statusColor: Color {
        switch task.status {
        case "in_progress": return DS.indigo
        case "done":        return DS.emerald
        default:            return DS.textMuted
        }
    }
    private var statusLabel: String {
        switch task.status {
        case "in_progress": return "In Progress"
        case "done":        return "Done"
        default:            return "To Do"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            // Project color bar
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: task.projectColor))
                .frame(width: 3, height: 38)

            // Task info
            VStack(alignment: .leading, spacing: 4) {
                Text(task.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(isActive ? DS.indigo : DS.text)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text(task.projectName)
                        .font(.system(size: 11))
                        .foregroundColor(DS.textMuted)
                    Text("·")
                        .font(.system(size: 11))
                        .foregroundColor(DS.border)
                    Text(statusLabel)
                        .font(.system(size: 11, weight: .medium))
                        .foregroundColor(statusColor)
                }
            }

            Spacer()

            // Right badge / action
            if isActive {
                HStack(spacing: 4) {
                    Circle().fill(DS.emerald).frame(width: 6, height: 6)
                    Text("Active")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DS.emerald)
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(DS.emeraldLight)
                .cornerRadius(10)
            } else if task.status != "done" {
                Button { onStart() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "play.fill").font(.system(size: 9))
                        Text("Start").font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(DS.indigo)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(DS.indigoLight)
                    .cornerRadius(6)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(DS.indigo.opacity(0.2), lineWidth: 1))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 11)
        .background(isActive ? DS.indigoLight.opacity(0.5) : DS.surface)
        .overlay(Rectangle().frame(height: 1).foregroundColor(DS.bg), alignment: .bottom)
    }
}
