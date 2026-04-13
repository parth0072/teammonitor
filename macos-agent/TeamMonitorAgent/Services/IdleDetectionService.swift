// IdleDetectionService.swift
// Detects keyboard/mouse inactivity using IOKit.
//
// State machine:
//   .active   → no inactivity (or recovered before warning)
//   .warning  → past warningThresholdSeconds, countdown shown to user
//   .stopped  → past stopThresholdSeconds, timer auto-paused; waiting for movement

import Foundation
import IOKit

class IdleDetectionService: ObservableObject {
    static let shared = IdleDetectionService()

    // Thresholds (set from BE config before calling start())
    var warningThresholdSeconds: Int = 120   // 2 min — show countdown
    var stopThresholdSeconds:    Int = 300   // 5 min — auto-stop timer

    @Published var isIdle:           Bool = false   // true once stop threshold passed
    @Published var idleSeconds:      Int  = 0
    @Published var activityPercent:  Int  = 100

    private enum IdleState { case active, warning, stopped }
    private var state: IdleState = .active

    private var timer:              Timer?
    private var idleStart:          Date?
    private var totalActiveSeconds: Int = 0
    private var totalIdleSeconds:   Int = 0

    // Callbacks
    var onIdleWarning: ((Int) -> Void)?              // called with seconds remaining until stop
    var onIdleWarningCancelled: (() -> Void)?        // called when user moves during warning
    var onIdleStart: ((Date) -> Void)?               // called when stop threshold reached
    var onIdleEnd:   ((Date, Date) -> Void)?         // called when movement detected after stop

    // MARK: - Start / Stop

    func start() {
        timer?.invalidate()
        state              = .active
        isIdle             = false
        idleStart          = nil
        totalActiveSeconds = 0
        totalIdleSeconds   = 0
        // 10 s poll — accurate enough for 2-5 min thresholds; halves IOKit call frequency
        let t = Timer(timeInterval: 10, repeats: true) { [weak self] _ in self?.check() }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        state     = .active
        isIdle    = false
        idleStart = nil
        totalActiveSeconds = 0
        totalIdleSeconds   = 0
    }

    func resetActivityCounters() {
        totalActiveSeconds = 0
        totalIdleSeconds   = 0
        updateActivityPercent()
    }

    // MARK: - Check (every 10 s)

    private func check() {
        let idle = systemIdleSeconds()
        // Only publish idleSeconds when it actually changed to avoid spurious SwiftUI updates
        if idle != idleSeconds { DispatchQueue.main.async { self.idleSeconds = idle } }

        switch state {
        case .active:
            if idle >= stopThresholdSeconds {
                // Skipped warning — jumped straight to stop (e.g. lid closed, long absence)
                let now = Date()
                state     = .stopped
                idleStart = now
                DispatchQueue.main.async { self.isIdle = true }
                onIdleStart?(now)
                totalIdleSeconds += 10
            } else if idle >= warningThresholdSeconds {
                state = .warning
                let remaining = stopThresholdSeconds - idle
                onIdleWarning?(remaining)
                totalIdleSeconds += 10
            } else {
                totalActiveSeconds += 10
            }

        case .warning:
            if idle < warningThresholdSeconds {
                // User moved — cancel warning
                state = .active
                onIdleWarningCancelled?()
                totalActiveSeconds += 10
            } else if idle >= stopThresholdSeconds {
                // Countdown expired — stop
                let now = Date()
                state     = .stopped
                idleStart = now
                DispatchQueue.main.async { self.isIdle = true }
                onIdleStart?(now)
                totalIdleSeconds += 10
            } else {
                // Still in warning window — update remaining
                let remaining = stopThresholdSeconds - idle
                onIdleWarning?(remaining)
                totalIdleSeconds += 10
            }

        case .stopped:
            if idle < warningThresholdSeconds {
                // User returned
                let now   = Date()
                let start = idleStart ?? now
                state     = .active
                DispatchQueue.main.async { self.isIdle = false }
                onIdleEnd?(start, now)
                idleStart = nil
                totalActiveSeconds += 10
            } else {
                totalIdleSeconds += 10
            }
        }

        updateActivityPercent()
    }

    private func updateActivityPercent() {
        let total = totalActiveSeconds + totalIdleSeconds
        let pct   = total > 0 ? Int(Double(totalActiveSeconds) / Double(total) * 100) : 100
        // Only publish when value actually changed
        if pct != activityPercent { DispatchQueue.main.async { self.activityPercent = pct } }
    }

    // MARK: - IOKit idle time
    // Uses IORegistryEntryCreateCFProperty to fetch only HIDIdleTime (not all properties).

    /// Public accessor used by TrackingManager for auto check-in polling.
    func systemIdleSecondsPublic() -> Int { systemIdleSeconds() }

    private func systemIdleSeconds() -> Int {
        let ioService = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOHIDSystem"))
        guard ioService != 0 else { return 0 }
        defer { IOObjectRelease(ioService) }

        guard let value = IORegistryEntryCreateCFProperty(ioService, "HIDIdleTime" as CFString,
                                                          kCFAllocatorDefault, 0)?
                            .takeRetainedValue() as? Int else { return 0 }
        return value / 1_000_000_000  // nanoseconds → seconds
    }
}
