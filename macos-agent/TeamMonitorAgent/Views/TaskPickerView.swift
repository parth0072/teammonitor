// TaskPickerView.swift

import SwiftUI

struct TaskPickerView: View {
    let tasks:  [TaskItem]
    let onPick: (TaskItem?) -> Void

    var body: some View {
        VStack(spacing: 0) {
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
                    ForEach(tasks.filter { $0.status != "done" }) { task in
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
            }
            .background(Color(hex: "f9fafb"))
        }
        .frame(width: 400, height: 420)
    }
}
