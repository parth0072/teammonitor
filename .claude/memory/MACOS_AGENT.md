---
name: TeamMonitor — macOS Agent Architecture
description: Swift/SwiftUI macOS agent structure, key services, views, and how to extend them
type: reference
---

# macOS Agent

**Location:** `macos-agent/TeamMonitorAgent/`
**Type:** macOS menu bar app (LSUIElement=true, no dock icon)
**Language:** Swift 5.9, SwiftUI, Combine

---

## Key Files

### Entry Point
- `TeamMonitorAgentApp.swift` — `@main`, sets up AppDelegate, menu bar extra, launches main window

### Services (background logic)
| File | Purpose |
|------|---------|
| `APIService.swift` | All network calls to backend; JWT auth; model definitions |
| `TrackingManager.swift` | Central orchestrator; punch in/out; idle/break logic |
| `ScreenshotService.swift` | Captures screen every N seconds (configurable), uploads |
| `AppTrackingService.swift` | Polls active app + window title every 30s via NSWorkspace |
| `IdleDetectionService.swift` | IOKit HID idle time detection |
| `UpdateService.swift` | Auto-update check and install |
| `NetworkMonitor.swift` | Offline detection |
| `OfflineQueue.swift` | Queue API calls when offline |

### Views (split into extension files)
| File | Purpose |
|------|---------|
| `TrackingDashboardView.swift` | Main struct, state vars, body, sheet wiring |
| `TrackingDashboardView+Tabs.swift` | Tab bar, tasks tab, activity tab, Jira section |
| `TrackingDashboardView+Logic.swift` | `loadTasks()`, `loadJiraIssues()`, toast, break timer |
| `TrackingDashboardView+Header.swift` | Top header bar |
| `TrackingDashboardView+Banners.swift` | Update/status/permission banners |
| `TrackingDashboardView+Actions.swift` | Punch in/out button logic |
| `LoginView.swift` | Email/password login |
| `SettingsView.swift` | App settings |
| `ReportsView.swift` | Daily activity reports |
| `TaskRow.swift` | `TaskRow2` — TeamMonitor task row |
| `NewTaskView.swift` | Create task sheet |
| `TaskPickerView.swift` | Pick task before punch-in |

---

## APIService Patterns

### Adding a new API call
```swift
// 1. Add model (if needed)
struct MyModel: Decodable, Identifiable { ... }

// 2. Add method to APIService
func getMyData() async throws -> [MyModel] {
    try await get("/my-endpoint")
}

// 3. Call from a View via Task { @MainActor in ... }
Task { @MainActor in
    myData = try await APIService.shared.getMyData()
}
```

### Auth / credentials
- Token stored in `UserDefaults` (key: `tm_cred_auth_token`) via `CredStore`
- Employee info stored in `UserDefaults` (key: `tm_cred_employee_info`)
- Restored on every launch in `APIService.init()`
- `APIService.shared.employee` — current logged-in employee

### Production API base
```swift
let API_BASE = "https://api.alphabyteinnovation.com/teammonitor/api"
```

---

## Dashboard Tabs
The main window has 3 tabs defined by `DashTab` enum:
- `.tasks` — My Tasks (TeamMonitor tasks + Jira issues section)
- `.activity` — Recent App Activity
- `.notes` — Work Notes (placeholder)

---

## Jira in macOS Agent
- `jiraConnected: Bool`, `jiraIssues: [JiraIssue]`, `jiraLoading: Bool` — state in `TrackingDashboardView.swift`
- `loadJiraIssues()` called after `loadTasks()` in `TrackingDashboardView+Logic.swift`
- Jira section appears in tasks tab only when `jiraConnected == true`
- `JiraIssueRow` struct defined in `TrackingDashboardView+Tabs.swift`
- Tapping the external link icon opens `issue.url` in the browser via `NSWorkspace.shared.open(url)`

---

## Build & Distribution
- Xcode project: `macos-agent/TeamMonitorAgent.xcodeproj`
- Build scripts: `macos-agent/scripts/`
- Ad-hoc signed (no Apple Developer account required)
- Auto-update via `UpdateService` — checks GitHub releases
- Install script: `macos-agent/install.sh`
