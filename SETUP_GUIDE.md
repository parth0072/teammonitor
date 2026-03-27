# TeamMonitor – Setup Guide

## Prerequisites
- Xcode 15+ (for macOS agent)
- Node.js 18+ and npm (for admin panel)
- A Firebase project (free Spark plan works to start)

---

## Step 1 — Create a Firebase Project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Name it (e.g., `teammonitor-prod`)
3. Enable Google Analytics if desired → **Create project**

### Enable Authentication
- Firebase Console → **Authentication** → **Get started**
- Enable **Email/Password** provider

### Enable Firestore
- Firebase Console → **Firestore Database** → **Create database**
- Choose **production mode** → select a region closest to you

### Enable Storage
- Firebase Console → **Storage** → **Get started**
- Use default rules for now (you'll tighten these later)

### Set Firestore Security Rules
Paste these rules under Firestore → Rules:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Employees can read their own record
    match /employees/{empId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    // Authenticated users can write their own data
    match /sessions/{id} {
      allow read, write: if request.auth != null;
    }
    match /activity_logs/{id} {
      allow read, write: if request.auth != null;
    }
    match /screenshots/{id} {
      allow read, write: if request.auth != null;
    }
    match /idle_logs/{id} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### Set Storage Security Rules
Under Storage → Rules:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /screenshots/{allPaths=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

---

## Step 2 — Set Up the Admin Panel (React)

```bash
cd admin-panel

# Copy and fill in your Firebase config
cp .env.example .env
# Edit .env with your values from Firebase Console → Project Settings → General

npm install
npm start
```

### Deploy to Firebase Hosting (optional)
```bash
npm install -g firebase-tools
firebase login
firebase init hosting   # choose admin-panel/build as public directory
npm run build
firebase deploy
```

### Create First Admin User
1. Go to Firebase Console → Authentication → Add user
2. Enter your admin email & password
3. In Firestore, create a document in `employees` collection:
   ```json
   {
     "uid": "paste-uid-from-auth",
     "name": "Admin Name",
     "email": "admin@company.com",
     "department": "Management",
     "role": "admin",
     "isActive": true
   }
   ```

---

## Step 3 — Set Up the macOS Agent (Swift/Xcode)

### 3a. Add Firebase to your Xcode project

1. Open Xcode → Create a new **macOS App** project
   - Product Name: `TeamMonitorAgent`
   - Interface: SwiftUI
   - Bundle ID: `com.yourcompany.TeamMonitorAgent`

2. Add Firebase SDK via Swift Package Manager:
   - File → Add Packages → `https://github.com/firebase/firebase-ios-sdk`
   - Select: `FirebaseAuth`, `FirebaseFirestore`, `FirebaseStorage`

3. Download `GoogleService-Info.plist` from Firebase Console:
   - Project Settings → General → Your apps → **Add app** → macOS
   - Download the plist and drag it into your Xcode project

### 3b. Add the source files

Copy all `.swift` files from `macos-agent/TeamMonitorAgent/` into your Xcode project:
- `TeamMonitorAgentApp.swift`
- `ContentView.swift`
- `Services/FirebaseService.swift`
- `Services/ScreenshotService.swift`
- `Services/AppTrackingService.swift`
- `Services/IdleDetectionService.swift`
- `Services/TrackingManager.swift`
- `Views/LoginView.swift`
- `Views/TrackingDashboardView.swift`
- `Models/TrackingModels.swift`

### 3c. Add required entitlements

In your `.entitlements` file, add:
```xml
<key>com.apple.security.automation.apple-events</key><true/>
<key>com.apple.security.files.user-selected.read-write</key><true/>
```

For screen recording, add to Info.plist:
```xml
<key>NSScreenCaptureUsageDescription</key>
<string>TeamMonitor captures screenshots to verify work activity.</string>
<key>NSAppleEventsUsageDescription</key>
<string>TeamMonitor reads active window titles for activity tracking.</string>
```

### 3d. Build & Run
- Select target: **My Mac** → ⌘R to run
- The app will show a login screen — use employee credentials created from the admin panel

---

## Step 4 — Add Employees

1. Log in to the **Admin Panel**
2. Go to **Employees** → **Add Employee**
3. Fill in name, email, department, and a temporary password
4. Give the employee the macOS agent app and their login credentials

---

## File Structure Reference

```
TeamMonitor/
├── ARCHITECTURE.md          ← Firebase schema & system diagram
├── SETUP_GUIDE.md           ← This file
├── admin-panel/             ← React web app
│   ├── src/
│   │   ├── firebase.js
│   │   ├── App.jsx
│   │   └── pages/
│   │       ├── Login.jsx
│   │       ├── Dashboard.jsx
│   │       ├── Employees.jsx
│   │       ├── EmployeeDetail.jsx
│   │       ├── Screenshots.jsx
│   │       └── Attendance.jsx
│   ├── .env.example
│   └── package.json
└── macos-agent/
    └── TeamMonitorAgent/
        ├── TeamMonitorAgentApp.swift
        ├── ContentView.swift
        ├── Services/
        │   ├── FirebaseService.swift
        │   ├── ScreenshotService.swift
        │   ├── AppTrackingService.swift
        │   ├── IdleDetectionService.swift
        │   └── TrackingManager.swift
        ├── Views/
        │   ├── LoginView.swift
        │   └── TrackingDashboardView.swift
        └── Models/
            └── TrackingModels.swift
```

---

## Customization Options

| Setting | Location | Default |
|---------|----------|---------|
| Screenshot interval | `ScreenshotService.swift` → `captureIntervalSeconds` | 300s (5 min) |
| Idle threshold | `IdleDetectionService.swift` → `idleThresholdSeconds` | 300s (5 min) |
| App poll interval | `TrackingManager.swift` → `appTracker.start(pollInterval:)` | 30s |
| JPEG quality | `ScreenshotService.swift` → `jpegData(compressionFactor:)` | 0.7 |
