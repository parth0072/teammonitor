// TeamMonitorAgentApp.swift – menu bar, background running, launch at login

import SwiftUI
import ServiceManagement
import UserNotifications

@main
struct TeamMonitorAgentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // Single-instance main window (Window vs WindowGroup prevents duplicate windows
        // when "Open TeamMonitor…" is clicked from the menu bar multiple times)
        Window("TeamMonitor", id: "main") {
            ContentView()
                .frame(minWidth: 700, minHeight: 580)
        }
        .windowStyle(.hiddenTitleBar)
        .commands {
            CommandGroup(replacing: .newItem) {}
        }

        // Menu bar icon (macOS 13+)
        MenuBarExtra {
            MenuBarView()
        } label: {
            MenuBarLabel()
        }
        .menuBarExtraStyle(.menu)
    }
}

// MARK: - AppDelegate (keep alive + launch at login)

class AppDelegate: NSObject, NSApplicationDelegate, UNUserNotificationCenterDelegate {

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Single-instance guard: if another copy is already running, activate it and quit.
        let bundleId = Bundle.main.bundleIdentifier ?? ""
        let running  = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
        if running.count > 1,
           let existing = running.first(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            existing.activate(options: .activateIgnoringOtherApps)
            NSApp.terminate(nil)
            return
        }

        // Set delegate BEFORE requesting auth so foreground notifications work.
        UNUserNotificationCenter.current().delegate = self

        // Admin notification categories
        let takeBreakAction      = UNNotificationAction(identifier: "ADMIN_TAKE_BREAK", title: "Take Break", options: [])
        let punchOutAction       = UNNotificationAction(identifier: "ADMIN_PUNCH_OUT",  title: "Punch Out",  options: [])
        let ackAction            = UNNotificationAction(identifier: "ADMIN_ACK",        title: "OK",         options: [.destructive])
        let adminBreakCategory   = UNNotificationCategory(identifier: "ADMIN_NOTIFY_BREAK",
            actions: [takeBreakAction, ackAction], intentIdentifiers: [], options: [])
        let adminPunchOutCategory = UNNotificationCategory(identifier: "ADMIN_NOTIFY_PUNCHOUT",
            actions: [punchOutAction, ackAction], intentIdentifiers: [], options: [])
        let adminAckCategory     = UNNotificationCategory(identifier: "ADMIN_NOTIFY_ACK",
            actions: [ackAction], intentIdentifiers: [], options: [])

        UNUserNotificationCenter.current().setNotificationCategories([
            adminBreakCategory, adminPunchOutCategory, adminAckCategory
        ])

        // Listen for window-activation requests from TrackingManager
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(activateMainWindow),
            name: .tmActivateWindow,
            object: nil
        )

        // Briefly activate so the permission dialog appears on screen.
        NSApp.activate(ignoringOtherApps: true)

        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                TMLog("[Notifications] Auth error: \(error)")
                return
            }
            TMLog("[Notifications] Permission granted: \(granted)")
        }

        // Register to launch automatically at login
        registerLaunchAtLogin()
    }

    // Show notifications even when the app is in the foreground / frontmost.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        TMLog("[Notifications] willPresent fired — showing banner")
        completionHandler([.banner, .sound])
    }

    // Handle tapping the notification or its action buttons
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        activateMainWindow()
        switch response.actionIdentifier {
        case "ADMIN_TAKE_BREAK":
            Task { @MainActor in
                let m = TrackingManager.shared
                if m.isTracking && !m.isOnBreak { await m.takeBreak() }
            }
        case "ADMIN_PUNCH_OUT":
            Task { @MainActor in
                let m = TrackingManager.shared
                if m.isTracking { await m.punchOut() }
            }
        default:
            break
        }
        completionHandler()
    }

    @objc func activateMainWindow() {
        DispatchQueue.main.async {
            NSApp.unhide(nil)
            NSApp.activate(ignoringOtherApps: true)
            if let win = NSApp.windows.first(where: { $0.canBecomeMain && $0.canBecomeKey }) {
                win.makeKeyAndOrderFront(nil)
            }
        }
    }

    // Window close does NOT quit the app – it just hides to menu bar
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return false
    }

    private func registerLaunchAtLogin() {
        if #available(macOS 13.0, *) {
            do {
                if SMAppService.mainApp.status != .enabled {
                    try SMAppService.mainApp.register()
                    TMLog("✓ TeamMonitor registered for launch at login")
                }
            } catch {
                TMLog("Launch at login registration failed: \(error)")
                // Fallback: write a LaunchAgent plist
                writeLaunchAgentPlist()
            }
        } else {
            writeLaunchAgentPlist()
        }
    }

    /// Fallback for macOS < 13: write a LaunchAgent plist to ~/Library/LaunchAgents/
    private func writeLaunchAgentPlist() {
        let plistDir  = "\(NSHomeDirectory())/Library/LaunchAgents"
        let plistPath = "\(plistDir)/com.teammonitor.agent.plist"
        let exePath   = Bundle.main.executablePath ?? ""
        guard !exePath.isEmpty else { return }

        let content = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
            <key>Label</key>
            <string>com.teammonitor.agent</string>
            <key>ProgramArguments</key>
            <array>
                <string>\(exePath)</string>
            </array>
            <key>RunAtLoad</key>
            <true/>
            <key>KeepAlive</key>
            <false/>
        </dict>
        </plist>
        """
        try? FileManager.default.createDirectory(atPath: plistDir, withIntermediateDirectories: true)
        try? content.write(toFile: plistPath, atomically: true, encoding: .utf8)
        TMLog("✓ LaunchAgent plist written to \(plistPath)")
    }
}

// MARK: - MenuBarState (minimal observable — avoids re-rendering menu bar on every TrackingManager change)

/// Holds only the three values MenuBarLabel needs. Updated explicitly from TrackingManager
/// at punch-in/out, break, and the minute timer — not on every @Published change.
@MainActor
class MenuBarState: ObservableObject {
    static let shared = MenuBarState()
    @Published var isTracking:    Bool = false
    @Published var isOnBreak:     Bool = false
    @Published var todayMinutes:  Int  = 0
}

// MARK: - Menu Bar Label (live time display)

struct MenuBarLabel: View {
    // Observes only 3 fields — never re-renders due to idleSeconds, activityPercent, etc.
    @ObservedObject private var state = MenuBarState.shared

    var body: some View {
        if state.isTracking || state.todayMinutes > 0 {
            HStack(spacing: 4) {
                if state.isOnBreak {
                    Circle().fill(Color.orange).frame(width: 7, height: 7)
                } else if state.isTracking {
                    Circle().fill(.green).frame(width: 7, height: 7)
                } else {
                    Circle().fill(Color.gray).frame(width: 7, height: 7)
                }
                Text(formatHM(state.todayMinutes))
                    .font(.system(size: 12, weight: .semibold, design: .monospaced))
            }
        } else {
            Image(systemName: "clock")
        }
    }

    private func formatHM(_ mins: Int) -> String {
        String(format: "%d:%02d", mins / 60, mins % 60)
    }
}

// MARK: - Menu Bar Dropdown

struct MenuBarView: View {
    // MenuBarState for display (isTracking, isOnBreak, todayMinutes)
    // TrackingManager only for actions (punchIn, punchOut, etc.) — not observed for rendering
    @ObservedObject private var state = MenuBarState.shared
    @Environment(\.openWindow) private var openWindow

    private var manager: TrackingManager { TrackingManager.shared }

    var body: some View {
        // Status line
        if state.isTracking {
            Text(state.isOnBreak
                 ? "⏸ On Break – \(formatHM(state.todayMinutes))"
                 : "● Tracking – \(formatHM(state.todayMinutes))")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(state.isOnBreak ? .orange : .green)
        } else {
            Text("○ Not tracking")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary)
        }

        Divider()

        // Quick punch in / out / break / resume
        if state.isTracking {
            if state.isOnBreak {
                Button("▶  Resume") { manager.resumeFromBreak() }
            } else {
                Button("⏸  Take a Break") { Task { await manager.takeBreak() } }
            }
            Button("Punch Out") { Task { await manager.punchOut() } }
        } else {
            Button("Punch In") {
                // Open main window so user can pick a task before tracking starts
                NotificationCenter.default.post(name: .tmActivateWindow, object: nil)
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    manager.showTaskPicker = true
                }
            }
        }

        Divider()

        // Open main window
        Button("Open TeamMonitor…") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }

        Divider()

        Button("Quit") {
            if state.isTracking {
                Task {
                    await manager.punchOut()
                    NSApp.terminate(nil)
                }
            } else {
                NSApp.terminate(nil)
            }
        }
    }

    private func formatHM(_ mins: Int) -> String {
        String(format: "%dh %02dm", mins / 60, mins % 60)
    }
}
