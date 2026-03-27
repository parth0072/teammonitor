# TeamMonitor — cPanel Deployment Guide

## Overview
One Node.js app on your cPanel that serves **both the API and admin dashboard**.
Uses MySQL (cPanel's built-in database — no extra software needed).

---

## Step 1 — Create MySQL Database in cPanel

1. In cPanel → **MySQL Databases**
2. Create a new database, e.g. `yourusername_teammonitor`
3. Create a new user, e.g. `yourusername_tmuser` with a strong password
4. Add the user to the database → grant **All Privileges**
5. Note down:
   - Database name: `yourusername_teammonitor`
   - Username: `yourusername_tmuser`
   - Password: *(what you set)*
   - Host: `localhost`

---

## Step 2 — Upload the zip

1. cPanel → **File Manager** → go to your **home directory** (e.g. `/home/yourusername/`)
   ⚠️ Do NOT put it inside `public_html`
2. Click **Upload** → upload `teammonitor_cpanel.zip`
3. Right-click the zip → **Extract** → creates `teammonitor/server/`

---

## Step 3 — Edit the .env file

1. In File Manager, open `teammonitor/server/.env`
2. Fill in your database details:

```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=yourusername_teammonitor
DB_USER=yourusername_tmuser
DB_PASS=your_db_password

JWT_SECRET=any_long_random_string_here_make_it_unique
JWT_EXPIRES_IN=7d

BASE_URL=https://yourdomain.com
```

3. Save the file.

---

## Step 4 — Set up Node.js App

1. cPanel → **"Setup Node.js App"** (Software section)
2. Click **"Create Application"**

| Field | Value |
|---|---|
| Node.js version | **18** or **20** (highest available) |
| Application mode | **Production** |
| Application root | `teammonitor/server` |
| Application URL | your domain (e.g. `yourdomain.com`) |
| Application startup file | `index.js` |

3. Click **Create**

---

## Step 5 — Install dependencies

In the Node.js App panel, click **"Run NPM Install"**

This installs only pure-JS packages (mysql2, express, etc.) — no compilation needed. Should finish in under a minute.

---

## Step 6 — Start the app

1. Click **"Start App"**
2. Open `https://yourdomain.com` in your browser

---

## Login

| | |
|---|---|
| **URL** | `https://yourdomain.com` |
| **Email** | `admin@teammonitor.local` |
| **Password** | `Admin1234` |

> Change the password after first login via the Employees page.

---

## Update macOS agent to point to your domain

In `macos-agent/TeamMonitorAgent/Services/APIService.swift`, change:
```swift
private let baseURL = "http://localhost:3001/api"
```
to:
```swift
private let baseURL = "https://yourdomain.com/api"
```
Then rebuild in Xcode.

---

## Troubleshooting

**"Application Error" / app won't start**
→ Check cPanel → Node.js App → Logs
→ Make sure `.env` file has correct DB credentials
→ Click "Run NPM Install" again

**Can't login / JWT error**
→ Make sure `JWT_SECRET` is set in `.env`

**Database connection error**
→ Double-check DB_NAME, DB_USER, DB_PASS in `.env`
→ Make sure the MySQL user has All Privileges on the database

**Screenshots not saving**
→ In File Manager, right-click `teammonitor/server/uploads` → Permissions → set to `755`

---

## Folder structure on server
```
/home/yourusername/
  teammonitor/
    server/
      index.js        ← Node.js entry point
      db.js           ← Auto MySQL/SQLite adapter
      .env            ← Your credentials (keep private!)
      public/         ← Built React admin dashboard
      routes/         ← API routes
      uploads/        ← Screenshot storage
      package.json    ← mysql2 only (no native modules)
```
