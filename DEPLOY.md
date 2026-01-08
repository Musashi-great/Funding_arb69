# Netlify Deployment Guide

## Method 1: Connect Git Repository (Recommended - Functions Work)

### 1. Create GitHub Repository
1. Log in to GitHub
2. Click "New repository"
3. Repository name: `funding-arbitrage`
4. Click "Create repository"

### 2. Initialize Git and Push Locally
```bash
cd C:\funding-arbitrage
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/funding-arbitrage.git
git push -u origin main
```

### 3. Connect to Netlify
1. Go to [Netlify](https://app.netlify.com)
2. "Add new site" → "Import an existing project"
3. Select GitHub and choose repository
4. Build settings:
   - Build command: (leave empty)
   - Publish directory: `.` (or leave empty)
5. Click "Show advanced" → Click "New variable" to add environment variables:
   - `BYBIT_API_KEY` = `OZwc5A2DRkFVhDCueOvMWYi0GwORQZu0SZuU`
   - `BYBIT_API_SECRET` = `Iobd3CM36UWiUgPgKJ`
   - `LIGHTER_AUTH_TOKEN` = `ro:92374:single:1854227934:d2a84b224e888823ecb03dc3e90b3cefd0802253ceb8cc9456c6aec01d551cb2`
   - `TELEGRAM_BOT_TOKEN` = `8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0` (if using Telegram notifications)
   - `TELEGRAM_CHAT_ID` = `1374527604` (if using Telegram notifications)
6. Click "Deploy site"

## Method 2: Drag and Drop (Simple but Functions Don't Work)

1. Go to [Netlify](https://app.netlify.com)
2. "Add new site" → "Deploy manually"
3. Drag and drop `C:\funding-arbitrage` folder
4. Deployment complete

⚠️ **Warning**: This method doesn't work with Netlify Functions, so Bybit API won't work.

## Environment Variables Setup (When Using Method 1)

In Netlify dashboard:
1. Site settings → Environment variables
2. Add the following variables:
   - `BYBIT_API_KEY`: `OZwc5A2DRkFVhDCueOvMWYi0GwORQZu0SZuU`
   - `BYBIT_API_SECRET`: `Iobd3CM36UWiUgPgKJ`
   - `LIGHTER_AUTH_TOKEN`: `ro:92374:single:1854227934:d2a84b224e888823ecb03dc3e90b3cefd0802253ceb8cc9456c6aec01d551cb2`
   - `TELEGRAM_BOT_TOKEN`: `8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0` (if using Telegram notifications)
   - `TELEGRAM_CHAT_ID`: `1374527604` (if using Telegram notifications)

## Verification

After deployment:
- ✅ Variational API works
- ✅ Binance API works
- ✅ Bybit API works (when Git connected)
- ✅ Hyperliquid API works (when Git connected)
- ✅ Lighter API works (when Git connected)
- ✅ Telegram notifications work (when environment variables are set)

## Telegram Notification Test

Test with the following URL after deployment:
```
https://your-site.netlify.app/.netlify/functions/sendTelegramNotification
```

Or you can test locally by opening the `test-telegram-bot.html` file.

