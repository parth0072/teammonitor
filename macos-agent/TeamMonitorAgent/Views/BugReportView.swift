// BugReportView.swift — let employees report issues directly from the macOS agent

import SwiftUI
import AppKit
import UniformTypeIdentifiers

struct BugReportView: View {
    @Environment(\.presentationMode) var presentationMode

    let categories = ["Time Tracking", "Screenshots", "Login / Auth", "App Activity", "Performance", "Other"]

    @State private var selectedCategory = "Time Tracking"
    @State private var description      = ""
    @State private var attachLogs       = true
    @State private var showLogPreview   = false
    @State private var isSubmitting     = false
    @State private var submitError:    String? = nil
    @State private var submitted        = false

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Report an Issue")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(Color(hex: "111827"))
                    Text("Your report is sent to the admin with diagnostic info")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "6b7280"))
                }
                Spacer()
                Button { presentationMode.wrappedValue.dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(Color(hex: "9ca3af"))
                        .frame(width: 24, height: 24)
                        .background(Color(hex: "f3f4f6"))
                        .cornerRadius(5)
                }.buttonStyle(.plain)
            }
            .padding(16)
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            if submitted {
                submittedView
            } else {
                formView
            }
        }
        .frame(width: 460)
        .background(Color(hex: "f9fafb"))
    }

    // MARK: – Form

    private var formView: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Category
            VStack(alignment: .leading, spacing: 6) {
                Text("Category")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "374151"))
                Picker("", selection: $selectedCategory) {
                    ForEach(categories, id: \.self) { Text($0).tag($0) }
                }
                .pickerStyle(.menu)
                .frame(maxWidth: .infinity, alignment: .leading)
            }

            // Description
            VStack(alignment: .leading, spacing: 6) {
                Text("What's going wrong?")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "374151"))
                ZStack(alignment: .topLeading) {
                    if description.isEmpty {
                        Text("e.g. My total time shows 4h but the dashboard shows 2h…")
                            .font(.system(size: 12))
                            .foregroundColor(Color(hex: "9ca3af"))
                            .padding(8)
                    }
                    TextEditor(text: $description)
                        .font(.system(size: 12))
                        .frame(height: 110)
                        .opacity(description.isEmpty ? 0.99 : 1)
                }
                .padding(4)
                .background(Color.white)
                .cornerRadius(7)
                .overlay(RoundedRectangle(cornerRadius: 7).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
            }

            // Log attachment toggle
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Toggle("", isOn: $attachLogs)
                        .toggleStyle(.checkbox)
                        .labelsHidden()
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Attach app logs")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(Color(hex: "374151"))
                        Text("Last 150 lines from \(AppLogger.shared.logFileURL.lastPathComponent)")
                            .font(.system(size: 10))
                            .foregroundColor(Color(hex: "9ca3af"))
                    }
                    Spacer()
                    Button(showLogPreview ? "Hide preview" : "Preview") {
                        showLogPreview.toggle()
                    }
                    .buttonStyle(.plain)
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "3b82f6"))

                    Button("Save file") { saveLogFile() }
                        .buttonStyle(.plain)
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "3b82f6"))
                }

                if showLogPreview {
                    ScrollView {
                        Text(AppLogger.shared.recentLogs(lines: 50))
                            .font(.system(size: 10, design: .monospaced))
                            .foregroundColor(Color(hex: "374151"))
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(8)
                    }
                    .frame(height: 120)
                    .background(Color(hex: "f8fafc"))
                    .cornerRadius(6)
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: "e2e8f0"), lineWidth: 1))
                }
            }
            .padding(10)
            .background(Color(hex: "eff6ff"))
            .cornerRadius(7)

            if let err = submitError {
                Text(err)
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "ef4444"))
            }

            // Submit
            HStack {
                Spacer()
                Button("Cancel") { presentationMode.wrappedValue.dismiss() }
                    .buttonStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "6b7280"))
                    .padding(.horizontal, 12).padding(.vertical, 7)

                Button(action: submit) {
                    if isSubmitting {
                        ProgressView().scaleEffect(0.6).frame(width: 60)
                    } else {
                        Text("Submit Report")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(.white)
                            .padding(.horizontal, 14).padding(.vertical, 7)
                    }
                }
                .disabled(description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                .background(description.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            ? Color(hex: "93c5fd") : Color(hex: "3b82f6"))
                .cornerRadius(7)
                .buttonStyle(.plain)
            }
        }
        .padding(16)
    }

    // MARK: – Success state

    private var submittedView: some View {
        VStack(spacing: 12) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 40))
                .foregroundColor(Color(hex: "22c55e"))
            Text("Report Sent")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(Color(hex: "111827"))
            Text("Your report has been sent to the admin. They'll investigate and follow up.")
                .font(.system(size: 12))
                .foregroundColor(Color(hex: "6b7280"))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 280)
            Button("Close") { presentationMode.wrappedValue.dismiss() }
                .buttonStyle(.plain)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 20).padding(.vertical, 8)
                .background(Color(hex: "3b82f6"))
                .cornerRadius(7)
        }
        .padding(32)
        .frame(maxWidth: .infinity)
    }

    // MARK: – Submit

    private func submit() {
        let trimmed = description.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        let manager = TrackingManager.shared
        var diagnostics: [String: Any] = [
            "tracked_minutes":  manager.trackedMinutes,
            "is_tracking":      manager.isTracking,
            "session_id":       manager.currentSessionId ?? 0,
            "app_version":      Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown",
            "macos_version":    ProcessInfo.processInfo.operatingSystemVersionString,
            "reported_at":      ISO8601DateFormatter().string(from: Date()),
        ]
        if attachLogs {
            diagnostics["app_logs"] = AppLogger.shared.recentLogs(lines: 150)
        }

        isSubmitting = true
        submitError  = nil

        Task { @MainActor in
            do {
                try await APIService.shared.submitBugReport(
                    category:    selectedCategory,
                    description: trimmed,
                    diagnostics: diagnostics
                )
                TMLog("[BugReport] Report submitted — category: \(selectedCategory), logs attached: \(attachLogs)")
                submitted = true
            } catch {
                submitError = "Failed to send: \(error.localizedDescription)"
                TMLog("[BugReport] Submit failed: \(error)")
            }
            isSubmitting = false
        }
    }

    // MARK: – Save log file

    private func saveLogFile() {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = "teammonitor.log"
        panel.allowedContentTypes  = [.plainText]
        panel.begin { response in
            guard response == .OK, let url = panel.url else { return }
            try? FileManager.default.copyItem(at: AppLogger.shared.logFileURL, to: url)
        }
    }
}
