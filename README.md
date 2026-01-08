# Funding Rate Arbitrage

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
