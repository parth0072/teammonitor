// TrackingManager.swift – coordinates all tracking services, uses APIService (no Firebase)

import Foundation
import Combine

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
    // Set to true when the user manually dismisses the banner this session
    @Published var permissionBannerDismissed: Bool = false

    // MARK: - Private

    private let api          = APIService.shared
    private let screenshots  = ScreenshotService.shared
    private let appTracker   = AppTrackingService.shared
    private let idleDetector = IdleDetectionService.shared

    private var sessionTimer:    Timer?
    private var resumeTimer:     Timer?
    private var permissionTimer: Timer?   // polls until screen-recording is granted
    private var lastResumeTime:  Date?
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

        // Check screen-recording permission immediately at launch.
        // If not granted, start polling every 3 s so the banner clears
        // automatically once the user grants access — no app restart needed.
        hasScreenPermission = ScreenshotService.hasPermission()
        if !hasScreenPermission { startPermissionPolling() }
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
            statusMessage    = "Tracking active"
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
            statusMessage    = "Session saved. Have a great day!"
            currentSessionId = nil
            currentTask      = nil
            punchInTime      = nil
            lastResumeTime   = nil
            recentApps       = []
            minutesSinceResume = 0
        } catch {
            statusMessage = "Error saving: \(error.localizedDescription)"
        }
    }

    // MARK: - Take a Break (manual pause – shows idle alert)

    func takeBreak() async {
        guard isTracking else { return }
        sessionTimer?.invalidate(); sessionTimer = nil
        resumeTimer?.invalidate();  resumeTimer  = nil
        pendingIdleStart = Date()
        idleAlertMinutes = 0
        statusMessage    = "On break…"
        showIdleAlert    = true
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
                do {
                    _ = try await self.api.uploadScreenshot(
                        imageData,
                        sessionId: sessionId,
                        activityLevel: self.idleDetector.activityPercent
                    )
                    await MainActor.run { self.screenshotCount += 1 }
                } catch { print("Screenshot error: \(error)") }
            }
        }

        // App tracking every 30s
        appTracker.onAppChange = { [weak self] appName, windowTitle, start, end in
            guard let self else { return }
            let secs = Int(end.timeIntervalSince(start))
            guard secs > 5 else { return }
            Task {
                try? await self.api.logActivity(
                    sessionId: sessionId,
                    appName: appName,
                    windowTitle: windowTitle,
                    startTime: start,
                    endTime: end,
                    durationSeconds: secs
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
                self.showIdleAlert    = true
            }
        }
        idleDetector.start()
    }

    // MARK: - Timer helpers

    private func startMinuteTimer(sessionId: Int) {
        sessionTimer?.invalidate()
        sessionTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.trackedMinutes += 1
                try? await self.api.heartbeat(sessionId: sessionId, totalMinutes: self.trackedMinutes)
            }
        }
    }

    private func startResumeTimer() {
        resumeTimer?.invalidate()
        resumeTimer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                guard let resume = self.lastResumeTime else { return }
                self.minutesSinceResume = Int(Date().timeIntervalSince(resume)) / 60
            }
        }
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
