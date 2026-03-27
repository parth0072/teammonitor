// TrackingDashboardView.swift

import SwiftUI
import UserNotifications

// MARK: - Toast model

struct ToastMessage: Equatable {
    let text: String
    let isWarning: Bool
}

// MARK: - Main Dashboard

struct TrackingDashboardView: View {
    @EnvironmentObject var auth: AuthState
    @StateObject private var manager = TrackingManager.shared

    @State private var selectedTab:    DashTab = .tasks
    @State private var searchText             = ""
    @State private var workStatus             = "WFO"
    @State private var showManualEntry        = false
    @State private var showReports            = false
    @State private var showNewTask            = false
    @State private var showTaskPicker         = false

    // Tasks loaded from server
    @State private var myTasks:      [TaskItem]    = []
    @State private var projects:     [ProjectItem] = []
    @State private var tasksLoading: Bool          = false

    // Toast
    @State private var toast:             ToastMessage? = nil
    @State private var toastTimer:        Timer?        = nil

    // "Start your timer" reminder when not tracking
    @State private var notTrackingTimer:  Timer?        = nil
    @State private var showStartReminder: Bool          = false   // sticky banner

    // Break reminder
    @AppStorage("breakIntervalMinutes") private var breakIntervalMinutes: Int = 60
    @State private var breakTimer:        Timer?        = nil
    @State private var showBreakReminder: Bool          = false

    enum DashTab: String { case tasks = "My Tasks", activity = "App Activity", notes = "Work Notes" }

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                headerBar
                statsBar
                statusBanner
                screenPermissionBanner
                startTimerReminderBanner
                offlineBanner
                taskButton
                actionButtons
                idleWarning
                tabBar
                tabContent
            }
            .background(Color(hex: "f3f4f6"))
            .frame(minWidth: 700, minHeight: 580)

            // Toast overlay
            if let t = toast {
                toastView(t)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 16)
                    .zIndex(10)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: toast)
        .sheet(isPresented: $manager.showIdleAlert) { IdleAlertView(manager: manager) }
        .sheet(isPresented: $showManualEntry)       { ManualEntryView() }
        .sheet(isPresented: $showReports)           { ReportsView() }
        .sheet(isPresented: $showBreakReminder)     {
            BreakReminderView(
                minutesWorked: manager.trackedMinutes,
                onSnooze: {
                    showBreakReminder = false
                    scheduleBreakReminder(interval: 15 * 60)
                },
                onDismiss: {
                    showBreakReminder = false
                    scheduleBreakReminder()
                }
            )
        }
        .sheet(isPresented: $showNewTask)           { NewTaskView(projects: projects, onCreated: { loadTasks() }) }
        .sheet(isPresented: $showTaskPicker)        { TaskPickerView(tasks: myTasks, onPick: { task in
            showTaskPicker = false
            Task { await manager.punchIn(task: task) }
        })}
        .onAppear {
            loadTasks()
            requestNotificationPermission()
            // If app opens and user is already not tracking, start the reminder
            if !manager.isTracking { scheduleNotTrackingReminder() }
        }
        .onDisappear { cancelNotTrackingReminder() }
        // Start / stop reminder when tracking state changes
        .onChange(of: manager.isTracking) { tracking in
            if tracking {
                cancelNotTrackingReminder()
                showStartReminder = false
                scheduleBreakReminder()
            } else {
                cancelBreakTimer()
                scheduleNotTrackingReminder()
            }
        }
        // Watch for idle → fire toast
        .onChange(of: manager.isIdle) { idle in
            if idle { showToast("You've been idle — timer paused", warning: true) }
        }
        // Watch for long tracking without punch-out reminder (every 30 min)
        .onChange(of: manager.trackedMinutes) { mins in
            if mins > 0 && mins % 30 == 0 {
                showToast("You've been working \(mins / 60)h \(mins % 60)m — remember to take a break!", warning: false)
            }
        }
    }

    // MARK: – Data

    func loadTasks() {
        tasksLoading = true
        Task {
            async let t = APIService.shared.getMyTasks()
            async let p = APIService.shared.getProjects()
            myTasks  = (try? await t) ?? []
            projects = (try? await p) ?? []
            tasksLoading = false
        }
    }

    // MARK: – Toast

    func showToast(_ text: String, warning: Bool, duration: TimeInterval = 5) {
        toastTimer?.invalidate()
        withAnimation { toast = ToastMessage(text: text, isWarning: warning) }
        toastTimer = Timer.scheduledTimer(withTimeInterval: duration, repeats: false) { _ in
            Task { @MainActor in withAnimation { toast = nil } }
        }
        // Also fire a macOS notification
        sendNotification(text, isWarning: warning)
    }

    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    func sendNotification(_ text: String, isWarning: Bool) {
        let content         = UNMutableNotificationContent()
        content.title       = isWarning ? "⚠️ TeamMonitor Alert" : "⏱ TeamMonitor"
        content.body        = text
        content.sound       = isWarning ? .defaultCritical : .default
        let req = UNNotificationRequest(identifier: UUID().uuidString,
                                        content: content, trigger: nil)
        UNUserNotificationCenter.current().add(req, withCompletionHandler: nil)
    }

    // MARK: – Not-Tracking Reminder

    /// Fires once after 5 min, then every 5 min while not tracking.
    func scheduleNotTrackingReminder() {
        cancelNotTrackingReminder()
        notTrackingTimer = Timer.scheduledTimer(withTimeInterval: 5 * 60, repeats: true) { _ in
            Task { @MainActor in
                guard !manager.isTracking else {
                    cancelNotTrackingReminder()
                    return
                }
                showStartReminder = true
                showToast("⏱ Timer is not running — tap Start to begin tracking", warning: true, duration: 15)
            }
        }
    }

    func cancelNotTrackingReminder() {
        notTrackingTimer?.invalidate()
        notTrackingTimer = nil
    }

    // MARK: – Break Reminder

    func scheduleBreakReminder(interval: TimeInterval? = nil) {
        cancelBreakTimer()
        let secs = interval ?? TimeInterval(breakIntervalMinutes * 60)
        breakTimer = Timer.scheduledTimer(withTimeInterval: secs, repeats: false) { _ in
            Task { @MainActor in
                guard manager.isTracking else { return }
                showBreakReminder = true
                sendNotification("Time for a break! You've been working \(manager.trackedMinutes / 60)h \(manager.trackedMinutes % 60)m", isWarning: false)
            }
        }
    }

    func cancelBreakTimer() {
        breakTimer?.invalidate()
        breakTimer = nil
    }

    // MARK: – Toast view

    func toastView(_ t: ToastMessage) -> some View {
        HStack(spacing: 10) {
            Image(systemName: t.isWarning ? "exclamationmark.triangle.fill" : "clock.fill")
                .foregroundColor(t.isWarning ? Color(hex: "f59e0b") : Color(hex: "3b82f6"))
            Text(t.text)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(hex: "1e293b"))
            Spacer()
            Button { withAnimation { toast = nil } } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundColor(Color(hex: "9ca3af"))
            }.buttonStyle(.plain)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white)
        .cornerRadius(10)
        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 4)
        .padding(.horizontal, 24)
    }

    // MARK: – Header

    var headerBar: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                ZStack {
                    Circle().fill(Color(hex: "3b82f6")).frame(width: 30, height: 30)
                    Image(systemName: "person.fill").font(.system(size: 13)).foregroundColor(.white)
                }
                Text(auth.email.isEmpty ? "employee@company.com" : auth.email)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(hex: "3b82f6"))
            }
            Spacer()
            Button("✏  Manual Entry") { showManualEntry = true }
                .buttonStyle(TLHeaderButtonStyle())
            Button("📋  Reports") { showReports = true }
                .buttonStyle(TLHeaderButtonStyle())
            Button {
                loadTasks()
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(width: 28, height: 28)
                    .background(Color(hex: "3b82f6"))
                    .cornerRadius(5)
            }.buttonStyle(.plain)

            Button("Sign Out") {
                Task {
                    if manager.isTracking { await manager.punchOut() }
                    APIService.shared.logout()
                    await MainActor.run { auth.isLoggedIn = false }
                }
            }
            .buttonStyle(.plain)
            .font(.system(size: 12))
            .foregroundColor(Color(hex: "9ca3af"))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Stats bar

    var statsBar: some View {
        HStack(spacing: 0) {
            VStack(spacing: 3) {
                Text(formatHoursMinutes(manager.minutesSinceResume))
                    .font(.system(size: 18, weight: .light))
                    .foregroundColor(Color(hex: "374151"))
                Text("since last task resume")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "9ca3af"))
            }
            .frame(maxWidth: .infinity)
            Divider().frame(height: 42)
            VStack(spacing: 3) {
                Text(formatHoursMinutes(manager.trackedMinutes))
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundColor(Color(hex: "111827"))
                Text("total current working day")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "9ca3af"))
            }
            .frame(maxWidth: .infinity)
            Divider().frame(height: 42)
            VStack(spacing: 3) {
                Text(timerStatusText)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(timerStatusColor)
                Text("Timer status")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "9ca3af"))
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 14)
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Status/error banner

    @ViewBuilder
    var statusBanner: some View {
        let msg = manager.statusMessage
        if !msg.isEmpty && msg != "Ready" && msg != "Tracking active" && msg != "Session saved. Have a great day!" {
            HStack(spacing: 8) {
                Image(systemName: msg.hasPrefix("Error") ? "exclamationmark.triangle.fill" : "info.circle.fill")
                    .foregroundColor(msg.hasPrefix("Error") ? .red : .blue)
                Text(msg)
                    .font(.system(size: 12))
                    .foregroundColor(msg.hasPrefix("Error") ? .red : Color(hex: "374151"))
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(msg.hasPrefix("Error") ? Color.red.opacity(0.08) : Color.blue.opacity(0.06))
        }
    }

    // MARK: – Screen recording permission banner

    @ViewBuilder
    var screenPermissionBanner: some View {
        if !manager.hasScreenPermission && !manager.permissionBannerDismissed {
            HStack(spacing: 10) {
                Image(systemName: "camera.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "92400e"))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Screen Recording permission required")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: "92400e"))
                    Text("Go to System Settings → Privacy & Security → Screen Recording → enable TeamMonitorAgent. Then restart the app.")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "b45309"))
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Button("Open Settings") {
                    NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(Color(hex: "92400e"))
                .padding(.horizontal, 10).padding(.vertical, 5)
                .background(Color(hex: "fde68a")).cornerRadius(5).buttonStyle(.plain)

                Button("Restart App") { relaunchApp() }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color(hex: "b45309")).cornerRadius(5).buttonStyle(.plain)

                Button("✕") { manager.permissionBannerDismissed = true }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(hex: "92400e").opacity(0.6))
                    .frame(width: 24, height: 24).buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "fef3c7"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "fde68a")), alignment: .bottom)
        }
    }

    /// Relaunches the app via `open` so the fresh process gets the updated
    /// Screen Recording permission from macOS.
    private func relaunchApp() {
        let url  = Bundle.main.bundleURL
        let task = Process()
        task.launchPath = "/usr/bin/open"
        task.arguments  = [url.path]
        try? task.run()
        NSApp.terminate(nil)
    }

    // MARK: – Start Timer Reminder Banner

    @ViewBuilder
    var startTimerReminderBanner: some View {
        if showStartReminder && !manager.isTracking {
            HStack(spacing: 10) {
                // Pulsing clock icon
                Image(systemName: "timer")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Color(hex: "7c3aed"))
                VStack(alignment: .leading, spacing: 1) {
                    Text("Timer is not running")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(Color(hex: "4c1d95"))
                    Text("You haven't started tracking yet. Tap Start to begin.")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "6d28d9"))
                }
                Spacer()
                Button("Start Now") {
                    showStartReminder = false
                    if myTasks.isEmpty {
                        Task { await manager.punchIn() }
                    } else {
                        showTaskPicker = true
                    }
                }
                .font(.system(size: 11, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 12).padding(.vertical, 5)
                .background(Color(hex: "7c3aed")).cornerRadius(6).buttonStyle(.plain)

                Button("✕") { showStartReminder = false }
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(Color(hex: "7c3aed").opacity(0.5))
                    .frame(width: 24, height: 24).buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "ede9fe"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "ddd6fe")), alignment: .bottom)
        }
    }

    // MARK: – Offline / pending-upload banner

    @ViewBuilder
    var offlineBanner: some View {
        if manager.isOffline {
            HStack(spacing: 10) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 13))
                    .foregroundColor(Color(hex: "92400e"))
                VStack(alignment: .leading, spacing: 1) {
                    Text("No internet connection")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundColor(Color(hex: "92400e"))
                    Text(manager.pendingUploadCount > 0
                         ? "\(manager.pendingUploadCount) screenshot(s) queued — will upload when connected."
                         : "Screenshots will be saved locally until connected.")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "b45309"))
                }
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(Color(hex: "fef3c7"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "fde68a")), alignment: .bottom)
        } else if manager.pendingUploadCount > 0 {
            HStack(spacing: 10) {
                ProgressView().scaleEffect(0.7)
                Text("Uploading \(manager.pendingUploadCount) queued screenshot(s)…")
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "1d4ed8"))
                Spacer()
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(Color(hex: "eff6ff"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "bfdbfe")), alignment: .bottom)
        }
    }

    // MARK: – Big punch button

    var taskButton: some View {
        Button {
            if manager.isTracking {
                // already tracking — do nothing (punch out is in action buttons)
            } else {
                // If tasks available, show picker; otherwise punch in without task
                if myTasks.isEmpty {
                    Task { await manager.punchIn() }
                } else {
                    showTaskPicker = true
                }
            }
        } label: {
            VStack(spacing: 5) {
                if manager.isTracking {
                    if let task = manager.currentTask {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(Color(hex: task.projectColor))
                                .frame(width: 8, height: 8)
                            Text(task.projectName)
                                .font(.system(size: 12, weight: .semibold))
                            Image(systemName: "play.fill").font(.system(size: 10))
                        }
                        .foregroundColor(.white.opacity(0.85))
                        Text(task.name)
                            .font(.system(size: 19, weight: .semibold))
                            .foregroundColor(.white)
                    } else {
                        HStack(spacing: 5) {
                            Text("Tracking — no task selected")
                                .font(.system(size: 13, weight: .semibold))
                            Image(systemName: "play.fill").font(.system(size: 10))
                        }
                        .foregroundColor(.white.opacity(0.85))
                        Text(manager.currentApp.isEmpty ? "App activity monitored" : manager.currentApp)
                            .font(.system(size: 17)).foregroundColor(.white)
                    }
                } else {
                    Text("▶  Click to Punch In")
                        .font(.system(size: 17)).foregroundColor(.white)
                    if !myTasks.isEmpty {
                        Text("Tap to choose a task")
                            .font(.system(size: 11)).foregroundColor(.white.opacity(0.7))
                    }
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 22)
            .background(manager.isTracking ? Color(hex: "16a34a") : Color(hex: "3b82f6"))
        }
        .buttonStyle(.plain)
    }

    // MARK: – Action buttons

    var actionButtons: some View {
        HStack(spacing: 8) {
            Button { } label: {
                Image(systemName: "info.circle").font(.system(size: 13))
                    .foregroundColor(Color(hex: "374151"))
                    .frame(width: 34, height: 30)
                    .background(Color.white)
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color(hex: "d1d5db"), lineWidth: 1))
            }.buttonStyle(.plain)

            Button { showReports = true } label: {
                HStack(spacing: 5) {
                    Image(systemName: "doc.text").font(.system(size: 11))
                    Text("Report").font(.system(size: 12))
                }
                .foregroundColor(Color(hex: "374151"))
                .padding(.horizontal, 10).frame(height: 30)
                .background(Color.white)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(Color(hex: "d1d5db"), lineWidth: 1))
            }.buttonStyle(.plain)

            if manager.isTracking {
                HStack(spacing: 4) {
                    Image(systemName: "camera.fill").font(.system(size: 10))
                        .foregroundColor(manager.hasScreenPermission ? Color(hex: "3b82f6") : Color(hex: "9ca3af"))
                    Text("\(manager.screenshotCount) screenshots").font(.system(size: 11))
                        .foregroundColor(manager.hasScreenPermission ? Color(hex: "374151") : Color(hex: "9ca3af"))
                }
                .padding(.horizontal, 8).frame(height: 30)
                .background(Color(hex: "f1f5f9")).cornerRadius(4)
            }

            Spacer()

            if manager.isTracking {
                Button { Task { await manager.takeBreak() } } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "pause.fill").font(.system(size: 9))
                        Text("Take a break").font(.system(size: 12))
                    }
                    .foregroundColor(.white).padding(.horizontal, 12).frame(height: 30)
                    .background(Color(hex: "f59e0b")).cornerRadius(4)
                }.buttonStyle(.plain)

                Button { Task { await manager.punchOut() } } label: {
                    HStack(spacing: 5) {
                        Image(systemName: "stop.fill").font(.system(size: 9))
                        Text("Punch Out").font(.system(size: 12))
                    }
                    .foregroundColor(.white).padding(.horizontal, 12).frame(height: 30)
                    .background(Color(hex: "ef4444")).cornerRadius(4)
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Idle warning

    @ViewBuilder
    var idleWarning: some View {
        if manager.isTracking {
            HStack {
                Spacer()
                Text("Your timeout is set to 5 minutes")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Color(hex: "d97706"))
                Spacer()
            }
            .padding(.vertical, 7).background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
        }
    }

    // MARK: – Tab bar

    var tabBar: some View {
        HStack(spacing: 0) {
            ForEach([DashTab.tasks, .activity, .notes], id: \.self) { tab in
                Button { selectedTab = tab } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 12, weight: selectedTab == tab ? .semibold : .regular))
                        .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : Color(hex: "6b7280"))
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .overlay(Rectangle().frame(height: 2)
                            .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : .clear),
                                 alignment: .bottom)
                }.buttonStyle(.plain)
            }
            Spacer()
            HStack(spacing: 4) {
                Text("Status").font(.system(size: 12)).foregroundColor(Color(hex: "6b7280"))
                Picker("", selection: $workStatus) {
                    Text("WFO").tag("WFO")
                    Text("WFH").tag("WFH")
                    Text("Remote").tag("Remote")
                }
                .pickerStyle(.menu).frame(width: 80).font(.system(size: 12))
            }
            .padding(.trailing, 12)
        }
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: – Tab content

    @ViewBuilder
    var tabContent: some View {
        switch selectedTab {
        case .tasks:    tasksTabContent
        case .activity: activityTabContent
        case .notes:    notesTabContent
        }
    }

    // MARK: – Tasks tab

    var tasksTabContent: some View {
        VStack(spacing: 0) {
            // Search + New Task
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 12))
                    .foregroundColor(Color(hex: "9ca3af"))
                TextField("Search tasks…", text: $searchText)
                    .font(.system(size: 12)).textFieldStyle(.plain)
                Spacer()
                Button {
                    showNewTask = true
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "plus").font(.system(size: 11, weight: .bold))
                        Text("New Task").font(.system(size: 12, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color(hex: "3b82f6")).cornerRadius(6)
                }.buttonStyle(.plain)
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "f9fafb"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    let filtered = myTasks.filter { searchText.isEmpty || $0.name.localizedCaseInsensitiveContains(searchText) || $0.projectName.localizedCaseInsensitiveContains(searchText) }

                    if tasksLoading {
                        ProgressView().padding(.vertical, 36).frame(maxWidth: .infinity)
                    } else if filtered.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "checklist").font(.system(size: 30))
                                .foregroundColor(Color(hex: "d1d5db"))
                            Text(myTasks.isEmpty ? "No tasks assigned yet" : "No tasks match search")
                                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
                            if myTasks.isEmpty {
                                Text("Ask your admin to create a project and assign tasks, or tap + New Task")
                                    .font(.system(size: 11)).foregroundColor(Color(hex: "c4c9d4"))
                                    .multilineTextAlignment(.center).padding(.horizontal, 24)
                            }
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 36)
                    } else {
                        ForEach(filtered) { task in
                            TaskRow2(task: task,
                                     isActive: manager.currentTask?.id == task.id && manager.isTracking,
                                     onStart: {
                                if manager.isTracking {
                                    // Switch task while tracking
                                    Task { await manager.punchIn(task: task) }
                                } else {
                                    Task { await manager.punchIn(task: task) }
                                }
                            })
                        }
                    }
                }
            }
            .background(Color.white)
        }
    }

    // MARK: – Activity tab (in-session app usage)

    var activityTabContent: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Recent App Activity").font(.system(size: 12, weight: .semibold))
                    .foregroundColor(Color(hex: "374151"))
                Spacer()
                if !manager.isTracking {
                    Text("Punch in to start tracking")
                        .font(.system(size: 11)).foregroundColor(Color(hex: "9ca3af"))
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(Color(hex: "f9fafb"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    if manager.recentApps.isEmpty {
                        VStack(spacing: 10) {
                            Image(systemName: "desktopcomputer").font(.system(size: 30))
                                .foregroundColor(Color(hex: "d1d5db"))
                            Text(manager.isTracking ? "Monitoring app usage…" : "Punch in to start monitoring")
                                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
                        }
                        .frame(maxWidth: .infinity).padding(.vertical, 36)
                    } else {
                        ForEach(manager.recentApps, id: \.self) { app in
                            AppActivityRow(appName: app, isActive: app == manager.currentApp)
                        }
                    }
                }
            }
            .background(Color.white)
        }
    }

    // MARK: – Notes tab

    var notesTabContent: some View {
        VStack {
            Image(systemName: "note.text").font(.system(size: 30))
                .foregroundColor(Color(hex: "d1d5db")).padding(.top, 36)
            Text("Work notes coming soon")
                .font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
            Spacer()
        }
        .frame(maxWidth: .infinity).background(Color.white)
    }

    // MARK: – Helpers

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

// MARK: - Task Row (real tasks)

struct TaskRow2: View {
    let task:     TaskItem
    let isActive: Bool
    let onStart:  () -> Void

    var statusColor: Color {
        switch task.status {
        case "in_progress": return Color(hex: "3b82f6")
        case "done":        return Color(hex: "10b981")
        default:            return Color(hex: "9ca3af")
        }
    }
    var statusLabel: String {
        switch task.status {
        case "in_progress": return "In Progress"
        case "done":        return "Done"
        default:            return "To Do"
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            // Project color bar
            RoundedRectangle(cornerRadius: 2)
                .fill(Color(hex: task.projectColor))
                .frame(width: 4, height: 36)

            VStack(alignment: .leading, spacing: 3) {
                Text(task.name)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Color(hex: "111827"))
                HStack(spacing: 6) {
                    Text(task.projectName)
                        .font(.system(size: 11)).foregroundColor(Color(hex: "6b7280"))
                    Text("·")
                        .font(.system(size: 11)).foregroundColor(Color(hex: "d1d5db"))
                    Text(statusLabel)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(statusColor)
                }
            }

            Spacer()

            if isActive {
                HStack(spacing: 4) {
                    Circle().fill(Color(hex: "16a34a")).frame(width: 6, height: 6)
                    Text("Active").font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(hex: "16a34a"))
                }
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Color(hex: "dcfce7")).cornerRadius(10)
            } else if task.status != "done" {
                Button("▶ Start") { onStart() }
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 10).padding(.vertical, 5)
                    .background(Color(hex: "3b82f6")).cornerRadius(5)
                    .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(isActive ? Color(hex: "f0fdf4") : Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "f3f4f6")), alignment: .bottom)
    }
}

// MARK: - App Activity Row

struct AppActivityRow: View {
    let appName:  String
    let isActive: Bool
    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color(hex: "f1f5f9"))
                    .frame(width: 32, height: 32)
                Image(systemName: "app.fill")
                    .font(.system(size: 14))
                    .foregroundColor(Color(hex: "64748b"))
            }
            Text(appName)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Color(hex: "111827"))
            Spacer()
            if isActive {
                Image(systemName: "play.fill")
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "16a34a"))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
        .background(isActive ? Color(hex: "f0fdf4") : Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "f3f4f6")), alignment: .bottom)
    }
}

// MARK: - Task Picker Sheet

struct TaskPickerView: View {
    let tasks:  [TaskItem]
    let onPick: (TaskItem?) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Choose a Task to Work On")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: "111827"))
                Spacer()
                Button("Skip (no task)") { onPick(nil) }
                    .font(.system(size: 12))
                    .foregroundColor(Color(hex: "9ca3af"))
                    .buttonStyle(.plain)
            }
            .padding(20)
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            ScrollView {
                LazyVStack(spacing: 0) {
                    ForEach(tasks.filter { $0.status != "done" }) { task in
                        Button { onPick(task) } label: {
                            HStack(spacing: 12) {
                                RoundedRectangle(cornerRadius: 2)
                                    .fill(Color(hex: task.projectColor))
                                    .frame(width: 4, height: 34)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(task.name)
                                        .font(.system(size: 13, weight: .medium))
                                        .foregroundColor(Color(hex: "111827"))
                                    Text(task.projectName)
                                        .font(.system(size: 11))
                                        .foregroundColor(Color(hex: "6b7280"))
                                }
                                Spacer()
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 11))
                                    .foregroundColor(Color(hex: "d1d5db"))
                            }
                            .padding(.horizontal, 20).padding(.vertical, 10)
                            .background(Color.white)
                            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "f3f4f6")), alignment: .bottom)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .background(Color(hex: "f9fafb"))
        }
        .frame(width: 400, height: 420)
    }
}

// MARK: - New Task Sheet

struct NewTaskView: View {
    let projects:  [ProjectItem]
    let onCreated: () -> Void
    @Environment(\.dismiss) var dismiss

    @State private var taskName     = ""
    @State private var taskDesc     = ""
    @State private var selectedProj: ProjectItem? = nil
    @State private var saving       = false
    @State private var error        = ""

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text("New Task").font(.system(size: 16, weight: .semibold))
                Spacer()
                Button("Cancel") { dismiss() }.foregroundColor(Color(hex: "9ca3af")).buttonStyle(.plain)
            }
            .padding(20)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            VStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Project").font(.system(size: 12, weight: .semibold)).foregroundColor(Color(hex: "374151"))
                    if projects.isEmpty {
                        Text("No projects available. Ask your admin to create one.")
                            .font(.system(size: 12)).foregroundColor(Color(hex: "ef4444"))
                    } else {
                        Picker("Project", selection: $selectedProj) {
                            Text("Select project…").tag(Optional<ProjectItem>.none)
                            ForEach(projects) { p in Text(p.name).tag(Optional(p)) }
                        }
                        .pickerStyle(.menu)
                        .frame(maxWidth: .infinity)
                        .padding(8)
                        .background(Color(hex: "f9fafb"))
                        .cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
                    }
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Task name").font(.system(size: 12, weight: .semibold)).foregroundColor(Color(hex: "374151"))
                    TextField("e.g. Fix login bug", text: $taskName)
                        .textFieldStyle(.plain)
                        .padding(8)
                        .background(Color(hex: "f9fafb"))
                        .cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
                }

                VStack(alignment: .leading, spacing: 6) {
                    Text("Description (optional)").font(.system(size: 12, weight: .semibold)).foregroundColor(Color(hex: "374151"))
                    TextEditor(text: $taskDesc)
                        .font(.system(size: 12))
                        .frame(height: 60)
                        .padding(6)
                        .background(Color(hex: "f9fafb"))
                        .cornerRadius(6)
                        .overlay(RoundedRectangle(cornerRadius: 6).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
                }

                if !error.isEmpty {
                    Text(error).font(.system(size: 12)).foregroundColor(.red)
                }

                Button {
                    guard !taskName.trimmingCharacters(in: .whitespaces).isEmpty else { error = "Task name required"; return }
                    guard let proj = selectedProj else { error = "Please select a project"; return }
                    saving = true
                    Task {
                        do {
                            _ = try await APIService.shared.createTask(projectId: proj.id, name: taskName, description: taskDesc)
                            onCreated()
                            dismiss()
                        } catch {
                            self.error = error.localizedDescription
                            saving = false
                        }
                    }
                } label: {
                    HStack {
                        Spacer()
                        if saving { ProgressView().scaleEffect(0.7) }
                        Text(saving ? "Creating…" : "Create Task")
                            .font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
                        Spacer()
                    }
                    .frame(height: 38)
                    .background(taskName.isEmpty || selectedProj == nil ? Color(hex: "93c5fd") : Color(hex: "3b82f6"))
                    .cornerRadius(8)
                }
                .buttonStyle(.plain)
                .disabled(saving)
            }
            .padding(20)
        }
        .frame(width: 380)
        .background(Color.white)
        .onAppear { if !projects.isEmpty { selectedProj = projects.first } }
    }
}

// MARK: - Idle Alert Sheet

struct IdleAlertView: View {
    @ObservedObject var manager: TrackingManager
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "clock.badge.questionmark.fill")
                .font(.system(size: 52)).foregroundColor(Color(hex: "f59e0b"))
            VStack(spacing: 8) {
                Text("You were away")
                    .font(.system(size: 20, weight: .semibold)).foregroundColor(Color(hex: "111827"))
                Text("No activity was detected for \(manager.idleAlertMinutes) minute\(manager.idleAlertMinutes == 1 ? "" : "s").\nWhat would you like to do with this time?")
                    .font(.system(size: 14)).foregroundColor(Color(hex: "6b7280")).multilineTextAlignment(.center)
            }
            HStack(spacing: 12) {
                Button { manager.resumeAfterIdle(countTime: false) } label: {
                    Text("Discard idle time").font(.system(size: 13, weight: .medium)).foregroundColor(.white)
                        .padding(.horizontal, 20).padding(.vertical, 10)
                        .background(Color(hex: "ef4444")).cornerRadius(8)
                }.buttonStyle(.plain)
                Button { manager.resumeAfterIdle(countTime: true) } label: {
                    Text("Count as work time").font(.system(size: 13, weight: .medium)).foregroundColor(.white)
                        .padding(.horizontal, 20).padding(.vertical, 10)
                        .background(Color(hex: "16a34a")).cornerRadius(8)
                }.buttonStyle(.plain)
            }
        }
        .padding(36).frame(width: 380).background(Color.white)
    }
}

// MARK: - Break Reminder Sheet

struct BreakReminderView: View {
    let minutesWorked: Int
    let onSnooze:  () -> Void
    let onDismiss: () -> Void

    private var workedText: String {
        let h = minutesWorked / 60, m = minutesWorked % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m) min"
    }

    var body: some View {
        VStack(spacing: 28) {
            // Icon
            ZStack {
                Circle().fill(Color(hex: "fef3c7")).frame(width: 72, height: 72)
                Image(systemName: "cup.and.saucer.fill")
                    .font(.system(size: 32)).foregroundColor(Color(hex: "f59e0b"))
            }

            // Text
            VStack(spacing: 8) {
                Text("Time for a Break!")
                    .font(.system(size: 22, weight: .bold)).foregroundColor(Color(hex: "111827"))
                Text("You've been working for \(workedText).\nStep away for 5–10 minutes to recharge.")
                    .font(.system(size: 14)).foregroundColor(Color(hex: "6b7280"))
                    .multilineTextAlignment(.center).lineSpacing(3)
            }

            // Tip
            HStack(spacing: 8) {
                Image(systemName: "lightbulb.fill").foregroundColor(Color(hex: "10b981")).font(.system(size: 12))
                Text("Short breaks improve focus and reduce eye strain.")
                    .font(.system(size: 12)).foregroundColor(Color(hex: "059669"))
            }
            .padding(.horizontal, 16).padding(.vertical, 10)
            .background(Color(hex: "ecfdf5")).cornerRadius(8)

            // Buttons
            VStack(spacing: 10) {
                Button(action: onDismiss) {
                    Text("I'll take a break now")
                        .font(.system(size: 14, weight: .semibold)).foregroundColor(.white)
                        .frame(maxWidth: .infinity).frame(height: 42)
                        .background(Color(hex: "10b981")).cornerRadius(10)
                }.buttonStyle(.plain)

                Button(action: onSnooze) {
                    Text("Snooze 15 min")
                        .font(.system(size: 13, weight: .medium)).foregroundColor(Color(hex: "6b7280"))
                        .frame(maxWidth: .infinity).frame(height: 38)
                        .background(Color(hex: "f1f5f9")).cornerRadius(10)
                }.buttonStyle(.plain)
            }
        }
        .padding(32).frame(width: 360).background(Color.white)
    }
}

// MARK: - Helper button styles

struct TLHeaderButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 12, weight: .medium)).foregroundColor(.white)
            .padding(.horizontal, 12).frame(height: 28)
            .background(Color(hex: configuration.isPressed ? "2563eb" : "3b82f6"))
            .cornerRadius(5)
    }
}

// MARK: - Color hex extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:  (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:  (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:  (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default: (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(.sRGB, red: Double(r)/255, green: Double(g)/255, blue: Double(b)/255, opacity: Double(a)/255)
    }
}
