// ReportsView.swift – daily report powered by /api/reports/daily

import SwiftUI

private func parseISO(_ s: String) -> Date? {
    let withFrac = ISO8601DateFormatter()
    withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = withFrac.date(from: s) { return d }
    let plain = ISO8601DateFormatter()
    plain.formatOptions = [.withInternetDateTime]
    return plain.date(from: s)
}

private func fmtHM(_ mins: Int) -> String {
    mins < 60 ? "\(mins)m" : String(format: "%dh %02dm", mins / 60, mins % 60)
}

private func shortTime(_ d: Date) -> String {
    let f = DateFormatter(); f.timeStyle = .short; return f.string(from: d)
}

// MARK: - ReportsView

struct ReportsView: View {
    @Environment(\.dismiss) private var dismiss

    @State private var selectedDate = Date()
    @State private var report:      DailyReport? = nil
    @State private var isLoading    = false
    @State private var loadError:   String? = nil
    @State private var selectedTab: ReportTab = .punchLog

    enum ReportTab: String, CaseIterable {
        case punchLog = "Punch Log"
        case activity = "Activity"
        case patterns = "Patterns"
        case aiReport = "AI Report"
    }

    private let api = APIService.shared

    var body: some View {
        VStack(spacing: 0) {
            header
            summaryCards
            tabBar
            ScrollView {
                switch selectedTab {
                case .punchLog: punchLogTab
                case .activity: activityTab
                case .patterns: patternsTab
                case .aiReport: aiReportTab
                }
            }
            .background(Color(hex: "f9fafb"))
        }
        .frame(width: 580, height: 660)
        .task { await loadData() }
    }

    // MARK: Header

    var header: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("Reports").font(.system(size: 16, weight: .semibold)).foregroundColor(Color(hex: "111827"))
                Text("Your activity for the selected day").font(.system(size: 12)).foregroundColor(Color(hex: "6b7280"))
            }
            Spacer()
            DatePicker("", selection: $selectedDate, displayedComponents: .date)
                .datePickerStyle(.compact).labelsHidden()
                .onChange(of: selectedDate) { _ in Task { await loadData() } }
            Button { dismiss() } label: {
                Image(systemName: "xmark.circle.fill").font(.system(size: 20)).foregroundColor(Color(hex: "9ca3af"))
            }.buttonStyle(.plain).padding(.leading, 8)
        }
        .padding(16)
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: Summary Cards

    var summaryCards: some View {
        HStack(spacing: 0) {
            SummaryCard(title: "Total Time",  value: fmtHM(report?.totalTrackedMinutes ?? 0), icon: "clock.fill",                   color: "3b82f6")
            Divider().frame(height: 60)
            SummaryCard(title: "Active Time", value: fmtHM((report?.totalActiveSeconds ?? 0) / 60), icon: "bolt.fill",             color: "16a34a")
            Divider().frame(height: 60)
            SummaryCard(title: "Sessions",    value: "\(report?.punchLog.count ?? 0)", icon: "rectangle.stack.fill",                color: "f59e0b")
            Divider().frame(height: 60)
            SummaryCard(title: "Productive",  value: "\(report?.productivePercent ?? 0)%", icon: "chart.line.uptrend.xyaxis",
                        color: (report?.productivePercent ?? 0) >= 60 ? "16a34a" : "f59e0b")
        }
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: Tab Bar

    var tabBar: some View {
        HStack(spacing: 0) {
            ForEach(ReportTab.allCases, id: \.self) { tab in
                Button { selectedTab = tab } label: {
                    Text(tab.rawValue)
                        .font(.system(size: 12, weight: selectedTab == tab ? .semibold : .regular))
                        .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : Color(hex: "6b7280"))
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .overlay(Rectangle().frame(height: 2)
                            .foregroundColor(selectedTab == tab ? Color(hex: "2563eb") : .clear),
                                 alignment: .bottom)
                }.buttonStyle(.plain)
            }
            Spacer()
            if isLoading { ProgressView().scaleEffect(0.6).padding(.trailing, 16) }
        }
        .background(Color.white)
        .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    // MARK: Punch Log Tab

    var punchLogTab: some View {
        VStack(spacing: 0) {
            let sessions = report?.punchLog ?? []
            if sessions.isEmpty {
                emptyState(icon: "rectangle.stack", message: "No sessions recorded for this day")
            } else {
                sectionHeader("Work Sessions")
                LazyVStack(spacing: 0) {
                    ForEach(sessions) { s in
                        PunchLogRow(session: s)
                        Divider().padding(.leading, 60)
                    }
                }.background(Color.white)

                sectionHeader("Day Timeline")
                DayTimelineBar(sessions: sessions).padding(16).background(Color.white)
            }
        }
    }

    // MARK: Activity Tab

    var activityTab: some View {
        VStack(spacing: 0) {
            let apps = report?.topApps ?? []
            let logs = report?.activityLogs ?? []
            if apps.isEmpty {
                emptyState(icon: "macwindow", message: "No activity recorded for this day")
            } else {
                sectionHeader("App Usage")
                VStack(spacing: 8) {
                    ForEach(Array(apps.prefix(10))) { item in
                        AppUsageRow(item: item, maxSeconds: apps.first?.totalSeconds ?? 1)
                    }
                }.padding(16).background(Color.white)

                sectionHeader("Recent Activity")
                LazyVStack(spacing: 0) {
                    ForEach(logs.prefix(30)) { log in
                        ActivityLogRow(log: log)
                        Divider().padding(.leading, 16)
                    }
                }.background(Color.white)
            }
        }
    }

    // MARK: Patterns Tab

    var patternsTab: some View {
        VStack(spacing: 0) {
            guard let r = report, !r.productiveHours.isEmpty else {
                return AnyView(emptyState(icon: "chart.bar", message: "No activity recorded for this day"))
            }
            return AnyView(VStack(spacing: 0) {
                sectionHeader("Productive Hours — Activity per Hour")
                ProductiveHoursChart(hours: r.productiveHours, peakHours: r.peakHours)
                    .padding(16).background(Color.white)

                sectionHeader("Peak Productive Hours")
                PeakHoursCard(peakHours: r.peakHours).padding(16).background(Color.white)

                sectionHeader("Work Pattern")
                WorkPatternCard(pattern: r.workPattern).padding(16).background(Color.white)
            })
        }
    }

    // MARK: AI Report Tab

    var aiReportTab: some View {
        VStack(spacing: 0) {
            guard let r = report else {
                return AnyView(emptyState(icon: "sparkles", message: "No data available to generate a report"))
            }
            return AnyView(AIReportCard(date: selectedDate, report: r).padding(16).background(Color.white))
        }
    }

    // MARK: Helpers

    func sectionHeader(_ title: String) -> some View {
        HStack { Text(title).font(.system(size: 12, weight: .semibold)).foregroundColor(Color(hex: "374151")); Spacer() }
            .padding(.horizontal, 16).padding(.vertical, 8)
            .background(Color(hex: "f3f4f6"))
            .overlay(Rectangle().frame(height: 1).foregroundColor(Color(hex: "e5e7eb")), alignment: .bottom)
    }

    func emptyState(icon: String, message: String) -> some View {
        VStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 36)).foregroundColor(Color(hex: "d1d5db"))
            Text(message).font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
        }
        .frame(maxWidth: .infinity).padding(.vertical, 48)
    }

    func loadData() async {
        isLoading = true
        let dateStr = DateFormatter().then { $0.dateFormat = "yyyy-MM-dd" }.string(from: selectedDate)
        report    = try? await api.getDailyReport(date: dateStr)
        loadError = report == nil ? "Could not load report" : nil
        isLoading = false
    }
}

// DateFormatter helper
private extension DateFormatter {
    func then(_ block: (DateFormatter) -> Void) -> DateFormatter {
        block(self); return self
    }
}

// MARK: - Punch Log Row

struct PunchLogRow: View {
    let session: SessionItem

    var isActive: Bool { session.status == "active" }

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle()
                    .fill(isActive ? Color(hex: "dcfce7") : Color(hex: "eff6ff"))
                    .frame(width: 40, height: 40)
                Image(systemName: isActive ? "play.fill" : "checkmark")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(isActive ? Color(hex: "16a34a") : Color(hex: "3b82f6"))
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 6) {
                    let inStr  = parseISO(session.punchIn).map { shortTime($0) } ?? "–"
                    let outStr = session.punchOut.flatMap { parseISO($0) }.map { shortTime($0) } ?? "–"
                    Text("\(inStr) → \(outStr)")
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(Color(hex: "111827"))
                    if isActive {
                        Text("LIVE").font(.system(size: 9, weight: .bold)).foregroundColor(Color(hex: "16a34a"))
                            .padding(.horizontal, 5).padding(.vertical, 2)
                            .background(Color(hex: "dcfce7")).cornerRadius(3)
                    }
                }
                HStack(spacing: 10) {
                    Label {
                        Text(parseISO(session.punchIn).map { shortTime($0) } ?? "–")
                            .font(.system(size: 11)).foregroundColor(Color(hex: "16a34a"))
                    } icon: {
                        Image(systemName: "arrow.right.circle.fill")
                            .font(.system(size: 10)).foregroundColor(Color(hex: "16a34a"))
                    }
                    if let po = session.punchOut, let d = parseISO(po) {
                        Label {
                            Text(shortTime(d)).font(.system(size: 11)).foregroundColor(Color(hex: "ef4444"))
                        } icon: {
                            Image(systemName: "arrow.left.circle.fill")
                                .font(.system(size: 10)).foregroundColor(Color(hex: "ef4444"))
                        }
                    }
                    // Task/Jira chip
                    if let task = session.taskName {
                        Text(task).font(.system(size: 10)).foregroundColor(Color(hex: "6366f1"))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Color(hex: "eef2ff")).cornerRadius(4)
                            .lineLimit(1)
                    } else if let jira = session.jiraIssueKey {
                        Text(jira).font(.system(size: 10, weight: .bold)).foregroundColor(Color(hex: "0052CC"))
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Color(hex: "eff6ff")).cornerRadius(4)
                    }
                }
            }

            Spacer()

            let m = session.totalMinutes
            VStack(alignment: .trailing, spacing: 2) {
                Text(m > 0 ? fmtHM(m) : "active")
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(Color(hex: "111827"))
                Text("tracked").font(.system(size: 10)).foregroundColor(Color(hex: "9ca3af"))
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12).background(Color.white)
    }
}

// MARK: - Day Timeline Bar

struct DayTimelineBar: View {
    let sessions: [SessionItem]
    private let startHour = 8
    private let spanHours = 12

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 0) {
                ForEach(0...spanHours, id: \.self) { i in
                    let h = startHour + i
                    Text(h == 12 ? "12p" : h < 12 ? "\(h)a" : "\(h-12)p")
                        .font(.system(size: 9)).foregroundColor(Color(hex: "9ca3af"))
                        .frame(maxWidth: .infinity, alignment: i == 0 ? .leading : i == spanHours ? .trailing : .center)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color(hex: "f3f4f6")).frame(height: 16)
                    ForEach(sessions) { s in
                        if let d = parseISO(s.punchIn) {
                            let inM  = minutesFrom(d)
                            let outM = s.punchOut.flatMap { parseISO($0) }.map { minutesFrom($0) }
                                       ?? min(inM + s.totalMinutes, spanHours * 60)
                            let x = CGFloat(inM) / CGFloat(spanHours * 60) * geo.size.width
                            let w = max(4, CGFloat(outM - inM) / CGFloat(spanHours * 60) * geo.size.width)
                            RoundedRectangle(cornerRadius: 3)
                                .fill(s.status == "active" ? Color(hex: "16a34a") : Color(hex: "3b82f6"))
                                .frame(width: w, height: 16).offset(x: x)
                        }
                    }
                }
            }.frame(height: 16)
            HStack {
                Circle().fill(Color(hex: "3b82f6")).frame(width: 8, height: 8)
                Text("Completed").font(.system(size: 10)).foregroundColor(Color(hex: "6b7280"))
                Circle().fill(Color(hex: "16a34a")).frame(width: 8, height: 8).padding(.leading, 8)
                Text("Active").font(.system(size: 10)).foregroundColor(Color(hex: "6b7280"))
            }
        }
    }

    private func minutesFrom(_ d: Date) -> Int {
        let c = Calendar.current.dateComponents([.hour, .minute], from: d)
        return max(0, min((c.hour ?? 0) * 60 + (c.minute ?? 0) - startHour * 60, spanHours * 60))
    }
}

// MARK: - Productive Hours Chart (BE data)

struct ProductiveHoursChart: View {
    let hours:     [DailyReportHour]
    let peakHours: [DailyReportPeakHour]

    private var maxVal: Int { hours.map(\.activeSeconds).max() ?? 1 }
    private var peakHourNum: Int { peakHours.first?.hour ?? -1 }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom, spacing: 3) {
                ForEach(hours) { h in
                    let frac    = maxVal > 0 ? CGFloat(h.activeSeconds) / CGFloat(maxVal) : 0
                    let isPeak  = h.hour == peakHourNum && h.activeSeconds > 0
                    VStack(spacing: 2) {
                        RoundedRectangle(cornerRadius: 2)
                            .fill(isPeak ? Color(hex: "6366f1")
                                  : h.activeSeconds > 0 ? Color(hex: "3b82f6")
                                  : Color(hex: "e5e7eb"))
                            .frame(height: max(4, 64 * frac))
                        Text(h.hour % 6 == 0 ? "\(h.hour)" : "")
                            .font(.system(size: 8)).foregroundColor(Color(hex: "9ca3af"))
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .frame(height: 80)
            HStack(spacing: 10) {
                Circle().fill(Color(hex: "6366f1")).frame(width: 8, height: 8)
                Text("Peak hour").font(.system(size: 10)).foregroundColor(Color(hex: "6b7280"))
                Circle().fill(Color(hex: "3b82f6")).frame(width: 8, height: 8).padding(.leading, 6)
                Text("Active").font(.system(size: 10)).foregroundColor(Color(hex: "6b7280"))
                Circle().fill(Color(hex: "e5e7eb")).frame(width: 8, height: 8).padding(.leading, 6)
                Text("Inactive").font(.system(size: 10)).foregroundColor(Color(hex: "6b7280"))
            }
        }
    }
}

// MARK: - Peak Hours Card (BE data)

struct PeakHoursCard: View {
    let peakHours: [DailyReportPeakHour]
    private var maxSec: Int { peakHours.first?.activeSeconds ?? 1 }

    var body: some View {
        VStack(spacing: 10) {
            if peakHours.isEmpty {
                Text("No activity data available").font(.system(size: 13)).foregroundColor(Color(hex: "9ca3af"))
            } else {
                ForEach(peakHours) { entry in
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(entry.rank == 1 ? Color(hex: "6366f1") :
                                      entry.rank == 2 ? Color(hex: "3b82f6") : Color(hex: "94a3b8"))
                                .frame(width: 28, height: 28)
                            Text("\(entry.rank)").font(.system(size: 12, weight: .bold)).foregroundColor(.white)
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.label).font(.system(size: 13, weight: .medium)).foregroundColor(Color(hex: "111827"))
                            Text(entry.activeSeconds >= 3600
                                 ? String(format: "%dh %02dm active", entry.activeSeconds/3600, (entry.activeSeconds%3600)/60)
                                 : "\(entry.activeMinutes)m active")
                                .font(.system(size: 11)).foregroundColor(Color(hex: "6b7280"))
                        }
                        Spacer()
                        GeometryReader { geo in
                            let frac = CGFloat(entry.activeSeconds) / CGFloat(maxSec)
                            ZStack(alignment: .leading) {
                                RoundedRectangle(cornerRadius: 3).fill(Color(hex: "f3f4f6"))
                                RoundedRectangle(cornerRadius: 3)
                                    .fill(entry.rank == 1 ? Color(hex: "6366f1") : Color(hex: "3b82f6"))
                                    .frame(width: geo.size.width * frac)
                            }
                        }.frame(width: 80, height: 6)
                    }.padding(.vertical, 4)
                }
            }
        }
    }
}

// MARK: - Work Pattern Card (BE data)

struct WorkPatternCard: View {
    let pattern: DailyReportWorkPattern

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                stat(icon: "sun.rise.fill", color: "f59e0b", label: "First punch-in",
                     value: pattern.firstPunchIn.flatMap { parseISO($0) }.map { shortTime($0) } ?? "–")
                stat(icon: "moon.fill", color: "6366f1", label: "Last punch-out",
                     value: pattern.lastPunchOut.flatMap { parseISO($0) }.map { shortTime($0) } ?? "–")
            }
            HStack(spacing: 12) {
                stat(icon: "timer", color: "3b82f6", label: "Avg session",
                     value: pattern.avgSessionMinutes > 0 ? fmtHM(pattern.avgSessionMinutes) : "–")
                stat(icon: "flame.fill", color: "ef4444", label: "Longest session",
                     value: pattern.longestSessionMinutes > 0 ? fmtHM(pattern.longestSessionMinutes) : "–")
            }
        }
    }

    private func stat(icon: String, color: String, label: String, value: String) -> some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 8).fill(Color(hex: color).opacity(0.12)).frame(width: 36, height: 36)
                Image(systemName: icon).font(.system(size: 15)).foregroundColor(Color(hex: color))
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 14, weight: .semibold)).foregroundColor(Color(hex: "111827"))
                Text(label).font(.system(size: 11)).foregroundColor(Color(hex: "6b7280"))
            }
            Spacer()
        }
        .padding(10)
        .background(Color(hex: "f9fafb")).cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
        .frame(maxWidth: .infinity)
    }
}

// MARK: - AI Report Card (BE data)

struct AIReportCard: View {
    let date:   Date
    let report: DailyReport

    private var ai: DailyReportAISummary { report.aiSummary }

    private var dateString: String {
        let f = DateFormatter(); f.dateStyle = .long; return f.string(from: date)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Header with focus score
            HStack(spacing: 10) {
                ZStack {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(LinearGradient(colors: [Color(hex: "6366f1"), Color(hex: "8b5cf6")],
                                             startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 40, height: 40)
                    Image(systemName: "sparkles").font(.system(size: 18)).foregroundColor(.white)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("AI Daily Report").font(.system(size: 14, weight: .semibold)).foregroundColor(Color(hex: "111827"))
                    Text(dateString).font(.system(size: 11)).foregroundColor(Color(hex: "6b7280"))
                }
                Spacer()
                VStack(spacing: 2) {
                    Text("\(ai.focusScore)").font(.system(size: 22, weight: .black))
                        .foregroundColor(ai.focusScore >= 7 ? Color(hex: "16a34a") :
                                         ai.focusScore >= 4 ? Color(hex: "f59e0b") : Color(hex: "ef4444"))
                    Text("/ 10").font(.system(size: 10)).foregroundColor(Color(hex: "9ca3af"))
                    Text("Focus").font(.system(size: 9, weight: .semibold)).foregroundColor(Color(hex: "6b7280"))
                }
                .padding(.horizontal, 12).padding(.vertical, 8)
                .background(Color(hex: "f9fafb")).cornerRadius(10)
                .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
            }

            Divider()

            aiRow(icon: "doc.text.fill",          color: "3b82f6", title: "Summary",                  text: ai.summary)
            aiRow(icon: "macwindow",               color: "8b5cf6", title: "Top Application",           text: ai.topAppText)
            if !report.peakHours.isEmpty {
                aiRow(icon: "chart.bar.fill",      color: "f59e0b", title: "Peak Productive Hours",     text: ai.peakText)
            }
            aiRow(icon: "lightbulb.fill",          color: "16a34a", title: "Insights & Recommendations", text: ai.insights)
            if !ai.pattern.isEmpty {
                aiRow(icon: "clock.arrow.circlepath", color: "06b6d4", title: "Work Pattern",           text: ai.pattern)
            }
        }
        .padding(4)
    }

    private func aiRow(icon: String, color: String, title: String, text: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 13)).foregroundColor(Color(hex: color))
                Text(title).font(.system(size: 12, weight: .semibold)).foregroundColor(Color(hex: "374151"))
            }
            Text(text).font(.system(size: 13)).foregroundColor(Color(hex: "4b5563")).lineSpacing(4)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(Color(hex: "f9fafb")).cornerRadius(10)
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color(hex: "e5e7eb"), lineWidth: 1))
    }
}

// MARK: - App Usage Bar Row

struct AppUsageRow: View {
    let item: ActivitySummaryItem
    let maxSeconds: Int

    var minutes: Int { item.totalSeconds / 60 }
    var fraction: Double { maxSeconds > 0 ? Double(item.totalSeconds) / Double(maxSeconds) : 0 }

    var barColor: Color {
        let colors = ["3b82f6","16a34a","8b5cf6","f59e0b","ef4444","06b6d4","ec4899","64748b"]
        return Color(hex: colors[abs(item.appName.hashValue) % colors.count])
    }

    var body: some View {
        HStack(spacing: 10) {
            ZStack {
                RoundedRectangle(cornerRadius: 6).fill(barColor.opacity(0.15)).frame(width: 28, height: 28)
                Text(String(item.appName.prefix(1)).uppercased()).font(.system(size: 12, weight: .bold)).foregroundColor(barColor)
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack {
                    Text(item.appName).font(.system(size: 12, weight: .medium)).foregroundColor(Color(hex: "111827")).lineLimit(1)
                    Spacer()
                    Text(minutes >= 60 ? String(format: "%dh %02dm", minutes/60, minutes%60) : "\(minutes)m")
                        .font(.system(size: 11)).foregroundColor(Color(hex: "6b7280"))
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        RoundedRectangle(cornerRadius: 3).fill(Color(hex: "f3f4f6")).frame(height: 6)
                        RoundedRectangle(cornerRadius: 3).fill(barColor).frame(width: geo.size.width * fraction, height: 6)
                    }
                }.frame(height: 6)
            }
        }
        .padding(.vertical, 4)
    }
}

// MARK: - Activity Log Row

struct ActivityLogRow: View {
    let log: ActivityLogItem

    var body: some View {
        HStack(spacing: 12) {
            Text(parseISO(log.startTime).map { shortTime($0) } ?? "")
                .font(.system(size: 11, design: .monospaced)).foregroundColor(Color(hex: "9ca3af"))
                .frame(width: 60, alignment: .leading)
            VStack(alignment: .leading, spacing: 1) {
                Text(log.appName).font(.system(size: 13, weight: .medium)).foregroundColor(Color(hex: "111827"))
                if !log.windowTitle.isEmpty {
                    Text(log.windowTitle).font(.system(size: 11)).foregroundColor(Color(hex: "6b7280")).lineLimit(1)
                }
            }
            Spacer()
            let s = log.durationSeconds
            Text(s < 60 ? "\(s)s" : s < 3600 ? "\(s/60)m" : String(format: "%dh %02dm", s/3600, (s%3600)/60))
                .font(.system(size: 11, weight: .medium)).foregroundColor(Color(hex: "6b7280"))
                .padding(.horizontal, 8).padding(.vertical, 2)
                .background(Color(hex: "f3f4f6")).cornerRadius(4)
        }
        .padding(.horizontal, 16).padding(.vertical, 8).background(Color.white)
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
            Image(systemName: icon).font(.system(size: 16)).foregroundColor(Color(hex: color))
            Text(value).font(.system(size: 17, weight: .semibold)).foregroundColor(Color(hex: "111827"))
            Text(title).font(.system(size: 10)).foregroundColor(Color(hex: "9ca3af"))
        }
        .frame(maxWidth: .infinity).padding(.vertical, 12)
    }
}
