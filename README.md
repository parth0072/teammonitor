# TeamMonitor

Employee monitoring system with macOS agent + Firebase-backed admin panel.

---

## ⚡ Quick Start (3 steps)

### Step 1 — Run setup (once)
```bash
cd TeamMonitor
bash setup.sh
```
This will ask for your Firebase credentials, install npm packages, create all config files, and create your first admin user.

### Step 2 — Start the Admin Panel
```bash
bash START_ADMIN.sh
# Opens at http://localhost:3000
```

### Step 3 — Open macOS Agent in Xcode
```bash
bash OPEN_XCODE.sh
# Press ⌘R in Xcode to build and run
```

---

## What's included

```
TeamMonitor/
├── setup.sh              ← Run this first (interactive Firebase setup)
├── START_ADMIN.sh        ← Starts the admin web panel
├── OPEN_XCODE.sh         ← Opens macOS agent in Xcode
│
├── admin-panel/          ← React + Vite + Firebase web app
│   ├── src/
│   │   ├── firebase.js
│   │   ├── App.jsx       ← Auth routing + sidebar
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx     ← Stats + 7-day chart + live sessions
│   │       ├── Employees.jsx     ← Employee list + add employee
│   │       ├── EmployeeDetail.jsx← Screenshots, app usage, activity log
│   │       ├── Screenshots.jsx   ← Filterable screenshot gallery
│   │       └── Attendance.jsx    ← Punch-in/out records
│   ├── .env.example
│   ├── vite.config.js
│   └── package.json
│
└── macos-agent/
    ├── TeamMonitorAgent.xcodeproj  ← Open in Xcode (Firebase SDK auto-resolves)
    └── TeamMonitorAgent/
        ├── TeamMonitorAgentApp.swift
        ├── ContentView.swift
        ├── Info.plist
        ├── TeamMonitorAgent.entitlements
        ├── Assets.xcassets
        ├── GoogleService-Info.plist  ← Created by setup.sh
        ├── Services/
        │   ├── FirebaseService.swift      ← All Firestore + Storage writes
        │   ├── ScreenshotService.swift    ← CGWindowListCreateImage every 5 min
        │   ├── AppTrackingService.swift   ← NSWorkspace + Accessibility API
        │   ├── IdleDetectionService.swift ← IOKit HIDIdleTime
        │   └── TrackingManager.swift      ← Coordinates all services
        ├── Views/
        │   ├── LoginView.swift
        │   └── TrackingDashboardView.swift
        └── Models/
            └── TrackingModels.swift
```

---

## Firebase Setup (if not using setup.sh)

1. [Create Firebase project](https://console.firebase.google.com)
2. Enable **Authentication** → Email/Password
3. Enable **Firestore Database** (production mode)
4. Enable **Storage**
5. Add a **Web app** → copy config → paste in `admin-panel/.env`
6. Add an **Apple (macOS) app** → download `GoogleService-Info.plist` → place in `macos-agent/TeamMonitorAgent/`

### Firestore Security Rules
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Storage Rules
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## macOS Permissions Required

The agent app needs two permissions (macOS will prompt automatically):
- **Screen Recording** — for screenshots (System Settings → Privacy & Security → Screen Recording)
- **Accessibility** — for reading window titles (System Settings → Privacy & Security → Accessibility)

---

## Customization

| What | File | Setting |
|------|------|---------|
| Screenshot interval | `ScreenshotService.swift` | `captureIntervalSeconds = 300` |
| Idle threshold | `IdleDetectionService.swift` | `idleThresholdSeconds = 300` |
| App poll rate | `TrackingManager.swift` | `appTracker.start(pollInterval: 30)` |
| Screenshot quality | `ScreenshotService.swift` | `jpegData(compressionFactor: 0.7)` |
