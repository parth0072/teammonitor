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
    // Set to true when the user manually dismisses the banner this session
    @Published var permissionBannerDismissed: Bool = false

    // Offline state
    @Published var isOffline:           Bool     = false
    @Published var pendingUploadCount:  Int      = 0   // queued screenshots

    // MARK: - Private

    private let api          = APIService.shared
    private let screenshots  = ScreenshotService.shared
    private let appTracker   = AppTrackingService.shared
    private let idleDetector = IdleDetectionService.shared
    private let network      = NetworkMonitor.shared
    private let offlineQueue = OfflineQueue.shared

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

        // Network monitor → sync queued items when we come back online
        network.$isOnline
            .receive(on: RunLoop.main)
            .sink { [weak self] (online: Bool) in
                guard let self else { return }
                self.isOffline = !online
                if online { Task { await self.syncOfflineQueue() } }
            }
            .store(in: &cancellables)

        // Check screen-recording permission immediately at launch.
        hasScreenPermission = ScreenshotService.hasPermission()
        if !hasScreenPermission { startPermissionPolling() }

        // Update offline-queue badge count
        pendingUploadCount = offlineQueue.pendingScreenshotCount()

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

        if network.isOnline {
            do {
                try await api.punchOut(sessionId: sessionId, totalMinutes: trackedMinutes)
                statusMessage = "Session saved. Have a great day!"
            } catch {
                // Server unreachable even though monitor said online – queue it
                offlineQueue.enqueuePunchOut(QueuedPunchOut(
                    sessionId: sessionId, totalMinutes: trackedMinutes, punchedOutAt: Date()))
                statusMessage = "Saved offline. Will sync when connected."
            }
        } else {
            offlineQueue.enqueuePunchOut(QueuedPunchOut(
                sessionId: sessionId, totalMinutes: trackedMinutes, punchedOutAt: Date()))
            statusMessage = "Saved offline. Will sync when connected."
        }

        clearSessionState()
        currentSessionId   = nil
        currentTask        = nil
        punchInTime        = nil
        lastResumeTime     = nil
        recentApps         = []
        minutesSinceResume = 0
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

    // MARK: - Offline Sync

    /// Called whenever network comes back online. Drains queued screenshots and punch-outs.
    private func syncOfflineQueue() async {
        // 1. Pending punch-out
        if let pendingOut = offlineQueue.pendingPunchOut() {
            do {
                try await api.punchOut(sessionId: pendingOut.sessionId, totalMinutes: pendingOut.totalMinutes)
                offlineQueue.dequeuePunchOut()
                print("[OfflineSync] Punch-out synced for session \(pendingOut.sessionId)")
            } catch {
                print("[OfflineSync] Punch-out failed: \(error)")
            }
        }

        // 2. Queued screenshots
        let pending = offlineQueue.pendingScreenshots()
        for (item, data) in pending {
            do {
                _ = try await api.uploadScreenshot(data, sessionId: item.sessionId,
                                                   activityLevel: item.activityLevel)
                offlineQueue.dequeueScreenshot(filename: item.filename)
                await MainActor.run {
                    self.screenshotCount    += 1
                    self.pendingUploadCount  = self.offlineQueue.pendingScreenshotCount()
                }
            } catch {
                print("[OfflineSync] Screenshot upload failed: \(error)")
                break  // stop on first failure – will retry next time
            }
        }

        await MainActor.run {
            self.pendingUploadCount = self.offlineQueue.pendingScreenshotCount()
        }
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
                if self.network.isOnline {
                    do {
                        _ = try await self.api.uploadScreenshot(
                            imageData,
                            sessionId: sessionId,
                            activityLevel: self.idleDetector.activityPercent
                        )
                        await MainActor.run { self.screenshotCount += 1 }
                    } catch {
                        // Upload failed – save to offline queue
                        self.offlineQueue.enqueueScreenshot(imageData, sessionId: sessionId,
                                                            activityLevel: self.idleDetector.activityPercent)
                        await MainActor.run {
                            self.pendingUploadCount = self.offlineQueue.pendingScreenshotCount()
                        }
                        print("Screenshot queued offline: \(error)")
                    }
                } else {
                    // No internet – queue immediately
                    self.offlineQueue.enqueueScreenshot(imageData, sessionId: sessionId,
                                                        activityLevel: self.idleDetector.activityPercent)
                    await MainActor.run {
                        self.pendingUploadCount = self.offlineQueue.pendingScreenshotCount()
                    }
                }
            }
        }

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
        sessionTimer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                self.trackedMinutes += 1
                self.saveSessionState()   // ← persist every minute
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
