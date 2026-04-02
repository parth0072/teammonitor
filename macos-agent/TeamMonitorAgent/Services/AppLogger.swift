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

    private init() {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("TeamMonitor", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        fileURL = dir.appendingPathComponent("teammonitor.log")

        // Load existing log lines into buffer on startup
        if let existing = try? String(contentsOf: fileURL, encoding: .utf8) {
            buffer = existing.components(separatedBy: "\n").filter { !$0.isEmpty }
        }

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
            try? (self.buffer.joined(separator: "\n") + "\n")
                .write(to: self.fileURL, atomically: false, encoding: .utf8)
        }
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
