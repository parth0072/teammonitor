// TrackingManager.swift – coordinates all tracking services, uses APIService (no Firebase)

import AppKit
import Foundation
import Combine
import UserNotifications

extension Notification.Name {
    static let tmActivateWindow = Notification.Name("tm.activateWindow")
}

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
    @Published var isIdleBreak:         Bool     = false  // break was triggered by idle, not user

    // Idle warning
    @Published var showIdleWarning:         Bool = false
    @Published var idleWarningSecondsLeft:  Int  = 0
    private var idleWarningCountdownTimer:  Timer?
    private var reminderDeadline:           Date?

    // Offline state
    @Published var isOffline:           Bool     = false

    // Not-tracking reminder
    @Published var showStartReminder:    Bool    = false
    @Published var showNotTrackingAlert: Bool    = false
    @Published var showTaskPicker:       Bool    = false
    @Published var showResumePrompt:     Bool    = false
    @Published var secondsUntilNextReminder: Int = 2 * 60

    // Escalating reminder: 2 min → 5 min → 10 min repeating
    private let reminderIntervals: [TimeInterval] = [2 * 60, 5 * 60, 10 * 60]
    private var reminderPhase: Int = 0
    @Published var idleReminderDisabled: Bool = UserDefaults.standard.bool(forKey: "tm_idle_reminder_disabled")

    var nextReminderMinutes: Int {
        Int(reminderIntervals[min(reminderPhase, reminderIntervals.count - 1)] / 60)
    }

    // Slow work alert
    @Published var showSlowWorkAlert: Bool = false
    @Published var reminderMessage:  String? = nil

    // Admin remote control
    @Published var trackingLocked: Bool = false

    // Work status options loaded from org settings
    @Published var workStatusOptions: [String] = ["WFO", "WFH", "Remote"]

    // Recent tasks (persisted across sessions)
    @Published var recentTaskIds:  [Int]    = []
    @Published var recentJiraKeys: [String] = []

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
    private var activityWatchTimer:   Timer?   // auto check-in when activity detected while not tracking
    private var dayChangeTimer:       Timer?   // always-running — detects midnight even when not tracking
    private var heartbeatTickCount:        Int    = 0
    private let kHeartbeatEvery:           Int    = 5
    private var lowActivityMinutes:        Int    = 0
    private var pendingDeliveredCommandIds: [Int] = []
    /// Breaks completed offline (breakEnd API failed) — synced with the next heartbeat.
    private var pendingBreaks: [(start: Date, end: Date)] = []

    private let kRecentTaskIds  = "tm_recent_task_ids"
    private let kRecentJiraKeys = "tm_recent_jira_keys"
    private let kLastTask       = "tm_last_task"      // persists last active task across restarts

    // Last task/jira before punch-out — used by auto check-in so it always resumes with context
    private(set) var lastActiveTask:      TaskItem?   = nil
    private(set) var lastActiveJiraIssue: JiraIssue?  = nil

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
                guard let self else { return }
                let wasOffline = self.isOffline
                self.isOffline = !online
                // When network comes back while tracking, immediately sync accumulated
                // minutes to the server (pass reconnect:true so the server skips
                // gap/break insertion — the user was working, not sleeping).
                if online && wasOffline && self.isTracking,
                   let sessionId = self.currentSessionId {
                    let mins       = self.trackedMinutes
                    let perm       = ScreenshotService.hasPermission()
                    let breaks     = self.pendingBreaks
                    let breakStart = self.isOnBreak ? self.stoppedTrackingAt : nil
                    self.pendingBreaks      = []
                    self.heartbeatTickCount = 0   // avoid double-heartbeat right after reconnect
                    TMLog("[Network] Reconnected — syncing \(mins)m + \(breaks.count) break(s) (session \(sessionId))")
                    Task {
                        if let resp = try? await self.api.heartbeat(
                            sessionId: sessionId, totalMinutes: mins,
                            screenPermission: perm, isIdle: false,
                            deliveredCommandIds: [], breaks: breaks,
                            currentBreakStart: breakStart, reconnect: true) {
                            await self.handleHeartbeatResponse(resp)
                        } else {
                            await MainActor.run { self.pendingBreaks = breaks + self.pendingBreaks }
                        }
                    }
                }
            }
            .store(in: &cancellables)

        hasScreenPermission = ScreenshotService.hasPermission()

        recentTaskIds  = UserDefaults.standard.array(forKey: kRecentTaskIds)  as? [Int]    ?? []
        recentJiraKeys = UserDefaults.standard.array(forKey: kRecentJiraKeys) as? [String] ?? []

        restoreSessionIfNeeded()
        loadTodayMinutes()

        // Sync todayMinutes from server so the display is correct even if UserDefaults
        // was cleared (app reinstall, new device, or date mismatch from timezone).
        if api.token != nil {
            Task {
                if let serverMins = await api.getTodayMinutes() {
                    await MainActor.run {
                        // Only update if server reports more than local (local may be ahead
                        // by a few minutes if the heartbeat hasn't synced yet).
                        if serverMins > self.todayMinutes {
                            self.todayMinutes = serverMins
                            self.saveTodayMinutes()
                            TMLog("[TrackingManager] Synced todayMinutes from server: \(serverMins) min")
                        }
                    }
                }
            }

            // Load org settings (work status options, etc.)
            Task {
                let opts = await api.getWorkStatusOptions()
                await MainActor.run { self.workStatusOptions = opts }
            }
        }

        if !isTracking && currentSessionId == nil {
            // No restored session — start the not-tracking reminder from scratch
            stoppedTrackingAt = Date()
            scheduleNotTrackingReminder()
        }
        // If currentSessionId != nil (restored session), showResumePrompt is already set;
        // reminder will start only after the user dismisses the prompt or punches out.

        // ── Sleep / wake / quit observers ─────────────────────────────────────
        // We do NOT punch out on sleep. The minute timer is RunLoop-based and
        // naturally pauses while the Mac is asleep, so no time accrues during
        // sleep. The session stays open on the server and resumes seamlessly on
        // wake — no employee action needed, no time lost.

        // BEFORE sleep (lid close, manual sleep, display sleep):
        // Fire a heartbeat with isIdle=true so the server marks the user idle/offline
        // immediately instead of waiting for the 8-minute heartbeat timeout.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.willSleepNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self, let sid = self.currentSessionId else {
                TMLog("[LidClose] Mac going to sleep — no active session, nothing to do")
                return
            }
            let mins = self.trackedMinutes
            TMLog("[LidClose] Mac going to sleep — session: \(sid), \(mins)m tracked, isOnBreak: \(self.isOnBreak), isIdle: \(self.isIdle), isTracking: \(self.isTracking)")
            // Stop the session timer so Power Nap wakes don't send heartbeats during sleep.
            // Without this, Power Nap fires the RunLoop timer every 5 min and keeps
            // last_heartbeat_at fresh, preventing the server's gap detection from
            // inserting a break for the sleep period.
            // Laptops that deep-sleep are unaffected — their RunLoop pauses anyway.
            if self.isTracking && !self.isOnBreak {
                self.sessionTimer?.invalidate()
                self.sessionTimer = nil
                TMLog("[LidClose] Session timer stopped — will restart on wake")
            }
            let delivered = self.pendingDeliveredCommandIds
            self.pendingDeliveredCommandIds = []
            Task {
                try? await self.api.heartbeat(
                    sessionId: sid, totalMinutes: mins,
                    isIdle: true, deliveredCommandIds: delivered
                )
                TMLog("[LidClose] Idle heartbeat sent — session: \(sid)")
            }
        }

        // AFTER wake: clear the idle flag so the user shows as active again.
        // On wake: only handle the case where the Mac slept past midnight (day
        // change → punch out stale session) or where activity was detected after
        // a prior idle break. If still actively tracking, nothing needs to happen.
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didWakeNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            let sessionInfo = self.currentSessionId.map { "session: \($0), \(self.trackedMinutes)m" } ?? "no session"
            TMLog("[LidOpen] Mac woke from sleep — \(sessionInfo), isTracking: \(self.isTracking), isOnBreak: \(self.isOnBreak), isIdleBreak: \(self.isIdleBreak)")
            // Punch out and remind if the day rolled over during sleep.
            let dayChanged = self.checkDayChange()
            guard !dayChanged else {
                TMLog("[LidOpen] Day changed during sleep — stale session punched out")
                return
            }
            // Clear server-side idle flag if we're still in a session
            if let sid = self.currentSessionId {
                let mins = self.trackedMinutes
                TMLog("[LidOpen] Clearing idle flag on server — session: \(sid), \(mins)m tracked")
                // Restart the session timer (was stopped on sleep to prevent Power Nap heartbeats).
                // The wake heartbeat below triggers server-side gap detection which inserts the
                // break for the sleep period automatically.
                if self.isTracking && !self.isOnBreak {
                    self.startMinuteTimer(sessionId: sid)
                    TMLog("[LidOpen] Session timer restarted — session: \(sid)")
                }
                Task {
                    try? await self.api.heartbeat(
                        sessionId: sid, totalMinutes: mins,
                        isIdle: false, deliveredCommandIds: []
                    )
                    TMLog("[LidOpen] Wake heartbeat sent — session: \(sid)")
                }
            } else {
                TMLog("[LidOpen] No active session on wake — will show resume prompt if activity detected")
            }
            // Three cases:
            //  1. Actively tracking (no break)     → session continues silently, nothing to do.
            //  2. On an idle-triggered break        → auto-resume as soon as user is detected active.
            //  3. Not tracking at all               → show resume prompt.
            // (Manual break = isOnBreak && !isIdleBreak → don't auto-resume; employee chose to pause.)
            if !self.isTracking || (self.isOnBreak && self.isIdleBreak) {
                DispatchQueue.main.asyncAfter(deadline: .now() + 1) { [weak self] in
                    self?.handleActivityDetected(reason: "Mac woke from sleep")
                }
            }
        }

        // Punch OUT when the app is about to quit (logout, force-quit, update install)
        NotificationCenter.default.addObserver(
            forName: NSApplication.willTerminateNotification, object: nil, queue: .main
        ) { [weak self] _ in
            guard let self else { return }
            TMLog("[AppTerminate] App terminating — isTracking: \(self.isTracking), session: \(self.currentSessionId.map{"\($0)"} ?? "none"), \(self.trackedMinutes)m tracked")
            guard self.isTracking else { return }
            TMLog("[AutoCheckOut] App terminating — punching out session \(self.currentSessionId ?? -1), \(self.trackedMinutes)m tracked")
            // Synchronous-style: run punch-out on a detached task and give it 5 s.
            // The install script waits 7 s after pkill, so this has enough runway
            // even on a slow connection.
            let sem = DispatchSemaphore(value: 0)
            Task {
                await self.punchOut()
                sem.signal()
            }
            _ = sem.wait(timeout: .now() + 5)
        }

        // Poll every 2 min while not tracking — if system idle time just
        // dropped below 60 s the user moved; treat that as returning to desk.
        startActivityWatcher()

        // Always-running day-change watcher (detects midnight even when not tracking)
        startDayChangeWatcher()
    }

    // MARK: - Auto Check-In

    private func startActivityWatcher(interval: TimeInterval = 120) {
        activityWatchTimer?.invalidate()
        let t = Timer(timeInterval: interval, repeats: true) { [weak self] _ in
            guard let self else { return }

            // Safety self-stop: if we're actively tracking (not on any break) this watcher
            // should not be running. Invalidate immediately — no IOKit call, zero overhead.
            if self.isTracking && !self.isOnBreak {
                self.activityWatchTimer?.invalidate()
                self.activityWatchTimer = nil
                return
            }

            // One IOKit registry read — takes ~microseconds, no allocation.
            let idle = IdleDetectionService.shared.systemIdleSecondsPublic()

            // Idle-triggered break: auto-resume when user activity detected
            if self.isTracking && self.isOnBreak && self.isIdleBreak {
                // Guard: if the day changed since the break started (slept overnight),
                // punch out the stale session instead of resuming it on the new day.
                if let stopped = self.stoppedTrackingAt {
                    let breakDay   = dayFormatter.string(from: stopped)
                    let currentDay = dayFormatter.string(from: Date())
                    if breakDay != currentDay {
                        TMLog("[ActivityWatcher] Day changed during idle break — punching out stale session")
                        Task { await self.punchOut() }
                        return
                    }
                }
                if idle < 60, self.stoppedTrackingAt != nil {
                    self.handleActivityDetected(reason: "Activity after idle break")
                }
                return
            }

            guard !self.isTracking, !self.isOnBreak else { return }
            // User became active (idle < 60 s) after being away at least 5 min
            if idle < 60, let stopped = self.stoppedTrackingAt,
               Date().timeIntervalSince(stopped) > 5 * 60 {
                self.handleActivityDetected(reason: "Activity detected after \(Int(Date().timeIntervalSince(stopped) / 60)) min away")
            }
        }
        RunLoop.main.add(t, forMode: .common)
        activityWatchTimer = t
    }

    private func handleActivityDetected(reason: String) {
        guard api.token != nil else { return }

        // Auto-resume from idle-triggered break (no prompt — seamless)
        if isTracking && isOnBreak && isIdleBreak {
            TMLog("[AutoResume] \(reason)")
            resumeFromBreak()
            NotificationOverlayManager.shared.show(
                title: "Tracking Resumed",
                message: "Welcome back — timer resumed automatically.",
                isWarning: false
            )
            return
        }

        guard !isTracking, !isOnBreak else { return }
        let resumeTask = currentTask ?? lastActiveTask
        let resumeJira = currentJiraIssue ?? lastActiveJiraIssue
        guard resumeTask != nil || resumeJira != nil else {
            TMLog("[AutoCheckIn] \(reason) — no previous task, skipping prompt")
            return
        }
        TMLog("[AutoCheckIn] \(reason) — showing resume prompt")
        showResumePrompt = true
        NotificationCenter.default.post(name: .tmActivateWindow, object: nil)
    }

    /// Called when user taps "Resume" in the resume prompt banner.
    func confirmResume() {
        showResumePrompt = false
        NotificationOverlayManager.shared.dismissWarnings()  // clear any "not tracking" banner

        // If we have a restored session that hasn't started yet, resume it directly
        // without a new punch-in API call. Otherwise do a fresh punch-in.
        if let sessionId = currentSessionId, !isTracking {
            // Resume the existing server-side session
            cancelNotTrackingReminder()
            activityWatchTimer?.invalidate(); activityWatchTimer = nil
            stoppedTrackingAt   = nil
            punchInTime         = punchInTime ?? Date()
            lastResumeTime      = Date()
            trackedMinutes      = trackedMinutes   // keep restored value
            isTracking          = true
            isOnBreak           = false
            showIdleAlert       = false
            statusMessage       = "Tracking active"
            MenuBarState.shared.isTracking   = true
            MenuBarState.shared.isOnBreak    = false
            MenuBarState.shared.todayMinutes = todayMinutes
            saveSessionState()
            startAllServices(sessionId: sessionId)
            TMLog("[TrackingManager] Resumed restored session \(sessionId)")

            // Immediate heartbeat — syncs time + any pending breaks right away
            let mins       = trackedMinutes
            let perm       = ScreenshotService.hasPermission()
            let delivered  = pendingDeliveredCommandIds
            let breaksSnap = pendingBreaks
            pendingDeliveredCommandIds = []
            pendingBreaks              = []
            Task {
                if (try? await self.api.heartbeat(sessionId: sessionId, totalMinutes: mins,
                                                  screenPermission: perm, isIdle: false,
                                                  deliveredCommandIds: delivered,
                                                  breaks: breaksSnap)) != nil {
                    TMLog("[ConfirmResume] Immediate heartbeat synced — session: \(sessionId), \(mins)m, breaks: \(breaksSnap.count)")
                } else {
                    await MainActor.run {
                        self.pendingDeliveredCommandIds = delivered + self.pendingDeliveredCommandIds
                        self.pendingBreaks = breaksSnap + self.pendingBreaks
                    }
                    TMLog("[ConfirmResume] Immediate heartbeat failed — will retry")
                }
            }
        } else {
            let task = currentTask ?? lastActiveTask
            let jira = currentJiraIssue ?? lastActiveJiraIssue
            Task { await punchIn(task: task, jiraIssue: jira) }
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
        let title = isWarning ? "Timer Paused" : "Tracking Resumed"
        Task { @MainActor in
            NotificationOverlayManager.shared.show(title: title, message: text, isWarning: isWarning)
        }
        TMLog("[Notifications] \(title): \(text)")
    }

    /// Idle-specific notification — fires a real macOS system notification with
    /// "Start Timer" / "Don't Remind Me Again" action buttons, plus the in-app overlay.
    func sendIdleNotification(_ text: String) {
        // System notification (shows in Notification Center with action buttons)
        let content = UNMutableNotificationContent()
        content.title    = "⏱ Timer Not Running"
        content.body     = text
        content.sound    = .default
        content.categoryIdentifier = "IDLE_REMINDER"
        let request = UNNotificationRequest(
            identifier: "idle-reminder",   // reuse same ID so it replaces the previous one
            content: content,
            trigger: nil                   // deliver immediately
        )
        UNUserNotificationCenter.current().add(request) { err in
            if let err { TMLog("[Notifications] idle system notification error: \(err)") }
        }

        // In-app overlay (visible even when the window is open)
        Task { @MainActor in
            NotificationOverlayManager.shared.show(
                title: "⏱ Timer Not Running",
                message: text,
                isWarning: true,
                muteAction: { [weak self] in self?.disableIdleReminder() }
            )
        }
        showNotTrackingAlert = true
    }

    // MARK: - Admin Remote Commands

    /// Called after every heartbeat response — applies server-sent commands.
    func handleHeartbeatResponse(_ r: HeartbeatResponse) {
        // 1. Sync lock state silently — no side effects here.
        //    Commands (lock_tracking / unlock_tracking) drive the actual punchOut/notification
        //    so we don't double-act on every heartbeat while locked.
        if trackingLocked != r.trackingLocked {
            trackingLocked = r.trackingLocked
        }

        // 2. Sync todayMinutes from server every heartbeat (every 5 min).
        //    The server value is 0–5 min behind local in normal operation (local ticks
        //    every minute, server only knows the last heartbeat value). So:
        //    • Correct upward always   — server knows about sessions the local missed.
        //    • Correct downward only when gap > kHeartbeatEvery min — real drift (e.g.
        //      double-counted from a failed offline punchOut), not just normal lag.
        if let serverMins = r.todayMinutes {
            let diff = todayMinutes - serverMins
            // Correct upward always (server knows more).
            // Correct downward only when gap > heartbeat interval AND server > 0
            // (guards against a silent server-side query failure returning 0).
            if serverMins > todayMinutes || (diff > kHeartbeatEvery && serverMins > 0) {
                TMLog("[Heartbeat] Correcting todayMinutes: local=\(todayMinutes)m → server=\(serverMins)m")
                todayMinutes = serverMins
                MenuBarState.shared.todayMinutes = serverMins
                saveTodayMinutes()
            }
        }

        // 3. One-shot commands — each delivered once, marked in pendingDeliveredCommandIds
        guard !r.commands.isEmpty else { return }
        TMLog("[AdminCommand] \(r.commands.count) command(s) received: \(r.commands.map { "\($0.type)(id:\($0.id))" }.joined(separator: ", "))")
        var newDelivered: [Int] = []
        for cmd in r.commands {
            TMLog("[AdminCommand] Executing: \(cmd.type) (id: \(cmd.id))")
            switch cmd.type {
            case "notify":
                showAdminNotification(id: cmd.id, title: cmd.title ?? "Admin",
                                      message: cmd.message ?? "", action: cmd.action ?? "none")
            case "force_punch_out":
                TMLog("[AdminCommand] force_punch_out — isTracking: \(isTracking)")
                if isTracking { Task { await punchOut() } }
                sendNotification("Admin ended your session", isWarning: true)
            case "force_break":
                TMLog("[AdminCommand] force_break — isTracking: \(isTracking), isOnBreak: \(isOnBreak)")
                if isTracking && !isOnBreak { Task { await takeBreak() } }
                sendNotification("Admin started a break for you", isWarning: false)
            case "lock_tracking":
                TMLog("[AdminCommand] lock_tracking — punching out if active")
                trackingLocked = true
                if isTracking { Task { await punchOut() } }
                sendNotification("Tracking locked by admin", isWarning: true)
            case "unlock_tracking":
                TMLog("[AdminCommand] unlock_tracking")
                trackingLocked = false
                sendNotification("Tracking unlocked by admin", isWarning: false)
            default:
                TMLog("[AdminCommand] Unknown command type: \(cmd.type)")
                break
            }
            newDelivered.append(cmd.id)
        }
        pendingDeliveredCommandIds.append(contentsOf: newDelivered)
    }

    /// Show an admin-sent notification as the custom in-app overlay only.
    private func showAdminNotification(id: Int, title: String, message: String, action: String) {
        NotificationOverlayManager.shared.show(title: title, message: message, isWarning: false)
    }

    func scheduleNotTrackingReminder() {
        cancelNotTrackingReminder()
        guard !idleReminderDisabled else { return }

        let interval = reminderIntervals[min(reminderPhase, reminderIntervals.count - 1)]
        reminderDeadline = Date().addingTimeInterval(interval)
        secondsUntilNextReminder = Int(interval)
        startCountdownTimer()

        let t = Timer(timeInterval: interval, repeats: false) { [weak self] _ in
            guard let self else { return }
            Task { @MainActor in
                guard !self.isTracking || self.isOnBreak else {
                    self.cancelNotTrackingReminder(); return
                }
                guard !self.idleReminderDisabled else { return }

                self.reminderPhase += 1

                // Activate window via AppDelegate observer
                NotificationCenter.default.post(name: .tmActivateWindow, object: nil)

                // Send persistent notification with action buttons (forces Alert style)
                let msg = self.isOnBreak
                    ? "You've been on break for \(self.minutesNotTracking) min. Tap 'Start Timer' to resume."
                    : "You haven't been tracking for \(self.minutesNotTracking) min. Don't forget to log your time!"
                self.sendIdleNotification(msg)

                // Show the in-app "Timer is not running" reminder banner
                self.showStartReminder = true

                self.scheduleNotTrackingReminder()
            }
        }
        RunLoop.main.add(t, forMode: .common)
        notTrackingTimer = t
        TMLog("[Notifications] Idle reminder scheduled in \(Int(interval / 60)) min (phase \(reminderPhase))")
    }

    func cancelNotTrackingReminder() {
        notTrackingTimer?.invalidate()
        notTrackingTimer = nil
        countdownTimer?.invalidate()
        countdownTimer = nil
        reminderDeadline = nil
        secondsUntilNextReminder = Int(reminderIntervals[0])
        // Note: showStartReminder is intentionally NOT cleared here because
        // cancelNotTrackingReminder() is called during rescheduling too — we want
        // the banner to stay visible between reminder intervals. It is cleared in
        // punchIn() and resumeFromBreak() when the user actually starts tracking.
    }

    func disableIdleReminder() {
        idleReminderDisabled = true
        UserDefaults.standard.set(true, forKey: "tm_idle_reminder_disabled")
        cancelNotTrackingReminder()
    }

    func enableIdleReminder() {
        idleReminderDisabled = false
        UserDefaults.standard.removeObject(forKey: "tm_idle_reminder_disabled")
        if !isTracking { reminderPhase = 0; scheduleNotTrackingReminder() }
    }

    private func startCountdownTimer() {
        countdownTimer?.invalidate()
        // Fires every 10 s (not 1 s) — avoids a @Published update + SwiftUI re-render
        // every second. Reads the stored deadline so the displayed value stays accurate.
        let c = Timer(timeInterval: 10, repeats: true) { [weak self] _ in
            guard let self, !self.isTracking || self.isOnBreak else { return }
            guard let deadline = self.reminderDeadline else { return }
            let secs = max(0, Int(deadline.timeIntervalSinceNow))
            if secs != self.secondsUntilNextReminder { self.secondsUntilNextReminder = secs }
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
        activityWatchTimer?.invalidate(); activityWatchTimer = nil  // stop polling while tracking
        showStartReminder        = false
        showNotTrackingAlert     = false
        showResumePrompt         = false
        stoppedTrackingAt        = nil
        secondsUntilNextReminder = 5 * 60
        guard !isTracking else {
            TMLog("[PunchIn] Already tracking — ignored (session: \(currentSessionId ?? -1))")
            return
        }
        guard !trackingLocked else {
            TMLog("[PunchIn] Blocked — tracking locked by admin")
            sendNotification("Tracking is disabled by admin", isWarning: true)
            return
        }
        guard network.isOnline else {
            TMLog("[PunchIn] Blocked — no internet connection")
            statusMessage = "No internet connection. Connect and try again."
            return
        }
        TMLog("[PunchIn] Starting — task: \(task?.name ?? "none"), jira: \(jiraIssue?.key ?? "none")")
        statusMessage = "Starting session…"

        do {
            // Refresh settings from server so admin changes (screenshots, intervals, etc.)
            // take effect without requiring a logout/login.
            await api.refreshEmployee()

            // Gate: if the admin has screenshots enabled for this employee, screen recording
            // permission is required before we allow the timer to start.
            let screenshotsRequired = api.employee?.screenshotsEnabled ?? true
            if screenshotsRequired && !ScreenshotService.hasPermission() {
                statusMessage = "Screen recording permission is required to start tracking. Please grant access in System Settings."
                hasScreenPermission = false
                ScreenshotService.requestPermission()
                scheduleNotTrackingReminder()
                return
            }

            let sessionId    = try await api.punchIn(taskId: task?.id, jiraIssueKey: jiraIssue?.key, jiraIssueSummary: jiraIssue?.summary)
            TMLog("[PunchIn] ✅ Session \(sessionId) created — task: \(task?.name ?? "none"), jira: \(jiraIssue?.key ?? "none")")
            currentSessionId = sessionId
            currentTask      = task
            currentJiraIssue = jiraIssue
            punchInTime      = Date()
            lastResumeTime   = Date()
            trackedMinutes   = 0        // per-session reset (heartbeat uses this)
            pendingBreaks    = []       // new session — clear any stale break records
            // todayMinutes intentionally NOT reset — accumulates all day
            screenshotCount    = 0
            isTracking         = true
            isOnBreak          = false
            // Re-enable idle reminders — "Don't Remind Me Again" should only silence
            // notifications for the current idle period, not permanently across sessions.
            if idleReminderDisabled { enableIdleReminder() }
            showIdleAlert      = false
            lowActivityMinutes = 0
            showSlowWorkAlert  = false
            statusMessage      = "Tracking active"
            MenuBarState.shared.isTracking   = true
            MenuBarState.shared.isOnBreak    = false
            MenuBarState.shared.todayMinutes = todayMinutes

            // Persist recent task / jira for "recently used" feature
            if let t = task {
                recentTaskIds.removeAll { $0 == t.id }
                recentTaskIds.insert(t.id, at: 0)
                if recentTaskIds.count > 5 { recentTaskIds = Array(recentTaskIds.prefix(5)) }
                UserDefaults.standard.set(recentTaskIds, forKey: kRecentTaskIds)
            }
            if let j = jiraIssue {
                recentJiraKeys.removeAll { $0 == j.key }
                recentJiraKeys.insert(j.key, at: 0)
                if recentJiraKeys.count > 5 { recentJiraKeys = Array(recentJiraKeys.prefix(5)) }
                UserDefaults.standard.set(recentJiraKeys, forKey: kRecentJiraKeys)
            }

            saveSessionState()
            startAllServices(sessionId: sessionId)

            // Immediate heartbeat — admin dashboard goes green straight away
            let perm      = ScreenshotService.hasPermission()
            let delivered = pendingDeliveredCommandIds
            pendingDeliveredCommandIds = []
            Task { try? await self.api.heartbeat(sessionId: sessionId, totalMinutes: 0,
                                                 screenPermission: perm, isIdle: false,
                                                 deliveredCommandIds: delivered) }
            TMLog("[PunchIn] Immediate heartbeat sent — session: \(sessionId)")

            // Sync todayMinutes unconditionally from server on every punch-in.
            // If a previous punchOut failed offline and the same session was reused,
            // todayMinutes can be inflated (double-counts the first phase). The server
            // total is always correct — allow it to correct both upward and downward drift.
            Task {
                if let serverMins = await self.api.getTodayMinutes() {
                    await MainActor.run {
                        if serverMins != self.todayMinutes {
                            TMLog("[PunchIn] Correcting todayMinutes: local=\(self.todayMinutes)m → server=\(serverMins)m")
                            self.todayMinutes = serverMins
                            MenuBarState.shared.todayMinutes = serverMins
                            self.saveTodayMinutes()
                        }
                    }
                }
            }
        } catch {
            TMLog("[PunchIn] ❌ Failed — \(error.localizedDescription)")
            statusMessage = "Error: \(error.localizedDescription)"
        }
    }

    // MARK: - Punch Out

    func punchOut() async {
        guard isTracking, let sessionId = currentSessionId else {
            TMLog("[PunchOut] Called but not tracking — ignored (session: \(currentSessionId.map{"\($0)"} ?? "none"), isTracking: \(isTracking))")
            return
        }
        let finalMinutes = trackedMinutes   // capture before clearing state
        TMLog("[PunchOut] Stopping session \(sessionId) — \(finalMinutes)m tracked, isOnBreak: \(isOnBreak)")
        statusMessage = "Stopping session…"
        isTracking    = false
        isOnBreak     = false   // clear break state — punchOut always ends any active break
        isIdleBreak   = false
        showIdleAlert = false
        MenuBarState.shared.isTracking = false
        MenuBarState.shared.isOnBreak  = false
        stopAllServices()

        // Clear UserDefaults BEFORE the API call — if app crashes during the call,
        // restoreSessionIfNeeded won't reload a completed session on next launch.
        clearSessionState()
        currentSessionId   = nil
        // Preserve task/jira so auto check-in (wake/activity) always resumes with context
        lastActiveTask      = currentTask
        lastActiveJiraIssue = currentJiraIssue
        currentTask        = nil
        currentJiraIssue   = nil
        punchInTime        = nil
        lastResumeTime     = nil
        recentApps         = []
        minutesSinceResume = 0

        do {
            try await api.punchOut(sessionId: sessionId, totalMinutes: finalMinutes)
            TMLog("[PunchOut] ✅ Session \(sessionId) ended — \(finalMinutes)m tracked")
        } catch {
            TMLog("[PunchOut] ❌ API error for session \(sessionId) — \(error.localizedDescription)")
        }

        statusMessage      = "Session ended. Have a great day!"
        stoppedTrackingAt  = Date()
        reminderPhase      = 0
        lowActivityMinutes = 0
        showSlowWorkAlert  = false
        scheduleNotTrackingReminder()
        startActivityWatcher()  // resume auto check-in polling

        // Check AI memory reminder after punch-out
        Task {
            if let reminder = await APIService.shared.getDailyReminder() {
                await MainActor.run { self.reminderMessage = reminder }
            }
        }
        // todayMinutes kept — shows total for the day even after punch out
    }

    // MARK: - Take a Break / Resume

    func takeBreak() async {
        guard isTracking, !isOnBreak else {
            TMLog("[Break] takeBreak called but guard failed — isTracking: \(isTracking), isOnBreak: \(isOnBreak)")
            return
        }
        TMLog("[Break] Starting break — session: \(currentSessionId ?? -1), \(trackedMinutes)m tracked")

        sessionTimer?.invalidate(); sessionTimer = nil
        resumeTimer?.invalidate();  resumeTimer  = nil
        screenshots.stop()
        idleDetector.stop()

        isOnBreak         = true
        stoppedTrackingAt = Date()
        reminderPhase     = 0
        statusMessage     = "On break"
        MenuBarState.shared.isOnBreak = true
        saveSessionState()
        scheduleNotTrackingReminder()

        // Local-first: store break start locally; the heartbeat will sync it to the server.
        // No separate breakStart API call — everything goes through heartbeat.
        TMLog("[Break] Break started locally — session: \(currentSessionId ?? -1), stoppedAt: \(stoppedTrackingAt!)")
    }

    func resumeFromBreak() {
        guard isTracking, isOnBreak, let sessionId = currentSessionId else {
            TMLog("[Break] resumeFromBreak called but guard failed — isTracking: \(isTracking), isOnBreak: \(isOnBreak), session: \(currentSessionId.map{"\($0)"} ?? "none")")
            return
        }
        TMLog("[Break] Resuming from break — session: \(sessionId), \(trackedMinutes)m tracked so far")

        cancelNotTrackingReminder()
        NotificationOverlayManager.shared.dismissWarnings()  // clear "Timer paused" overlay banner
        showNotTrackingAlert = false  // dismiss "Timer not running" modal sheet if visible
        showStartReminder    = false  // hide the in-app "Timer not running" banner
        showResumePrompt     = false  // clear any stale resume prompt

        // Stop the activity watcher — idle detector (restarted in startAllServices) takes over
        activityWatchTimer?.invalidate(); activityWatchTimer = nil

        let wasIdleBreak = isIdleBreak   // capture before clearing
        isOnBreak        = false
        isIdleBreak      = false   // clear idle-break flag whether user or auto resumed
        lastResumeTime   = Date()
        statusMessage  = "Tracking active"
        MenuBarState.shared.isOnBreak = false
        saveSessionState()

        // Local-first break recording.
        // stoppedTrackingAt = the moment takeBreak() was called (= break start).
        if wasIdleBreak {
            // Idle-triggered break → log as idle_log (shows as red on dashboard timeline).
            // pendingIdleStart is the actual moment the user went idle (set by onIdleStart);
            // fall back to stoppedTrackingAt if for some reason it wasn't set.
            let idleStart = pendingIdleStart ?? stoppedTrackingAt ?? Date()
            let idleEnd   = Date()
            pendingIdleStart = nil
            let sid = sessionId   // capture for Task
            Task {
                try? await self.api.logIdle(sessionId: sid, idleStart: idleStart, idleEnd: idleEnd)
                TMLog("[Break] Idle log sent to server: \(idleStart) → \(idleEnd) (\(Int(idleEnd.timeIntervalSince(idleStart)))s)")
            }
        } else {
            // Manual break → store as session_break (shows as yellow), synced via heartbeat.
            if let breakStart = stoppedTrackingAt {
                pendingBreaks.append((start: breakStart, end: Date()))
                TMLog("[Break] Break stored locally: \(breakStart) → now, total pending: \(pendingBreaks.count)")
            }
        }

        startAllServices(sessionId: sessionId)

        // Immediate heartbeat — syncs trackedMinutes + the just-completed break right away.
        let resumeMins = trackedMinutes
        let perm       = ScreenshotService.hasPermission()
        let breaksSnap = pendingBreaks
        pendingBreaks  = []
        Task {
            if (try? await self.api.heartbeat(sessionId: sessionId, totalMinutes: resumeMins,
                                              screenPermission: perm, isIdle: false,
                                              deliveredCommandIds: [], breaks: breaksSnap)) != nil {
                TMLog("[Break] Resume heartbeat synced \(breaksSnap.count) break(s)")
            } else {
                await MainActor.run { self.pendingBreaks = breaksSnap + self.pendingBreaks }
                TMLog("[Break] Resume heartbeat failed — \(breaksSnap.count) break(s) re-queued")
            }
        }
        TMLog("[Break] Resuming — session: \(sessionId), \(resumeMins)m")
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

        // Restore session context — but do NOT auto-start tracking.
        // Show the resume prompt so the user explicitly confirms before the timer resumes.
        currentSessionId = state.sessionId
        punchInTime      = state.punchInTime
        trackedMinutes   = state.trackedMinutes
        lastResumeTime   = nil
        isTracking       = false   // wait for user confirmation
        statusMessage    = "Session paused — tap Resume to continue"
        stoppedTrackingAt = Date()

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

        // Keep last-active context so auto check-in and resume prompt can use it
        lastActiveTask      = currentTask
        lastActiveJiraIssue = currentJiraIssue

        // Defer @Published mutations to the next run-loop turn so they don't fire
        // while SwiftUI is mid-render (avoids "Publishing changes from within view
        // updates is not allowed" runtime warning).
        let mins = trackedMinutes
        DispatchQueue.main.async { [weak self] in
            MenuBarState.shared.isTracking   = false
            MenuBarState.shared.isOnBreak    = false
            MenuBarState.shared.todayMinutes = mins
            self?.showResumePrompt = true
        }

        TMLog("[SessionRestore] Restored session \(state.sessionId) — \(state.trackedMinutes)m tracked, task: \(state.taskName ?? "none"), jira: \(state.jiraIssueKey ?? "none"), punchIn: \(state.punchInTime) — showing resume prompt")

        // Server verification — confirm session is still active on the server.
        if api.token != nil {
            let sid = state.sessionId
            Task { await self.verifyRestoredSession(sessionId: sid, date: today) }
        }
    }

    /// Background check: if restored session is no longer active on server, cancel local tracking.
    private func verifyRestoredSession(sessionId: Int, date: String) async {
        guard let sessions = try? await api.getMySessions(date: date) else {
            TMLog("[TrackingManager] verifyRestoredSession: network error — keeping local state")
            return
        }
        let match = sessions.first { $0.id == sessionId }
        if match?.status == "active" {
            // Sync trackedMinutes from server if server has a higher value.
            // This prevents post-restart agents from underreporting — the server
            // value is ground truth when the local counter was reset by a crash/lid-close.
            let serverMins = match?.totalMinutes ?? 0
            if serverMins > trackedMinutes {
                TMLog("[SessionRestore] Server has more minutes (\(serverMins)) than local (\(trackedMinutes)) — syncing up")
                await MainActor.run { self.trackedMinutes = serverMins }
            } else {
                TMLog("[SessionRestore] Session \(sessionId) verified — local: \(trackedMinutes)m, server: \(serverMins)m ✓")
            }
            return
        }
        let serverStatus = match?.status ?? "not found"
        TMLog("[TrackingManager] Session \(sessionId) is '\(serverStatus)' on server — discarding stale restore")
        await MainActor.run {
            stopAllServices()
            clearSessionState()
            isTracking       = false
            showResumePrompt = false   // dismiss the resume prompt — session is gone
            currentSessionId = nil
            lastActiveTask      = currentTask
            lastActiveJiraIssue = currentJiraIssue
            currentTask        = nil
            currentJiraIssue   = nil
            punchInTime        = nil
            lastResumeTime     = nil
            MenuBarState.shared.isTracking = false
            statusMessage     = "Ready"
            stoppedTrackingAt = Date()
            scheduleNotTrackingReminder()
            startActivityWatcher()
            sendNotification("Session was already closed — start tracking to begin.", isWarning: true)
        }
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
                guard self.isTracking, !self.isOnBreak else { return }
                self.showIdleWarning        = false
                self.idleWarningSecondsLeft = 0
                self.pendingIdleStart       = idleStart  // kept for idle log on resume

                // Pause (break) instead of ending the session — auto-resumes when user returns
                self.isIdleBreak = true
                await self.takeBreak()
                self.sendNotification("Timer paused — idle detected. Will auto-resume when you're back.", isWarning: true)
                // Use a fast 10-second poll so auto-resume happens within seconds of the
                // user returning, not up to 2 minutes later.
                self.startActivityWatcher(interval: 10)
            }
        }

        idleDetector.onIdleEnd = { [weak self] _, _ in
            guard let self else { return }
            Task { @MainActor in
                NotificationOverlayManager.shared.dismissWarnings()
                // idle detector was stopped by takeBreak — onIdleEnd is only reached
                // if user returns before the stop threshold; handle as activity
                self.handleActivityDetected(reason: "IdleEnd")
            }
        }
        idleDetector.start()
    }

    // MARK: - Day-change watcher (always running)

    /// Starts a 60-second repeating timer that detects midnight even when not tracking.
    private func startDayChangeWatcher() {
        dayChangeTimer?.invalidate()
        let t = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            self?.checkDayChange()
        }
        RunLoop.main.add(t, forMode: .common)
        dayChangeTimer = t
    }

    /// Called every minute (from day-change watcher) and from the minute timer.
    /// Punches out any active session at midnight and shows a punch-in reminder.
    @discardableResult
    private func checkDayChange() -> Bool {
        let currentDay = dayFormatter.string(from: Date())
        let savedDay   = UserDefaults.standard.string(forKey: kTodayDate) ?? currentDay
        guard savedDay != currentDay else { return false }

        TMLog("[DayChange] \(savedDay) → \(currentDay) — resetting day")
        todayMinutes = 0
        saveTodayMinutes()
        MenuBarState.shared.todayMinutes = 0

        if isTracking {
            Task { await punchOut() }
        }

        // Show persistent punch-in reminder (stays until user dismisses)
        sendIdleNotification("A new day has started! Remember to start your timer.")
        return true
    }

    // MARK: - Timer helpers

    private func startMinuteTimer(sessionId: Int) {
        sessionTimer?.invalidate()
        heartbeatTickCount = 0
        // Timer runs on RunLoop.main — no Task wrapper needed for synchronous work.
        // Only the async heartbeat spawns a Task (infrequent, every kHeartbeatEvery minutes).
        let t = Timer(timeInterval: 60, repeats: true) { [weak self] _ in
            guard let self else { return }
            self.trackedMinutes     += 1
            self.heartbeatTickCount += 1

            // End session + show punch-in reminder when date changes at midnight
            if self.checkDayChange() {
                return  // punchOut() called inside — stopAllServices() cancels this timer
            }
            self.todayMinutes += 1
            MenuBarState.shared.todayMinutes = self.todayMinutes

            self.saveSessionState()
            self.saveTodayMinutes()

            // Slow work alert
            let alertEnabled   = APIService.shared.employee?.slowWorkAlertEnabled ?? false
            let alertThreshold = APIService.shared.employee?.slowWorkAlertMinutes ?? 10
            if alertEnabled && self.activityPercent < 25 && !self.isIdle {
                self.lowActivityMinutes += 1
                if self.lowActivityMinutes == alertThreshold { self.showSlowWorkAlert = true }
            } else {
                self.lowActivityMinutes = 0
                self.showSlowWorkAlert  = false
            }

            if self.heartbeatTickCount % self.kHeartbeatEvery == 0 {
                let mins      = self.trackedMinutes
                let perm      = ScreenshotService.hasPermission()
                let delivered = self.pendingDeliveredCommandIds
                let breaks    = self.pendingBreaks
                let breakStart = self.isOnBreak ? self.stoppedTrackingAt : nil
                self.hasScreenPermission        = perm
                self.pendingDeliveredCommandIds = []
                self.pendingBreaks              = []   // optimistic clear; restored on failure
                let idle = self.isIdle || self.isOnBreak
                TMLog("[Heartbeat] Sending — session: \(sessionId), \(mins)m, isIdle: \(idle), breaks: \(breaks.count), onBreak: \(self.isOnBreak)")
                Task {
                    if let resp = try? await self.api.heartbeat(
                        sessionId: sessionId, totalMinutes: mins,
                        screenPermission: perm, isIdle: idle,
                        deliveredCommandIds: delivered,
                        breaks: breaks,
                        currentBreakStart: breakStart) {
                        TMLog("[Heartbeat] ✅ Synced \(breaks.count) break(s) — trackingLocked: \(resp.trackingLocked)")
                        await self.handleHeartbeatResponse(resp)
                    } else {
                        // Restore unsynced breaks so the next heartbeat retries them
                        await MainActor.run { self.pendingBreaks = breaks + self.pendingBreaks }
                        TMLog("[Heartbeat] ❌ Failed — session: \(sessionId), \(mins)m, \(breaks.count) break(s) re-queued")
                    }
                }
                self.heartbeatTickCount = 0
            }
        }
        RunLoop.main.add(t, forMode: .common)
        sessionTimer = t
    }

    private func startResumeTimer() {
        resumeTimer?.invalidate()
        // Timer runs on RunLoop.main — direct property access is safe, no Task needed.
        let t = Timer(timeInterval: 30, repeats: true) { [weak self] _ in
            guard let self, let resume = self.lastResumeTime else { return }
            self.minutesSinceResume = Int(Date().timeIntervalSince(resume)) / 60
        }
        RunLoop.main.add(t, forMode: .common)
        resumeTimer = t
    }

    private func stopAllServices() {
        sessionTimer?.invalidate();      sessionTimer      = nil
        resumeTimer?.invalidate();       resumeTimer       = nil
        activityWatchTimer?.invalidate(); activityWatchTimer = nil  // restarted by punchOut/takeBreak
        heartbeatTickCount = 0
        screenshots.stop()
        appTracker.stop()
        idleDetector.stop()
        recentApps         = []
        minutesSinceResume = 0
    }
}
