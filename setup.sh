#!/bin/bash
# TeamMonitor – One-Command Setup Script
# Run this from the TeamMonitor/ folder: bash setup.sh

set -e

BOLD="\033[1m"
GREEN="\033[32m"
BLUE="\033[34m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

banner() {
  echo ""
  echo -e "${BOLD}${BLUE}══════════════════════════════════════════${RESET}"
  echo -e "${BOLD}${BLUE}        TeamMonitor Setup Wizard          ${RESET}"
  echo -e "${BOLD}${BLUE}══════════════════════════════════════════${RESET}"
  echo ""
}

step() { echo -e "\n${BOLD}${GREEN}▶ $1${RESET}"; }
warn()  { echo -e "  ${YELLOW}⚠ $1${RESET}"; }
ok()    { echo -e "  ${GREEN}✓ $1${RESET}"; }
err()   { echo -e "  ${RED}✗ $1${RESET}"; exit 1; }
skip()  { echo -e "  ${BLUE}↩ $1 (already done — skipping)${RESET}"; }

banner

# ── STEP 1: Check prerequisites ──────────────────────────────────────────────
step "Checking prerequisites"

if ! command -v node &>/dev/null; then
  err "Node.js not found. Install from https://nodejs.org (LTS version recommended)"
fi
ok "Node.js $(node --version)"

if ! command -v npm &>/dev/null; then
  err "npm not found. It usually comes with Node.js."
fi
ok "npm $(npm --version)"

if ! command -v xcodebuild &>/dev/null; then
  warn "Xcode not found. Install it from the App Store to build the macOS agent."
else
  ok "Xcode $(xcodebuild -version 2>/dev/null | head -1)"
fi

# ── STEP 2: Firebase config ───────────────────────────────────────────────────
step "Firebase Configuration"

if [ -f "admin-panel/.env" ]; then
  skip "admin-panel/.env already exists"
  # Load existing values so later steps can use them
  source admin-panel/.env
  FB_API_KEY="$VITE_FIREBASE_API_KEY"
  FB_AUTH_DOMAIN="$VITE_FIREBASE_AUTH_DOMAIN"
  FB_PROJECT_ID="$VITE_FIREBASE_PROJECT_ID"
  FB_STORAGE_BUCKET="$VITE_FIREBASE_STORAGE_BUCKET"
  FB_SENDER_ID="$VITE_FIREBASE_MESSAGING_SENDER_ID"
  FB_APP_ID="$VITE_FIREBASE_APP_ID"
else
  echo ""
  echo -e "  ${BOLD}You need a Firebase project. If you don't have one:${RESET}"
  echo -e "  1. Go to ${BLUE}https://console.firebase.google.com${RESET}"
  echo -e "  2. Create a project → Enable Auth (Email/Password), Firestore, Storage"
  echo -e "  3. Go to Project Settings → General → Add a Web App"
  echo -e "  4. Copy the config values below"
  echo ""

  read -p "  Paste your Firebase API Key: " FB_API_KEY
  read -p "  Firebase Auth Domain (e.g. myapp.firebaseapp.com): " FB_AUTH_DOMAIN
  read -p "  Firebase Project ID: " FB_PROJECT_ID
  read -p "  Firebase Storage Bucket (e.g. myapp.appspot.com): " FB_STORAGE_BUCKET
  read -p "  Firebase Messaging Sender ID: " FB_SENDER_ID
  read -p "  Firebase App ID (1:xxx:web:xxx): " FB_APP_ID

  cat > admin-panel/.env <<EOF
VITE_FIREBASE_API_KEY=$FB_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=$FB_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=$FB_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=$FB_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=$FB_SENDER_ID
VITE_FIREBASE_APP_ID=$FB_APP_ID
EOF
  ok "Created admin-panel/.env"
fi

# ── STEP 3: Install admin panel deps ─────────────────────────────────────────
step "Installing Admin Panel dependencies"

if [ -d "admin-panel/node_modules" ]; then
  skip "node_modules already installed"
else
  cd admin-panel
  npm install --legacy-peer-deps
  ok "npm packages installed"
  cd ..
fi

# ── STEP 4: GoogleService-Info.plist for macOS agent ─────────────────────────
step "GoogleService-Info.plist for macOS Agent"

PLIST_PATH="macos-agent/TeamMonitorAgent/GoogleService-Info.plist"

if [ -f "$PLIST_PATH" ] && ! grep -q "YOUR_API_KEY" "$PLIST_PATH"; then
  skip "$PLIST_PATH already configured"
else
  echo ""
  echo -e "  ${BOLD}A few extra values for the macOS app.${RESET}"
  echo -e "  Firebase Console → Project Settings → Add App → Apple (macOS)"
  echo -e "  Bundle ID: ${BLUE}com.yourcompany.TeamMonitorAgent${RESET}"
  echo ""
  read -p "  Google App ID from plist (1:xxx:ios:xxx): " GOOGLE_APP_ID
  read -p "  Reversed Client ID (com.googleusercontent.apps.xxx): " REVERSED_CLIENT_ID

  cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>API_KEY</key>            <string>$FB_API_KEY</string>
  <key>GCM_SENDER_ID</key>     <string>$FB_SENDER_ID</string>
  <key>PLIST_VERSION</key>     <string>1</string>
  <key>BUNDLE_ID</key>         <string>com.yourcompany.TeamMonitorAgent</string>
  <key>PROJECT_ID</key>        <string>$FB_PROJECT_ID</string>
  <key>STORAGE_BUCKET</key>    <string>$FB_STORAGE_BUCKET</string>
  <key>IS_ADS_ENABLED</key>    <false/>
  <key>IS_ANALYTICS_ENABLED</key><false/>
  <key>IS_GCM_ENABLED</key>    <true/>
  <key>IS_SIGNIN_ENABLED</key> <true/>
  <key>GOOGLE_APP_ID</key>     <string>$GOOGLE_APP_ID</string>
  <key>REVERSED_CLIENT_ID</key><string>$REVERSED_CLIENT_ID</string>
  <key>CLIENT_ID</key>         <string>$(echo "$REVERSED_CLIENT_ID" | awk -F'apps.' '{print $2}').apps.googleusercontent.com</string>
</dict>
</plist>
EOF
  ok "Created $PLIST_PATH"
fi

# ── STEP 5: Firestore rules reminder ─────────────────────────────────────────
step "Firestore & Storage Security Rules"
echo ""
echo -e "  ${YELLOW}If you haven't already, paste these into Firebase Console:${RESET}"
echo -e "  ${YELLOW}Firestore → Rules:${RESET}"
cat << 'RULES'

  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /{document=**} {
        allow read, write: if request.auth != null;
      }
    }
  }

RULES
echo -e "  ${YELLOW}Storage → Rules:${RESET}"
cat << 'RULES'

  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /{allPaths=**} {
        allow read, write: if request.auth != null;
      }
    }
  }

RULES

# ── STEP 6: Create first admin user ──────────────────────────────────────────
step "Create Admin User"

# Check if a .setup_done marker exists (written after successful user creation)
if [ -f ".admin_created" ]; then
  skip "Admin user already created"
else
  echo ""
  read -p "  Admin email address: " ADMIN_EMAIL
  read -s -p "  Admin password (min 6 chars): " ADMIN_PASS
  echo ""
  read -p "  Admin display name: " ADMIN_NAME

  CREATE_RESP=$(curl -s -X POST \
    "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=$FB_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\",\"returnSecureToken\":true}")

  FB_UID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('localId','ERROR'))" 2>/dev/null)

  if [[ "$FB_UID" == "ERROR" ]] || [[ -z "$FB_UID" ]]; then
    warn "Could not auto-create user. Create manually in Firebase Console → Authentication → Add User."
    warn "Then add a document in Firestore 'employees' collection with your uid, name, email, role: admin"
  else
    ok "Firebase Auth user created (uid: $FB_UID)"

    FIRESTORE_URL="https://firestore.googleapis.com/v1/projects/$FB_PROJECT_ID/databases/(default)/documents/employees"
    ID_TOKEN=$(echo "$CREATE_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('idToken',''))" 2>/dev/null)

    curl -s -X POST "$FIRESTORE_URL" \
      -H "Authorization: Bearer $ID_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"fields\": {
          \"uid\":        {\"stringValue\": \"$FB_UID\"},
          \"name\":       {\"stringValue\": \"$ADMIN_NAME\"},
          \"email\":      {\"stringValue\": \"$ADMIN_EMAIL\"},
          \"role\":       {\"stringValue\": \"admin\"},
          \"department\": {\"stringValue\": \"Management\"},
          \"isActive\":   {\"booleanValue\": true}
        }
      }" > /dev/null

    ok "Admin employee record created in Firestore"
    touch .admin_created
  fi
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
echo -e "${BOLD}${GREEN}         Setup Complete! 🎉              ${RESET}"
echo -e "${BOLD}${GREEN}══════════════════════════════════════════${RESET}"
echo ""
echo -e "${BOLD}Next steps:${RESET}"
echo ""
echo -e "  ${BLUE}1. Start the Admin Panel:${RESET}"
echo -e "     bash START_ADMIN.sh"
echo -e "     → Opens at http://localhost:3000"
echo ""
echo -e "  ${BLUE}2. Open macOS Agent in Xcode:${RESET}"
echo -e "     bash OPEN_XCODE.sh"
echo -e "     → Press ⌘R to build and run"
echo ""
echo -e "  ${BLUE}3. Add employees from the admin panel:${RESET}"
echo -e "     Employees → Add Employee → share credentials + app with your team"
echo ""
