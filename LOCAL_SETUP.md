# Local Testing Environment Setup Guide

How to test the Funding Rate Arbitrage site locally.

## Method 1: Using Python (Simplest)

### If Python 3 is installed:

1. **Open Terminal/Command Prompt**
   - Windows: `Win + R` → type `cmd` → Enter
   - Or use PowerShell

2. **Navigate to project folder**
   ```bash
   cd C:\funding-arbitrage
   ```

3. **Run local server**
   ```bash
   python -m http.server 8000
   ```
   
   Or if using Python 2:
   ```bash
   python -m SimpleHTTPServer 8000
   ```

4. **Access in browser**
   - Type in address bar: `http://localhost:8000`
   - Or: `http://127.0.0.1:8000`

5. **Stop server**
   - Press `Ctrl + C` in terminal

---

## Method 2: Using Node.js

### If Node.js is installed:

1. **Open Terminal/Command Prompt**

2. **Navigate to project folder**
   ```bash
   cd C:\funding-arbitrage
   ```

3. **Install http-server (one time only)**
   ```bash
   npm install -g http-server
   ```

4. **Run local server**
   ```bash
   http-server -p 8000
   ```

5. **Access in browser**
   - Type in address bar: `http://localhost:8000`

6. **Stop server**
   - Press `Ctrl + C` in terminal

---

## Method 3: Using VS Code Live Server Extension

### If using VS Code:

1. **Open project folder in VS Code**
   - `File` → `Open Folder` → select `C:\funding-arbitrage`

2. **Install Live Server extension**
   - Click extension icon in left sidebar (or `Ctrl + Shift + X`)
   - Search for "Live Server"
   - Install "Live Server" (by Ritwick Dey)

3. **Run server**
   - Right-click `index.html` file
   - Select "Open with Live Server"
   - Browser will open automatically

4. **Stop server**
   - Click "Go Live" button in VS Code bottom status bar

---

## Method 4: Using PHP (If PHP is installed)

1. **Open Terminal/Command Prompt**

2. **Navigate to project folder**
   ```bash
   cd C:\funding-arbitrage
   ```

3. **Run local server**
   ```bash
   php -S localhost:8000
   ```

4. **Access in browser**
   - Type in address bar: `http://localhost:8000`

---

## Test Verification

When local server is running:

1. **Open browser developer tools**
   - Press `F12` or `Ctrl + Shift + I` (Windows)
   - `Cmd + Option + I` (Mac)

2. **Check Console tab**
   - Check API call logs
   - Check error messages

3. **Check Network tab**
   - Check API request status
   - Check response data

---

## Notes

- **CORS Issues**: Some APIs may cause CORS errors when called directly from browser.
  - Opening with `file://` protocol may work with relaxed CORS restrictions.
  - Running with `http://localhost` applies strict CORS policy.
  - **Solution**: Use Netlify CLI to run Functions locally to resolve CORS issues (see "Method 5" below).

- **API Key Security**: When testing locally, Bybit API keys are visible in browser developer tools.
  - When deployed, they are only used server-side through Netlify Functions.

- **Port Number**: If port 8000 is already in use, use a different port.
  - Example: `python -m http.server 8080`

---

## Method 5: Using Netlify CLI (Recommended - Resolves CORS Issues)

If CORS issues occur with local server, using Netlify CLI can run Functions together to resolve CORS issues.

### Install and Use Netlify CLI:

1. **Check Node.js installation**
   - Node.js must be installed.

2. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

3. **Navigate to project folder**
   ```bash
   cd C:\funding-arbitrage
   ```

4. **Run Netlify Dev server**
   ```bash
   netlify dev
   ```
   
   Or to run Functions only:
   ```bash
   netlify dev --live
   ```

5. **Access in browser**
   - Netlify CLI will automatically display URL (usually `http://localhost:8888`)
   - Or access the displayed URL

6. **Stop server**
   - Press `Ctrl + C` in terminal

### Advantages:
- ✅ Netlify Functions work locally
- ✅ Resolves CORS issues
- ✅ Test in same environment as production

### Disadvantages:
- ⚠️ Requires Node.js and Netlify CLI installation

---

## Troubleshooting

### "Port is already in use" error
- Use different port number: `python -m http.server 8080`
- Or close program using that port

### "Python not found" error
- Check if Python is installed
- Or use other method (Node.js, VS Code Live Server)

### API data not loading
- Check errors in browser developer tools Console tab
- Check API request status in Network tab
- Check internet connection

---

## Quick Start (Using Python)

```bash
# 1. Navigate to project folder
cd C:\funding-arbitrage

# 2. Run server
python -m http.server 8000

# 3. Access http://localhost:8000 in browser
```
