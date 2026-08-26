// AppLogger.swift — file-backed logger; use TMLog() everywhere instead of print()

import Foundation

// MARK: - Global shortcut

func TMLog(_ message: String, file: String = #file, function: String = #function) {
    AppLogger.shared.log(message, file: file, function: function)
}

// MARK: - AppLogger

final class AppLogger {
    static let shared = AppLogger()

    private let maxLines   = 1_000
    private let fileURL: URL
    private let queue      = DispatchQueue(label: "com.teammonitor.logger", qos: .utility)
    private var buffer:    [String] = []
    private var handle:    FileHandle?
    /// Lines appended since the last full-file compaction. We rewrite the whole file only
    /// once every `maxLines` appends (to keep it bounded); every other log is a cheap O(1)
    /// append of the single new line — instead of re-serializing all 1,000 lines each time.
    private var linesSinceCompaction = 0

    private init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("TeamMonitor", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("teammonitor.log")

        // Load existing log lines into buffer on startup (trimmed to the cap).
        if let existing = try? String(contentsOf: fileURL, encoding: .utf8) {
            buffer = existing.components(separatedBy: "\n").filter { !$0.isEmpty }
            if buffer.count > maxLines { buffer.removeFirst(buffer.count - maxLines) }
        }
        // Compact once at startup so the on-disk file is bounded and the append handle
        // starts from a clean, trimmed file.
        compact()

        // Use print directly — TMLog would recurse into AppLogger.shared during init
        print("[AppLogger] started — log: \(fileURL.path)")
    }

    // MARK: - Write

    func log(_ message: String, file: String = #file, function: String = #function) {
        let tag      = URL(fileURLWithPath: file).deletingPathExtension().lastPathComponent
        let ts       = Self.timestamp()
        let line     = "[\(ts)] [\(tag)] \(message)"

        // Also print to Xcode console
        print(line)

        queue.async { [weak self] in
            guard let self else { return }
            self.buffer.append(line)
            if self.buffer.count > self.maxLines {
                self.buffer.removeFirst(self.buffer.count - self.maxLines)
            }
            self.linesSinceCompaction += 1

            // Rewrite the whole file only periodically; otherwise append just the new line.
            if self.linesSinceCompaction >= self.maxLines || self.handle == nil {
                self.compact()
            } else {
                let data = Data((line + "\n").utf8)
                do { try self.handle?.write(contentsOf: data) }
                catch { self.handle = nil }   // force a compaction + reopen on the next log
            }
        }
    }

    /// Rewrite the file from the (trimmed) in-memory buffer and reopen the append handle.
    /// Must run on `queue` (or during init before any concurrent access).
    private func compact() {
        let text = buffer.isEmpty ? "" : buffer.joined(separator: "\n") + "\n"
        try? text.write(to: fileURL, atomically: true, encoding: .utf8)
        linesSinceCompaction = 0
        openHandle()
    }

    private func openHandle() {
        if let h = handle { _ = try? h.close() }
        handle = try? FileHandle(forWritingTo: fileURL)
        _ = try? handle?.seekToEnd()
    }

    // MARK: - Read

    /// Last N lines as a single string, for including in bug reports.
    func recentLogs(lines: Int = 150) -> String {
        queue.sync {
            let slice = buffer.suffix(lines)
            return slice.joined(separator: "\n")
        }
    }

    /// Path to the log file on disk.
    var logFileURL: URL { fileURL }

    // MARK: - Helpers

    private static func timestamp() -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd HH:mm:ss"
        return f.string(from: Date())
    }
}
