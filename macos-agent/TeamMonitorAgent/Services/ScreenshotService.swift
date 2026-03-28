// ScreenshotService.swift
// Captures screenshots at configurable intervals
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
        let t = Timer(timeInterval: max(30, delay), repeats: false) { [weak self] _ in
            self?.captureNow()
            self?.scheduleNext()
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
    /// Does NOT gate on CGPreflightScreenCaptureAccess — that API returns false
    /// for unsigned/dev builds even when permission is granted. Instead we let
    /// CGDisplayCreateImage be the real gate: it returns nil when blocked.
    func captureNow(completion: ((Data) -> Void)?) {
        Task {
            if let data = await captureScreen() {
                await MainActor.run { completion?(data) }
            }
        }
    }

    private func captureScreen() async -> Data? {
        let displayID = CGMainDisplayID()
        guard let cgImage = CGDisplayCreateImage(displayID) else { return nil }
        let size    = NSSize(width: cgImage.width, height: cgImage.height)
        let nsImage = NSImage(cgImage: cgImage, size: size)
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
