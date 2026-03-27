// OfflineQueue.swift – persists failed uploads to disk; replays them when online

import Foundation

// MARK: - Queued screenshot item

struct QueuedScreenshot: Codable {
    let filename:      String   // just the file name; directory is implicit
    let sessionId:     Int
    let activityLevel: Int
    let capturedAt:    Date
}

// MARK: - Queued punch-out item

struct QueuedPunchOut: Codable {
    let sessionId:    Int
    let totalMinutes: Int
    let punchedOutAt: Date
}

// MARK: - OfflineQueue

final class OfflineQueue {
    static let shared = OfflineQueue()

    // ~/Library/Application Support/TeamMonitor/offline/
    private let baseURL: URL = {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("TeamMonitor/offline", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }()

    private var screenshotDir: URL { baseURL.appendingPathComponent("screenshots", isDirectory: true) }
    private var punchOutURL:   URL { baseURL.appendingPathComponent("pending_punchout.json") }
    private var indexURL:      URL { baseURL.appendingPathComponent("screenshot_index.json") }

    private init() {
        try? FileManager.default.createDirectory(at: screenshotDir, withIntermediateDirectories: true)
    }

    // MARK: - Screenshots

    /// Saves an image to disk and appends it to the index.
    func enqueueScreenshot(_ data: Data, sessionId: Int, activityLevel: Int) {
        let filename = "\(Int(Date().timeIntervalSince1970))_s\(sessionId)_a\(activityLevel).jpg"
        let fileURL  = screenshotDir.appendingPathComponent(filename)
        try? data.write(to: fileURL)

        let item = QueuedScreenshot(filename: filename, sessionId: sessionId,
                                    activityLevel: activityLevel, capturedAt: Date())
        var index = loadScreenshotIndex()
        index.append(item)
        saveScreenshotIndex(index)
    }

    /// Returns all queued screenshots (only those whose file still exists on disk).
    func pendingScreenshots() -> [(item: QueuedScreenshot, data: Data)] {
        loadScreenshotIndex().compactMap { item in
            let url = screenshotDir.appendingPathComponent(item.filename)
            guard let data = try? Data(contentsOf: url) else { return nil }
            return (item, data)
        }
    }

    /// Removes a screenshot from disk and index after successful upload.
    func dequeueScreenshot(filename: String) {
        let url = screenshotDir.appendingPathComponent(filename)
        try? FileManager.default.removeItem(at: url)
        var index = loadScreenshotIndex()
        index.removeAll { $0.filename == filename }
        saveScreenshotIndex(index)
    }

    func pendingScreenshotCount() -> Int { loadScreenshotIndex().count }

    // MARK: - Punch-out

    func enqueuePunchOut(_ item: QueuedPunchOut) {
        if let data = try? JSONEncoder().encode(item) {
            try? data.write(to: punchOutURL)
        }
    }

    func pendingPunchOut() -> QueuedPunchOut? {
        guard let data = try? Data(contentsOf: punchOutURL) else { return nil }
        return try? JSONDecoder().decode(QueuedPunchOut.self, from: data)
    }

    func dequeuePunchOut() {
        try? FileManager.default.removeItem(at: punchOutURL)
    }

    // MARK: - Private helpers

    private func loadScreenshotIndex() -> [QueuedScreenshot] {
        guard let data = try? Data(contentsOf: indexURL),
              let list = try? JSONDecoder().decode([QueuedScreenshot].self, from: data)
        else { return [] }
        return list
    }

    private func saveScreenshotIndex(_ index: [QueuedScreenshot]) {
        if let data = try? JSONEncoder().encode(index) {
            try? data.write(to: indexURL)
        }
    }
}
