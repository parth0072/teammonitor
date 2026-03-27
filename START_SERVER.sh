#!/bin/bash
# Start the Node.js backend server locally
cd "$(dirname "$0")/server"

if [ ! -f ".env" ]; then
  cp .env.example .env
  echo "⚠  Created server/.env — edit it with your MySQL credentials before running."
  echo "   Then re-run this script."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo "📦 Installing server dependencies..."
  npm install
fi

echo ""
echo "🚀 Starting TeamMonitor API server..."
echo "   → http://localhost:3001/api/health"
echo ""
npm start
