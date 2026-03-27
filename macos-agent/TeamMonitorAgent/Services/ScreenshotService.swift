// ScreenshotService.swift
// Captures screenshots at configurable intervals using CGWindowListCreateImage
// Requires "Screen Recording" permission in System Settings → Privacy & Security

import Foundation
import AppKit
import CoreGraphics

class ScreenshotService: ObservableObject {
    static let shared = ScreenshotService()

    var captureIntervalSeconds: TimeInterval = 300

    private var timer: Timer?
    private var onCapture: ((Data) -> Void)?

    // MARK: - Permission

    /// Returns true when Screen Recording permission has been granted.
    /// Uses CGPreflightScreenCaptureAccess() — the only reliable API.
    /// Note: on first grant macOS sometimes requires an app restart before
    /// this returns true; the banner's "Restart App" button handles that.
    static func hasPermission() -> Bool {
        if #available(macOS 10.15, *) {
            return CGPreflightScreenCaptureAccess()
        }
        return true  // macOS < 10.15 never needed permission
    }

    /// Opens the Screen Recording pane in System Settings so the user can
    /// enable access there. Does NOT block.
    static func requestPermission() {
        if #available(macOS 10.15, *) {
            // CGRequestScreenCaptureAccess() shows a one-time dialog then opens
            // System Settings. On subsequent calls it just opens System Settings.
            CGRequestScreenCaptureAccess()
        }
    }

    // MARK: - Start / Stop

    func start(interval: TimeInterval = 300, onCapture: @escaping (Data) -> Void) {
        self.captureIntervalSeconds = interval
        self.onCapture = onCapture
        scheduleNext()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    private func scheduleNext() {
        timer?.invalidate()
        // Random jitter: ±20% of interval so screenshots aren't predictable
        let jitter  = captureIntervalSeconds * 0.2
        let delay   = captureIntervalSeconds + Double.random(in: -jitter...jitter)
        timer = Timer.scheduledTimer(withTimeInterval: max(30, delay), repeats: false) { [weak self] _ in
            self?.captureNow()
            self?.scheduleNext()
        }
    }

    // MARK: - Capture

    func captureNow() {
        // Always attempt the capture; the OS will silently return a blank or
        // partial image if permission was revoked mid-session.
        Task {
            if let data = await captureScreen() {
                await MainActor.run { self.onCapture?(data) }
            }
        }
    }

    private func captureScreen() async -> Data? {
        guard let screen = NSScreen.main else { return nil }
        let rect = screen.frame

        guard let image = CGWindowListCreateImage(
            rect,
            .optionOnScreenOnly,
            kCGNullWindowID,
            [.bestResolution]
        ) else { return nil }

        let nsImage = NSImage(cgImage: image, size: rect.size)
        // Resize to max 1280px wide then compress — keeps files small (~80-150 KB)
        let compressed = nsImage.resized(toMaxWidth: 1280)
        return compressed.jpegData(compressionFactor: 0.5)
    }
}

extension NSImage {
    func jpegData(compressionFactor: CGFloat = 0.5) -> Data? {
        guard let tiff = self.tiffRepresentation,
              let bitmapRep = NSBitmapImageRep(data: tiff) else { return nil }
        return bitmapRep.representation(using: .jpeg, properties: [.compressionFactor: compressionFactor])
    }

    /// Scales the image down proportionally so its width is at most maxWidth.
    /// Returns self unchanged if already smaller.
    func resized(toMaxWidth maxWidth: CGFloat) -> NSImage {
        guard size.width > maxWidth else { return self }
        let scale   = maxWidth / size.width
        let newSize = NSSize(width: maxWidth, height: (size.height * scale).rounded())
        let result  = NSImage(size: newSize)
        result.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .high
        draw(in: NSRect(origin: .zero, size: newSize),
             from: NSRect(origin: .zero, size: size),
             operation: .copy, fraction: 1.0)
        result.unlockFocus()
        return result
    }
}
