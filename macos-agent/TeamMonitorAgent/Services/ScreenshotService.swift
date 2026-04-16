// ScreenshotService.swift
// Captures screenshots at configurable intervals
// Requires "Screen Recording" permission in System Settings → Privacy & Security

import Foundation
import AppKit
import CoreGraphics
import ImageIO   // CGImageDestination — thread-safe JPEG encode (unlike NSBitmapImageRep)

class ScreenshotService: ObservableObject {
    static let shared = ScreenshotService()

    var captureIntervalSeconds: TimeInterval = 300

    private var timer: Timer?
    private var onCapture: ((Data) -> Void)?

    // MARK: - Permission

    /// Returns true when Screen Recording permission has been granted.
    /// Safe to call at any frequency — CGPreflightScreenCaptureAccess() never
    /// triggers a system dialog.
    static func hasPermission() -> Bool {
        if #available(macOS 10.15, *) {
            return CGPreflightScreenCaptureAccess()
        }
        return true
    }

    /// Opens the Screen Recording pane in System Settings so the user can
    /// enable access there. Does NOT block. Never calls CGRequestScreenCaptureAccess()
    /// because that triggers the system popup (which fires repeatedly for unsigned builds).
    static func requestPermission() {
        if #available(macOS 10.15, *) {
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture")!)
        }
    }

    // MARK: - Start / Stop

    var isEnabled: Bool = true   // set false to stop all captures (BE-configured)

    func start(interval: TimeInterval = 300, enabled: Bool = true, onCapture: @escaping (Data) -> Void) {
        self.captureIntervalSeconds = interval
        self.isEnabled              = enabled
        self.onCapture              = onCapture
        guard enabled else { return }
        scheduleNext()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func scheduleNext() {
        timer?.invalidate()
        // Random jitter: ±20% of interval so screenshots aren't predictable
        let jitter = captureIntervalSeconds * 0.2
        let delay  = captureIntervalSeconds + Double.random(in: -jitter...jitter)
        let t = Timer(timeInterval: max(30, delay), repeats: false) { [weak self] _ in
            guard let self, self.isEnabled else { return }
            // If permission was revoked while running, stop the service
            if !ScreenshotService.hasPermission() {
                self.stop()
                return
            }
            self.captureNow()
            self.scheduleNext()
        }
        RunLoop.main.add(t, forMode: .common)
        timer = t
    }

    // MARK: - Capture

    /// Captures using the stored interval callback (called by the scheduler).
    func captureNow() {
        captureNow(completion: onCapture)
    }

    /// Captures and delivers the result to an explicit callback.
    /// Runs on a background GCD queue (QoS .background) via a detached Task —
    /// never competes with UI or the Swift cooperative thread pool.
    func captureNow(completion: ((Data) -> Void)?) {
        // Snapshot onCapture on the main thread before the hop so the background
        // closure never touches instance state (avoids data race on `completion`).
        let cb = completion
        // Detached = no priority inheritance from caller.
        // @Sendable enforced by the compiler — no non-Sendable captures allowed.
        Task.detached(priority: .background) {
            guard let data = Self.captureScreenSync() else { return }
            await MainActor.run { cb?(data) }
        }
    }

    /// Pure synchronous capture — runs on background GCD thread.
    /// Uses only CoreGraphics + ImageIO: both are fully thread-safe.
    /// NSBitmapImageRep is NOT used — it's AppKit and not safe off the main thread.
    private static func captureScreenSync() -> Data? {
        let displayID = CGMainDisplayID()
        guard let cgImage = CGDisplayCreateImage(displayID) else { return nil }

        // ── Resize via CGContext (no NSImage / TIFF roundtrip) ───────────────────
        // Peak memory: ~4 MB (was ~31 MB with old NSImage path)
        let srcW = cgImage.width, srcH = cgImage.height
        let maxWidth = 960
        let dstW = min(srcW, maxWidth)
        let dstH = max(1, Int(Double(srcH) * Double(dstW) / Double(srcW)))

        let colorSpace = cgImage.colorSpace ?? CGColorSpaceCreateDeviceRGB()
        // byteOrder32Little | noneSkipFirst = fast blit path on all Apple HW
        let bitmapInfo = CGBitmapInfo(rawValue:
            CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.noneSkipFirst.rawValue)
        guard let ctx = CGContext(
            data: nil, width: dstW, height: dstH,
            bitsPerComponent: 8, bytesPerRow: 0,
            space: colorSpace, bitmapInfo: bitmapInfo.rawValue
        ) else { return nil }

        ctx.interpolationQuality = CGInterpolationQuality.medium
        ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: dstW, height: dstH))
        guard let resized = ctx.makeImage() else { return nil }
        // cgImage and ctx now out of scope — ARC releases before encode

        // ── JPEG encode via ImageIO (thread-safe, no AppKit) ─────────────────────
        let output = NSMutableData()
        guard let dest = CGImageDestinationCreateWithData(
            output, "public.jpeg" as CFString, 1, nil
        ) else { return nil }
        CGImageDestinationAddImage(dest, resized, [
            kCGImageDestinationLossyCompressionQuality: 0.35
        ] as CFDictionary)
        guard CGImageDestinationFinalize(dest) else { return nil }
        return output as Data
    }
}
