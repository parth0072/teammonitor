// ManualEntryView.swift – manual time entry sheet

import SwiftUI

struct ManualEntryView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var selectedDate = Date()
    @State private var startTime    = Calendar.current.date(bySettingHour: 9, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var endTime      = Calendar.current.date(bySettingHour: 10, minute: 0, second: 0, of: Date()) ?? Date()
    @State private var note         = ""
    @State private var isSubmitting = false
    @State private var errorMsg     = ""
    @State private var successMsg   = ""

    private let api = APIService.shared

    var totalMinutes: Int {
        max(0, Int(endTime.timeIntervalSince(startTime)) / 60)
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Manual Entry")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: "111827"))
                    Text("Add time that wasn't tracked automatically")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "6b7280"))
                }
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color(hex: "9ca3af"))
                }.buttonStyle(.plain)
            }
            .padding(20)
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                VStack(spacing: 16) {

                    // Date
                    FormRow(label: "Date") {
                        DatePicker("", selection: $selectedDate, displayedComponents: .date)
                            .datePickerStyle(.compact)
                            .labelsHidden()
                    }

                    Divider()

                    // Start time
                    FormRow(label: "Start Time") {
                        DatePicker("", selection: $startTime, displayedComponents: .hourAndMinute)
                            .datePickerStyle(.compact)
                            .labelsHidden()
                    }

                    Divider()

                    // End time
                    FormRow(label: "End Time") {
                        DatePicker("", selection: $endTime, displayedComponents: .hourAndMinute)
                            .datePickerStyle(.compact)
                            .labelsHidden()
                    }

                    Divider()

                    // Duration preview
                    FormRow(label: "Duration") {
                        Text(totalMinutes > 0
                             ? String(format: "%d hr %02d min", totalMinutes / 60, totalMinutes % 60)
                             : "—")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(totalMinutes > 0 ? Color(hex: "16a34a") : Color(hex: "ef4444"))
                    }

                    Divider()

                    // Note
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Note / Task Description")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color(hex: "374151"))
                        TextEditor(text: $note)
                            .font(.system(size: 13))
                            .frame(height: 72)
                            .padding(8)
                            .background(Color(hex: "f9fafb"))
                            .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: "d1d5db"), lineWidth: 1))
                    }

                    // Error / success
                    if !errorMsg.isEmpty {
                        Label(errorMsg, systemImage: "exclamationmark.triangle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: "ef4444"))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if !successMsg.isEmpty {
                        Label(successMsg, systemImage: "checkmark.circle.fill")
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: "16a34a"))
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                }
                .padding(20)
            }
            .background(Color(hex: "f9fafb"))

            // Footer buttons
            HStack(spacing: 10) {
                Button("Cancel") { dismiss() }
                    .buttonStyle(OutlineButtonStyle())

                Spacer()

                Button {
                    Task { await submit() }
                } label: {
                    HStack(spacing: 6) {
                        if isSubmitting { ProgressView().scaleEffect(0.7) }
                        Text(isSubmitting ? "Saving…" : "Save Entry")
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(isSubmitting || totalMinutes <= 0)
            }
            .padding(16)
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .top)
        }
        .frame(width: 400)
    }

    // MARK: - Submit

    private func submit() async {
        errorMsg     = ""
        successMsg   = ""
        isSubmitting = true

        let dateStr  = formatDate(selectedDate)
        let startStr = formatTime(startTime)
        let endStr   = formatTime(endTime)

        do {
            try await api.createManualEntry(date: dateStr, startTime: startStr, endTime: endStr, note: note)
            successMsg = "Entry saved — \(totalMinutes) minutes added."
            note       = ""
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { dismiss() }
        } catch {
            errorMsg = error.localizedDescription
        }
        isSubmitting = false
    }

    private func formatDate(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: date)
    }
    private func formatTime(_ date: Date) -> String {
        let f = DateFormatter(); f.dateFormat = "HH:mm"; return f.string(from: date)
    }
}

// MARK: - Helper Views

struct FormRow<Content: View>: View {
    let label: String
    @ViewBuilder let content: () -> Content

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(hex: "374151"))
                .frame(width: 110, alignment: .leading)
            Spacer()
            content()
        }
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 8)
            .background(configuration.isPressed ? Color(hex: "1d4ed8") : Color(hex: "3b82f6"))
            .cornerRadius(7)
    }
}

struct OutlineButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13))
            .foregroundColor(Color(hex: "374151"))
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
            .background(Color.white)
            .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color(hex: "d1d5db"), lineWidth: 1))
    }
}
