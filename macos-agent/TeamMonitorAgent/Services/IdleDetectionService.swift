// IdleDetectionService.swift
// Detects keyboard/mouse inactivity using IOKit

import Foundation
import IOKit

class IdleDetectionService: ObservableObject {
    static let shared = IdleDetectionService()

    // Seconds of inactivity before considered "idle"
    var idleThresholdSeconds: Int = 300  // 5 minutes

    @Published var isIdle: Bool = false
    @Published var idleSeconds: Int = 0
    @Published var activityPercent: Int = 100  // 0–100

    private var timer: Timer?
    private var idleStart: Date?
    private var totalActiveSeconds: Int = 0
    private var totalIdleSeconds: Int = 0

    // Callbacks
    var onIdleStart: ((Date) -> Void)?
    var onIdleEnd: ((Date, Date) -> Void)?  // (idleStart, idleEnd)

    // MARK: - Start / Stop

    func start() {
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.check()
        }
    }

    func stop() {
        timer?.invalidate()
        timer = nil
        // Close any open idle period
        if let start = idleStart {
            onIdleEnd?(start, Date())
            idleStart = nil
        }
        // Reset counters
        totalActiveSeconds = 0
        totalIdleSeconds = 0
    }

    func resetActivityCounters() {
        totalActiveSeconds = 0
        totalIdleSeconds = 0
        updateActivityPercent()
    }

    // MARK: - Check

    private func check() {
        let idle = systemIdleSeconds()
        DispatchQueue.main.async { self.idleSeconds = idle }

        if idle >= idleThresholdSeconds {
            // Became idle
            if !isIdle {
                let now = Date()
                DispatchQueue.main.async { self.isIdle = true }
                idleStart = now
                onIdleStart?(now)
            }
            totalIdleSeconds += 5
        } else {
            // Active
            if isIdle, let start = idleStart {
                let now = Date()
                DispatchQueue.main.async { self.isIdle = false }
                onIdleEnd?(start, now)
                idleStart = nil
            }
            totalActiveSeconds += 5
        }

        updateActivityPercent()
    }

    private func updateActivityPercent() {
        let total = totalActiveSeconds + totalIdleSeconds
        let pct = total > 0 ? Int(Double(totalActiveSeconds) / Double(total) * 100) : 100
        DispatchQueue.main.async { self.activityPercent = pct }
    }

    // MARK: - IOKit idle time

    private func systemIdleSeconds() -> Int {
        let ioService = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOHIDSystem"))
        guard ioService != 0 else { return 0 }
        defer { IOObjectRelease(ioService) }

        var dict: Unmanaged<CFMutableDictionary>?
        guard IORegistryEntryCreateCFProperties(ioService, &dict, kCFAllocatorDefault, 0) == kIOReturnSuccess,
              let properties = dict?.takeRetainedValue() as? [String: Any],
              let idleTimeNs = properties["HIDIdleTime"] as? Int else { return 0 }

        return idleTimeNs / 1_000_000_000  // nanoseconds → seconds
    }
}
