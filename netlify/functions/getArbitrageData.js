// Get arbitrage data - uses the exact same logic as script.js
// This function fetches data from all exchanges and returns the top arbitrage opportunities

const fetch = globalThis.fetch;

// Exchange API configuration (same as script.js)
const EXCHANGES = {
    variational: {
        baseUrl: 'https://omni-client-api.prod.ap-northeast-1.variational.io',
        endpoint: '/metadata/stats',
        fundingIntervalHours: 8
    },
    binance: {
        baseUrl: 'https://fapi.binance.com',
        endpoint: '/fapi/v1/premiumIndex',
        fundingIntervalHours: 8
    },
    bybit: {
        baseUrl: 'https://api.bybit.com',
        endpoint: '/v5/market/tickers',
        fundingIntervalHours: 8
    },
    hyperliquid: {
        baseUrl: 'https://api.hyperliquid.xyz',
        endpoint: '/info',
        fundingIntervalHours: 1
    },
    lighter: {
        baseUrl: 'https://mainnet.zklighter.elliot.ai',
        endpoint: '/api/v1/orderBooks',
        fundingIntervalHours: 1
    }
};

// Fetch Variational data (same as script.js)
async function fetchVariationalData() {
    try {
        const response = await fetch(`${EXCHANGES.variational.baseUrl}${EXCHANGES.variational.endpoint}`);
        if (!response.ok) return {};
        const data = await response.json();
        const pairs = {};
        if (data?.listings) {
            data.listings.forEach(listing => {
                if (!listing.ticker) return;
                const fundingIntervalSeconds = listing.funding_interval_s || 28800;
                const fundingIntervalHours = fundingIntervalSeconds / 3600;
                const annualRatePercent = (parseFloat(listing.funding_rate || 0)) * 100;
                const annualTimes = (365 * 24) / fundingIntervalHours;
                const intervalRatePercent = annualRatePercent / annualTimes;
                
                pairs[listing.ticker] = {
                    ticker: listing.ticker,
                    name: listing.name || listing.ticker,
                    variational: intervalRatePercent,
                    variationalInterval: fundingIntervalHours,
                    variationalAnnual: annualRatePercent
                };
            });
        }
        return pairs;
    } catch (error) {
        console.error('Error fetching Variational data:', error);
        return {};
    }
}

// Fetch Binance data (same as script.js)
async function fetchBinanceData() {
    try {
        const response = await fetch(`${EXCHANGES.binance.baseUrl}${EXCHANGES.binance.endpoint}`);
        if (!response.ok) return {};
        const data = await response.json();
        const pairs = {};
        if (Array.isArray(data)) {
            data.forEach(item => {
                if (item.symbol?.endsWith('USDT')) {
                    const ticker = item.symbol.replace('USDT', '');
                    pairs[ticker] = {
                        rate: parseFloat(item.lastFundingRate || 0) * 100,
                        interval: EXCHANGES.binance.fundingIntervalHours
                    };
                }
            });
        }
        return pairs;
    } catch (error) {
        console.error('Error fetching Binance data:', error);
        return {};
    }
}

// Fetch Bybit data (same as script.js)
async function fetchBybitData() {
    try {
        const response = await fetch(`${EXCHANGES.bybit.baseUrl}${EXCHANGES.bybit.endpoint}`);
        if (!response.ok) return {};
        const data = await response.json();
        const pairs = {};
        if (data?.result?.list) {
            data.result.list.forEach(item => {
                if (item.symbol?.endsWith('USDT')) {
                    const ticker = item.symbol.replace('USDT', '');
                    const rate = parseFloat(item.fundingRate || 0) * 100;
                    if (rate !== 0) {
                        pairs[ticker] = {
                            rate: rate,
                            interval: EXCHANGES.bybit.fundingIntervalHours
                        };
                    }
                }
            });
        }
        return pairs;
    } catch (error) {
        console.error('Error fetching Bybit data:', error);
        return {};
    }
}

// Fetch Hyperliquid data (same as script.js)
async function fetchHyperliquidData() {
    try {
        const response = await fetch(`${EXCHANGES.hyperliquid.baseUrl}${EXCHANGES.hyperliquid.endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'metaAndAssetCtxs' })
        });
        if (!response.ok) return {};
        const data = await response.json();
        const pairs = {};
        if (Array.isArray(data) && data.length >= 2) {
            const metadata = data[0];
            const assetContexts = data[1];
            if (metadata?.universe && Array.isArray(assetContexts)) {
                metadata.universe.forEach((asset, index) => {
                    const ticker = asset.name;
                    const context = assetContexts[index];
                    if (ticker && context?.funding !== undefined) {
                        pairs[ticker] = {
                            rate: parseFloat(context.funding || 0) * 100,
                            interval: EXCHANGES.hyperliquid.fundingIntervalHours
                        };
                    }
                });
            }
        }
        return pairs;
    } catch (error) {
        console.error('Error fetching Hyperliquid data:', error);
        return {};
    }
}

// Fetch Lighter data (simplified - WebSocket not available in serverless)
async function fetchLighterData() {
    // Note: Lighter requires WebSocket for funding rates
    // This is a placeholder - in production, use a WebSocket service or cache
    return {};
}

// Normalize exchange data to common format (same as script.js)
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

// Fetch all exchange data and calculate arbitrage (exact same logic as script.js)
async function fetchAllExchangeData() {
    // Fetch all data in parallel
    const [variationalRaw, binanceRaw, bybitRaw, hyperliquidRaw, lighterRaw] = await Promise.all([
        fetchVariationalData(),
        fetchBinanceData(),
        fetchBybitData(),
        fetchHyperliquidData(),
        fetchLighterData()
    ]);

    // Normalize each exchange data individually to common format (same as script.js)
    const variationalNormalized = normalizeVariationalData(variationalRaw);
    const binanceNormalized = normalizeBinanceData(binanceRaw);
    const bybitNormalized = normalizeBybitData(bybitRaw);
    const hyperliquidNormalized = normalizeHyperliquidData(hyperliquidRaw);
    const lighterNormalized = normalizeLighterData(lighterRaw);

    // Get all unique tickers from all exchanges (same as script.js)
    const allTickers = new Set();
    Object.keys(variationalNormalized).forEach(ticker => allTickers.add(ticker));
    Object.keys(binanceNormalized).forEach(ticker => allTickers.add(ticker));
    Object.keys(bybitNormalized).forEach(ticker => allTickers.add(ticker));
    Object.keys(hyperliquidNormalized).forEach(ticker => allTickers.add(ticker));
    Object.keys(lighterNormalized).forEach(ticker => allTickers.add(ticker));

    // Process each ticker and find arbitrage opportunities (exact same logic as script.js)
    const markets = [];
    
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
            // Calculate estimated APR from spread (exact same logic as script.js)
            // Use minimum interval for conservative APR calculation
            const intervals = sortedRates.map(r => r.interval).filter(i => i > 0);
            const minInterval = intervals.length > 0 ? Math.min(...intervals) : 8;
            const annualTimes = (365 * 24) / minInterval;
            const estimatedApr = profit * annualTimes; // profit is already in percent

            const varData = variationalNormalized[ticker];
            const market = {
                symbol: ticker,
                baseAsset: ticker.replace('-PERP', ''),
                quoteAsset: 'USD',
                spread: profit / 100, // Convert to decimal for API response
                estimatedApr: estimatedApr, // Percent format (same as script.js)
                longExchange: bestRate.name.toLowerCase(),
                shortExchange: worstRate.name.toLowerCase(),
                confidence: profit > 0.1 ? 'high' : profit > 0.05 ? 'medium' : 'low',
                variational: varData ? {
                    rate: varData.rate / 100,
                    apr: varData.apr,
                    interval: varData.interval,
                    name: varData.name
                } : null
            };

            markets.push(market);
        }
    });

    // Sort by estimatedApr (descending) to get top opportunities (same as script.js)
    markets.sort((a, b) => {
        const aApr = a.estimatedApr || 0;
        const bApr = b.estimatedApr || 0;
        return bApr - aApr; // Descending order (highest first)
    });

    return markets;
}

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        const markets = await fetchAllExchangeData();
        
        // Filter markets with valid arbitrage opportunities
        const validMarkets = markets.filter(market => 
            market.estimatedApr && 
            market.estimatedApr > 0
        );
        
        // Get top N (default 3, can be specified via query parameter)
        const topN = parseInt(event.queryStringParameters?.top || '3', 10);
        const topMarkets = validMarkets.slice(0, topN);

        // Format response
        const topOpportunities = topMarkets.map(market => ({
            symbol: market.symbol,
            baseAsset: market.baseAsset,
            quoteAsset: market.quoteAsset,
            spread: market.spread,
            estimatedApr: market.estimatedApr,
            longExchange: market.longExchange,
            shortExchange: market.shortExchange,
            confidence: market.confidence,
            variational: market.variational
        }));

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                total: validMarkets.length,
                top: topOpportunities
            })
        };
    } catch (error) {
        console.error('Error in getArbitrageData:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Internal server error',
                message: error.message
            })
        };
    }
};
