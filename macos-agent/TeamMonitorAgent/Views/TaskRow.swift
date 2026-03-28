// TaskRow.swift

import SwiftUI

struct TaskRow2: View {
    let task:     TaskItem
    let isActive: Bool
    let onStart:  () -> Void

    var statusColor: Color {
        switch task.status {
        case "in_progress": return Color(hex: "3b82f6")
        case "done":        return Color(hex: "10b981")
        default:            return Color(hex: "9ca3af")
        }
    }
    var statusLabel: String {
        switch task.status {
        case "in_progress": return "In Progress"
        case "done":        return "Done"
        default:            return "To Do"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: task.projectColor))
                .frame(width: 4, height: 36)

            VStack(alignment: .leading, spacing: 3) {
                Text(task.name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "111827"))
                HStack(spacing: 6) {
                    Text(task.projectName)
                        .font(.system(size: 11)).foregroundColor(Color(hex: "6b7280"))
                    Text("·")
                        .font(.system(size: 11)).foregroundColor(Color(hex: "d1d5db"))
                    Text(statusLabel)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(statusColor)
                }
            }

            Spacer()

            if isActive {
                HStack(spacing: 4) {
                    Circle().fill(Color(hex: "16a34a")).frame(width: 6, height: 6)
                    Text("Active").font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(hex: "16a34a"))
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Color(hex: "dcfce7")).cornerRadius(10)
            } else if task.status != "done" {
                Button("▶ Start") { onStart() }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color(hex: "3b82f6")).cornerRadius(5)
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(isActive ? Color(hex: "f0fdf4") : Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "f3f4f6")), alignment: .bottom)
    }
}
