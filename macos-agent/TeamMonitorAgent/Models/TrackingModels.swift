// TrackingModels.swift
// Data models for the tracking agent

import Foundation

struct TrackingSession: Identifiable {
    let id: String
    let employeeId: String
    var punchIn: Date
    var punchOut: Date?
    var totalMinutes: Int
    var status: SessionStatus
    let date: String  // "yyyy-MM-dd"

    enum SessionStatus: String {
        case active, completed
    }

    var duration: String {
        let mins = totalMinutes
        let h = mins / 60
        let m = mins % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }
}

struct ActivityLog: Identifiable {
    let id: String
    let employeeId: String
    let sessionId: String
    let appName: String
    let windowTitle: String
    let startTime: Date
    var endTime: Date
    var durationSeconds: Int
    let date: String
}

struct ScreenshotRecord: Identifiable {
    let id: String
    let employeeId: String
    let sessionId: String
    let timestamp: Date
    var storageUrl: String
    let date: String
    var activityLevel: Int
}

struct IdleLog: Identifiable {
    let id: String
    let employeeId: String
    let sessionId: String
    let idleStart: Date
    var idleEnd: Date
    var durationSeconds: Int
    let date: String
}

// AppTrackingState represents the currently active app window
struct ActiveAppInfo {
    let appName: String
    let bundleId: String
    let windowTitle: String
    let timestamp: Date
}
