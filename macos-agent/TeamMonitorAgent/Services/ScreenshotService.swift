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

    /// Two-step check. CGPreflightScreenCaptureAccess() is unreliable in debug/
    /// Xcode builds — it can return false even after the user grants access.
    /// We fall back to inspecting whether the window list contains windows from
    /// other processes, which only works when Screen Recording is granted.
    static func hasPermission() -> Bool {
        // Step 1: official API (fast, often correct in release builds)
        if #available(macOS 10.15, *) {
            if CGPreflightScreenCaptureAccess() { return true }
        } else {
            return true // macOS < 10.15 never needed permission
        }

        // Step 2: attempt to enumerate on-screen windows.
        // Without Screen Recording, CGWindowListCopyWindowInfo only returns
        // windows owned by the current process.
        let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
        guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[CFString: Any]] else {
            return false
        }
        let myPID = Int(ProcessInfo.processInfo.processIdentifier)
        let canSeeOtherApps = list.contains { info in
            let pid = info[kCGWindowOwnerPID as CFString] as? Int ?? 0
            return pid != myPID && pid != 0
        }
        return canSeeOtherApps
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
        timer = Timer.scheduledTimer(withTimeInterval: captureIntervalSeconds, repeats: false) { [weak self] _ in
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
        return nsImage.jpegData(compressionFactor: 0.6)
    }
}

extension NSImage {
    func jpegData(compressionFactor: CGFloat = 0.7) -> Data? {
        guard let tiff = self.tiffRepresentation,
              let bitmapRep = NSBitmapImageRep(data: tiff) else { return nil }
        return bitmapRep.representation(using: .jpeg, properties: [.compressionFactor: compressionFactor])
    }
}
