// TrackingManager.swift – coordinates all tracking services, uses APIService (no Firebase)

import AppKit
import Foundation
import Combine
import UserNotifications

// MARK: - Persisted session state (survives app restart within the same day)

private struct PersistedSession: Codable {
    let sessionId:        Int
    let punchInTime:      Date
    let trackedMinutes:   Int
    let date:             String   // "yyyy-MM-dd"
    let taskId:           Int?
    let taskName:         String?
    let taskProjectName:  String?
    let taskProjectColor: String?
    let jiraIssueKey:     String?
    let jiraIssueSummary: String?
}

private let kPersistedSession = "tm_active_session"
private let kTodayMinutes     = "tm_today_minutes"
private let kTodayDate        = "tm_today_date"
private let dayFormatter: DateFormatter = {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
}()

@MainActor
class TrackingManager: ObservableObject {
    static let shared = TrackingManager()

    // MARK: - Published State

    @Published var isTracking:          Bool      = false
    @Published var currentSessionId:    Int?
    @Published var currentTask:         TaskItem?  = nil
    @Published var currentJiraIssue:    JiraIssue? = nil
    @Published var punchInTime:         Date?
    @Published var trackedMinutes:      Int       = 0   // current session only (used for heartbeat)
    @Published var todayMinutes:        Int       = 0   // accumulated all-day total (for display)
    @Published var screenshotCount:     Int       = 0
    @Published var statusMessage:       String    = "Ready"
    @Published var currentApp:          String    = ""
    @Published var activityPercent:     Int       = 100
    @Published var isIdle:              Bool      = false
    @Published var recentApps:          [String]  = []
    @Published var minutesSinceResume:  Int       = 0

    // Idle alert
    @Published var showIdleAlert:       Bool     = false
    @Published var idleAlertMinutes:    Int      = 0

    // Screen recording permission
    @Published var hasScreenPermission: Bool = true

    // Break state
    @Published var isOnBreak:           Bool     = false

    // Idle warning
    @Published var showIdleWarning:         Bool = false
    @Published var idleWarningSecondsLeft:  Int  = 0
    private var idleWarningCountdownTimer:  Timer?

    // Offline state
    @Published var isOffline:           Bool     = false

    // Not-tracking reminder
    @Published var showStartReminder:    Bool    = false
    @Published var showNotTrackingAlert: Bool    = false
    @Published var secondsUntilNextReminder: Int = 5 * 60

    private(set) var stoppedTrackingAt: Date?    = nil

    var minutesNotTracking: Int {
        guard let stopped = stoppedTrackingAt else { return 0 }
        return Int(Date().timeIntervalSince(stopped)) / 60
    }

    // MARK: - Private

    private let api          = APIService.shared
    private let screenshots  = ScreenshotService.shared
    private let appTracker   = AppTrackingService.shared
    private let idleDetector = IdleDetectionService.shared
    private let network      = NetworkMonitor.shared

    private var sessionTimer:         Timer?
    private var resumeTimer:          Timer?
    private var notTrackingTimer:     Timer?
    private var countdownTimer:       Timer?
    private var heartbeatTickCount:   Int   = 0
    private let kHeartbeatEvery:      Int   = 5
    var lastResumeTime:  Date?
    private var pendingIdleStart: Date?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    init() {
        appTracker.$currentApp
            .receive(on: RunLoop.main)
            .sink { [weak self] app in
                guard let self else { return }
                self.currentApp = app
                guard !app.isEmpty, !self.recentApps.contains(app) else { return }
                self.recentApps.insert(app, at: 0)
                if self.recentApps.count > 15 { self.recentApps.removeLast() }
            }
            .store(in: &cancellables)

        idleDetector.$activityPercent
            .receive(on: RunLoop.main)
            .sink { [weak self] in self?.activityPercent = $0 }
            .store(in: &cancellables)

        idleDetector.$isIdle
            .receive(on: RunLoop.main)
            .sink { [weak self] in self?.isIdle = $0 }
            .store(in: &cancellables)

        network.$isOnline
            .receive(on: RunLoop.main)
            .sink { [weak self] (online: Bool) in
                self?.isOffline = !online
            }
            .store(in: &cancellables)

        hasScreenPermission = ScreenshotService.hasPermission()

        restoreSessionIfNeeded()
        loadTodayMinutes()

        if !isTracking {
            stoppedTrackingAt = Date()
            scheduleNotTrackingReminder()
        }
    }

    // MARK: - Today Minutes (day-persistent display counter)

    private func loadTodayMinutes() {
        let today     = dayFormatter.string(from: Date())
        let savedDate = UserDefaults.standard.string(forKey: kTodayDate) ?? ""
        if savedDate == today {
            let saved = UserDefaults.standard.integer(forKey: kTodayMinutes)
            // Must be at least the restored session's minutes
            todayMinutes = max(saved, trackedMinutes)
        } else {
            // New day — seed from current session (may be 0 if no session)
            todayMinutes = trackedMinutes
            saveTodayMinutes()
        }
    }

    private func saveTodayMinutes() {
        UserDefaults.standard.set(todayMinutes, forKey: kTodayMinutes)
        UserDefaults.standard.set(dayFormatter.string(from: Date()), forKey: kTodayDate)
    }

    // MARK: - Screen-Recording Permission

    func recheckScreenPermission() {
        hasScreenPermission = ScreenshotService.hasPermission()
        if hasScreenPermission {
            UserDefaults.standard.removeObject(forKey: "tm_screen_perm_dismissed")
        }
    }

    func openScreenRecordingSettings() {
        ScreenshotService.requestPermission()
    }

    // MARK: - Notifications

    func sendNotification(_ text: String, isWarning: Bool) {
        let content   = UNMutableNotificationContent()
        content.title = isWarning ? "⚠️ TeamMonitor Alert" : "⏱ TeamMonitor"
        content.body  = text
        content.sound = .default
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req) { err in
            if let err { TMLog("[Notifications] Delivery failed: \(err)") }
            else       { TMLog("[Notifications] Sent: \(text)") }
        }
    }

    func scheduleNotTrackingReminder() {
        cancelNotTrackingReminder()

        secondsUntilNextReminder = 5 * 60
        startCountdownTimer()

        let t = Timer(timeInterval: 5 * 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                guard !self.isTracking || self.isOnBreak else {
                    self.cancelNotTrackingReminder(); return
                }

                self.secondsUntilNextReminder = 5 * 60

                self.showStartReminder    = true
                self.showNotTrackingAlert = true

                if let win = NSApp.windows.first(where: { $0.canBecomeMain && $0.canBecomeKey }) {
                    win.makeKeyAndOrderFront(nil)
                }
                NSApp.activate(ignoringOtherApps: true)

                let msg = self.isOnBreak
                    ? "⏸ Still on break — tap Resume to continue tracking"
                    : "⏱ Timer is not running — you've been untracked for \(self.minutesNotTracking) min"
                self.sendNotification(msg, isWarning: true)
            }
        }
        RunLoop.main.add(t, forMode: .common)
        notTrackingTimer = t
    }

    func cancelNotTrackingReminder() {
        notTrackingTimer?.invalidate()
        notTrackingTimer = nil
        countdownTimer?.invalidate()
        countdownTimer = nil
        secondsUntilNextReminder = 5 * 60
    }

    private func startCountdownTimer() {
        countdownTimer?.invalidate()
        let c = Timer(timeInterval: 1, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                guard !self.isTracking || self.isOnBreak else { return }
                if self.secondsUntilNextReminder > 0 {
                    self.secondsUntilNextReminder -= 1
                }
            }
        }
        RunLoop.main.add(c, forMode: .common)
        countdownTimer = c
    }

    private func uploadScreenshot(_ imageData: Data, sessionId: Int) async {
        do {
            _ = try await api.uploadScreenshot(
                imageData,
                sessionId: sessionId,
                activityLevel: idleDetector.activityPercent
            )
            await MainActor.run {
                screenshotCount += 1
                if !hasScreenPermission { hasScreenPermission = true }
            }
        } catch { }
    }

    // MARK: - Punch In

    func punchIn(task: TaskItem? = nil, jiraIssue: JiraIssue? = nil) async {
        cancelNotTrackingReminder()
        showStartReminder        = false
        showNotTrackingAlert     = false
        stoppedTrackingAt        = nil
        secondsUntilNextReminder = 5 * 60
        guard !isTracking else { return }
        guard network.isOnline else {
            statusMessage = "No internet connection. Connect and try again."
            return
        }
        statusMessage = "Starting session…"

        do {
            let sessionId    = try await api.punchIn(taskId: task?.id, jiraIssueKey: jiraIssue?.key)
            currentSessionId = sessionId
            currentTask      = task
            currentJiraIssue = jiraIssue
            punchInTime      = Date()
            lastResumeTime   = Date()
            trackedMinutes   = 0        // per-session reset (heartbeat uses this)
            // todayMinutes intentionally NOT reset — accumulates all day
            screenshotCount  = 0
            isTracking       = true
            isOnBreak        = false
            showIdleAlert    = false
            statusMessage    = "Tracking active"
            saveSessionState()
            startAllServices(sessionId: sessionId)
        } catch {
            statusMessage = "Error: \(error.localizedDescription)"
        }
    }

    // MARK: - Punch Out

    func punchOut() async {
        guard isTracking, let sessionId = currentSessionId else { return }
        statusMessage = "Stopping session…"
        isTracking    = false
        showIdleAlert = false
        stopAllServices()

        do {
            try await api.punchOut(sessionId: sessionId, totalMinutes: trackedMinutes)
        } catch { }

        statusMessage     = "Session ended. Have a great day!"
        stoppedTrackingAt = Date()
        scheduleNotTrackingReminder()

        clearSessionState()
        currentSessionId   = nil
        currentTask        = nil
        currentJiraIssue   = nil
        punchInTime        = nil
        lastResumeTime     = nil
        recentApps         = []
        minutesSinceResume = 0
        // todayMinutes kept — shows total for the day even after punch out
    }

    // MARK: - Take a Break / Resume

    func takeBreak() async {
        guard isTracking, !isOnBreak else { return }

        sessionTimer?.invalidate(); sessionTimer = nil
        resumeTimer?.invalidate();  resumeTimer  = nil
        screenshots.stop()
        idleDetector.stop()

        isOnBreak         = true
        stoppedTrackingAt = Date()
        statusMessage     = "On break"
        saveSessionState()
        scheduleNotTrackingReminder()

        if let sessionId = currentSessionId {
            try? await api.heartbeat(sessionId: sessionId, totalMinutes: trackedMinutes, screenPermission: hasScreenPermission)
        }
    }

    func resumeFromBreak() {
        guard isTracking, isOnBreak, let sessionId = currentSessionId else { return }

        cancelNotTrackingReminder()
        isOnBreak      = false
        lastResumeTime = Date()
        statusMessage  = "Tracking active"
        saveSessionState()

        startAllServices(sessionId: sessionId)
    }

    // MARK: - Resume after idle

    func resumeAfterIdle(countTime: Bool) {
        guard let sessionId = currentSessionId else { return }

        if !countTime {
            let deduct = min(idleAlertMinutes, trackedMinutes)
            trackedMinutes  = trackedMinutes  - deduct
            todayMinutes    = max(0, todayMinutes - deduct)
        }

        if let idleStart = pendingIdleStart {
            let idleEnd = Date()
            Task { try? await api.logIdle(sessionId: sessionId, idleStart: idleStart, idleEnd: idleEnd) }
            pendingIdleStart = nil
        }

        showIdleAlert  = false
        isIdle         = false
        lastResumeTime = Date()
        statusMessage  = "Tracking active"

        startMinuteTimer(sessionId: sessionId)
        startResumeTimer()
        saveSessionState()
    }

    // MARK: - Session Persistence

    private func saveSessionState() {
        guard let sessionId = currentSessionId, let punchIn = punchInTime else { return }
        let state = PersistedSession(
            sessionId:        sessionId,
            punchInTime:      punchIn,
            trackedMinutes:   trackedMinutes,
            date:             dayFormatter.string(from: punchIn),
            taskId:           currentTask?.id,
            taskName:         currentTask?.name,
            taskProjectName:  currentTask?.projectName,
            taskProjectColor: currentTask?.projectColor,
            jiraIssueKey:     currentJiraIssue?.key,
            jiraIssueSummary: currentJiraIssue?.summary
        )
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: kPersistedSession)
        }
    }

    private func clearSessionState() {
        UserDefaults.standard.removeObject(forKey: kPersistedSession)
    }

    private func restoreSessionIfNeeded() {
        guard let data  = UserDefaults.standard.data(forKey: kPersistedSession),
              let state = try? JSONDecoder().decode(PersistedSession.self, from: data)
        else { return }

        let today = dayFormatter.string(from: Date())
        guard state.date == today else {
            clearSessionState()
            return
        }

        currentSessionId = state.sessionId
        punchInTime      = state.punchInTime
        trackedMinutes   = state.trackedMinutes
        lastResumeTime   = Date()
        isTracking       = true
        statusMessage    = "Tracking resumed"

        // Restore task
        if let taskId = state.taskId, let taskName = state.taskName {
            currentTask = TaskItem(
                id: taskId, projectId: 0, name: taskName, description: "",
                status: "in_progress",
                projectName: state.taskProjectName ?? "",
                projectColor: state.taskProjectColor ?? "6366f1",
                assignedToName: nil
            )
        }

        // Restore Jira issue (minimal — enough to show the chip)
        if let key = state.jiraIssueKey, let summary = state.jiraIssueSummary {
            currentJiraIssue = JiraIssue(
                id: key, key: key, summary: summary,
                status: "", statusCategory: "indeterminate",
                priority: "", issueType: "", projectKey: "", projectName: "", url: ""
            )
        }

        startAllServices(sessionId: state.sessionId)
        TMLog("[TrackingManager] Restored session \(state.sessionId) with \(state.trackedMinutes) min")
    }

    // MARK: - Services

    private func startAllServices(sessionId: Int) {
        startMinuteTimer(sessionId: sessionId)
        startResumeTimer()

        let screenshotInterval = TimeInterval(api.employee?.screenshotInterval ?? 300)
        let screenshotsOn      = api.employee?.screenshotsEnabled ?? true
        screenshots.start(interval: screenshotInterval, enabled: screenshotsOn) { [weak self] imageData in
            guard let self else { return }
            Task { await self.uploadScreenshot(imageData, sessionId: sessionId) }
        }

        if screenshotsOn {
            let initialShot = Timer(timeInterval: 10, repeats: false) { [weak self] _ in
                guard ScreenshotService.hasPermission() else { return }
                self?.screenshots.captureNow()
            }
            RunLoop.main.add(initialShot, forMode: .common)
        }

        appTracker.onAppChange = { [weak self] appName, windowTitle, startTime, endTime in
            guard let self else { return }
            let duration = Int(endTime.timeIntervalSince(startTime))
            Task {
                try? await self.api.logActivity(
                    sessionId: sessionId, appName: appName, windowTitle: windowTitle,
                    startTime: startTime, endTime: endTime, durationSeconds: duration
                )
            }
        }
        appTracker.start(pollInterval: 30)

        idleDetector.warningThresholdSeconds = (api.employee?.idleWarningMinutes ?? 2) * 60
        idleDetector.stopThresholdSeconds    = (api.employee?.idleStopMinutes    ?? 5) * 60

        idleDetector.onIdleWarning = { [weak self] secondsLeft in
            guard let self else { return }
            Task { @MainActor in
                self.idleWarningSecondsLeft = secondsLeft
                self.showIdleWarning = true
            }
        }
        idleDetector.onIdleWarningCancelled = { [weak self] in
            guard let self else { return }
            Task { @MainActor in
                self.showIdleWarning = false
                self.idleWarningSecondsLeft = 0
            }
        }

        idleDetector.onIdleStart = { [weak self] idleStart in
            guard let self else { return }
            Task { @MainActor in
                self.pendingIdleStart = idleStart
                self.showIdleWarning  = false
                self.idleWarningSecondsLeft = 0
                self.sessionTimer?.invalidate(); self.sessionTimer = nil
                self.resumeTimer?.invalidate();  self.resumeTimer  = nil
            }
        }

        idleDetector.onIdleEnd = { [weak self] idleStart, idleEnd in
            guard let self else { return }
            let idleMinutes = max(1, Int(idleEnd.timeIntervalSince(idleStart)) / 60)
            Task { @MainActor in
                self.idleAlertMinutes = idleMinutes
                self.showIdleAlert    = false
                self.showIdleAlert    = true
            }
        }
        idleDetector.start()
    }

    // MARK: - Timer helpers

    private func startMinuteTimer(sessionId: Int) {
        sessionTimer?.invalidate()
        heartbeatTickCount = 0
        let t = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.trackedMinutes     += 1   // per-session (heartbeat)
                self.todayMinutes       += 1   // all-day total (display)
                self.heartbeatTickCount += 1
                self.saveSessionState()
                self.saveTodayMinutes()

                if self.heartbeatTickCount % self.kHeartbeatEvery == 0 {
                    try? await self.api.heartbeat(
                        sessionId:        sessionId,
                        totalMinutes:     self.trackedMinutes,
                        screenPermission: self.hasScreenPermission
                    )
                    self.heartbeatTickCount = 0
                }
            }
        }
        RunLoop.main.add(t, forMode: .common)
        sessionTimer = t
    }

    private func startResumeTimer() {
        resumeTimer?.invalidate()
        let t = Timer(timeInterval: 30, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                guard let resume = self.lastResumeTime else { return }
                self.minutesSinceResume = Int(Date().timeIntervalSince(resume)) / 60
            }
        }
        RunLoop.main.add(t, forMode: .common)
        resumeTimer = t
    }

    private func stopAllServices() {
        sessionTimer?.invalidate(); sessionTimer = nil
        resumeTimer?.invalidate();  resumeTimer  = nil
        heartbeatTickCount = 0
        screenshots.stop()
        appTracker.stop()
        idleDetector.stop()
        recentApps         = []
        minutesSinceResume = 0
    }
}
