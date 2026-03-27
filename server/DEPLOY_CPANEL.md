# Deploy TeamMonitor Server to cPanel

## Step 1 — Create MySQL Database

1. cPanel → **MySQL Databases**
2. Create database: `youruser_teammonitor`
3. Create user: `youruser_tmuser` with a strong password
4. Add user to database → grant **All Privileges**
5. Open **phpMyAdmin** → select the database → **SQL** tab → paste contents of `schema.sql` → Go

---

## Step 2 — Upload the server files

Upload the entire `server/` folder to your cPanel home directory.
Recommended path: `~/teammonitor-server/`

Using File Manager or FTP:
```
~/teammonitor-server/
  index.js
  db.js
  package.json
  .env            ← create this (see Step 3)
  routes/
  middleware/
  uploads/        ← must be writable (chmod 755)
```

---

## Step 3 — Create .env on the server

SSH into cPanel or use Terminal, then:
```bash
cd ~/teammonitor-server
cp .env.example .env
nano .env
```

Fill in:
```
DB_HOST=localhost
DB_PORT=3306
DB_NAME=youruser_teammonitor
DB_USER=youruser_tmuser
DB_PASS=your_db_password

JWT_SECRET=some_very_long_random_string_here
JWT_EXPIRES_IN=7d

PORT=3001
BASE_URL=https://yourdomain.com
```

---

## Step 4 — Install dependencies

```bash
cd ~/teammonitor-server
npm install --production
```

---

## Step 5 — Set up Node.js in cPanel

1. cPanel → **Setup Node.js App**
2. Click **Create Application**
   - Node.js version: 18+ (or latest available)
   - Application mode: Production
   - Application root: `teammonitor-server`
   - Application URL: your domain or subdomain (e.g. `monitor.yourdomain.com`)
   - Application startup file: `index.js`
3. Click **Create**
4. Click **Run NPM Install** (if not done via SSH)
5. Click **Start Application**

---

## Step 6 — Create first admin user

Run this once via SSH:
```bash
cd ~/teammonitor-server
node -e "
const bcrypt = require('bcryptjs');
const db = require('./db');
require('dotenv').config();

(async () => {
  const hash = await bcrypt.hash('YourPassword123', 10);
  await db.query(
    'INSERT INTO employees (name, email, password, role) VALUES (?, ?, ?, ?)',
    ['Admin', 'admin@yourdomain.com', hash, 'admin']
  );
  console.log('Admin created!');
  process.exit(0);
})();
"
```

---

## Step 7 — Update admin panel API URL

Edit `admin-panel/.env`:
```
VITE_API_URL=https://yourdomain.com/api
```

Then rebuild:
```bash
cd admin-panel
npm run build
```

Upload the `admin-panel/dist/` folder to `public_html/` (or a subdirectory).

---

## Step 8 — Update macOS agent API URL

In `APIService.swift`, change line 8:
```swift
let API_BASE = "https://yourdomain.com/api"
```

Rebuild the macOS app in Xcode.

---

## Test the deployment

```bash
curl https://yourdomain.com/api/health
# Should return: {"status":"ok","db":"connected",...}
```
