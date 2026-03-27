# TeamMonitor – Architecture & Firebase Schema

## System Overview

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  macOS Agent (SwiftUI)  │ ──────> │      Firebase Backend     │
│  - Screenshot capture   │         │  - Firestore (DB)         │
│  - App/URL tracking     │         │  - Firebase Storage       │
│  - Idle detection       │         │    (screenshots)          │
│  - Punch in/out UI      │         │  - Firebase Auth          │
└─────────────────────────┘         └────────────┬─────────────┘
                                                 │
                                    ┌────────────▼─────────────┐
                                    │  React Admin Panel        │
                                    │  - Employee dashboard     │
                                    │  - Screenshot viewer      │
                                    │  - Activity/app logs      │
                                    │  - Attendance records     │
                                    └──────────────────────────┘
```

---

## Firebase Collections (Firestore Schema)

### `employees` collection
```
employees/{employeeId}
  - name: string
  - email: string
  - department: string
  - role: string  ("employee" | "admin")
  - createdAt: timestamp
  - isActive: boolean
```

### `sessions` collection
```
sessions/{sessionId}
  - employeeId: string
  - punchIn: timestamp
  - punchOut: timestamp | null
  - date: string  ("YYYY-MM-DD")
  - totalMinutes: number
  - status: string  ("active" | "completed")
```

### `activity_logs` collection
```
activity_logs/{logId}
  - employeeId: string
  - sessionId: string
  - appName: string
  - windowTitle: string
  - startTime: timestamp
  - endTime: timestamp
  - durationSeconds: number
  - date: string
```

### `screenshots` collection
```
screenshots/{screenshotId}
  - employeeId: string
  - sessionId: string
  - timestamp: timestamp
  - storageUrl: string   (Firebase Storage URL)
  - date: string
  - activityLevel: number  (0-100, % of active time)
```

### `idle_logs` collection
```
idle_logs/{logId}
  - employeeId: string
  - sessionId: string
  - idleStart: timestamp
  - idleEnd: timestamp
  - durationSeconds: number
  - date: string
```

---

## Firebase Storage Structure
```
screenshots/
  {employeeId}/
    {date}/
      {timestamp}.jpg
```

---

## macOS Agent Flow
1. Employee opens app → logs in with Firebase Auth
2. Taps "Punch In" → creates a session document in Firestore
3. Background services start:
   - Screenshot timer (every 5 min by default)
   - App tracker (polls active app every 30s)
   - Idle monitor (checks mouse/keyboard activity)
4. Each event is written directly to Firestore
5. Screenshots are uploaded to Firebase Storage, URL saved in Firestore
6. Employee taps "Punch Out" → session is closed

## Admin Panel Flow
1. Admin logs in with Firebase Auth (admin role check)
2. Dashboard shows: active employees, today's hours, total screenshots
3. Can drill into any employee to see their timeline, app usage, screenshots
4. Attendance tab shows daily punch-in/out records
