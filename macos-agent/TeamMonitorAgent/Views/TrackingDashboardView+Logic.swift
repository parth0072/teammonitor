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
        if !manager.isTracking { return DS.textMuted }
        if manager.isIdle      { return DS.amber }
        return DS.emerald
    }

    /// "8h 42m" format for the hero timer
    func formatTimer(_ minutes: Int) -> String {
        let h = minutes / 60
        let m = minutes % 60
        if h > 0 { return "\(h)h \(m)m" }
        return "\(m)m"
    }

    /// Legacy format kept for any callers that still use it
    func formatHoursMinutes(_ totalMinutes: Int) -> String {
        String(format: "%02dh %02dm", totalMinutes / 60, totalMinutes % 60)
    }

    /// Two-letter initials from name (or first letter of email)
    var userInitials: String {
        let name = auth.employeeName
        if !name.isEmpty {
            let parts = name.split(separator: " ").prefix(2)
            let initials = parts.compactMap { $0.first.map(String.init) }.joined()
            if !initials.isEmpty { return initials.uppercased() }
        }
        return String(auth.email.prefix(1)).uppercased()
    }
}
