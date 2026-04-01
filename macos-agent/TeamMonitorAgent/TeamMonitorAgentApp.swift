// TeamMonitorAgentApp.swift – menu bar, background running, launch at login

import SwiftUI
import ServiceManagement
import UserNotifications

@main
struct TeamMonitorAgentApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        // Main window
        WindowGroup("TeamMonitor", id: "main") {
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
        // Set delegate BEFORE requesting auth so foreground notifications work.
        UNUserNotificationCenter.current().delegate = self

        // Briefly activate so the permission dialog appears on screen.
        // (LSUIElement=true apps aren't frontmost by default.)
        NSApp.activate(ignoringOtherApps: true)

        // Always call requestAuthorization — it's a no-op if already granted/denied,
        // and shows the dialog only on first launch.
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
            if let error {
                TMLog("[Notifications] Auth error: \(error)")
                return
            }
            TMLog("[Notifications] Permission granted: \(granted)")
            guard granted else { return }
            // Warmup: macOS sometimes silently drops the very first notification.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                let content   = UNMutableNotificationContent()
                content.title = "TeamMonitor is running"
                content.body  = "You'll get reminders if you forget to start tracking."
                content.sound = .default
                let req = UNNotificationRequest(identifier: "tm-welcome", content: content, trigger: nil)
                UNUserNotificationCenter.current().add(req) { _ in }
            }
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
        if manager.isTracking {
            HStack(spacing: 4) {
                if manager.isOnBreak {
                    // Amber pause dot
                    Circle().fill(Color.orange).frame(width: 7, height: 7)
                } else {
                    Circle().fill(.green).frame(width: 7, height: 7)
                }
                Text(formatHM(manager.trackedMinutes))
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
                 ? "⏸ On Break – \(formatHM(manager.trackedMinutes))"
                 : "● Tracking – \(formatHM(manager.trackedMinutes))")
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
