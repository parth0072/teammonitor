// TaskRow.swift

import SwiftUI

struct TaskRow2: View {
    let task:     TaskItem
    let isActive: Bool
    let onStart:  () -> Void

    @State private var hovered = false

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
    private var statusIcon: String {
        switch task.status {
        case "in_progress": return "circle.fill"
        case "done":        return "checkmark.circle.fill"
        default:            return "circle"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            // Project color bar with gradient
            RoundedRectangle(cornerRadius: 2)
                .fill(
                    LinearGradient(
                        colors: [Color(hex: task.projectColor), Color(hex: task.projectColor).opacity(0.5)],
                        startPoint: .top, endPoint: .bottom
                    )
                )
                .frame(width: 3, height: 40)

            // Task info
            VStack(alignment: .leading, spacing: 4) {
                Text(task.name)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(isActive ? DS.indigo : DS.text)
                    .lineLimit(1)
                HStack(spacing: 5) {
                    Image(systemName: statusIcon)
                        .font(.system(size: 9))
                        .foregroundColor(statusColor)
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
                HStack(spacing: 5) {
                    Circle()
                        .fill(DS.emerald)
                        .frame(width: 6, height: 6)
                        .shadow(color: DS.emerald.opacity(0.5), radius: 4)
                    Text("Active")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(DS.emerald)
                }
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(DS.emeraldLight)
                .cornerRadius(10)
            } else if task.status != "done" {
                Button { onStart() } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "play.fill").font(.system(size: 8, weight: .bold))
                        Text("Start").font(.system(size: 11, weight: .semibold))
                    }
                    .foregroundColor(hovered ? .white : DS.indigo)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(hovered ? DS.indigo : DS.indigoLight)
                    .cornerRadius(7)
                    .animation(.easeInOut(duration: 0.15), value: hovered)
                }
                .buttonStyle(.plain)
                .opacity(hovered ? 1 : 0.85)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 11)
        .background(
            isActive
                ? LinearGradient(colors: [DS.indigoLight.opacity(0.6), DS.indigoLight.opacity(0.2)],
                                 startPoint: .leading, endPoint: .trailing)
                : LinearGradient(colors: [hovered ? DS.bg : DS.surface, DS.surface],
                                 startPoint: .leading, endPoint: .trailing)
        )
        .overlay(Rectangle().frame(height: 1).foregroundColor(DS.bg), alignment: .bottom)
        .onHover { hovered = $0 }
        .animation(.easeInOut(duration: 0.15), value: hovered)
    }
}
