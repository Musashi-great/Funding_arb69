# Git Repository Connection Guide

## Step 1: After Creating GitHub Repository

If you've created a repository on GitHub, run the following commands:

```bash
cd C:\funding-arbitrage
git remote add origin https://github.com/YOUR_USERNAME/funding-arbitrage.git
git branch -M main
git push -u origin main
```

Replace **YOUR_USERNAME** with your GitHub username.

## Step 2: Connect to Netlify

1. Go to [Netlify](https://app.netlify.com)
2. "Add new site" → "Import an existing project"
3. Select GitHub
4. Select the `funding-arbitrage` repository you just created
5. Build settings:
   - Build command: (leave empty)
   - Publish directory: `.` (or leave empty)
6. "Show advanced" → Click "New variable" to add environment variables:
   - `BYBIT_API_KEY` = `OZwc5A2DRkFVhDCueOvMWYi0GwORQZu0SZuU`
   - `BYBIT_API_SECRET` = `Iobd3CM36UWiUgPgKJ`
7. Click "Deploy site"

## Complete!

After deployment is complete, all APIs will work normally.

