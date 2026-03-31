// TrackingManager.swift – coordinates all tracking services, uses APIService (no Firebase)

import AppKit
import Foundation
import Combine
import UserNotifications

// MARK: - Persisted session state (survives app restart within the same day)

private struct PersistedSession: Codable {
    let sessionId:      Int
    let punchInTime:    Date
    let trackedMinutes: Int
    let date:           String   // "yyyy-MM-dd"
    let taskId:         Int?
    let taskName:       String?
    let taskProjectName: String?
    let taskProjectColor: String?
}

private let kPersistedSession = "tm_active_session"
private let dayFormatter: DateFormatter = {
    let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f
}()

@MainActor
class TrackingManager: ObservableObject {
    static let shared = TrackingManager()

    // MARK: - Published State

    @Published var isTracking:          Bool      = false
    @Published var currentSessionId:    Int?
    @Published var currentTask:         TaskItem? = nil   // active task being worked on
    @Published var punchInTime:         Date?
    @Published var trackedMinutes:      Int       = 0
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

    // Screen recording permission — checked once at launch, re-checked on demand.
    @Published var hasScreenPermission: Bool = true

    // Break state
    @Published var isOnBreak:           Bool     = false

    // Offline state (banner only — no queuing)
    @Published var isOffline:           Bool     = false

    // Not-tracking reminder banner + alert
    @Published var showStartReminder:    Bool    = false
    @Published var showNotTrackingAlert: Bool    = false

    // Countdown to next not-tracking notification (seconds, counts down from 300)
    @Published var secondsUntilNextReminder: Int = 5 * 60

    // When tracking stopped (used to display "X minutes ago" in the alert)
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
    // Counts minute-ticks; heartbeat is sent every kHeartbeatEvery ticks to reduce HTTP calls.
    private var heartbeatTickCount:   Int   = 0
    private let kHeartbeatEvery:      Int   = 5   // send heartbeat every 5 minutes
    var lastResumeTime:  Date?   // internal – read by view for live display
    private var pendingIdleStart: Date?
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Init

    init() {
        // Wire up Combine subscriptions
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

        // Network monitor → update isOffline flag (used for offline banner in UI)
        network.$isOnline
            .receive(on: RunLoop.main)
            .sink { [weak self] (online: Bool) in
                self?.isOffline = !online
            }
            .store(in: &cancellables)

        // Check screen-recording permission once at launch — no polling.
        hasScreenPermission = ScreenshotService.hasPermission()

        // Restore a session that was active when the app was last closed
        restoreSessionIfNeeded()

        // Start the not-tracking reminder if we launched without an active session
        if !isTracking {
            stoppedTrackingAt = Date()
            scheduleNotTrackingReminder()
        }
    }

    // MARK: - Screen-Recording Permission

    /// One-shot re-check — call when user taps "Re-check" in the banner.
    /// Never polls; never triggers a system dialog.
    func recheckScreenPermission() {
        hasScreenPermission = ScreenshotService.hasPermission()
        if hasScreenPermission {
            // Clear dismissed flag so banner won't hide a future revocation
            UserDefaults.standard.removeObject(forKey: "tm_screen_perm_dismissed")
        }
    }

    /// Opens System Settings to the Screen Recording pane.
    func openScreenRecordingSettings() {
        ScreenshotService.requestPermission()
    }

    // MARK: - Notifications

    /// Sends a local notification. Fires immediately (trigger: nil).
    /// Uses .default sound only — .defaultCritical requires a special entitlement
    /// that unsigned dev builds don't have, causing silent rejection.
    func sendNotification(_ text: String, isWarning: Bool) {
        // Permission is requested at launch (AppDelegate). Just send — macOS drops it
        // silently if denied, no need for a secondary gate here.
        let content   = UNMutableNotificationContent()
        content.title = isWarning ? "⚠️ TeamMonitor Alert" : "⏱ TeamMonitor"
        content.body  = text
        content.sound = .default
        let req = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req) { err in
            if let err { print("[Notifications] Delivery failed: \(err)") }
            else       { print("[Notifications] Sent: \(text)") }
        }
    }

    /// Schedules a repeating 5-minute reminder when the user is not tracking.
    /// Lives in TrackingManager (not the view) so it survives window close.
    func scheduleNotTrackingReminder() {
        cancelNotTrackingReminder()

        // Reset + start the 1-second countdown
        secondsUntilNextReminder = 5 * 60
        startCountdownTimer()

        // 5-minute repeating reminder
        let t = Timer(timeInterval: 5 * 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                // Cancel if tracking is active and not on break
                guard !self.isTracking || self.isOnBreak else {
                    self.cancelNotTrackingReminder(); return
                }

                // Reset countdown for the next interval
                self.secondsUntilNextReminder = 5 * 60

                self.showStartReminder    = true
                self.showNotTrackingAlert = true

                // Bring the main app window to front (skip status-bar/panel windows)
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
        print("[Notifications] Not-tracking reminder scheduled (fires every 5 min)")
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

    /// Uploads screenshot data, increments the counter, and confirms screen
    /// permission on first success (auto-dismisses the permission banner).
    private func uploadScreenshot(_ imageData: Data, sessionId: Int) async {
        do {
            _ = try await api.uploadScreenshot(
                imageData,
                sessionId: sessionId,
                activityLevel: idleDetector.activityPercent
            )
            await MainActor.run {
                screenshotCount += 1
                // Successful capture proves screen recording works — clear the banner.
                if !hasScreenPermission { hasScreenPermission = true }
            }
        } catch {
            // Upload failed (no internet / auth error) — silently skip
        }
    }

    // MARK: - Punch In

    func punchIn(task: TaskItem? = nil) async {
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
            let sessionId  = try await api.punchIn(taskId: task?.id)
            currentSessionId = sessionId
            currentTask      = task
            punchInTime      = Date()
            lastResumeTime   = Date()
            trackedMinutes   = 0
            screenshotCount  = 0
            isTracking       = true
            isOnBreak        = false
            showIdleAlert    = false   // clear any stale idle alert from previous session
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

        // Always attempt punch-out; if it fails (no internet etc.) silently skip.
        // No offline queue — keeps the app simple and avoids stale-token replays.
        do {
            try await api.punchOut(sessionId: sessionId, totalMinutes: trackedMinutes)
        } catch {
            // ignore – session will be auto-closed server-side on next heartbeat timeout
        }
        statusMessage     = "Session ended. Have a great day!"
        stoppedTrackingAt = Date()
        scheduleNotTrackingReminder()

        clearSessionState()
        currentSessionId   = nil
        currentTask        = nil
        punchInTime        = nil
        lastResumeTime     = nil
        recentApps         = []
        minutesSinceResume = 0
    }

    // MARK: - Take a Break / Resume

    /// Pauses the minute timer, stops screenshots, syncs current minutes to server.
    func takeBreak() async {
        guard isTracking, !isOnBreak else { return }

        // Stop local timers
        sessionTimer?.invalidate(); sessionTimer = nil
        resumeTimer?.invalidate();  resumeTimer  = nil
        screenshots.stop()
        idleDetector.stop()

        isOnBreak         = true
        stoppedTrackingAt = Date()
        statusMessage     = "On break"
        saveSessionState()
        scheduleNotTrackingReminder()

        // Sync current time to server
        if let sessionId = currentSessionId {
            try? await api.heartbeat(sessionId: sessionId, totalMinutes: trackedMinutes, screenPermission: hasScreenPermission)
        }
    }

    /// Resumes from a manual break – restarts the timers and screenshot service.
    func resumeFromBreak() {
        guard isTracking, isOnBreak, let sessionId = currentSessionId else { return }

        cancelNotTrackingReminder()
        isOnBreak      = false
        lastResumeTime = Date()
        statusMessage  = "Tracking active"
        saveSessionState()

        startAllServices(sessionId: sessionId)
    }

    // MARK: - Resume after idle / break

    func resumeAfterIdle(countTime: Bool) {
        guard let sessionId = currentSessionId else { return }

        if !countTime {
            trackedMinutes = max(0, trackedMinutes - idleAlertMinutes)
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
            taskProjectColor: currentTask?.projectColor
        )
        if let data = try? JSONEncoder().encode(state) {
            UserDefaults.standard.set(data, forKey: kPersistedSession)
        }
    }

    private func clearSessionState() {
        UserDefaults.standard.removeObject(forKey: kPersistedSession)
    }

    /// On app launch: if there is a saved session from today, restore it and
    /// resume local timers (the server session stays open from the previous run).
    private func restoreSessionIfNeeded() {
        guard let data  = UserDefaults.standard.data(forKey: kPersistedSession),
              let state = try? JSONDecoder().decode(PersistedSession.self, from: data)
        else { return }

        // Only restore if the session started today
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

        // Rebuild a minimal TaskItem from persisted fields if needed
        // (We can't do a full decode without all fields, so we skip re-linking the task object.
        //  The task chip just won't show after restore – acceptable trade-off.)

        startAllServices(sessionId: state.sessionId)
        print("[TrackingManager] Restored session \(state.sessionId) with \(state.trackedMinutes) min")
    }

    // MARK: - Services

    private func startAllServices(sessionId: Int) {
        startMinuteTimer(sessionId: sessionId)
        startResumeTimer()

        // Screenshots – interval from employee profile (default 300s / 5 min)
        let screenshotInterval = TimeInterval(api.employee?.screenshotInterval ?? 300)
        screenshots.start(interval: screenshotInterval) { [weak self] imageData in
            guard let self else { return }
            Task {
                await self.uploadScreenshot(imageData, sessionId: sessionId)
            }
        }

        // Take a first screenshot 10 s after start so admin sees activity immediately
        let initialShot = Timer(timeInterval: 10, repeats: false) { [weak self] _ in
            self?.screenshots.captureNow()
        }
        RunLoop.main.add(initialShot, forMode: .common)

        // App / window tracking — logs which app + window title is active
        appTracker.onAppChange = { [weak self] appName, windowTitle, startTime, endTime in
            guard let self else { return }
            let duration = Int(endTime.timeIntervalSince(startTime))
            Task {
                try? await self.api.logActivity(
                    sessionId:       sessionId,
                    appName:         appName,
                    windowTitle:     windowTitle,
                    startTime:       startTime,
                    endTime:         endTime,
                    durationSeconds: duration
                )
            }
        }
        appTracker.start(pollInterval: 30)

        // Idle detection
        idleDetector.onIdleStart = { [weak self] idleStart in
            guard let self else { return }
            Task { @MainActor in self.pendingIdleStart = idleStart }
        }

        idleDetector.onIdleEnd = { [weak self] idleStart, idleEnd in
            guard let self else { return }
            let idleMinutes = max(1, Int(idleEnd.timeIntervalSince(idleStart)) / 60)
            Task { @MainActor in
                self.sessionTimer?.invalidate(); self.sessionTimer = nil
                self.resumeTimer?.invalidate();  self.resumeTimer  = nil
                self.idleAlertMinutes = idleMinutes
                // Force false → true so onChange always fires even if a previous
                // alert was dismissed via Esc without calling resumeAfterIdle.
                self.showIdleAlert = false
                self.showIdleAlert = true
            }
        }
        idleDetector.start()
    }

    // MARK: - Timer helpers

    private func startMinuteTimer(sessionId: Int) {
        sessionTimer?.invalidate()
        heartbeatTickCount = 0
        // Use .common run-loop mode so the timer fires even during UI interactions
        // (.default mode is paused while menus/drags/events are active).
        let t = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.trackedMinutes     += 1
                self.heartbeatTickCount += 1
                self.saveSessionState()

                // Send heartbeat every kHeartbeatEvery minutes (not every minute)
                // to reduce server load and battery/network usage.
                if self.heartbeatTickCount % self.kHeartbeatEvery == 0 {
                    try? await self.api.heartbeat(
                        sessionId:       sessionId,
                        totalMinutes:    self.trackedMinutes,
                        screenPermission: self.hasScreenPermission
                    )
                    self.heartbeatTickCount = 0   // reset to avoid Int overflow over long sessions
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
