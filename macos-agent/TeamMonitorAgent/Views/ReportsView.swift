// ReportsView.swift – daily report with activity charts

import SwiftUI

struct ReportsView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var selectedDate     = Date()
    @State private var appSummary:      [ActivitySummaryItem] = []
    @State private var activityLogs:    [ActivityLogItem]     = []
    @State private var sessions:        [SessionItem]         = []
    @State private var isLoading        = false
    @State private var selectedTab: ReportTab = .activity

    enum ReportTab: String, CaseIterable { case activity = "Activity", timeline = "Timeline", sessions = "Sessions" }

    private let api = APIService.shared

    var totalTrackedMinutes: Int { sessions.reduce(0) { $0 + $1.totalMinutes } }
    var totalActiveSeconds:  Int { appSummary.reduce(0) { $0 + $1.totalSeconds } }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Reports")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: "111827"))
                    Text("Your activity for the selected day")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "6b7280"))
                }
                Spacer()
                DatePicker("", selection: $selectedDate, displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .labelsHidden()
                    .onChange(of: selectedDate) { _ in Task { await loadData() } }
                Button { dismiss() } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color(hex: "9ca3af"))
                }.buttonStyle(.plain).padding(.leading, 8)
            }
            .padding(16)
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            // Summary cards
            summaryCards

            // Tab bar
            HStack(spacing: 0) {
                ForEach(ReportTab.allCases, id: \.self) { tab in
                    Button {
                        selectedTab = tab
                    } label: {
                        Text(tab.rawValue)
                            .font(.system(size: 12, weight: selectedTab == tab ? .semibold : .regular))
                            .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : Color(hex: "6b7280"))
                            .padding(.horizontal, 16)
                            .padding(.vertical, 9)
                            .overlay(
                                Rectangle().frame(height: 2)
                                    .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : .clear),
                                alignment: .bottom
                            )
                    }.buttonStyle(.plain)
                }
                Spacer()
                if isLoading {
                    ProgressView().scaleEffect(0.6).padding(.trailing, 16)
                }
            }
            .background(Color.white)
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)

            // Tab content
            ScrollView {
                switch selectedTab {
                case .activity: activityTab
                case .timeline: timelineTab
                case .sessions: sessionsTab
                }
            }
            .background(Color(hex: "f9fafb"))
        }
        .frame(width: 580, height: 640)
        .task { await loadData() }
    }

    // MARK: - Summary Cards

    var summaryCards: some View {
        HStack(spacing: 0) {
            SummaryCard(
                title: "Total Time",
                value: formatHM(totalTrackedMinutes),
                icon: "clock.fill",
                color: "3b82f6"
            )
            Divider().frame(height: 60)
            SummaryCard(
                title: "Active Time",
                value: formatHM(totalActiveSeconds / 60),
                icon: "bolt.fill",
                color: "16a34a"
            )
            Divider().frame(height: 60)
            SummaryCard(
                title: "Apps Used",
                value: "\(appSummary.count)",
                icon: "square.grid.2x2.fill",
                color: "8b5cf6"
            )
            Divider().frame(height: 60)
            SummaryCard(
                title: "Sessions",
                value: "\(sessions.count)",
                icon: "rectangle.stack.fill",
                color: "f59e0b"
            )
        }
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: - Activity Tab (App Usage Chart)

    var activityTab: some View {
        VStack(spacing: 0) {
            if appSummary.isEmpty {
                emptyState(message: "No activity recorded for this day")
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    sectionHeader("App Usage")

                    VStack(spacing: 8) {
                        ForEach(Array(appSummary.prefix(10))) { item in
                            AppUsageRow(item: item, maxSeconds: appSummary.first?.totalSeconds ?? 1)
                        }
                    }
                    .padding(16)
                }

                sectionHeader("Recent Activity")

                LazyVStack(spacing: 0) {
                    ForEach(activityLogs.prefix(30)) { log in
                        ActivityLogRow(log: log)
                        Divider().padding(.leading, 16)
                    }
                }
                .background(Color.white)
            }
        }
    }

    // MARK: - Timeline Tab

    var timelineTab: some View {
        VStack(spacing: 0) {
            if activityLogs.isEmpty {
                emptyState(message: "No activity recorded for this day")
            } else {
                sectionHeader("Hourly Timeline")
                TimelineChart(logs: activityLogs)
                    .padding(16)
                    .background(Color.white)

                sectionHeader("Activity Log")
                LazyVStack(spacing: 0) {
                    ForEach(activityLogs) { log in
                        TimelineLogRow(log: log)
                        Divider().padding(.leading, 56)
                    }
                }.background(Color.white)
            }
        }
    }

    // MARK: - Sessions Tab

    var sessionsTab: some View {
        VStack(spacing: 0) {
            if sessions.isEmpty {
                emptyState(message: "No sessions recorded for this day")
            } else {
                sectionHeader("Work Sessions")
                LazyVStack(spacing: 0) {
                    ForEach(sessions) { session in
                        SessionRow(session: session)
                        Divider().padding(.leading, 16)
                    }
                }.background(Color.white)
            }
        }
    }

    // MARK: - Helpers

    func sectionHeader(_ title: String) -> some View {
        HStack {
            Text(title)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Color(hex: "374151"))
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color(hex: "f3f4f6"))
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    func emptyState(message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: "chart.bar.xaxis")
                .font(.system(size: 36))
                .foregroundColor(Color(hex: "d1d5db"))
            Text(message)
                .font(.system(size: 13))
                .foregroundColor(Color(hex: "9ca3af"))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 48)
    }

    func formatHM(_ mins: Int) -> String {
        String(format: "%dh %02dm", mins / 60, mins % 60)
    }

    // MARK: - Load Data

    func loadData() async {
        isLoading = true
        let dateStr = { () -> String in
            let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"; return f.string(from: selectedDate)
        }()
        async let summary  = try? api.getMyActivitySummary(date: dateStr)
        async let logs     = try? api.getMyActivity(date: dateStr)
        async let sess     = try? api.getMySessions(date: dateStr)
        appSummary   = await summary  ?? []
        activityLogs = await logs     ?? []
        sessions     = await sess     ?? []
        isLoading    = false
    }
}

// MARK: - App Usage Bar Row

struct AppUsageRow: View {
    let item: ActivitySummaryItem
    let maxSeconds: Int

    var minutes: Int { item.totalSeconds / 60 }
    var fraction: Double { maxSeconds > 0 ? Double(item.totalSeconds) / Double(maxSeconds) : 0 }

    // Distinct color per app
    var barColor: Color {
        let colors = ["3b82f6","16a34a","8b5cf6","f59e0b","ef4444","06b6d4","ec4899","64748b"]
        let idx = abs(item.appName.hashValue) % colors.count
        return Color(hex: colors[idx])
    }

    var body: some View {
        HStack(spacing: 10) {
            // App icon placeholder
            ZStack {
                RoundedRectangle(cornerRadius: 6)
                    .fill(barColor.opacity(0.15))
                    .frame(width: 28, height: 28)
                Text(String(item.appName.prefix(1)).uppercased())
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(barColor)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(item.appName)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundColor(Color(hex: "111827"))
                        .lineLimit(1)
                    Spacer()
                    Text(minutes >= 60
                         ? String(format: "%dh %02dm", minutes/60, minutes%60)
                         : "\(minutes)m")
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "6b7280"))
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3)
                            .fill(Color(hex: "f3f4f6"))
                            .frame(height: 6)
                        RoundedRectangle(cornerRadius: 3)
                            .fill(barColor)
                            .frame(width: geo.size.width * fraction, height: 6)
                    }
                }
                .frame(height: 6)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Activity Log Row

struct ActivityLogRow: View {
    let log: ActivityLogItem

    var durationText: String {
        let s = log.durationSeconds
        if s < 60  { return "\(s)s" }
        if s < 3600 { return "\(s/60)m" }
        return String(format: "%dh %02dm", s/3600, (s%3600)/60)
    }

    var timeText: String {
        guard let date = ISO8601DateFormatter().date(from: log.startTime) else { return "" }
        let f = DateFormatter(); f.timeStyle = .short; return f.string(from: date)
    }

    var body: some View {
        HStack(spacing: 12) {
            Text(timeText)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(Color(hex: "9ca3af"))
                .frame(width: 60, alignment: .leading)

            VStack(alignment: .leading, spacing: 1) {
                Text(log.appName)
                    .font(.system(size: 13, weight: .medium))
                    .foregroundColor(Color(hex: "111827"))
                if !log.windowTitle.isEmpty {
                    Text(log.windowTitle)
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "6b7280"))
                        .lineLimit(1)
                }
            }

            Spacer()

            Text(durationText)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(Color(hex: "6b7280"))
                .padding(.horizontal, 8)
                .padding(.vertical, 2)
                .background(Color(hex: "f3f4f6"))
                .cornerRadius(4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
        .background(Color.white)
    }
}

// MARK: - Timeline Chart (hourly blocks)

struct TimelineChart: View {
    let logs: [ActivityLogItem]

    // Build hour buckets 0..23 with total seconds
    var hourBuckets: [Int] {
        var buckets = [Int](repeating: 0, count: 24)
        let parser = ISO8601DateFormatter()
        for log in logs {
            guard let start = parser.date(from: log.startTime) else { continue }
            let hour = Calendar.current.component(.hour, from: start)
            buckets[hour] += log.durationSeconds
        }
        return buckets
    }

    var maxVal: Int { hourBuckets.max() ?? 1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(0..<24, id: \.self) { hour in
                    let val = hourBuckets[hour]
                    let frac = maxVal > 0 ? CGFloat(val) / CGFloat(maxVal) : 0
                    VStack(spacing: 2) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(val > 0 ? Color(hex: "3b82f6") : Color(hex: "e5e7eb"))
                            .frame(height: max(4, 60 * frac))
                        Text(hour % 6 == 0 ? "\(hour)" : "")
                            .font(.system(size: 8))
                            .foregroundColor(Color(hex: "9ca3af"))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 80)

            Text("Bars show active time per hour")
                .font(.system(size: 10))
                .foregroundColor(Color(hex: "9ca3af"))
        }
    }
}

// MARK: - Timeline Log Row

struct TimelineLogRow: View {
    let log: ActivityLogItem

    var timeText: String {
        guard let date = ISO8601DateFormatter().date(from: log.startTime) else { return "" }
        let f = DateFormatter(); f.timeStyle = .short; return f.string(from: date)
    }

    var body: some View {
        HStack(spacing: 12) {
            // Timeline dot + line
            VStack(spacing: 0) {
                Circle().fill(Color(hex: "3b82f6")).frame(width: 8, height: 8)
                Rectangle().fill(Color(hex: "e5e7eb")).frame(width: 1)
            }
            .frame(width: 20)
            .padding(.leading, 16)

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(log.appName)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "111827"))
                    Spacer()
                    Text(timeText)
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "9ca3af"))
                }
                if !log.windowTitle.isEmpty {
                    Text(log.windowTitle)
                        .font(.system(size: 11))
                        .foregroundColor(Color(hex: "6b7280"))
                        .lineLimit(1)
                }
            }
            .padding(.trailing, 16)
        }
        .padding(.vertical, 8)
        .background(Color.white)
    }
}

// MARK: - Session Row

struct SessionRow: View {
    let session: SessionItem

    var timeRange: String {
        let f = DateFormatter(); f.timeStyle = .short
        let parser = ISO8601DateFormatter()
        let start = parser.date(from: session.punchIn).map { f.string(from: $0) } ?? session.punchIn
        let end   = session.punchOut.flatMap { parser.date(from: $0) }.map { f.string(from: $0) } ?? "–"
        return "\(start) → \(end)"
    }

    var isManual: Bool { session.totalMinutes > 0 && session.status == "completed" }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(session.status == "active" ? Color(hex: "dcfce7") : Color(hex: "eff6ff"))
                    .frame(width: 36, height: 36)
                Image(systemName: session.status == "active" ? "play.fill" : "checkmark")
                    .font(.system(size: 13))
                    .foregroundColor(session.status == "active" ? Color(hex: "16a34a") : Color(hex: "3b82f6"))
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(timeRange)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Color(hex: "111827"))
                    if session.status == "active" {
                        Text("ACTIVE")
                            .font(.system(size: 9, weight: .bold))
                            .foregroundColor(Color(hex: "16a34a"))
                            .padding(.horizontal, 5)
                            .padding(.vertical, 2)
                            .background(Color(hex: "dcfce7"))
                            .cornerRadius(3)
                    }
                }
                Text(String(format: "%d hr %02d min", session.totalMinutes/60, session.totalMinutes%60))
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: "6b7280"))
            }

            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Color.white)
    }
}

// MARK: - Summary Card

struct SummaryCard: View {
    let title: String
    let value: String
    let icon:  String
    let color: String

    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(Color(hex: color))
            Text(value)
                .font(.system(size: 17, weight: .semibold))
                .foregroundColor(Color(hex: "111827"))
            Text(title)
                .font(.system(size: 10))
                .foregroundColor(Color(hex: "9ca3af"))
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
    }
}
