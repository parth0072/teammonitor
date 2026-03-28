// NewTaskView.swift

import SwiftUI

struct NewTaskView: View {
    let projects:  [ProjectItem]
    let onCreated: () -> Void
    @Environment(\.dismiss) var dismiss

    @State private var taskName     = ""
    @State private var taskDesc     = ""
    @State private var selectedProj: ProjectItem? = nil
    @State private var saving       = false
    @State private var error        = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("New Task").font(.system(size: 16, weight: .semibold))
                Spacer()
                Button("Cancel") { dismiss() }.foregroundColor(Color(hex: "9ca3af")).buttonStyle(.plain)
            }
            .padding(20)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Project").font(.system(size: 12, weight: .semibold)).foregroundColor(Color(hex: "374151"))
                    if projects.isEmpty {
                        Text("No projects available. Ask your admin to create one.")
                            .font(.system(size: 12)).foregroundColor(Color(hex: "ef4444"))
                    } else {
                        Picker("Project", selection: $selectedProj) {
                            Text("Select project…").tag(Optional<ProjectItem>.none)
                            ForEach(projects) { p in Text(p.name).tag(Optional(p)) }
                        }
                        .pickerStyle(.menu).frame(maxWidth: .infinity).padding(8)
                        .background(Color(hex: "f9fafb")).cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Task name").font(.system(size: 12, weight: .semibold)).foregroundColor(Color(hex: "374151"))
                    TextField("e.g. Fix login bug", text: $taskName)
                        .textFieldStyle(.plain).padding(8)
                        .background(Color(hex: "f9fafb")).cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Description (optional)").font(.system(size: 12, weight: .semibold)).foregroundColor(Color(hex: "374151"))
                    TextEditor(text: $taskDesc)
                        .font(.system(size: 12)).frame(height: 60).padding(6)
                        .background(Color(hex: "f9fafb")).cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }

                Button {
                    guard !taskName.trimmingCharacters(in: .whitespaces).isEmpty else { error = "Task name required"; return }
                    guard let proj = selectedProj else { error = "Please select a project"; return }
                    saving = true
                    Task {
                        do {
                            _ = try await APIService.shared.createTask(projectId: proj.id, name: taskName, description: taskDesc)
                            onCreated()
                            dismiss()
                        } catch {
                            self.error = error.localizedDescription
                            saving = false
                        }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if saving { ProgressView().scaleEffect(0.7) }
                        Text(saving ? "Creating…" : "Create Task")
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                        Spacer()
                    }
                    .frame(height: 38)
                    .background(taskName.isEmpty || selectedProj == nil ? Color(hex: "93c5fd") : Color(hex: "3b82f6"))
                    .cornerRadius(8)
                }
                .buttonStyle(.plain).disabled(saving)
            }
            .padding(20)
        }
        .frame(width: 380)
        .background(Color.white)
        .onAppear { if !projects.isEmpty { selectedProj = projects.first } }
    }
}
