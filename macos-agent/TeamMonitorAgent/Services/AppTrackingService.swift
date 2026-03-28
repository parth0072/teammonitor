// AppTrackingService.swift
// Tracks the active frontmost application and window title

import Foundation
import AppKit

class AppTrackingService: ObservableObject {
    static let shared = AppTrackingService()

    @Published var currentApp: String = ""
    @Published var currentWindow: String = ""

    private var pollTimer: Timer?
    private var lastApp: ActiveAppInfo?
    private var lastAppStart: Date = Date()

    // Called when an app session ends: (appName, windowTitle, startTime, endTime)
    var onAppChange: ((String, String, Date, Date) -> Void)?

    // MARK: - Start / Stop

    func start(pollInterval: TimeInterval = 30) {
        pollTimer?.invalidate()
        // Use .common run-loop mode so polling continues during UI interactions
        let t = Timer(timeInterval: pollInterval, repeats: true) { [weak self] _ in self?.poll() }
        RunLoop.main.add(t, forMode: .common)
        pollTimer = t
        poll()  // immediate first check
    }

    func stop() {
        // Flush the last app entry
        if let last = lastApp {
            let now = Date()
            let duration = Int(now.timeIntervalSince(lastAppStart))
            if duration > 2 {
                onAppChange?(last.appName, last.windowTitle, lastAppStart, now)
            }
        }
        pollTimer?.invalidate()
        pollTimer = nil
        lastApp = nil
    }

    // MARK: - Polling

    private func poll() {
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }
        let appName = frontApp.localizedName ?? frontApp.bundleIdentifier ?? "Unknown"
        let windowTitle = getWindowTitle(for: frontApp)

        DispatchQueue.main.async {
            self.currentApp = appName
            self.currentWindow = windowTitle
        }

        let newInfo = ActiveAppInfo(
            appName: appName,
            bundleId: frontApp.bundleIdentifier ?? "",
            windowTitle: windowTitle,
            timestamp: Date()
        )

        // App changed — log the previous one
        if let last = lastApp, last.appName != newInfo.appName || last.windowTitle != newInfo.windowTitle {
            let now = Date()
            let duration = Int(now.timeIntervalSince(lastAppStart))
            if duration > 5 {  // ignore < 5 second blips
                onAppChange?(last.appName, last.windowTitle, lastAppStart, now)
            }
            lastAppStart = now
        } else if lastApp == nil {
            lastAppStart = Date()
        }

        lastApp = newInfo
    }

    // MARK: - Window Title via Accessibility API

    private func getWindowTitle(for app: NSRunningApplication) -> String {
        guard let pid = app.processIdentifier as pid_t? else { return "" }
        let element = AXUIElementCreateApplication(pid)
        var windowRef: AnyObject?
        guard AXUIElementCopyAttributeValue(element, kAXFocusedWindowAttribute as CFString, &windowRef) == .success,
              let window = windowRef else { return "" }
        var titleRef: AnyObject?
        guard AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &titleRef) == .success,
              let title = titleRef as? String else { return "" }
        return title
    }
}
