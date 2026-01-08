// Elegant double-headed arrow SVG for arbitrage display
const ARROW_SEPARATOR_SVG = `<svg viewBox="0 0 40 16" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <linearGradient id="arrowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#22C55E;stop-opacity:0.8" />
            <stop offset="50%" style="stop-color:#6B7280;stop-opacity:0.6" />
            <stop offset="100%" style="stop-color:#EF4444;stop-opacity:0.8" />
        </linearGradient>
    </defs>
    <line x1="4" y1="8" x2="36" y2="8" stroke="url(#arrowGrad)" stroke-width="1.5" stroke-linecap="round"/>
    <polygon points="4,8 9,5 9,11" fill="#22C55E" opacity="0.8"/>
    <polygon points="36,8 31,5 31,11" fill="#EF4444" opacity="0.8"/>
</svg>`;

// Exchange API configuration
const EXCHANGES = {
    variational: {
        name: 'Variational',
        baseUrl: 'https://omni-client-api.prod.ap-northeast-1.variational.io',
        endpoint: '/metadata/stats',
        fundingIntervalHours: 8
    },
    binance: {
        name: 'Binance',
        baseUrl: 'https://fapi.binance.com',
        endpoint: '/fapi/v1/premiumIndex',
        fundingIntervalHours: 8
    },
    bybit: {
        name: 'Bybit',
        baseUrl: 'https://api.bybit.com',
        endpoint: '/v5/market/tickers',
        fundingIntervalHours: 8
    },
    hyperliquid: {
        name: 'Hyperliquid',
        baseUrl: 'https://api.hyperliquid.xyz',
        endpoint: '/info',
        fundingIntervalHours: 1 // Hyperliquid funding is applied hourly
    },
    lighter: {
        name: 'Lighter',
        baseUrl: 'https://mainnet.zklighter.elliot.ai',
        wsUrl: 'wss://mainnet.zklighter.elliot.ai/stream', // WebSocket URL for market_stats (requires /stream path)
        endpoint: '/api/v1/orderBooks', // OrderApi.order_books - get data about all markets' orderbooks
        fundingIntervalHours: 1 // Lighter funding is applied hourly (1 hour intervals)
    }
};

// API keys for local testing (will be moved to Netlify Functions for production)
const BYBIT_API_KEY = 'OZwc5A2DRkFVhDCueOvMWYi0GwORQZu0SZuU';
const BYBIT_API_SECRET = 'Iobd3CM36UWiUgPgKJ';
const LIGHTER_AUTH_TOKEN = 'ro:92374:single:1854227934:d2a84b224e888823ecb03dc3e90b3cefd0802253ceb8cc9456c6aec01d551cb2';

// Function to generate HMAC SHA256 signature for Bybit (client-side for local testing)
async function generateBybitSignature(params, timestamp, queryString) {
    const finalQueryString = queryString || Object.keys(params)
        .sort()
        .map(key => `${key}=${params[key]}`)
        .join('&');
    
    const signaturePayload = `${timestamp}${BYBIT_API_KEY}${finalQueryString}`;
    
    const encoder = new TextEncoder();
    const keyData = encoder.encode(BYBIT_API_SECRET);
    const messageData = encoder.encode(signaturePayload);
    
    const cryptoKey = await crypto.subtle.importKey(
        'raw',
        keyData,
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const hashArray = Array.from(new Uint8Array(signature));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Debug mode flag - set to false in production
const DEBUG_MODE = false;

let allPairs = [];
let currentSort = { column: null, direction: null };
let displayMode = 'interval'; // 'annual' or 'interval' - default: show interval rate first (4hr, 8hr, etc.)

// Helper function to extract funding interval from API response
function extractInterval(item, defaultInterval) {
    if (item.fundingInterval !== undefined) {
        return parseFloat(item.fundingInterval) || defaultInterval;
    } else if (item.interval !== undefined) {
        return parseFloat(item.interval) || defaultInterval;
    } else if (item.fundingIntervalHours !== undefined) {
        return parseFloat(item.fundingIntervalHours) || defaultInterval;
    } else if (item.intervalHours !== undefined) {
        return parseFloat(item.intervalHours) || defaultInterval;
    } else if (item.fundingIntervalSeconds !== undefined) {
        return parseFloat(item.fundingIntervalSeconds) / 3600 || defaultInterval;
    } else if (item.intervalSeconds !== undefined) {
        return parseFloat(item.intervalSeconds) / 3600 || defaultInterval;
    }
    return defaultInterval;
}

// Helper function to extract rate and interval from exchange data
function extractExchangeData(dataItem, defaultInterval) {
    if (!dataItem) return { rate: null, interval: defaultInterval };
    if (typeof dataItem === 'object' && dataItem.rate !== undefined) {
        return { rate: dataItem.rate, interval: dataItem.interval || defaultInterval };
    }
    return { rate: dataItem, interval: defaultInterval };
}

// Fetch Variational data
async function fetchVariationalData() {
    try {
        const response = await fetch(`${EXCHANGES.variational.baseUrl}${EXCHANGES.variational.endpoint}`);
        if (!response.ok) {
            throw new Error(`Variational API error: ${response.status}`);
        }
        const data = await response.json();
        
        // Debug: Log API response structure
        if (DEBUG_MODE && data.listings && data.listings.length > 0) {
            console.log('Sample Variational API response:', JSON.stringify(data.listings[0], null, 2));
        }
        
        const pairs = {};
        if (data.listings && Array.isArray(data.listings)) {
            data.listings.forEach(listing => {
                const ticker = listing.ticker;
                if (!ticker) return;
                
                // Get funding_interval_s (in seconds), convert to hours
                // Example: 28800 seconds = 8 hours
                const fundingIntervalSeconds = listing.funding_interval_s || 28800; // Default 8 hours
                const fundingIntervalHours = fundingIntervalSeconds / 3600;
                
                // Get funding_rate from API
                // Variational API returns annual funding rate (already annualized)
                const fundingRateRaw = listing.funding_rate;
                const fundingRateDecimal = typeof fundingRateRaw === 'string' 
                    ? parseFloat(fundingRateRaw || '0') 
                    : (fundingRateRaw || 0);
                const annualRatePercent = fundingRateDecimal * 100; // Convert decimal to percentage (annual rate)
                
                // Calculate interval rate from annual rate
                // Formula: interval_rate = annual_rate / (365 * 24 / interval_hours)
                const annualTimes = (365 * 24) / fundingIntervalHours;
                const intervalRatePercent = annualRatePercent / annualTimes;
                
                // Debug: Log first few pairs to verify data
                if (DEBUG_MODE && Object.keys(pairs).length < 5) {
                    console.log(`Variational [${ticker}]: annual_rate=${annualRatePercent.toFixed(2)}% → interval_rate=${intervalRatePercent.toFixed(4)}%, interval=${fundingIntervalHours}hr`);
                }
                
                pairs[ticker] = {
                    ticker: ticker,
                    name: listing.name || ticker,
                    variational: intervalRatePercent, // Interval-based funding rate (calculated from annual)
                    variationalAnnual: annualRatePercent, // Annual funding rate from API (use as-is)
                    variationalInterval: fundingIntervalHours // Interval from API (4hr, 8hr, 1hr, etc. - use as-is)
                };
            });
        }
        console.log(`Variational API: Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        return pairs;
    } catch (error) {
        console.error('Error fetching Variational data:', error);
        // CORS 에러인 경우 더 명확한 메시지
        if (error.message && error.message.includes('CORS') || error.name === 'TypeError') {
            console.error('CORS error detected. Try using Netlify CLI: netlify dev');
        }
        return {};
    }
}

// Fetch Binance data - match tickers from Variational
async function fetchBinanceData() {
    try {
        const response = await fetch(`${EXCHANGES.binance.baseUrl}${EXCHANGES.binance.endpoint}`);
        if (!response.ok) {
            throw new Error(`Binance API error: ${response.status}`);
        }
        const data = await response.json();
        
        const pairs = {};
        if (Array.isArray(data)) {
            // Log first item to see all available fields (debug only)
            if (DEBUG_MODE && data.length > 0) {
                console.log('Binance API - First item fields:', Object.keys(data[0]));
                console.log('Binance API - First item sample:', JSON.stringify(data[0], null, 2));
            }
            
            data.forEach((item, index) => {
                const symbol = item.symbol;
                if (symbol && symbol.endsWith('USDT')) {
                    const ticker = symbol.replace('USDT', '');
                    const fundingRate = parseFloat(item.lastFundingRate || 0) * 100;
                    const intervalHours = extractInterval(item, EXCHANGES.binance.fundingIntervalHours);
                    
                    if (DEBUG_MODE && index < 3) {
                        console.log(`Binance [${ticker}]: interval=${intervalHours}h`);
                    }
                    
                    pairs[ticker] = { rate: fundingRate, interval: intervalHours };
                }
            });
        }
        if (DEBUG_MODE) {
            console.log(`Binance API: Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        }
        return pairs;
    } catch (error) {
        console.error('Error fetching Binance data:', error);
        return {};
    }
}

// Fetch Bybit data - match tickers from Variational
// For local testing: direct API call with API keys (exposed in client-side)
// For production: use Netlify Function proxy (/.netlify/functions/fetchBybit)
async function fetchBybitData() {
    try {
        // Try Netlify Function first (for production), fallback to direct API call (for local testing)
        let response;
        let isNetlifyFunction = false;
        
        try {
            response = await fetch('/.netlify/functions/fetchBybit');
            if (response.ok) {
                isNetlifyFunction = true;
            } else {
                // 404 or other error - Netlify Function not available
                throw new Error('Netlify Function returned error');
            }
        } catch (e) {
            // Netlify Function not available (local testing), use direct API call
            console.log('Netlify Function not available, using direct API call for Bybit');
            
            const timestamp = Date.now().toString();
            const params = {
                category: 'linear'
            };
            
            const queryString = Object.keys(params)
                .sort()
                .map(key => `${key}=${params[key]}`)
                .join('&');
            
            const signature = await generateBybitSignature(params, timestamp, queryString);
            
            const url = `https://api.bybit.com/v5/market/tickers?${queryString}`;
            
            response = await fetch(url, {
                headers: {
                    'X-BAPI-API-KEY': BYBIT_API_KEY,
                    'X-BAPI-TIMESTAMP': timestamp,
                    'X-BAPI-SIGN': signature,
                    'X-BAPI-RECV-WINDOW': '5000'
                }
            });
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Bybit API error: ${response.status}`, errorText);
            return {};
        }
        
        const data = await response.json();
        
        // Check if response contains error
        if (data.error) {
            console.error('Bybit API error:', data.error, data.message);
            return {};
        }
        
        // Check Bybit API response code
        if (data.retCode !== 0 && data.retCode !== undefined) {
            console.error('Bybit API retCode:', data.retCode, data.retMsg);
            return {};
        }
        
        const pairs = {};
        if (data.result && data.result.list && Array.isArray(data.result.list)) {
            // Log first item to see all available fields (debug only)
            if (DEBUG_MODE && data.result.list.length > 0) {
                console.log('Bybit API - First item fields:', Object.keys(data.result.list[0]));
                console.log('Bybit API - First item sample:', JSON.stringify(data.result.list[0], null, 2));
            }
            
            data.result.list.forEach((item, index) => {
                const symbol = item.symbol;
                if (symbol && symbol.endsWith('USDT')) {
                    const ticker = symbol.replace('USDT', '');
                    const fundingRate = parseFloat(item.fundingRate || 0) * 100;
                    if (!isNaN(fundingRate) && fundingRate !== 0) {
                        const intervalHours = extractInterval(item, EXCHANGES.bybit.fundingIntervalHours);
                        
                        if (DEBUG_MODE && index < 3) {
                            console.log(`Bybit [${ticker}]: interval=${intervalHours}h`);
                        }
                        
                        pairs[ticker] = { rate: fundingRate, interval: intervalHours };
                    }
                }
            });
        }
        if (DEBUG_MODE) {
            console.log(`Bybit API: Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        }
        return pairs;
    } catch (error) {
        console.error('Error fetching Bybit data:', error);
        return {};
    }
}

// Fetch Hyperliquid data - match tickers from Variational
// For local testing: direct API call (POST request)
// For production: use Netlify Function proxy (/.netlify/functions/fetchHyperliquid)
async function fetchHyperliquidData() {
    try {
        // Try Netlify Function first (for production), fallback to direct API call (for local testing)
        let response;
        let isNetlifyFunction = false;
        
        try {
            response = await fetch('/.netlify/functions/fetchHyperliquid');
            if (response.ok) {
                isNetlifyFunction = true;
            } else {
                throw new Error('Netlify Function returned error');
            }
        } catch (e) {
            // Netlify Function not available (local testing), use direct API call
            console.log('Netlify Function not available, using direct API call for Hyperliquid');
            
            const url = `${EXCHANGES.hyperliquid.baseUrl}${EXCHANGES.hyperliquid.endpoint}`;
            response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type: 'metaAndAssetCtxs'
                })
            });
        }
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Hyperliquid API error: ${response.status}`, errorText);
            return {};
        }
        
        const data = await response.json();
        
        // Check if response contains error
        if (data.error) {
            console.error('Hyperliquid API error:', data.error, data.message);
            return {};
        }
        
        // Hyperliquid API returns [metadata, assetContexts]
        // metadata contains universe (list of assets)
        // assetContexts is an array of asset contexts (funding, markPx, etc.)
        if (!Array.isArray(data) || data.length < 2) {
            console.warn('Hyperliquid API: Unexpected response format');
            return {};
        }
        
        const metadata = data[0];
        const assetContexts = data[1];
        
        if (!metadata || !metadata.universe || !Array.isArray(metadata.universe)) {
            console.warn('Hyperliquid API: Missing universe in metadata');
            return {};
        }
        
        if (!Array.isArray(assetContexts)) {
            console.warn('Hyperliquid API: assetContexts is not an array');
            return {};
        }
        
        const pairs = {};
        
        // Match universe assets with their contexts
        metadata.universe.forEach((asset, index) => {
            const ticker = asset.name;
            if (!ticker) return;
            
            // Get corresponding asset context (same index)
            const context = assetContexts[index];
            if (!context || context.funding === undefined) {
                if (index < 5) {
                    console.log(`Hyperliquid [${ticker}]: No context or funding rate`);
                }
                return;
            }
            
            // Hyperliquid funding rate is in decimal format (e.g., 0.0000125 = 0.00125%)
            // Multiply by 100 to convert to percentage
            const fundingRate = parseFloat(context.funding || 0) * 100;
            if (!isNaN(fundingRate)) {
                // Hyperliquid funding is applied hourly (1 hour intervals)
                pairs[ticker] = {
                    rate: fundingRate,
                    interval: EXCHANGES.hyperliquid.fundingIntervalHours // 1 hour
                };
                if (index < 5) {
                    console.log(`Hyperliquid [${ticker}]: funding=${context.funding} → ${fundingRate}%`);
                }
            }
        });
        
        console.log(`Hyperliquid API: Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        return pairs;
    } catch (error) {
        console.error('Error fetching Hyperliquid data:', error);
        return {};
    }
}

// Fetch Lighter data using WebSocket for market_stats
// First get order_books to map market_id to symbol, then subscribe to market_stats/all
async function fetchLighterData() {
    // Step 1: Get order_books to create market_id -> symbol mapping
    let marketIdToSymbol = {};
    
    try {
        // Get order_books for market mapping
        const orderBooksUrl = `${EXCHANGES.lighter.baseUrl}${EXCHANGES.lighter.endpoint}`;
        const orderBooksResponse = await fetch(orderBooksUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': LIGHTER_AUTH_TOKEN // Try token only (no Bearer)
            }
        });
        
        if (orderBooksResponse.ok) {
            const orderBooksData = await orderBooksResponse.json();
            if (orderBooksData.order_books && Array.isArray(orderBooksData.order_books)) {
                orderBooksData.order_books.forEach(item => {
                    if (item.market_id !== undefined && item.symbol) {
                        marketIdToSymbol[item.market_id] = item.symbol;
                    }
                });
                console.log(`Lighter: Mapped ${Object.keys(marketIdToSymbol).length} markets (market_id -> symbol)`);
            }
        }
    } catch (e) {
        console.warn('Lighter: Failed to get order_books for mapping, will try WebSocket anyway');
    }
    
    // Step 2: Use WebSocket to get market_stats
    return new Promise((resolve) => {
        const pairs = {};
        let ws = null;
        let timeoutId = null;
        let resolved = false;
        
        const resolveOnce = (data) => {
            if (resolved) return;
            resolved = true;
            if (timeoutId) clearTimeout(timeoutId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
            resolve(data);
        };
        
        try {
            // Use correct WebSocket URL from documentation: wss://mainnet.zklighter.elliot.ai/stream
            const wsUrl = EXCHANGES.lighter.wsUrl;
            console.log(`Lighter: Connecting to WebSocket ${wsUrl}`);
            
            ws = new WebSocket(wsUrl);
            
            // Set timeout (15 seconds - increased to allow more data collection)
            // If WebSocket doesn't respond quickly, continue without Lighter data
            timeoutId = setTimeout(() => {
                if (!resolved) {
                    console.log(`Lighter: WebSocket timeout (15s), collected ${Object.keys(pairs).length} pairs`);
                if (Object.keys(pairs).length === 0) {
                        console.warn('⚠️ Lighter: No data collected from WebSocket (continuing without Lighter data)');
                        console.warn('  This might be due to:');
                        console.warn('  1. WebSocket connection issue');
                        console.warn('  2. Subscription not working');
                        console.warn('  3. API endpoint changed');
                        console.warn('  4. Network/firewall blocking WebSocket');
                    }
                    resolveOnce(pairs);
                }
            }, 15000);
            
            ws.onopen = () => {
                console.log('✅ Lighter: WebSocket connected successfully');
                // Wait a bit before subscribing to ensure connection is stable
                setTimeout(() => {
                // Subscribe to market_stats/all
                const subscribeMessage = {
                    type: 'subscribe',
                    channel: 'market_stats/all'
                };
                    try {
                ws.send(JSON.stringify(subscribeMessage));
                console.log('Lighter: Sent subscription message:', JSON.stringify(subscribeMessage));
                    } catch (e) {
                        console.error('Lighter: Failed to send subscription:', e);
                    }
                }, 100);
            };
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // Log first few messages for debugging (limit to avoid console spam)
                    const pairCount = Object.keys(pairs).length;
                    if (pairCount < 5) {
                        console.log('Lighter: WebSocket message received:', JSON.stringify(data, null, 2));
                    }
                    
                    // Check if it's a market_stats update
                    // Documentation: https://apidocs.lighter.xyz/docs/websocket-reference
                    // Response type: "update/market_stats" or "market_stats/all"
                    if ((data.type === 'update/market_stats' || data.type === 'market_stats/all') && data.market_stats) {
                        // Handle single market stats (when subscribing to specific market)
                        if (data.market_stats.market_id !== undefined) {
                            const stats = data.market_stats;
                            const marketId = stats.market_id;
                            
                            // Use symbol directly from market_stats (more reliable than mapping)
                            const ticker = stats.symbol || marketIdToSymbol[marketId] || `MARKET_${marketId}`;
                            
                            // Get funding rate (prefer current_funding_rate, then funding_rate)
                            // Lighter API returns funding rate as decimal (e.g., 0.000081 = 0.0081%)
                            // Check if it's already in percentage format or decimal format
                            const fundingRateRaw = stats.current_funding_rate || stats.funding_rate;
                            
                                    if (fundingRateRaw !== undefined && fundingRateRaw !== null) {
                                        let fundingRateDecimal = parseFloat(fundingRateRaw);
                                        
                                        // Lighter API returns funding rate - need to determine format
                                        // Based on user feedback: 1-hour funding rate is 100x too high
                                        // Lighter website shows 0.0081%, but we show 0.7800%
                                        // This suggests API might return 0.0078 (already in percentage format)
                                        // and we're multiplying by 100 incorrectly
                                        // 
                                        // Test: If API returns 0.0078 and we do * 100 = 0.78% (wrong)
                                        //       If API returns 0.0078 and we use as-is = 0.0078% (wrong, should be 0.0081%)
                                        //       If API returns 0.000081 and we do * 100 = 0.0081% (correct)
                                        //
                                        // Based on 100x difference, API likely returns values like 0.0078 (percentage)
                                        // but we're treating it as decimal and multiplying by 100
                                        // Solution: Don't multiply by 100 - use raw value as percentage
                                        
                                        // Lighter API returns funding rate already in percentage format
                                        // Example: 0.0078 = 0.0078%, 0.0081 = 0.0081%
                                        // Do NOT multiply by 100
                                        let fundingRate = fundingRateDecimal;
                                        
                                        // Validate: if result seems too large (> 10%), log warning
                                        if (Math.abs(fundingRate) > 10) {
                                            console.warn(`⚠️ Lighter [${ticker}]: Unusually large funding rate: ${fundingRate}% (raw: ${fundingRateRaw}). Check if API format changed.`);
                                        }
                                        
                                        if (!isNaN(fundingRate) && isFinite(fundingRate)) {
                                            // Use default funding interval (1 hour for Lighter)
                                            pairs[ticker] = {
                                                rate: fundingRate,
                                                interval: EXCHANGES.lighter.fundingIntervalHours
                                            };
                                            
                                            // Log first 10 for debugging
                                            if (Object.keys(pairs).length <= 10) {
                                                console.log(`✅ Lighter [${ticker}]: funding_rate=${fundingRate}%`);
                                            }
                                        }
                            }
                        } 
                        // Handle market_stats/all response (all markets at once - object with market_index keys)
                        else if (typeof data.market_stats === 'object' && !Array.isArray(data.market_stats)) {
                            // Process all market data quickly
                            Object.keys(data.market_stats).forEach(marketIndex => {
                                const stats = data.market_stats[marketIndex];
                                if (stats && (stats.current_funding_rate || stats.funding_rate)) {
                                    // Use symbol directly from market_stats (more reliable than mapping)
                                    const ticker = stats.symbol || marketIdToSymbol[stats.market_id] || marketIdToSymbol[parseInt(marketIndex)] || `MARKET_${stats.market_id || marketIndex}`;
                                    
                                    // Get funding rate - Lighter API returns funding rate already in percentage format
                                    const fundingRateRaw = stats.current_funding_rate || stats.funding_rate;
                                    
                                    if (fundingRateRaw !== undefined && fundingRateRaw !== null) {
                                        let fundingRate = parseFloat(fundingRateRaw);
                                        
                                        // Validate: if result seems too large (> 10%), log warning
                                        if (Math.abs(fundingRate) > 10) {
                                            console.warn(`⚠️ Lighter [${ticker}]: Unusually large funding rate: ${fundingRate}% (raw: ${fundingRateRaw}). Check if API format changed.`);
                                        }
                                        
                                        if (!isNaN(fundingRate) && isFinite(fundingRate)) {
                                            // Use default funding interval (1 hour for Lighter)
                                            pairs[ticker] = {
                                                rate: fundingRate,
                                                interval: EXCHANGES.lighter.fundingIntervalHours
                                            };
                                            }
                                    }
                                }
                            });
                            
                            // If we got all market data, close WebSocket and resolve immediately
                            console.log(`Lighter: Received all market data (${Object.keys(pairs).length} pairs), closing WebSocket`);
                            resolveOnce(pairs);
                        }
                    } 
                    // Handle "connected" message (initial connection confirmation)
                    else if (data.type === 'connected') {
                        console.log('✅ Lighter: WebSocket connection confirmed');
                        // Connection is established, wait for market_stats data
                    }
                    // Handle subscription confirmation
                    else if (data.type === 'subscribed' || data.type === 'subscribe') {
                        console.log('✅ Lighter: Subscription confirmed, waiting for market_stats data...');
                    }
                    // Handle any message with market_stats directly (alternative format)
                    else if (data.market_stats && !data.type) {
                        console.log('Lighter: Received market_stats without type field');
                        // Process as market_stats/all format
                        if (typeof data.market_stats === 'object' && !Array.isArray(data.market_stats)) {
                            Object.keys(data.market_stats).forEach(marketIndex => {
                                const stats = data.market_stats[marketIndex];
                                if (stats && (stats.current_funding_rate || stats.funding_rate)) {
                                    const ticker = stats.symbol || marketIdToSymbol[stats.market_id] || marketIdToSymbol[parseInt(marketIndex)] || `MARKET_${stats.market_id || marketIndex}`;
                                    const fundingRateRaw = stats.current_funding_rate || stats.funding_rate;
                                    
                                    if (fundingRateRaw !== undefined && fundingRateRaw !== null) {
                                        let fundingRate = parseFloat(fundingRateRaw);
                                        
                                        if (Math.abs(fundingRate) > 10) {
                                            console.warn(`⚠️ Lighter [${ticker}]: Unusually large funding rate: ${fundingRate}%`);
                                        }
                                        
                                        if (!isNaN(fundingRate) && isFinite(fundingRate)) {
                                            pairs[ticker] = {
                                                rate: fundingRate,
                                                interval: EXCHANGES.lighter.fundingIntervalHours
                                            };
                                        }
                                    }
                                }
                            });
                            console.log(`Lighter: Processed market_stats object, collected ${Object.keys(pairs).length} pairs`);
                            if (Object.keys(pairs).length > 0) {
                                resolveOnce(pairs);
                            }
                        }
                    }
                    else {
                        // Log unknown message types for debugging
                        const pairCount = Object.keys(pairs).length;
                        if (pairCount < 10 || !resolved) {
                            console.log('Lighter: Received message, type:', data.type || 'unknown');
                        console.log('  Message keys:', Object.keys(data));
                        if (data.channel) {
                            console.log('  Channel:', data.channel);
                            }
                            // Log full message for first few to debug
                            if (pairCount < 3) {
                                console.log('  Full message:', JSON.stringify(data, null, 2));
                            }
                        }
                    }
                } catch (e) {
                    console.warn('Lighter: Failed to parse WebSocket message:', e);
                    console.warn('  Raw message:', event.data);
                }
            };
            
            ws.onerror = (error) => {
                // WebSocket connection failed - resolve immediately without waiting
                console.error('Lighter: WebSocket error:', error);
                console.warn('Lighter: WebSocket connection failed (continuing without Lighter data)');
                if (Object.keys(pairs).length === 0) {
                    console.warn('  No data was collected. Check browser console for WebSocket errors.');
                }
                resolveOnce(pairs);
            };
            
            ws.onclose = (event) => {
                if (!resolved) {
                if (event.code !== 1000 && event.code !== 1001) {
                    // Not a normal closure
                    console.warn(`Lighter: WebSocket closed unexpectedly (code: ${event.code})`);
                    if (Object.keys(pairs).length === 0) {
                        console.warn('  Lighter data will not be available. App will continue with other exchanges.');
                    }
                } else {
                    console.log(`Lighter: WebSocket closed normally, collected ${Object.keys(pairs).length} pairs`);
                }
                    resolveOnce(pairs);
                }
            };
            
        } catch (error) {
            console.error('Lighter: WebSocket connection failed:', error);
            if (timeoutId) clearTimeout(timeoutId);
            resolve(pairs);
        }
    });
}

// Old REST API implementation (kept as fallback)
async function fetchLighterDataREST() {
    try {
        // Try Netlify Function first (for production), fallback to direct API call (for local testing)
        let response;
        let isNetlifyFunction = false;
        let data;
        
        try {
            response = await fetch('/.netlify/functions/fetchLighter');
            if (response.ok) {
                isNetlifyFunction = true;
                data = await response.json();
            } else {
                const errorText = await response.text();
                console.error(`Netlify Function error: ${response.status}`, errorText);
                throw new Error('Netlify Function returned error');
            }
        } catch (e) {
            // Netlify Function not available (local testing), use direct API call
            console.log('Netlify Function not available, using direct API call for Lighter');
            
            // Try multiple endpoints
            // Note: order_books doesn't contain funding rate, try other endpoints first
            const endpoints = [
                '/api/v1/marketStats',      // Market stats might contain funding rates
                '/api/v1/funding',          // Direct funding endpoint
                '/api/v1/fundingRates',     // Funding rates endpoint
                '/api/v1/markets',          // Markets endpoint
                '/api/v1/tickers',          // Tickers endpoint
                '/api/v1/orderBooks'        // Try last since it doesn't have funding rate
            ];
            
            let lastError = null;
            
            // Try different authentication methods
            const authMethods = [
                { name: 'Bearer', header: `Bearer ${LIGHTER_AUTH_TOKEN}` },
                { name: 'Token only', header: LIGHTER_AUTH_TOKEN },
                { name: 'No auth', header: null }
            ];
            
            for (const endpoint of endpoints) {
                for (const authMethod of authMethods) {
                    try {
                        const url = `${EXCHANGES.lighter.baseUrl}${endpoint}`;
                        console.log(`Trying Lighter endpoint: ${url} (${authMethod.name})`);
                        
                        const headers = {
                            'Content-Type': 'application/json'
                        };
                        
                        if (authMethod.header) {
                            headers['Authorization'] = authMethod.header;
                        }
                        
                        response = await fetch(url, {
                            method: 'GET',
                            headers: headers
                        });
                        
                        if (!response.ok) {
                            const errorText = await response.text();
                            if (response.status === 401 || response.status === 403) {
                                console.warn(`Lighter ${endpoint} (${authMethod.name}) error: ${response.status}`, errorText);
                                continue; // Try next auth method
                            } else {
                                console.warn(`Lighter ${endpoint} (${authMethod.name}) error: ${response.status}`, errorText);
                                lastError = new Error(`HTTP ${response.status}: ${errorText}`);
                                continue;
                            }
                        }
                        
                        data = await response.json();
                        console.log(`✅ Lighter ${endpoint} (${authMethod.name}) success!`);
                        break;
                    } catch (err) {
                        console.warn(`Lighter ${endpoint} (${authMethod.name}) failed:`, err.message);
                        lastError = err;
                        continue;
                    }
                }
                
                if (data) break; // If we got data, stop trying endpoints
            }
            
            if (!data) {
                console.error('❌ All Lighter endpoints and auth methods failed.');
                console.error('Last error:', lastError);
                console.error('\n=== Lighter API Authentication Issue ===');
                console.error('Possible reasons:');
                console.error('1. Token format may be incorrect');
                console.error('2. Token may have expired');
                console.error('3. API may require different authentication method');
                console.error('4. These endpoints may require WebSocket connection instead of REST');
                console.error('\nCurrent token format:', LIGHTER_AUTH_TOKEN.substring(0, 50) + '...');
                console.error('\nPlease check:');
                console.error('- Is the token still valid?');
                console.error('- Does Lighter API require WebSocket for funding rate data?');
                console.error('- Are there public endpoints that don\'t require authentication?');
                return {};
            }
        }
        
        // Check if response contains error
        if (data.error) {
            console.error('Lighter API error:', data.error, data.message);
            return {};
        }
        
        // Parse Lighter API response structure
        // OrderApi.order_books - get data about all markets' orderbooks
        // WebSocket format: { market_stats: { current_funding_rate, funding_rate, ... } }
        // REST API format: array of order books or object with market data
        const pairs = {};
        
        // Debug: Log full response structure
        console.log('=== Lighter API Response Debug ===');
        console.log('Response type:', Array.isArray(data) ? 'Array' : typeof data);
        console.log('Response keys:', typeof data === 'object' && data !== null ? Object.keys(data) : 'N/A');
        console.log('Full response (first 5000 chars):', JSON.stringify(data, null, 2).substring(0, 5000));
        
        // If response is very large, log a sample
        if (Array.isArray(data) && data.length > 0) {
            console.log('First item sample:', JSON.stringify(data[0], null, 2));
        }
        
        // Try different response formats
        // Check if response has order_books array
        if (data.order_books && Array.isArray(data.order_books)) {
            console.log(`Lighter: Processing order_books array with ${data.order_books.length} items`);
            data.order_books.forEach((item, index) => {
                // Log first 3 items in detail
                if (index < 3) {
                    console.log(`\n=== Lighter Item ${index} ===`);
                    console.log('Full item:', JSON.stringify(item, null, 2));
                    console.log('Item keys:', Object.keys(item));
                }
                
                // Get ticker from symbol field
                const ticker = item.symbol;
                
                if (!ticker) {
                    if (index < 3) {
                        console.log(`⚠️ Lighter [index ${index}]: No symbol found`);
                        console.log('  Item structure:', JSON.stringify(item, null, 2).substring(0, 1000));
                    }
                    return;
                }
                
                // Note: order_books endpoint doesn't contain funding rate
                // Funding rate might be in a different endpoint or require WebSocket
                // For now, we'll log that we found the market but no funding rate
                if (index < 5) {
                    console.log(`⚠️ Lighter [${ticker}]: Market found but no funding rate in order_books`);
                    console.log('  Note: order_books endpoint contains market metadata only');
                    console.log('  Funding rate may require WebSocket connection or different endpoint');
                }
            });
        } else if (Array.isArray(data)) {
            // If response is an array of markets
            console.log(`Lighter: Processing array with ${data.length} items`);
            data.forEach((item, index) => {
                // Log first 3 items in detail
                if (index < 3) {
                    console.log(`\n=== Lighter Item ${index} ===`);
                    console.log('Full item:', JSON.stringify(item, null, 2));
                    console.log('Item keys:', Object.keys(item));
                }
                
                // Check if item has market_stats or market data
                const marketStats = item.market_stats || item.market || item;
                const ticker = marketStats.ticker || marketStats.symbol || marketStats.name || 
                             marketStats.market || item.ticker || item.symbol || item.market || item.name ||
                             item.base_currency || item.base || item.instrument || item.pair;
                
                if (!ticker) {
                    if (index < 3) {
                        console.log(`⚠️ Lighter [index ${index}]: No ticker found`);
                        console.log('  All possible ticker fields checked');
                        console.log('  Item structure:', JSON.stringify(item, null, 2).substring(0, 1000));
                    }
                    return;
                }
                
                // Use current_funding_rate if available, otherwise use funding_rate
                // Check ALL possible locations for funding rate
                const fundingRateRaw = marketStats.current_funding_rate || marketStats.funding_rate || 
                                      item.current_funding_rate || item.funding_rate || item.fundingRate ||
                                      (item.market_stats && (item.market_stats.current_funding_rate || item.market_stats.funding_rate)) ||
                                      item.funding || marketStats.funding ||
                                      item.fundingRate || item.funding_rate_percent || item.funding_percent ||
                                      (item.stats && (item.stats.funding_rate || item.stats.current_funding_rate)) ||
                                      (item.market && item.market.funding_rate) ||
                                      (item.orderbook && item.orderbook.funding_rate);
                
                if (fundingRateRaw !== undefined && fundingRateRaw !== null) {
                    // Lighter funding rate might be in decimal format (e.g., 0.0057 = 0.57%)
                    // or already in percentage format
                    let fundingRate = parseFloat(fundingRateRaw);
                    
                    // If funding rate is very small (< 1), assume it's decimal and convert to percentage
                    if (Math.abs(fundingRate) < 1) {
                        fundingRate = fundingRate * 100;
                    }
                    
                    if (!isNaN(fundingRate)) {
                        pairs[ticker] = {
                            rate: fundingRate,
                            interval: EXCHANGES.lighter.fundingIntervalHours
                        };
                        console.log(`✅ Lighter [${ticker}]: funding_rate=${fundingRateRaw} → ${fundingRate}%`);
                    }
                } else {
                    if (index < 3) {
                        console.log(`⚠️ Lighter [${ticker}]: No funding rate found`);
                        console.log('  Item keys:', Object.keys(item));
                        console.log('  MarketStats keys:', marketStats !== item ? Object.keys(marketStats) : 'N/A');
                        // Search for any field containing "fund" or "rate"
                        const allKeys = Object.keys(item);
                        const fundKeys = allKeys.filter(k => k.toLowerCase().includes('fund') || k.toLowerCase().includes('rate'));
                        if (fundKeys.length > 0) {
                            console.log('  ⚠️ Found potential funding-related keys:', fundKeys);
                            fundKeys.forEach(key => {
                                console.log(`    ${key}:`, item[key]);
                            });
                        }
                    }
                }
            });
        } else if (data.market_stats) {
            // Single market stats (WebSocket format)
            const marketStats = data.market_stats;
            const ticker = marketStats.ticker || marketStats.symbol || 'UNKNOWN';
            const fundingRateRaw = marketStats.current_funding_rate || marketStats.funding_rate;
            if (fundingRateRaw !== undefined && fundingRateRaw !== null) {
                const fundingRate = parseFloat(fundingRateRaw) * 100;
                if (!isNaN(fundingRate)) {
                    pairs[ticker] = {
                        rate: fundingRate,
                        interval: EXCHANGES.lighter.fundingIntervalHours
                    };
                    console.log(`Lighter [${ticker}]: funding_rate=${fundingRateRaw} → ${fundingRate}%`);
                }
            }
        } else if (typeof data === 'object') {
            // Try to find market stats in object
            console.log('Lighter API: Object response, keys:', Object.keys(data));
            
            // Check if data has nested structure
            if (data.data && Array.isArray(data.data)) {
                data.data.forEach((item, index) => {
                    const marketStats = item.market_stats || item.market || item;
                    const ticker = marketStats.ticker || marketStats.symbol || marketStats.name || item.ticker || item.symbol;
                    const fundingRateRaw = marketStats.current_funding_rate || marketStats.funding_rate || 
                                         item.current_funding_rate || item.funding_rate;
                    if (ticker && fundingRateRaw !== undefined) {
                        const fundingRate = parseFloat(fundingRateRaw) * 100;
                        if (!isNaN(fundingRate)) {
                            pairs[ticker] = {
                                rate: fundingRate,
                                interval: EXCHANGES.lighter.fundingIntervalHours
                            };
                        }
                    }
                });
            } else if (data.markets && Array.isArray(data.markets)) {
                // If markets is an array
                data.markets.forEach((item, index) => {
                    const ticker = item.ticker || item.symbol || item.name || item.market;
                    const fundingRateRaw = item.current_funding_rate || item.funding_rate || 
                                         item.fundingRate || (item.market_stats && (item.market_stats.current_funding_rate || item.market_stats.funding_rate));
                    if (ticker && fundingRateRaw !== undefined) {
                        const fundingRate = parseFloat(fundingRateRaw) * 100;
                        if (!isNaN(fundingRate)) {
                            pairs[ticker] = {
                                rate: fundingRate,
                                interval: EXCHANGES.lighter.fundingIntervalHours
                            };
                        }
                    }
                });
            }
        }
        
        console.log(`\n=== Lighter API Summary ===`);
        console.log(`Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        
        if (Object.keys(pairs).length === 0) {
            console.error('❌ Lighter API: No funding rates found!');
            console.error('\n=== Full Response Structure ===');
            console.error(JSON.stringify(data, null, 2));
            console.error('\n=== Please check the response structure above ===');
            console.error('If funding rate data exists, please share the response structure so we can update the parsing logic.');
            
            // Try to find any numeric fields that might be funding rates
            if (Array.isArray(data) && data.length > 0) {
                console.error('\n=== Analyzing first item for potential funding rate fields ===');
                const firstItem = data[0];
                const numericFields = {};
                const findNumericFields = (obj, prefix = '') => {
                    for (const key in obj) {
                        if (obj.hasOwnProperty(key)) {
                            const value = obj[key];
                            const fullKey = prefix ? `${prefix}.${key}` : key;
                            if (typeof value === 'number' && Math.abs(value) < 1 && Math.abs(value) > 0.000001) {
                                numericFields[fullKey] = value;
                            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                                findNumericFields(value, fullKey);
                            }
                        }
                    }
                };
                findNumericFields(firstItem);
                if (Object.keys(numericFields).length > 0) {
                    console.error('Potential funding rate fields (small decimal values):', numericFields);
                }
            }
        } else {
            console.log('✅ Lighter pairs sample:', Object.keys(pairs).slice(0, 5).map(t => `${t}: ${pairs[t]}%`));
        }
        return pairs;
    } catch (error) {
        console.error('Error fetching Lighter data:', error);
        return {};
    }
}

// Calculate annual funding rate
function calculateAnnualRate(rate, intervalHours) {
    if (rate === null || rate === undefined || intervalHours === null || intervalHours === undefined) return null;
    const annualTimes = (365 * 24) / intervalHours;
    return rate * annualTimes;
}

// Format funding rate
// Default: Show interval rate first (4hr, 8hr, etc.) - large
//          Show annual rate second - small
// Toggle: Switch to show annual rate large, interval rate small
// If annualRate is provided (for Variational), use it directly instead of calculating
function formatFundingRate(rate, intervalHours, annualRate = null) {
    if (rate === null || rate === undefined || isNaN(rate)) return '-';
    
    // If annual rate is provided (Variational), use it directly
    // Otherwise calculate from interval rate (Binance)
    const finalAnnualRate = annualRate !== null && annualRate !== undefined 
        ? annualRate 
        : calculateAnnualRate(rate, intervalHours);
    
    const intervalDisplay = intervalHours === 1 ? '1h' : `${intervalHours}h`;
    const rateFormatted = `${rate >= 0 ? '+' : ''}${rate.toFixed(4)}%`;
    const annualFormatted = finalAnnualRate !== null ? `${finalAnnualRate >= 0 ? '+' : ''}${finalAnnualRate.toFixed(2)}%` : '';
    
    if (displayMode === 'interval') {
        // Interval mode (default): Show interval rate large, annual rate small
        // Format: "+0.0050% - 4h" (large, one line) / "(APR: +10.95%)" (small, next line)
        return `<div class="funding-rate-display"><div class="funding-rate-line"><span class="funding-annual">${rateFormatted}</span><span class="funding-interval-time"> - ${intervalDisplay}</span></div><span class="funding-interval">(APR: ${annualFormatted})</span></div>`;
    } else {
        // Annual mode: Show annual rate large, interval rate small
        // Format: "+10.95%" (large) / "(4h: +0.0050%)" (small)
        return `<div class="funding-rate-display"><span class="funding-annual">${annualFormatted}</span><span class="funding-interval">(${intervalDisplay}: ${rateFormatted})</span></div>`;
    }
}

// Display table
function displayTable(pairs) {
    const tableBody = document.getElementById('tableBody');
    
    if (pairs.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 60px; color: #9CA3AF; font-size: 1rem;">📊 No market data available. Please refresh the page.</td></tr>';
        return;
    }

    let sortedPairs = pairs;
    if (currentSort.column && currentSort.direction) {
        sortedPairs = sortPairs(pairs, currentSort.column, currentSort.direction);
    }
    
    updateSortIcons();

    tableBody.innerHTML = sortedPairs.map(pair => {
        const ticker = pair.ticker || '-';
        
        const variationalValue = (pair.variational !== null && pair.variational !== undefined && !isNaN(pair.variational)) ? pair.variational : null;
        const variationalInterval = pair.variationalInterval || EXCHANGES.variational.fundingIntervalHours;
        const variationalAnnual = pair.variationalAnnual !== null && pair.variationalAnnual !== undefined ? pair.variationalAnnual : null;
        const variational = formatFundingRate(variationalValue, variationalInterval, variationalAnnual);
        
        const binanceValue = (pair.binance !== null && pair.binance !== undefined && !isNaN(pair.binance)) ? pair.binance : null;
        const binanceInterval = pair.binanceInterval || EXCHANGES.binance.fundingIntervalHours;
        const binance = formatFundingRate(binanceValue, binanceInterval);
        
        const bybitValue = (pair.bybit !== null && pair.bybit !== undefined && !isNaN(pair.bybit)) ? pair.bybit : null;
        const bybitInterval = pair.bybitInterval || EXCHANGES.bybit.fundingIntervalHours;
        const bybit = formatFundingRate(bybitValue, bybitInterval);
        
        const hyperliquidValue = (pair.hyperliquid !== null && pair.hyperliquid !== undefined && !isNaN(pair.hyperliquid)) ? pair.hyperliquid : null;
        const hyperliquidInterval = pair.hyperliquidInterval || EXCHANGES.hyperliquid.fundingIntervalHours;
        const hyperliquid = formatFundingRate(hyperliquidValue, hyperliquidInterval);
        
        const lighterValue = (pair.lighter !== null && pair.lighter !== undefined && !isNaN(pair.lighter)) ? pair.lighter : null;
        const lighterInterval = pair.lighterInterval || EXCHANGES.lighter.fundingIntervalHours;
        const lighter = formatFundingRate(lighterValue, lighterInterval);
        
        let strategyHtml = '-';
        if (pair.strategy && pair.strategyExchange && pair.oppositeExchange) {
            const strategyClass = pair.strategy === 'long' ? 'long' : 'short';
            const oppositeClass = pair.oppositeStrategy === 'long' ? 'long' : 'short';

            // Use full exchange names
            const strategyExchangeFull = pair.strategyExchange;
            const oppositeExchangeFull = pair.oppositeExchange;

            // Use profit from pair (already calculated in fetchAllData)
            const profitPercent = pair.profit || 0;
            const profitFormatted = profitPercent > 0 ? `${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(4)}%` : '';

            // Format APR
            const aprFormatted = pair.estimatedApr !== undefined && pair.estimatedApr > 0
                ? `${pair.estimatedApr.toFixed(1)}%`
                : '';

            strategyHtml = `
                <div class="strategy-container">
                    <div class="strategy-profit-large">${profitFormatted || '-'}</div>
                    ${aprFormatted ? `<div class="strategy-apr">APR <span>${aprFormatted}</span></div>` : ''}
                    <div class="strategy-actions-row">
                        <div class="strategy-item ${strategyClass}">
                            <span class="strategy-direction-label">${pair.strategy === 'long' ? 'Long' : 'Short'}</span>
                            <span class="strategy-exchange-full">${strategyExchangeFull}</span>
                        </div>
                        <span class="arrow-separator">${ARROW_SEPARATOR_SVG}</span>
                        <div class="strategy-item ${oppositeClass}">
                            <span class="strategy-direction-label">${pair.oppositeStrategy === 'long' ? 'Long' : 'Short'}</span>
                            <span class="strategy-exchange-full">${oppositeExchangeFull}</span>
                        </div>
                    </div>
                </div>
            `;
        }
        
            return `
                <tr>
                    <td class="ticker">${ticker}</td>
                    <td class="funding-rate ${variationalValue !== null && variationalValue >= 0 ? 'positive' : variationalValue !== null ? 'negative' : ''}">${variational}</td>
                    <td class="funding-rate ${binanceValue !== null && binanceValue >= 0 ? 'positive' : binanceValue !== null ? 'negative' : ''}">${binance}</td>
                    <td class="funding-rate ${bybitValue !== null && bybitValue >= 0 ? 'positive' : bybitValue !== null ? 'negative' : ''}">${bybit}</td>
                    <td class="funding-rate ${hyperliquidValue !== null && hyperliquidValue >= 0 ? 'positive' : hyperliquidValue !== null ? 'negative' : ''}">${hyperliquid}</td>
                    <td class="funding-rate ${lighterValue !== null && lighterValue >= 0 ? 'positive' : lighterValue !== null ? 'negative' : ''}">${lighter}</td>
                    <td class="strategy-cell">${strategyHtml}</td>
                </tr>
            `;
    }).join('');
    
    updateSortIcons();
}

// Display top 3 arbitrage opportunities
function displayTopArbitrage(pairs, searchTerm = '') {
    const topArbitrageContainer = document.getElementById('topArbitrage');
    if (!topArbitrageContainer) return;

    // Filter pairs with valid arbitrage opportunities (profit > 0 and strategy exists)
    let validPairs = pairs.filter(pair =>
        pair.profit > 0 &&
        pair.strategy &&
        pair.strategyExchange &&
        pair.oppositeExchange
    );

    // Apply search filter if search term is provided
    if (searchTerm && searchTerm.trim() !== '') {
        const term = searchTerm.toLowerCase().trim();
        validPairs = validPairs.filter(pair =>
            (pair.ticker || '').toLowerCase().includes(term)
        );
    }

    // Sort by estimatedApr (descending) if available, otherwise by profit (descending)
    const sortedValidPairs = validPairs.sort((a, b) => {
        // Prefer estimatedApr for sorting (more accurate)
        if (a.estimatedApr !== undefined && b.estimatedApr !== undefined) {
            return b.estimatedApr - a.estimatedApr; // Descending order
        }
        // Fallback to profit
        const aProfit = a.profit || 0;
        const bProfit = b.profit || 0;
        return bProfit - aProfit; // Descending order
    });

    // Get top 3
    const top3 = sortedValidPairs.slice(0, 3);

    if (top3.length === 0) {
        topArbitrageContainer.style.display = 'none';
        return;
    }

    topArbitrageContainer.style.display = 'block';

    // Update each card
    top3.forEach((pair, index) => {
        const cardId = `arbitrageCard${index + 1}`;
        const card = document.getElementById(cardId);
        if (!card) return;

        const tickerEl = card.querySelector('.card-ticker');
        const profitEl = card.querySelector('.card-profit');
        const aprValueEl = card.querySelector('.card-apr-value');
        const strategyEl = card.querySelector('.card-strategy');

        if (tickerEl) {
            // Display ticker name only
            tickerEl.textContent = pair.ticker || '-';
        }

        if (profitEl) {
            // Display profit percentage (spread)
            const profitFormatted = `${pair.profit >= 0 ? '+' : ''}${pair.profit.toFixed(4)}%`;
            profitEl.textContent = profitFormatted;
        }

        if (aprValueEl) {
            // Display estimated APR with label
            const aprFormatted = pair.estimatedApr !== undefined
                ? `APR ${pair.estimatedApr.toFixed(1)}%`
                : '-';
            aprValueEl.textContent = aprFormatted;
        }

        if (strategyEl) {
            // Display exchange names with Long/Short labels in horizontal row layout with arrow separator
            strategyEl.innerHTML = `
                <div class="strategy-simple-row">
                    <div class="exchange-item long-item">
                        <span class="direction-label-inline long-label">Long</span>
                        <span class="exchange-name">${pair.strategyExchange}</span>
                    </div>
                    <span class="arrow-separator">${ARROW_SEPARATOR_SVG}</span>
                    <div class="exchange-item short-item">
                        <span class="direction-label-inline short-label">Short</span>
                        <span class="exchange-name">${pair.oppositeExchange}</span>
                    </div>
                </div>
            `;
        }
    });

    // Hide unused cards if less than 3 opportunities
    for (let i = top3.length; i < 3; i++) {
        const cardId = `arbitrageCard${i + 1}`;
        const card = document.getElementById(cardId);
        if (card) {
            card.style.display = 'none';
        }
    }

    // Show used cards
    for (let i = 0; i < top3.length; i++) {
        const cardId = `arbitrageCard${i + 1}`;
        const card = document.getElementById(cardId);
        if (card) {
            card.style.display = 'block';
        }
    }
}

// Sort function
function sortPairs(pairs, column, direction) {
    return [...pairs].sort((a, b) => {
        let aVal, bVal;
        
        switch(column) {
            case 'ticker':
                aVal = (a.ticker || '').toLowerCase();
                bVal = (b.ticker || '').toLowerCase();
                break;
            case 'variational':
                aVal = Math.abs(a.variational || 0);
                bVal = Math.abs(b.variational || 0);
                break;
            case 'binance':
                aVal = Math.abs(a.binance || 0);
                bVal = Math.abs(b.binance || 0);
                break;
            case 'bybit':
                aVal = Math.abs(a.bybit || 0);
                bVal = Math.abs(b.bybit || 0);
                break;
            case 'hyperliquid':
                aVal = Math.abs(a.hyperliquid || 0);
                bVal = Math.abs(b.hyperliquid || 0);
                break;
            case 'lighter':
                aVal = Math.abs(a.lighter || 0);
                bVal = Math.abs(b.lighter || 0);
                break;
            case 'strategy':
                // Sort by estimatedApr (more accurate than profit)
                // Fallback to profit if estimatedApr not available
                if (a.estimatedApr !== undefined && b.estimatedApr !== undefined) {
                    aVal = a.estimatedApr;
                    bVal = b.estimatedApr;
                } else {
                aVal = a.profit !== null && a.profit !== undefined ? a.profit : 0;
                bVal = b.profit !== null && b.profit !== undefined ? b.profit : 0;
                }
                break;
            default:
                return 0;
        }
        
        if (typeof aVal === 'string') {
            return direction === 'asc' 
                ? aVal.localeCompare(bVal)
                : bVal.localeCompare(aVal);
        } else {
            return direction === 'asc' ? aVal - bVal : bVal - aVal;
        }
    });
}

// Update sort icons
function updateSortIcons() {
    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(header => {
        header.classList.remove('sort-asc', 'sort-desc');
        const sortColumn = header.getAttribute('data-sort');
        if (currentSort.column === sortColumn) {
            header.classList.add(currentSort.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });
}

// Setup sorting
function setupSorting() {
    const headers = document.querySelectorAll('th.sortable');
    headers.forEach(header => {
        // Handle header click (including sort icon click)
        header.addEventListener('click', (e) => {
            // Prevent event bubbling if clicking on sort icon
            e.stopPropagation();
            
            const column = header.getAttribute('data-sort');
            
            // Toggle sort direction if clicking same column, otherwise set to ascending
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            
            // Apply search filter if active
            const searchInput = document.getElementById('searchInput');
            const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
            
            let pairsToDisplay = allPairs;
            if (searchTerm !== '') {
                pairsToDisplay = allPairs.filter(pair => {
                    const ticker = (pair.ticker || '').toLowerCase();
                    return ticker.includes(searchTerm);
                });
            }
            
            // Update table with sorted data
            displayTable(pairsToDisplay);
            // Update top arbitrage display
            displayTopArbitrage(pairsToDisplay);
        });
        
        // Also make sort icon clickable
        const sortIcon = header.querySelector('.sort-icon');
        if (sortIcon) {
            sortIcon.addEventListener('click', (e) => {
                e.stopPropagation();
                header.click(); // Trigger header click
            });
        }
    });
}

// Setup search
function setupSearch() {
    const searchInput = document.getElementById('searchInput');

    if (!searchInput) {
        console.warn('Search input element not found, skipping search setup');
        return;
    }

    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase().trim();

        if (searchTerm === '') {
            displayTable(allPairs);
        } else {
            const filtered = allPairs.filter(pair => {
                const ticker = (pair.ticker || '').toLowerCase();
                return ticker.includes(searchTerm);
            });
            displayTable(filtered);
        }
    });
}

// Setup top arbitrage search
function setupTopArbitrageSearch() {
    const topArbitrageSearch = document.getElementById('topArbitrageSearch');

    if (!topArbitrageSearch) {
        console.warn('Top arbitrage search input not found, skipping setup');
        return;
    }

    topArbitrageSearch.addEventListener('input', (e) => {
        const searchTerm = e.target.value;
        displayTopArbitrage(allPairs, searchTerm);
    });
}

// Setup display toggle
function setupDisplayToggle() {
    const toggleBtn = document.getElementById('displayToggleBtn');
    
    if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
            if (displayMode === 'interval') {
                displayMode = 'annual';
                toggleBtn.textContent = 'Display: APR';
                toggleBtn.classList.add('active');
            } else {
                displayMode = 'interval';
                toggleBtn.textContent = 'Display: Interval';
                toggleBtn.classList.remove('active');
            }
            displayTable(allPairs);
        });
    }
}

// Normalize exchange data to common format
// All rates normalized to: { ticker, rate (percent), interval (hours), apr (percent), name }
function normalizeVariationalData(variationalPairs) {
    const normalized = {};
    Object.keys(variationalPairs).forEach(ticker => {
        const data = variationalPairs[ticker];
        normalized[ticker] = {
            ticker: ticker,
            rate: data.variational, // Already in percent format
            interval: data.variationalInterval || EXCHANGES.variational.fundingIntervalHours,
            apr: data.variationalAnnual,
            name: data.name || ticker
        };
    });
    return normalized;
}

function normalizeBinanceData(binanceData) {
    const normalized = {};
    Object.keys(binanceData).forEach(ticker => {
        const data = binanceData[ticker];
        // Binance rate is already in percent format (from fetchBinanceData: * 100)
        const interval = data.interval || EXCHANGES.binance.fundingIntervalHours;
        normalized[ticker] = {
            ticker: ticker,
            rate: data.rate, // Already in percent format
            interval: interval,
            apr: data.rate * (365 * 24 / interval)
        };
    });
    return normalized;
}

function normalizeBybitData(bybitData) {
    const normalized = {};
    Object.keys(bybitData).forEach(ticker => {
        const data = bybitData[ticker];
        // Bybit rate is already in percent format (from fetchBybitData: * 100)
        const interval = data.interval || EXCHANGES.bybit.fundingIntervalHours;
        normalized[ticker] = {
            ticker: ticker,
            rate: data.rate, // Already in percent format
            interval: interval,
            apr: data.rate * (365 * 24 / interval)
        };
    });
    return normalized;
}

function normalizeHyperliquidData(hyperliquidData) {
    const normalized = {};
    Object.keys(hyperliquidData).forEach(ticker => {
        const data = hyperliquidData[ticker];
        // Hyperliquid rate is already in percent format (from fetchHyperliquidData: * 100)
        const interval = data.interval || EXCHANGES.hyperliquid.fundingIntervalHours;
        normalized[ticker] = {
            ticker: ticker,
            rate: data.rate, // Already in percent format
            interval: interval,
            apr: data.rate * (365 * 24 / interval)
        };
    });
    return normalized;
}

function normalizeLighterData(lighterData) {
    const normalized = {};
    Object.keys(lighterData).forEach(ticker => {
        const data = lighterData[ticker];
        // Lighter rate is already in percent format (from fetchLighterData: * 100)
        const interval = data.interval || EXCHANGES.lighter.fundingIntervalHours;
        normalized[ticker] = {
            ticker: ticker,
            rate: data.rate, // Already in percent format
            interval: interval,
            apr: data.rate * (365 * 24 / interval)
        };
    });
    return normalized;
}

// Fetch all data
async function fetchAllData() {
    const fullLoading = document.getElementById('fullLoading');
    const mainContent = document.getElementById('mainContent');
    const loadingStatus = document.getElementById('loadingStatus');
    const errorMessage = document.getElementById('errorMessage');
    const tableBody = document.getElementById('tableBody');
    
    // Show full screen loading
    if (fullLoading) {
        fullLoading.style.display = 'flex';
        fullLoading.classList.remove('hidden');
    }
    if (mainContent) {
        mainContent.style.display = 'none';
    }
    if (errorMessage) {
    errorMessage.style.display = 'none';
    }

    try {
        if (DEBUG_MODE) {
            console.log('=== Starting data fetch ===');
        }
        
        // Fetch all data in parallel for better performance
        // Add timeout wrapper to prevent hanging
        const fetchWithTimeout = async (fetchFn, timeoutMs = 10000, name = '') => {
            if (loadingStatus && name) {
                loadingStatus.textContent = `Collecting ${name} data...`;
            }
            return Promise.race([
                fetchFn(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout')), timeoutMs)
                )
            ]).catch(err => {
                console.warn(`${name} fetch timeout or error: ${err.message}`);
                return {}; // Return empty object on timeout/error
            });
        };
        
        if (loadingStatus) loadingStatus.textContent = 'Collecting all exchange data...';
        
        const [variationalRaw, binanceRaw, bybitRaw, hyperliquidRaw, lighterRaw] = await Promise.all([
            fetchWithTimeout(fetchVariationalData, 8000, 'Variational'),
            fetchWithTimeout(fetchBinanceData, 8000, 'Binance'),
            fetchWithTimeout(fetchBybitData, 8000, 'Bybit'),
            fetchWithTimeout(fetchHyperliquidData, 8000, 'Hyperliquid'),
            fetchWithTimeout(fetchLighterData, 20000, 'Lighter') // Lighter WebSocket timeout increased to 20s (15s internal + buffer)
        ]);
        
        if (loadingStatus) loadingStatus.textContent = 'Processing data...';
        
        if (DEBUG_MODE) {
            console.log(`Variational: ${Object.keys(variationalRaw).length} pairs`);
            console.log(`Binance: ${Object.keys(binanceRaw).length} pairs`);
            console.log(`Bybit: ${Object.keys(bybitRaw).length} pairs`);
            console.log(`Hyperliquid: ${Object.keys(hyperliquidRaw).length} pairs`);
            console.log(`Lighter: ${Object.keys(lighterRaw).length} pairs`);
        }

        // Normalize each exchange data individually to common format
        console.log('Normalizing exchange data...');
        const variationalNormalized = normalizeVariationalData(variationalRaw);
        const binanceNormalized = normalizeBinanceData(binanceRaw);
        const bybitNormalized = normalizeBybitData(bybitRaw);
        const hyperliquidNormalized = normalizeHyperliquidData(hyperliquidRaw);
        const lighterNormalized = normalizeLighterData(lighterRaw);
        
        if (DEBUG_MODE) {
            console.log('=== Data normalization complete ===');
        }

        // Combine all normalized exchange data
        const allExchangeData = {
            variational: variationalNormalized,
            binance: binanceNormalized,
            bybit: bybitNormalized,
            hyperliquid: hyperliquidNormalized,
            lighter: lighterNormalized
        };

        // Get all unique tickers from all exchanges (not just Variational)
        const allTickers = new Set();
        Object.keys(variationalNormalized).forEach(ticker => allTickers.add(ticker));
        Object.keys(binanceNormalized).forEach(ticker => allTickers.add(ticker));
        Object.keys(bybitNormalized).forEach(ticker => allTickers.add(ticker));
        Object.keys(hyperliquidNormalized).forEach(ticker => allTickers.add(ticker));
        Object.keys(lighterNormalized).forEach(ticker => allTickers.add(ticker));

        // Process each ticker and find arbitrage opportunities
        allPairs = [];
        allTickers.forEach(ticker => {
            // Collect all exchange rates for this ticker (all normalized to percent format)
            const exchangeRates = [];
            
            if (variationalNormalized[ticker]) {
                const data = variationalNormalized[ticker];
                exchangeRates.push({
                    name: 'Variational',
                    rate: data.rate,
                    interval: data.interval,
                    apr: data.apr
                });
            }
            if (binanceNormalized[ticker]) {
                const data = binanceNormalized[ticker];
                exchangeRates.push({
                    name: 'Binance',
                    rate: data.rate,
                    interval: data.interval,
                    apr: data.apr
                });
            }
            if (bybitNormalized[ticker]) {
                const data = bybitNormalized[ticker];
                exchangeRates.push({
                    name: 'Bybit',
                    rate: data.rate,
                    interval: data.interval,
                    apr: data.apr
                });
            }
            if (hyperliquidNormalized[ticker]) {
                const data = hyperliquidNormalized[ticker];
                exchangeRates.push({
                    name: 'Hyperliquid',
                    rate: data.rate,
                    interval: data.interval,
                    apr: data.apr
                });
            }
            if (lighterNormalized[ticker]) {
                const data = lighterNormalized[ticker];
                exchangeRates.push({
                    name: 'Lighter',
                    rate: data.rate,
                    interval: data.interval,
                    apr: data.apr
                });
            }

            // Need at least 2 exchanges to compare
            if (exchangeRates.length < 2) {
                return;
            }

            // Build pair object with all exchange data
            const varData = variationalNormalized[ticker];
            const pair = {
                ticker: ticker,
                name: varData ? varData.name : ticker,
                variational: variationalNormalized[ticker]?.rate ?? null,
                variationalInterval: variationalNormalized[ticker]?.interval ?? null,
                variationalAnnual: variationalNormalized[ticker]?.apr ?? null,
                binance: binanceNormalized[ticker]?.rate ?? null,
                binanceInterval: binanceNormalized[ticker]?.interval ?? null,
                bybit: bybitNormalized[ticker]?.rate ?? null,
                bybitInterval: bybitNormalized[ticker]?.interval ?? null,
                hyperliquid: hyperliquidNormalized[ticker]?.rate ?? null,
                hyperliquidInterval: hyperliquidNormalized[ticker]?.interval ?? null,
                lighter: lighterNormalized[ticker]?.rate ?? null,
                lighterInterval: lighterNormalized[ticker]?.interval ?? null
            };

            // Find best arbitrage opportunity by comparing all exchange rates
            // Sort by rate (ascending) - lowest rate = best for long, highest rate = best for short
            const sortedRates = exchangeRates.filter(e => e.rate !== null && e.rate !== undefined)
                .sort((a, b) => a.rate - b.rate);
            
            if (sortedRates.length < 2) {
                return;
            }

            const bestRate = sortedRates[0];      // Lowest rate (best for long)
            const worstRate = sortedRates[sortedRates.length - 1];  // Highest rate (best for short)
            
            // Calculate spread (difference between highest and lowest rate)
            // Note: rates are in percent format, so profit is also in percent
            const profit = Math.abs(worstRate.rate - bestRate.rate);
            
            if (profit > 0) {
                // Calculate estimated APR from spread
                // Use minimum interval for conservative APR calculation
                const intervals = sortedRates.map(r => r.interval).filter(i => i > 0);
                const minInterval = intervals.length > 0 ? Math.min(...intervals) : 8;
                const annualTimes = (365 * 24) / minInterval;
                const estimatedApr = profit * annualTimes; // profit is already in percent
                
                // Determine strategy: long on lower rate, short on higher rate
                pair.strategy = 'long';
                pair.strategyExchange = bestRate.name;
                pair.oppositeExchange = worstRate.name;
                pair.oppositeStrategy = 'short';
                pair.profit = profit;
                pair.estimatedApr = estimatedApr;

            allPairs.push(pair);
            }
        });

        // Sort by arbitrage profit (descending) on initial load
        allPairs = sortPairs(allPairs, 'strategy', 'desc');
        currentSort = { column: 'strategy', direction: 'desc' };
        
        displayTable(allPairs);
        displayTopArbitrage(allPairs);
        
        const marketCountEl = document.getElementById('marketCount');
        if (marketCountEl) {
            marketCountEl.textContent = `${allPairs.length} markets`;
        }
        
        // Hide loading and show main content
        if (loadingStatus) loadingStatus.textContent = 'Complete!';
        
        // Small delay for smooth transition
        setTimeout(() => {
            if (fullLoading) {
                fullLoading.classList.add('hidden');
                setTimeout(() => {
                    fullLoading.style.display = 'none';
                }, 300);
            }
            if (mainContent) {
                mainContent.style.display = 'block';
            }
        }, 500);
    } catch (error) {
        console.error('Error fetching data:', error);
        if (errorMessage) {
        errorMessage.textContent = `Error loading data: ${error.message}`;
        errorMessage.style.display = 'block';
        }
        if (loadingStatus) {
            loadingStatus.textContent = `Error: ${error.message}`;
        }
        // Still show main content even on error
        setTimeout(() => {
            if (fullLoading) {
                fullLoading.classList.add('hidden');
                setTimeout(() => {
                    fullLoading.style.display = 'none';
                }, 300);
            }
            if (mainContent) {
                mainContent.style.display = 'block';
            }
        }, 1000);
    }
}

// Setup calculator
function setupCalculator() {
    const calculatorBtn = document.getElementById('calculatorBtn');
    const calculatorModal = document.getElementById('calculatorModal');
    const modalClose = document.getElementById('modalClose');
    const calcPair = document.getElementById('calcPair');
    const calcLongExchange = document.getElementById('calcLongExchange');
    const calcShortExchange = document.getElementById('calcShortExchange');
    const calcResult = document.getElementById('calcResult');

    // Check if calculator elements exist (may not be in HTML yet)
    if (!calculatorBtn || !calculatorModal || !modalClose || !calcPair || !calcLongExchange || !calcShortExchange || !calcResult) {
        console.warn('Calculator elements not found in HTML, skipping calculator setup');
        return;
    }

    // Open modal
    calculatorBtn.addEventListener('click', () => {
        calculatorModal.style.display = 'block';
        updateCalculatorPairs();
    });

    // Close modal
    modalClose.addEventListener('click', () => {
        calculatorModal.style.display = 'none';
    });

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === calculatorModal) {
            calculatorModal.style.display = 'none';
        }
    });

    // Update pairs dropdown
    function updateCalculatorPairs() {
        calcPair.innerHTML = '<option value="">Select a pair</option>';
        if (allPairs && allPairs.length > 0) {
            allPairs.forEach(pair => {
                if (pair.profit > 0 && pair.strategyExchange && pair.oppositeExchange) {
                    const option = document.createElement('option');
                    option.value = pair.ticker;
                    option.textContent = `${pair.ticker} (Spread: ${(pair.profit * 100).toFixed(4)}%)`;
                    option.dataset.longExchange = pair.strategyExchange;
                    option.dataset.shortExchange = pair.oppositeExchange;
                    option.dataset.spread = pair.profit;
                    option.dataset.longRate = pair[pair.strategyExchange.toLowerCase()] || 0;
                    option.dataset.shortRate = pair[pair.oppositeExchange.toLowerCase()] || 0;
                    option.dataset.longInterval = pair[`${pair.strategyExchange.toLowerCase()}Interval`] || 8;
                    option.dataset.shortInterval = pair[`${pair.oppositeExchange.toLowerCase()}Interval`] || 8;
                    calcPair.appendChild(option);
                }
            });
        }
    }

    // Update exchanges when pair is selected
    calcPair.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        if (selectedOption.value) {
            const longExchange = selectedOption.dataset.longExchange;
            const shortExchange = selectedOption.dataset.shortExchange;
            
            calcLongExchange.innerHTML = `<option value="${longExchange}">${longExchange}</option>`;
            calcShortExchange.innerHTML = `<option value="${shortExchange}">${shortExchange}</option>`;
            
            calcLongExchange.disabled = false;
            calcShortExchange.disabled = false;
        } else {
            calcLongExchange.innerHTML = '<option value="">Select a pair first</option>';
            calcShortExchange.innerHTML = '<option value="">Select a pair first</option>';
            calcLongExchange.disabled = true;
            calcShortExchange.disabled = true;
        }
    });

    // Calculate function (reusable, called on any input change)
    function calculateResults() {
        const selectedOption = calcPair.options[calcPair.selectedIndex];
        if (!selectedOption || !selectedOption.value) {
            // Clear results if no pair selected
            document.getElementById('resultSpread').textContent = '-';
            document.getElementById('resultFundingProfit').textContent = '-';
            document.getElementById('resultFundingCount').textContent = '-';
            document.getElementById('resultTotalProfit').textContent = '-';
            document.getElementById('resultProfitRate').textContent = '-';
            document.getElementById('resultAPR').textContent = '-';
            return;
        }

        const positionSize = parseFloat(document.getElementById('calcPositionSize').value) || 0;
        const leverage = parseFloat(document.getElementById('calcLeverage').value) || 1;
        const duration = parseFloat(document.getElementById('calcDuration').value) || 0;

        if (positionSize <= 0 || duration <= 0) {
            // Show placeholder if invalid input
            document.getElementById('resultSpread').textContent = '-';
            document.getElementById('resultFundingProfit').textContent = '-';
            document.getElementById('resultFundingCount').textContent = '-';
            document.getElementById('resultTotalProfit').textContent = '-';
            document.getElementById('resultProfitRate').textContent = '-';
            document.getElementById('resultAPR').textContent = '-';
            return;
        }

        const spread = parseFloat(selectedOption.dataset.spread); // Already in percent (e.g., 0.00352 = 0.352%)
        const longInterval = parseFloat(selectedOption.dataset.longInterval);
        const shortInterval = parseFloat(selectedOption.dataset.shortInterval);
        const minInterval = Math.min(longInterval, shortInterval);

        // Calculate funding count
        const fundingCount = Math.floor(duration / minInterval);

        // Calculate profit per funding
        // spread is in percent, so profit per funding = positionSize * spread / 100
        const profitPerFunding = positionSize * spread / 100;

        // Total profit
        const totalProfit = profitPerFunding * fundingCount;

        // Profit rate
        const profitRate = (totalProfit / positionSize) * 100;

        // APR calculation
        const annualTimes = (365 * 24) / minInterval;
        const apr = spread * annualTimes;

        // Display results immediately
        document.getElementById('resultSpread').textContent = `${(spread * 100).toFixed(4)}%`;
        document.getElementById('resultFundingProfit').textContent = `$${profitPerFunding.toFixed(2)}`;
        document.getElementById('resultFundingCount').textContent = `${fundingCount} times`;
        document.getElementById('resultTotalProfit').textContent = `$${totalProfit.toFixed(2)}`;
        document.getElementById('resultProfitRate').textContent = `${profitRate >= 0 ? '+' : ''}${profitRate.toFixed(4)}%`;
        document.getElementById('resultProfitRate').className = `result-value-large ${profitRate >= 0 ? '' : 'negative'}`;
        document.getElementById('resultAPR').textContent = `${apr >= 0 ? '+' : ''}${apr.toFixed(2)}%`;
        document.getElementById('resultAPR').className = `result-value-large ${apr >= 0 ? '' : 'negative'}`;
    }

    // Update exchanges when pair is selected
    calcPair.addEventListener('change', (e) => {
        const selectedOption = e.target.options[e.target.selectedIndex];
        if (selectedOption.value) {
            const longExchange = selectedOption.dataset.longExchange;
            const shortExchange = selectedOption.dataset.shortExchange;
            
            calcLongExchange.innerHTML = `<option value="${longExchange}">${longExchange}</option>`;
            calcShortExchange.innerHTML = `<option value="${shortExchange}">${shortExchange}</option>`;
            
            calcLongExchange.disabled = false;
            calcShortExchange.disabled = false;
        } else {
            calcLongExchange.innerHTML = '<option value="">Select a pair first</option>';
            calcShortExchange.innerHTML = '<option value="">Select a pair first</option>';
            calcLongExchange.disabled = true;
            calcShortExchange.disabled = true;
        }
        // Calculate immediately when pair changes
        calculateResults();
    });

    // Calculate on input change (real-time calculation)
    document.getElementById('calcPositionSize').addEventListener('input', calculateResults);
    document.getElementById('calcLeverage').addEventListener('input', calculateResults);
    document.getElementById('calcDuration').addEventListener('input', calculateResults);
    
    // Initial calculation if default values are set
    setTimeout(calculateResults, 100);
}

// Initialize
function initialize() {
    setupSorting();
    setupSearch();
    setupTopArbitrageSearch();
    setupDisplayToggle();
    setupCalculator();
    fetchAllData();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
