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
        
        try {
            // Use correct WebSocket URL from documentation: wss://mainnet.zklighter.elliot.ai/stream
            const wsUrl = EXCHANGES.lighter.wsUrl;
            console.log(`Lighter: Connecting to WebSocket ${wsUrl}`);
            
            ws = new WebSocket(wsUrl);
            
            // Set timeout (12 seconds to get initial data from all markets)
            timeoutId = setTimeout(() => {
                if (ws && ws.readyState === WebSocket.OPEN) {
                    console.log('Lighter: Closing WebSocket due to timeout');
                    ws.close();
                }
                console.log(`Lighter: WebSocket timeout, collected ${Object.keys(pairs).length} pairs`);
                if (Object.keys(pairs).length === 0) {
                    console.warn('⚠️ Lighter: No data collected from WebSocket');
                    console.warn('  Possible issues:');
                    console.warn('  1. WebSocket URL might be incorrect');
                    console.warn('  2. Authentication might be required');
                    console.warn('  3. Channel name might be different');
                    console.warn('  4. Server might not be sending data');
                }
                resolve(pairs);
            }, 12000);
            
            ws.onopen = () => {
                console.log('✅ Lighter: WebSocket connected successfully');
                // Subscribe to market_stats/all
                const subscribeMessage = {
                    type: 'subscribe',
                    channel: 'market_stats/all'
                };
                ws.send(JSON.stringify(subscribeMessage));
                console.log('Lighter: Sent subscription message:', JSON.stringify(subscribeMessage));
            };
            
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    
                    // Log first few messages for debugging
                    if (Object.keys(pairs).length < 3) {
                        console.log('Lighter: WebSocket message received:', JSON.stringify(data, null, 2));
                    }
                    
                    // Check if it's a market_stats update
                    // Documentation: https://apidocs.lighter.xyz/docs/websocket-reference
                    // Response type: "update/market_stats"
                    if (data.type === 'update/market_stats' && data.market_stats) {
                        // Handle single market stats (when subscribing to specific market)
                        if (data.market_stats.market_id !== undefined) {
                            const stats = data.market_stats;
                            const marketId = stats.market_id;
                            
                            // Use symbol directly from market_stats (more reliable than mapping)
                            const ticker = stats.symbol || marketIdToSymbol[marketId] || `MARKET_${marketId}`;
                            
                            // Get funding rate (prefer current_funding_rate, then funding_rate)
                            // Both are strings in decimal format (e.g., "0.0012" = 0.12%)
                            const fundingRateRaw = stats.current_funding_rate || stats.funding_rate;
                            
                                    if (fundingRateRaw !== undefined && fundingRateRaw !== null) {
                                        // Convert from decimal string to percentage
                                        let fundingRate = parseFloat(fundingRateRaw) * 100;
                                        
                                        if (!isNaN(fundingRate) && isFinite(fundingRate)) {
                                            // Use default funding interval (1 hour for Lighter)
                                            pairs[ticker] = {
                                                rate: fundingRate,
                                                interval: EXCHANGES.lighter.fundingIntervalHours
                                            };
                                            
                                            if (Object.keys(pairs).length <= 10) {
                                                console.log(`✅ Lighter [${ticker}]: market_id=${marketId}, funding_rate=${fundingRateRaw} → ${fundingRate}%`);
                                            }
                                        }
                                    } else if (Object.keys(pairs).length < 3) {
                                console.log(`⚠️ Lighter [${ticker}]: No funding rate in market_stats`);
                                console.log('  Market stats keys:', Object.keys(stats));
                            }
                        } 
                        // Handle market_stats/all response (all markets at once - object with market_index keys)
                        else if (typeof data.market_stats === 'object' && !Array.isArray(data.market_stats)) {
                            Object.keys(data.market_stats).forEach(marketIndex => {
                                const stats = data.market_stats[marketIndex];
                                if (stats && (stats.current_funding_rate || stats.funding_rate)) {
                                    // Use symbol directly from market_stats (more reliable than mapping)
                                    const ticker = stats.symbol || marketIdToSymbol[stats.market_id] || marketIdToSymbol[parseInt(marketIndex)] || `MARKET_${stats.market_id || marketIndex}`;
                                    
                                    // Get funding rate
                                    // current_funding_rate: 1-hour funding rate (preferred)
                                    // funding_rate: 8-hour funding rate (fallback)
                                    // Both are strings in decimal format (e.g., "0.0012" = 0.12%)
                                    // Use current_funding_rate as it's the 1-hour rate shown on Lighter website
                                    const fundingRateRaw = stats.current_funding_rate || stats.funding_rate;
                                    
                                    if (fundingRateRaw !== undefined && fundingRateRaw !== null) {
                                        // Convert from decimal string to percentage
                                        let fundingRate = parseFloat(fundingRateRaw) * 100;
                                        
                                        if (!isNaN(fundingRate) && isFinite(fundingRate)) {
                                            // Use default funding interval (1 hour for Lighter)
                                            pairs[ticker] = {
                                                rate: fundingRate,
                                                interval: EXCHANGES.lighter.fundingIntervalHours
                                            };
                                            
                                            if (Object.keys(pairs).length <= 10) {
                                                console.log(`✅ Lighter [${ticker}]: market_id=${stats.market_id}, funding_rate=${fundingRateRaw} → ${fundingRate}%`);
                                            }
                                        }
                                    } else if (Object.keys(pairs).length < 3) {
                                        console.log(`⚠️ Lighter [${ticker}]: No funding rate in market_stats`);
                                        console.log('  Market stats keys:', Object.keys(stats));
                                    }
                                }
                            });
                        }
                    } 
                    // Handle "connected" message (initial connection confirmation)
                    else if (data.type === 'connected') {
                        console.log('✅ Lighter: WebSocket connection confirmed');
                        // Connection is established, wait for market_stats data
                    }
                    else if (Object.keys(pairs).length < 3) {
                        console.log('Lighter: Received message, type:', data.type);
                        console.log('  Message keys:', Object.keys(data));
                        if (data.channel) {
                            console.log('  Channel:', data.channel);
                        }
                    }
                } catch (e) {
                    console.warn('Lighter: Failed to parse WebSocket message:', e);
                    console.warn('  Raw message:', event.data);
                }
            };
            
            ws.onerror = (error) => {
                // WebSocket connection failed - this is expected if the URL is wrong
                // Don't show error to user, just log it
                console.warn('Lighter: WebSocket connection failed (this is expected if WebSocket is not available)');
                console.warn('  WebSocket URL:', wsUrl);
                console.warn('  Note: Lighter API may require different WebSocket URL or authentication');
                if (timeoutId) clearTimeout(timeoutId);
                // Return empty pairs - app will work without Lighter data
                resolve(pairs);
            };
            
            ws.onclose = (event) => {
                if (event.code !== 1000 && event.code !== 1001) {
                    // Not a normal closure
                    console.warn(`Lighter: WebSocket closed unexpectedly (code: ${event.code})`);
                    if (Object.keys(pairs).length === 0) {
                        console.warn('  Lighter data will not be available. App will continue with other exchanges.');
                    }
                } else {
                    console.log(`Lighter: WebSocket closed normally, collected ${Object.keys(pairs).length} pairs`);
                }
                if (timeoutId) clearTimeout(timeoutId);
                resolve(pairs);
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
            
            // Use full exchange names (font size will be reduced in CSS)
            const strategyExchangeFull = pair.strategyExchange;
            const oppositeExchangeFull = pair.oppositeExchange;
            
            // Use profit from pair (already calculated in fetchAllData)
            const profitPercent = pair.profit || 0;
            const profitFormatted = profitPercent > 0 ? `${profitPercent >= 0 ? '+' : ''}${profitPercent.toFixed(4)}%` : '';
            
            // Strategy icons for better visualization
            const longIcon = '↗';
            const shortIcon = '↘';
            const strategyIcon = pair.strategy === 'long' ? longIcon : shortIcon;
            const oppositeIcon = pair.oppositeStrategy === 'long' ? longIcon : shortIcon;
            
            strategyHtml = `
                <div class="strategy-container">
                    <div class="strategy-profit-large">${profitFormatted || '-'}</div>
                    <div class="strategy-actions">
                        <div class="strategy-item ${strategyClass}">
                            <span class="strategy-icon">${strategyIcon}</span>
                            <span class="strategy-exchange">${strategyExchangeFull}</span>
                            <span class="strategy-label">${pair.strategy.toUpperCase()}</span>
                        </div>
                        <span class="strategy-separator">↔</span>
                        <div class="strategy-item ${oppositeClass}">
                            <span class="strategy-icon">${oppositeIcon}</span>
                            <span class="strategy-exchange">${oppositeExchangeFull}</span>
                            <span class="strategy-label">${pair.oppositeStrategy.toUpperCase()}</span>
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
function displayTopArbitrage(pairs) {
    const topArbitrageContainer = document.getElementById('topArbitrage');
    if (!topArbitrageContainer) return;
    
    // Filter pairs with valid arbitrage opportunities (profit > 0 and strategy exists)
    const validPairs = pairs.filter(pair => 
        pair.profit > 0 && 
        pair.strategy && 
        pair.strategyExchange && 
        pair.oppositeExchange
    );
    
    // Get top 3
    const top3 = validPairs.slice(0, 3);
    
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
        const strategyEl = card.querySelector('.card-strategy');
        
        if (tickerEl) {
            tickerEl.textContent = pair.ticker || '-';
        }
        
        if (profitEl) {
            const profitFormatted = `${pair.profit >= 0 ? '+' : ''}${pair.profit.toFixed(4)}%`;
            profitEl.textContent = profitFormatted;
        }
        
        if (strategyEl) {
            const strategyClass = pair.strategy === 'long' ? 'long' : 'short';
            const oppositeClass = pair.oppositeStrategy === 'long' ? 'long' : 'short';
            
            const longIcon = '↗';
            const shortIcon = '↘';
            const strategyIcon = pair.strategy === 'long' ? longIcon : shortIcon;
            const oppositeIcon = pair.oppositeStrategy === 'long' ? longIcon : shortIcon;
            
            strategyEl.innerHTML = `
                <div class="strategy-row ${strategyClass}">
                    <span class="strategy-icon">${strategyIcon}</span>
                    <span class="strategy-exchange">${pair.strategyExchange}</span>
                    <span class="strategy-label">${pair.strategy.toUpperCase()}</span>
                </div>
                <div class="strategy-arrow" style="text-align: center;">↔</div>
                <div class="strategy-row ${oppositeClass}">
                    <span class="strategy-icon">${oppositeIcon}</span>
                    <span class="strategy-exchange">${pair.oppositeExchange}</span>
                    <span class="strategy-label">${pair.oppositeStrategy.toUpperCase()}</span>
                </div>
            `;
        }
    });
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
                // Sort by profit (arbitrage opportunity)
                aVal = a.profit !== null && a.profit !== undefined ? a.profit : 0;
                bVal = b.profit !== null && b.profit !== undefined ? b.profit : 0;
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

// Fetch all data
async function fetchAllData() {
    const loading = document.getElementById('loading');
    const errorMessage = document.getElementById('errorMessage');
    const tableBody = document.getElementById('tableBody');
    
    loading.classList.add('show');
    errorMessage.style.display = 'none';

    try {
        if (DEBUG_MODE) {
            console.log('=== Starting data fetch ===');
        }
        
        // Fetch all data in parallel for better performance
        const [variationalPairs, binanceData, bybitData, hyperliquidData, lighterData] = await Promise.all([
            fetchVariationalData(),
            fetchBinanceData(),
            fetchBybitData(),
            fetchHyperliquidData(),
            fetchLighterData()
        ]);
        
        if (DEBUG_MODE) {
            console.log(`Variational: ${Object.keys(variationalPairs).length} pairs`);
            console.log(`Binance: ${Object.keys(binanceData).length} pairs`);
            console.log(`Bybit: ${Object.keys(bybitData).length} pairs`);
            console.log(`Hyperliquid: ${Object.keys(hyperliquidData).length} pairs`);
            console.log(`Lighter: ${Object.keys(lighterData).length} pairs`);
            console.log('=== Data fetch complete ===');
        }

        // Match Variational tickers with Binance funding rates
        allPairs = [];
        Object.keys(variationalPairs).forEach(ticker => {
            const varData = variationalPairs[ticker];
            if (!varData || !varData.ticker) return;
            
            // Get Binance, Bybit, Hyperliquid, and Lighter funding rates for this ticker (if available)
            // Each exchange data is now an object: { rate, interval, timestamp }
            const binanceDataItem = binanceData[ticker];
            const bybitDataItem = bybitData[ticker];
            const hyperliquidDataItem = hyperliquidData[ticker];
            const lighterDataItem = lighterData[ticker];
            
            // Extract rate and interval from each exchange data using helper function
            const binanceDataExtracted = extractExchangeData(binanceDataItem, EXCHANGES.binance.fundingIntervalHours);
            const bybitDataExtracted = extractExchangeData(bybitDataItem, EXCHANGES.bybit.fundingIntervalHours);
            const hyperliquidDataExtracted = extractExchangeData(hyperliquidDataItem, EXCHANGES.hyperliquid.fundingIntervalHours);
            const lighterDataExtracted = extractExchangeData(lighterDataItem, EXCHANGES.lighter.fundingIntervalHours);
            
            const pair = {
                ticker: varData.ticker,
                name: varData.name || varData.ticker,
                variational: varData.variational ?? null,
                variationalInterval: varData.variationalInterval || EXCHANGES.variational.fundingIntervalHours,
                variationalAnnual: varData.variationalAnnual ?? null,
                binance: binanceDataExtracted.rate,
                binanceInterval: binanceDataExtracted.interval,
                bybit: bybitDataExtracted.rate,
                bybitInterval: bybitDataExtracted.interval,
                hyperliquid: hyperliquidDataExtracted.rate,
                hyperliquidInterval: hyperliquidDataExtracted.interval,
                lighter: lighterDataExtracted.rate,
                lighterInterval: lighterDataExtracted.interval
            };

            // Calculate strategy and profit - find best arbitrage opportunity
            // Compare ALL exchanges with each other, not just Variational as base
            // Find the pair with the maximum funding rate difference
            const exchanges = [
                { name: 'Variational', rate: pair.variational },
                { name: 'Binance', rate: binanceDataExtracted.rate },
                { name: 'Bybit', rate: bybitDataExtracted.rate },
                { name: 'Hyperliquid', rate: hyperliquidDataExtracted.rate },
                { name: 'Lighter', rate: lighterDataExtracted.rate }
            ];
            
            let bestProfit = 0;
            let bestStrategy = null;
            let bestStrategyExchange = null;
            let bestOppositeExchange = null;
            let bestOppositeStrategy = null;
            
            // Compare all exchange pairs
            for (let i = 0; i < exchanges.length; i++) {
                for (let j = i + 1; j < exchanges.length; j++) {
                    const exchange1 = exchanges[i];
                    const exchange2 = exchanges[j];
                    
                    // Skip if either exchange has no data
                    if (exchange1.rate === null || exchange1.rate === undefined || 
                        exchange2.rate === null || exchange2.rate === undefined) {
                        continue;
                    }
                    
                    const profit = Math.abs(exchange1.rate - exchange2.rate);
                    
                    if (profit > bestProfit) {
                        bestProfit = profit;
                        
                        // Determine strategy: long on lower rate, short on higher rate
                        if (exchange1.rate > exchange2.rate) {
                            bestStrategy = 'short';
                            bestStrategyExchange = exchange1.name;
                            bestOppositeExchange = exchange2.name;
                            bestOppositeStrategy = 'long';
                        } else if (exchange1.rate < exchange2.rate) {
                            bestStrategy = 'long';
                            bestStrategyExchange = exchange1.name;
                            bestOppositeExchange = exchange2.name;
                            bestOppositeStrategy = 'short';
                        }
                    }
                }
            }
            
            pair.strategy = bestStrategy;
            pair.strategyExchange = bestStrategyExchange;
            pair.oppositeExchange = bestOppositeExchange;
            pair.oppositeStrategy = bestOppositeStrategy;
            pair.profit = bestProfit;

            allPairs.push(pair);
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
        
        loading.classList.remove('show');
    } catch (error) {
        console.error('Error fetching data:', error);
        errorMessage.textContent = `Error loading data: ${error.message}`;
        errorMessage.style.display = 'block';
        loading.classList.remove('show');
    }
}

// Initialize
function initialize() {
    setupSorting();
    setupSearch();
    setupDisplayToggle();
    fetchAllData();
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}
