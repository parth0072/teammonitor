// TrackingManager.swift – coordinates all tracking services, uses APIService (no Firebase)

import Foundation
import Combine

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

    // Screen recording permission – updated at launch and every 3s until granted
    @Published var hasScreenPermission:      Bool = true
    // Persisted: user said "I know, stop showing this". Reset if permission
    // is later revoked (so the banner can reappear if needed).
    @Published var permissionBannerDismissed: Bool = UserDefaults.standard.bool(forKey: "tm_permBannerDismissed") {
        didSet { UserDefaults.standard.set(permissionBannerDismissed, forKey: "tm_permBannerDismissed") }
    }

    // Break state
    @Published var isOnBreak:           Bool     = false

    // Offline state (banner only — no queuing)
    @Published var isOffline:           Bool     = false

    // MARK: - Private

    private let api          = APIService.shared
    private let screenshots  = ScreenshotService.shared
    private let appTracker   = AppTrackingService.shared
    private let idleDetector = IdleDetectionService.shared
    private let network      = NetworkMonitor.shared

    private var sessionTimer:    Timer?
    private var resumeTimer:     Timer?
    private var permissionTimer: Timer?   // polls until screen-recording is granted
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

        // Check screen-recording permission immediately at launch.
        hasScreenPermission = ScreenshotService.hasPermission()
        if hasScreenPermission {
            // Permission confirmed — clear any stale dismiss flag
            permissionBannerDismissed = false
            UserDefaults.standard.removeObject(forKey: "tm_permBannerDismissed")
        } else {
            startPermissionPolling()
        }


        // Restore a session that was active when the app was last closed
        restoreSessionIfNeeded()
    }

    // MARK: - Screen-Recording Permission

    /// Call this when the user taps "Re-check" or "Open Settings" in the banner.
    func recheckScreenPermission() {
        hasScreenPermission = ScreenshotService.hasPermission()
        if hasScreenPermission {
            permissionTimer?.invalidate()
            permissionTimer = nil
        } else {
            ScreenshotService.requestPermission()   // opens System Settings
            startPermissionPolling()
        }
    }

    /// Polls every 3 seconds. Stops as soon as the user grants access.
    private func startPermissionPolling() {
        permissionTimer?.invalidate()
        permissionTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let granted = ScreenshotService.hasPermission()
                self.hasScreenPermission = granted
                if granted {
                    self.permissionTimer?.invalidate()
                    self.permissionTimer = nil
                }
            }
        }
    }

    // MARK: - Punch In

    func punchIn(task: TaskItem? = nil) async {
        guard !isTracking else { return }
        guard network.isOnline else {
            statusMessage = "No internet connection. Connect and try again."
            return
        }
        statusMessage = "Starting session…"

        hasScreenPermission = ScreenshotService.hasPermission()
        if !hasScreenPermission { startPermissionPolling() }

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
        statusMessage = "Session ended. Have a great day!"

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

        isOnBreak     = true
        statusMessage = "On break"
        saveSessionState()

        // Sync current time to server
        if let sessionId = currentSessionId {
            try? await api.heartbeat(sessionId: sessionId, totalMinutes: trackedMinutes)
        }
    }

    /// Resumes from a manual break – restarts the timers and screenshot service.
    func resumeFromBreak() {
        guard isTracking, isOnBreak, let sessionId = currentSessionId else { return }

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
            // Fire-and-forget: try to upload; silently skip on any failure.
            // No offline queue — avoids stale-token replays and "queued" messages.
            Task {
                do {
                    _ = try await self.api.uploadScreenshot(
                        imageData,
                        sessionId: sessionId,
                        activityLevel: self.idleDetector.activityPercent
                    )
                    await MainActor.run { self.screenshotCount += 1 }
                } catch {
                    // Upload failed (no internet / auth error) — silently skip
                }
            }
        }

        // Take a first screenshot 10 s after start so admin sees activity immediately
        let initialShot = Timer(timeInterval: 10, repeats: false) { [weak self] _ in
            self?.screenshots.captureNow()
        }
        RunLoop.main.add(initialShot, forMode: .common)

        // App tracking disabled — sessions, screenshots and idle detection only

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
                self.showIdleAlert    = true
            }
        }
        idleDetector.start()
    }

    // MARK: - Timer helpers

    private func startMinuteTimer(sessionId: Int) {
        sessionTimer?.invalidate()
        // Use .common run-loop mode so the timer fires even during UI interactions
        // (.default mode is paused while menus/drags/events are active).
        let t = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.trackedMinutes += 1
                self.saveSessionState()
                try? await self.api.heartbeat(sessionId: sessionId, totalMinutes: self.trackedMinutes)
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
        screenshots.stop()
        appTracker.stop()
        idleDetector.stop()
        recentApps         = []
        minutesSinceResume = 0
    }
}
