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
    ///
    /// Uses two complementary checks because neither is 100% reliable alone:
    /// 1. CGPreflightScreenCaptureAccess() — fast; may return false for a
    ///    running process immediately after the user grants in System Settings
    ///    (macOS updates it after a relaunch in some OS versions).
    /// 2. CGWindowListCopyWindowInfo — if we can enumerate windows owned by
    ///    other processes (Dock, Finder, etc.), Screen Recording is active.
    ///    The Dock / menubar are always on-screen, so this works even on a
    ///    clean desktop.
    static func hasPermission() -> Bool {
        if #available(macOS 10.15, *) {
            if CGPreflightScreenCaptureAccess() { return true }

            // Fallback: try to see other processes' windows.
            // Without Screen Recording only the calling process's windows appear.
            let opts: CGWindowListOption = [.optionOnScreenOnly]
            if let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[CFString: Any]] {
                let myPID = Int(ProcessInfo.processInfo.processIdentifier)
                if list.contains(where: {
                    let pid = $0[kCGWindowOwnerPID as CFString] as? Int ?? 0
                    return pid != myPID && pid > 0
                }) { return true }
            }
            return false
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
        // Use /usr/sbin/screencapture (Apple-signed system tool) so we get the
        // full desktop regardless of our own app's code-signing state.
        // CGWindowListCreateImage / CGDisplayCreateImage both restrict output
        // for unsigned builds even after the user grants Screen Recording.
        return await withCheckedContinuation { continuation in
            let tmpURL = URL(fileURLWithPath: NSTemporaryDirectory())
                .appendingPathComponent("tm_ss_\(Int(Date().timeIntervalSince1970)).png")

            let task = Process()
            task.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
            // -x  = silent (no shutter sound)
            // -t png = PNG (best quality before our JPEG recompression)
            task.arguments = ["-x", "-t", "png", tmpURL.path]

            task.terminationHandler = { _ in
                defer { try? FileManager.default.removeItem(at: tmpURL) }
                guard let image = NSImage(contentsOf: tmpURL) else {
                    continuation.resume(returning: nil)
                    return
                }
                let compressed = image.resized(toMaxWidth: 1280)
                continuation.resume(returning: compressed.jpegData(compressionFactor: 0.5))
            }

            do { try task.run() } catch { continuation.resume(returning: nil) }
        }
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
