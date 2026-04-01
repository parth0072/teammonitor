// TrackingDashboardView+Logic.swift — data loading, toasts, timers

import SwiftUI

extension TrackingDashboardView {

    // MARK: – Data

    func loadTasks() {
        tasksLoading = true
        tasksError   = nil
        Task { @MainActor in
            do {
                async let t = APIService.shared.getMyTasks()
                async let p = APIService.shared.getProjects()
                myTasks  = try await t
                projects = try await p
            } catch {
                tasksError = error.localizedDescription
                TMLog("[loadTasks] error: \(error)")
            }
            tasksLoading = false
            // Load Jira issues in parallel (non-blocking — failure is silent)
            loadJiraIssues()
        }
    }

    func loadJiraIssues() {
        Task { @MainActor in
            jiraLoading = true
            do {
                let statusResp = try await APIService.shared.getJiraStatus()
                jiraConnected  = statusResp.connected
                if statusResp.connected {
                    jiraIssues = try await APIService.shared.getJiraIssues()
                } else {
                    jiraIssues = []
                }
            } catch {
                // Jira errors are non-fatal; just hide the section
                jiraConnected = false
                jiraIssues    = []
                TMLog("[loadJiraIssues] \(error)")
            }
            jiraLoading = false
        }
    }

    // MARK: – Toast

    func showToast(_ text: String, warning: Bool, duration: TimeInterval = 5) {
        toastTimer?.invalidate()
        withAnimation { toast = ToastMessage(text: text, isWarning: warning) }
        toastTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { _ in
            Task { @MainActor in withAnimation { toast = nil } }
        }
        manager.sendNotification(text, isWarning: warning)
    }

    // MARK: – Break Reminder

    func scheduleBreakReminder(interval: TimeInterval? = nil) {
        cancelBreakTimer()
        let beInterval = APIService.shared.employee?.breakIntervalMinutes ?? 60
        let secs = interval ?? TimeInterval(beInterval * 60)
        breakTimer = Timer.scheduledTimer(withTimeInterval: secs, repeats: false) { _ in
            Task { @MainActor in
                guard manager.isTracking else { return }
                activeSheet = .breakReminder
                manager.sendNotification(
                    "Time for a break! You've been working \(manager.trackedMinutes / 60)h \(manager.trackedMinutes % 60)m",
                    isWarning: false
                )
            }
        }
    }

    func cancelBreakTimer() {
        breakTimer?.invalidate()
        breakTimer = nil
    }

    // MARK: – Relaunch

    func relaunchApp() {
        let url  = Bundle.main.bundleURL
        let task = Process()
        task.launchPath = "/usr/bin/open"
        task.arguments  = [url.path]
        try? task.run()
        NSApp.terminate(nil)
    }

    // MARK: – Computed helpers

    var reminderCountdownText: String {
        let s = manager.secondsUntilNextReminder
        return String(format: "%d:%02d", s / 60, s % 60)
    }

    var timerStatusText: String {
        if !manager.isTracking { return "Inactive" }
        if manager.isIdle      { return "Idle" }
        return "Active"
    }

    var timerStatusColor: Color {
        if !manager.isTracking { return Color(hex: "9ca3af") }
        if manager.isIdle      { return Color(hex: "f59e0b") }
        return Color(hex: "16a34a")
    }

    func formatHoursMinutes(_ totalMinutes: Int) -> String {
        String(format: "%02d hours %02d minutes", totalMinutes / 60, totalMinutes % 60)
    }
}
