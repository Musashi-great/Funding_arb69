# Funding Rate Arbitrage

A tool to find arbitrage opportunities by comparing funding rate differences across cryptocurrency exchanges.

Compare funding rates across multiple exchanges to identify arbitrage opportunities.

## Exchanges

- Variational
- Binance
- Bybit
- Hyperliquid
- Lighter

## Netlify Deployment

### Environment Variables

Set the following environment variables in Netlify:

- `BYBIT_API_KEY`: Your Bybit API key
- `BYBIT_API_SECRET`: Your Bybit API secret
- `LIGHTER_AUTH_TOKEN`: Your Lighter API token
- `TELEGRAM_BOT_TOKEN`: Telegram bot token (for notifications, optional)
- `TELEGRAM_CHAT_ID`: Telegram chat ID (for notifications, optional)

### Deploy

1. Connect your repository to Netlify
2. Set environment variables in Netlify dashboard
3. Deploy

## Local Development

For local development, you can use Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```

Or simply open `index.html` in a browser (some features may not work without Netlify Functions).

## Telegram Notifications

Receive notifications for the top 5 arbitrage opportunities via Telegram.

### Documentation

- **Production Setup**: [TELEGRAM_SETUP.md](./TELEGRAM_SETUP.md) - Telegram bot setup after Netlify deployment
- **Local Development**: [TELEGRAM_LOCAL_SETUP.md](./TELEGRAM_LOCAL_SETUP.md) - How to test Telegram bot locally

### Quick Setup

1. Create a bot with [@BotFather](https://t.me/botfather) on Telegram
2. Get bot token and chat ID
3. Set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Netlify environment variables
4. Configure scheduling (hourly or based on funding intervals)

### Local Testing

To test the Telegram bot locally:

**Using PowerShell Script Only (Recommended - No Node.js Required):**
```powershell
# Standalone execution with PowerShell script only
# Works without Netlify Functions
.\test-telegram-local.ps1
```

This script:
- ✅ **Standalone**: Works without Netlify Functions or Node.js
- ✅ **All Exchanges Supported**: Directly fetches data from Variational, Binance, Bybit, Hyperliquid
- ✅ **Real Data Processing**: Fetches data directly from exchange APIs and calculates arbitrage opportunities
- ✅ **Telegram Sending**: Sends top 3 calculated opportunities via Telegram

**Script Configuration:**
1. Open `test-telegram-local.ps1` file and modify bot token and chat ID at the top:
   ```powershell
   $TELEGRAM_BOT_TOKEN = "YOUR_BOT_TOKEN"
   $TELEGRAM_CHAT_ID = "YOUR_CHAT_ID"
   ```
2. Run in PowerShell:
   ```powershell
   .\test-telegram-local.ps1
   ```

**Using Node.js (Optional):**
```bash
# Run simple test script
node test-telegram-local.js

# Use Netlify CLI + ngrok (webhook testing)
# See TELEGRAM_LOCAL_SETUP.md for details
```

For more details, see `TELEGRAM_SETUP.md` and `TELEGRAM_LOCAL_SETUP.md` files.
