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
    private var lastLoggedAt: Date = Date()   // tracks when the current segment was last flushed

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
        // Flush the last app entry (skip our own app)
        let ownBundleId = Bundle.main.bundleIdentifier ?? ""
        if let last = lastApp {
            let now = Date()
            let duration = Int(now.timeIntervalSince(lastLoggedAt))
            if duration > 2 && last.bundleId != ownBundleId {
                onAppChange?(last.appName, last.windowTitle, lastLoggedAt, now)
            }
        }
        pollTimer?.invalidate()
        pollTimer = nil
        lastApp = nil
    }

    // MARK: - Polling

    private func poll() {
        let now = Date()
        guard let frontApp = NSWorkspace.shared.frontmostApplication else { return }
        let appName    = frontApp.localizedName ?? frontApp.bundleIdentifier ?? "Unknown"
        let windowTitle = getWindowTitle(for: frontApp)

        DispatchQueue.main.async {
            self.currentApp    = appName
            self.currentWindow = windowTitle
        }

        let newInfo = ActiveAppInfo(
            appName:     appName,
            bundleId:    frontApp.bundleIdentifier ?? "",
            windowTitle: windowTitle,
            timestamp:   now
        )

        let ownBundleId = Bundle.main.bundleIdentifier ?? ""

        guard let last = lastApp else {
            // First poll — just record start
            lastApp       = newInfo
            lastAppStart  = now
            lastLoggedAt  = now
            return
        }

        let appChanged = last.appName != newInfo.appName || last.windowTitle != newInfo.windowTitle

        if appChanged {
            // App switched — flush previous segment from lastLoggedAt → now
            let duration = Int(now.timeIntervalSince(lastLoggedAt))
            if duration > 2 && last.bundleId != ownBundleId {
                onAppChange?(last.appName, last.windowTitle, lastLoggedAt, now)
            }
            lastAppStart = now
            lastLoggedAt = now
        } else {
            // Same app — flush the elapsed chunk so it counts even if app never changes
            let duration = Int(now.timeIntervalSince(lastLoggedAt))
            if duration > 5 && newInfo.bundleId != ownBundleId {
                onAppChange?(newInfo.appName, newInfo.windowTitle, lastLoggedAt, now)
                lastLoggedAt = now   // advance the log pointer; keep lastAppStart for continuity
            }
        }

        lastApp = newInfo
    }

    // MARK: - Window Title via Accessibility API

    private func getWindowTitle(for app: NSRunningApplication) -> String {
        guard let pid = app.processIdentifier as pid_t? else { return "" }
        let element = AXUIElementCreateApplication(pid)
        // Cap AX calls to 0.5 s — a frozen/unresponsive app would otherwise block
        // the main thread indefinitely and cause the whole Mac to feel hung.
        AXUIElementSetMessagingTimeout(element, 0.5)
        var windowRef: AnyObject?
        guard AXUIElementCopyAttributeValue(element, kAXFocusedWindowAttribute as CFString, &windowRef) == .success,
              let window = windowRef else { return "" }
        var titleRef: AnyObject?
        guard AXUIElementCopyAttributeValue(window as! AXUIElement, kAXTitleAttribute as CFString, &titleRef) == .success,
              let title = titleRef as? String else { return "" }
        return title
    }
}
