// TrackingDashboardView.swift — main struct, body, sheet wiring, lifecycle

import SwiftUI
import UserNotifications

struct ToastMessage: Equatable {
    let text: String
    let isWarning: Bool
}

struct TrackingDashboardView: View {
    @EnvironmentObject var auth: AuthState
    @ObservedObject var manager = TrackingManager.shared
    @ObservedObject var updater = UpdateService.shared

    private let liveClock = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    @State var liveMinutes: Int = 0

    enum Sheet: Identifiable {
        case idleAlert, manualEntry, reports, breakReminder, newTask, taskPicker, settings, notTrackingAlert
        var id: Self { self }
    }
    @State var activeSheet: Sheet? = nil

    @State var selectedTab:    DashTab = .tasks
    @State var searchText             = ""
    @State var workStatus             = "WFO"

    @State var myTasks:      [TaskItem]    = []
    @State var projects:     [ProjectItem] = []
    @State var tasksLoading: Bool          = false
    @State var tasksError:   String?       = nil

    @State var toast:          ToastMessage? = nil
    @State var toastTimer:     Timer?        = nil

    @State var breakTimer: Timer? = nil

    enum DashTab: String { case tasks = "My Tasks", activity = "App Activity", notes = "Work Notes" }

    var body: some View {
        ZStack(alignment: .bottom) {
            VStack(spacing: 0) {
                headerBar
                statsBar
                updateBanner
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

            if let t = toast {
                toastView(t)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .padding(.bottom, 16)
                    .zIndex(10)
            }
        }
        .animation(.easeInOut(duration: 0.3), value: toast)
        .sheet(item: $activeSheet) { sheet in
            switch sheet {
            case .idleAlert:
                IdleAlertView(manager: manager)
            case .manualEntry:
                ManualEntryView()
            case .reports:
                ReportsView()
            case .breakReminder:
                BreakReminderView(
                    minutesWorked: manager.trackedMinutes,
                    onSnooze: {
                        activeSheet = nil
                        scheduleBreakReminder(interval: 15 * 60)
                    },
                    onDismiss: {
                        activeSheet = nil
                        scheduleBreakReminder()
                    }
                )
            case .newTask:
                NewTaskView(projects: projects, onCreated: { loadTasks() })
            case .taskPicker:
                TaskPickerView(tasks: myTasks, onPick: { task in
                    activeSheet = nil
                    Task { await manager.punchIn(task: task) }
                })
            case .settings:
                SettingsView()
            case .notTrackingAlert:
                NotTrackingAlertView(manager: manager, onStart: {
                    manager.showNotTrackingAlert = false
                    activeSheet = nil
                    if myTasks.isEmpty {
                        Task { await manager.punchIn() }
                    } else {
                        activeSheet = .taskPicker
                    }
                })
            }
        }
        .onChange(of: manager.showIdleAlert) { showing in
            if showing { activeSheet = .idleAlert }
            else if activeSheet == .idleAlert { activeSheet = nil }
        }
        .onChange(of: manager.showNotTrackingAlert) { showing in
            if showing { activeSheet = .notTrackingAlert }
            else if activeSheet == .notTrackingAlert { activeSheet = nil }
        }
        .onReceive(liveClock) { _ in
            guard manager.isTracking, !manager.isOnBreak else {
                liveMinutes = manager.trackedMinutes; return
            }
            if let resume = manager.lastResumeTime {
                liveMinutes = manager.trackedMinutes + Int(Date().timeIntervalSince(resume)) / 60
            } else {
                liveMinutes = manager.trackedMinutes
            }
        }
        .onAppear {
            liveMinutes = manager.trackedMinutes
            loadTasks()
            // Check for updates once on launch (non-blocking)
            Task { await UpdateService.shared.checkForUpdates() }
        }
        .onChange(of: manager.isTracking) { tracking in
            if tracking && APIService.shared.employee?.breakEnabled == true {
                scheduleBreakReminder()
            } else {
                cancelBreakTimer()
            }
        }
        .onChange(of: manager.isIdle) { idle in
            if idle { showToast("You've been idle — timer paused", warning: true) }
        }
        .onChange(of: manager.trackedMinutes) { mins in
            if mins > 0 && mins % 30 == 0 && APIService.shared.employee?.breakEnabled == true {
                showToast("You've been working \(mins / 60)h \(mins % 60)m — remember to take a break!", warning: false)
            }
        }
    }
}
