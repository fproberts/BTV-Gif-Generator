#!/bin/bash

# BTV Gif Generator - Local Hosting Helper

echo "🚀 Setting up BTV Gif Generator for Local Hosting..."

# 1. Install Dependencies
echo "📦 Installing Node dependencies..."
npm install

# 2. Build for Production
echo "🏗️  Building the application..."
npm run build

# 3. Check for PM2
if ! command -v pm2 &> /dev/null; then
    echo "⚙️  PM2 not found. Installing globally..."
    npm install -g pm2
fi

# 4. Start App
echo "🟢 Starting app with PM2..."
# Check if already running
if pm2 list | grep -q "btv-app"; then
    echo "   Restarting existing process..."
    pm2 restart btv-app
else
    echo "   Starting new process..."
    pm2 start npm --name "btv-app" -- start
fi

# 5. Save Process List (Runs on reboot if configured)
pm2 save

echo ""
echo "✅ App is running in the background!"
echo "👉 Local Access: http://localhost:3000"
echo "👉 View Logs:    pm2 logs btv-app"
echo "👉 Stop App:     pm2 stop btv-app"
echo ""
echo "🌍 To make it public, run a tunnel:"
echo "   npx pagekite.py 3000 yourname.pagekite.me"
echo "   OR use Cloudflare/Ngrok (See hosting-guide.md)"
