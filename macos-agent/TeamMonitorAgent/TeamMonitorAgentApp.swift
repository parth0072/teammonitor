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

        // Register idle-reminder category — action buttons force Alert style (stays on screen)
        let startAction = UNNotificationAction(
            identifier: "START_TRACKING",
            title: "▶ Start Tracking",
            options: [.foreground]
        )
        let dismissAction = UNNotificationAction(
            identifier: "DISMISS",
            title: "Dismiss",
            options: [.destructive]
        )
        let idleCategory = UNNotificationCategory(
            identifier: "IDLE_REMINDER",
            actions: [startAction, dismissAction],
            intentIdentifiers: [],
            options: []
        )
        UNUserNotificationCenter.current().setNotificationCategories([idleCategory])

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
        if response.actionIdentifier == "START_TRACKING" {
            // Punch in with last active task if available
            DispatchQueue.main.async {
                let manager = TrackingManager.shared
                guard !manager.isTracking else { return }
                Task { @MainActor in
                    let task  = manager.currentTask  ?? manager.lastActiveTask
                    let jira  = manager.currentJiraIssue ?? manager.lastActiveJiraIssue
                    await manager.punchIn(task: task, jiraIssue: jira)
                }
            }
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

// MARK: - Menu Bar Label (live time display)

struct MenuBarLabel: View {
    @ObservedObject private var manager = TrackingManager.shared

    var body: some View {
        if manager.isTracking || manager.todayMinutes > 0 {
            HStack(spacing: 4) {
                if manager.isOnBreak {
                    // Amber pause dot
                    Circle().fill(Color.orange).frame(width: 7, height: 7)
                } else if manager.isTracking {
                    Circle().fill(.green).frame(width: 7, height: 7)
                } else {
                    Circle().fill(Color.gray).frame(width: 7, height: 7)
                }
                Text(formatHM(manager.todayMinutes))
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
    @StateObject private var manager = TrackingManager.shared
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        // Status line
        if manager.isTracking {
            Text(manager.isOnBreak
                 ? "⏸ On Break – \(formatHM(manager.todayMinutes))"
                 : "● Tracking – \(formatHM(manager.todayMinutes))")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(manager.isOnBreak ? .orange : .green)
        } else {
            Text("○ Not tracking")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.secondary)
        }

        Divider()

        // Quick punch in / out / break / resume
        if manager.isTracking {
            if manager.isOnBreak {
                Button("▶  Resume") { manager.resumeFromBreak() }
            } else {
                Button("⏸  Take a Break") { Task { await manager.takeBreak() } }
            }
            Button("Punch Out") { Task { await manager.punchOut() } }
        } else {
            Button("Punch In") { Task { await manager.punchIn() } }
        }

        Divider()

        // Open main window
        Button("Open TeamMonitor…") {
            openWindow(id: "main")
            NSApp.activate(ignoringOtherApps: true)
        }

        Divider()

        Button("Quit") {
            if manager.isTracking {
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
