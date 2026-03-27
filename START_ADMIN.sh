#!/bin/bash
# Start the Admin Panel
# Usage: bash START_ADMIN.sh

cd "$(dirname "$0")/admin-panel"

if [ ! -f ".env" ]; then
  echo "⚠  No .env file found. Run 'bash setup.sh' first, or copy .env.example to .env and fill in your Firebase values."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "📦 Installing dependencies..."
  npm install --legacy-peer-deps
fi

echo ""
echo "🚀 Starting TeamMonitor Admin Panel..."
echo "   → Opens at http://localhost:3000"
echo ""
npm run dev
