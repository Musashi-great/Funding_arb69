// Telegram notification function for top 3 arbitrage opportunities
// This function fetches data, calculates top 3 opportunities, and sends Telegram notification

// Use native fetch (Node.js 18+)
const fetch = globalThis.fetch;

// Helper function to extract exchange data
function extractExchangeData(dataItem, defaultInterval) {
    if (!dataItem) return { rate: null, interval: defaultInterval };
    if (typeof dataItem === 'object' && dataItem.rate !== undefined) {
        return { rate: dataItem.rate, interval: dataItem.interval || defaultInterval };
    }
    return { rate: dataItem, interval: defaultInterval };
}

// Fetch arbitrage data from shared API endpoint
// This uses the same logic as the website to ensure consistency
async function fetchAllExchangeData() {
    try {
        // Get the site URL from environment or use default
        const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://your-site.netlify.app';
        const apiUrl = `${siteUrl}/.netlify/functions/getArbitrageData?top=3`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.success && data.top) {
            return data.top;
        }
        
        // Fallback to old method if API fails
        console.warn('getArbitrageData API failed, using fallback method');
        return await fetchAllExchangeDataFallback();
    } catch (error) {
        console.error('Error fetching from getArbitrageData API:', error);
        // Fallback to old method
        return await fetchAllExchangeDataFallback();
    }
}

// Fallback method (original implementation without Lighter)
async function fetchAllExchangeDataFallback() {
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

    // Fetch all data in parallel
    const [variationalRes, binanceRes, bybitRes, hyperliquidRes] = await Promise.all([
        fetch(`${EXCHANGES.variational.baseUrl}${EXCHANGES.variational.endpoint}`).catch(() => null),
        fetch(`${EXCHANGES.binance.baseUrl}${EXCHANGES.binance.endpoint}`).catch(() => null),
        fetch(`${EXCHANGES.bybit.baseUrl}${EXCHANGES.bybit.endpoint}`).catch(() => null),
        fetch(`${EXCHANGES.hyperliquid.baseUrl}${EXCHANGES.hyperliquid.endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'metaAndAssetCtxs' })
        }).catch(() => null)
    ]);

    // Parse responses
    const variationalData = variationalRes?.ok ? await variationalRes.json() : null;
    const binanceData = binanceRes?.ok ? await binanceRes.json() : null;
    const bybitData = bybitRes?.ok ? await bybitRes.json() : null;
    const hyperliquidData = hyperliquidRes?.ok ? await hyperliquidRes.json() : null;

    // Process Variational data
    const variationalPairs = {};
    if (variationalData?.listings) {
        variationalData.listings.forEach(listing => {
            if (!listing.ticker) return;
            const fundingIntervalSeconds = listing.funding_interval_s || 28800;
            const fundingIntervalHours = fundingIntervalSeconds / 3600;
            const annualRatePercent = (parseFloat(listing.funding_rate || 0)) * 100;
            const annualTimes = (365 * 24) / fundingIntervalHours;
            const intervalRatePercent = annualRatePercent / annualTimes;
            
            variationalPairs[listing.ticker] = {
                ticker: listing.ticker,
                name: listing.name || listing.ticker,
                variational: intervalRatePercent,
                variationalInterval: fundingIntervalHours,
                variationalAnnual: annualRatePercent
            };
        });
    }

    // Process Binance data
    const binancePairs = {};
    if (Array.isArray(binanceData)) {
        binanceData.forEach(item => {
            if (item.symbol?.endsWith('USDT')) {
                const ticker = item.symbol.replace('USDT', '');
                binancePairs[ticker] = {
                    rate: parseFloat(item.lastFundingRate || 0) * 100,
                    interval: EXCHANGES.binance.fundingIntervalHours
                };
            }
        });
    }

    // Process Bybit data
    const bybitPairs = {};
    if (bybitData?.result?.list) {
        bybitData.result.list.forEach(item => {
            if (item.symbol?.endsWith('USDT')) {
                const ticker = item.symbol.replace('USDT', '');
                const rate = parseFloat(item.fundingRate || 0) * 100;
                if (rate !== 0) {
                    bybitPairs[ticker] = {
                        rate: rate,
                        interval: EXCHANGES.bybit.fundingIntervalHours
                    };
                }
            }
        });
    }

    // Process Hyperliquid data
    const hyperliquidPairs = {};
    if (Array.isArray(hyperliquidData) && hyperliquidData.length >= 2) {
        const metadata = hyperliquidData[0];
        const assetContexts = hyperliquidData[1];
        if (metadata?.universe && Array.isArray(assetContexts)) {
            metadata.universe.forEach((asset, index) => {
                const ticker = asset.name;
                const context = assetContexts[index];
                if (ticker && context?.funding !== undefined) {
                    hyperliquidPairs[ticker] = {
                        rate: parseFloat(context.funding || 0) * 100,
                        interval: EXCHANGES.hyperliquid.fundingIntervalHours
                    };
                }
            });
        }
    }

    // Process Lighter data using WebSocket
    // Note: Lighter requires WebSocket connection, which is complex in serverless functions
    // For now, we'll try to get Lighter data, but if it fails, we'll continue without it
    const lighterPairs = {};
    // TODO: Add Lighter WebSocket data fetching logic here
    // For now, Lighter data will be null, but the structure matches the website

    // Combine all pairs
    const allPairs = [];
    Object.keys(variationalPairs).forEach(ticker => {
        const varData = variationalPairs[ticker];
        const binanceDataItem = binancePairs[ticker];
        const bybitDataItem = bybitPairs[ticker];
        const hyperliquidDataItem = hyperliquidPairs[ticker];
        const lighterDataItem = lighterPairs[ticker];

        const binanceDataExtracted = extractExchangeData(binanceDataItem, EXCHANGES.binance.fundingIntervalHours);
        const bybitDataExtracted = extractExchangeData(bybitDataItem, EXCHANGES.bybit.fundingIntervalHours);
        const hyperliquidDataExtracted = extractExchangeData(hyperliquidDataItem, EXCHANGES.hyperliquid.fundingIntervalHours);
        const lighterDataExtracted = extractExchangeData(lighterDataItem, EXCHANGES.lighter.fundingIntervalHours);

        const exchanges = [
            { name: 'Variational', rate: varData.variational },
            { name: 'Binance', rate: binanceDataExtracted.rate },
            { name: 'Bybit', rate: bybitDataExtracted.rate },
            { name: 'Hyperliquid', rate: hyperliquidDataExtracted.rate },
            { name: 'Lighter', rate: lighterDataExtracted.rate }
        ];

        let bestProfit = 0;
        let bestStrategy = null;
        let bestStrategyExchange = null;
        let bestOppositeExchange = null;

        for (let i = 0; i < exchanges.length; i++) {
            for (let j = i + 1; j < exchanges.length; j++) {
                const e1 = exchanges[i];
                const e2 = exchanges[j];
                if (e1.rate === null || e2.rate === null) continue;

                const profit = Math.abs(e1.rate - e2.rate);
                if (profit > bestProfit) {
                    bestProfit = profit;
                    if (e1.rate > e2.rate) {
                        bestStrategy = 'short';
                        bestStrategyExchange = e1.name;
                        bestOppositeExchange = e2.name;
                    } else {
                        bestStrategy = 'long';
                        bestStrategyExchange = e1.name;
                        bestOppositeExchange = e2.name;
                    }
                }
            }
        }

        if (bestProfit > 0 && bestStrategy) {
            allPairs.push({
                ticker: varData.ticker,
                name: varData.name,
                profit: bestProfit,
                strategy: bestStrategy,
                strategyExchange: bestStrategyExchange,
                oppositeExchange: bestOppositeExchange
            });
        }
    });

    // Sort by profit and return top 3
    return allPairs
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 3);
}

// Send Telegram message
async function sendTelegramMessage(botToken, chatId, message) {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'HTML'
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Telegram API error: ${response.status} - ${error}`);
        }

        return await response.json();
    } catch (error) {
        console.error('Error sending Telegram message:', error);
        throw error;
    }
}

// Format message for top 3 arbitrage opportunities
function formatTelegramMessage(top3) {
    if (top3.length === 0) {
        return '📊 <b>No arbitrage opportunities found</b>';
    }

    let message = '🚀 <b>Top 3 Arbitrage Opportunities</b>\n\n';
    
    top3.forEach((pair, index) => {
        const profitFormatted = `${pair.profit >= 0 ? '+' : ''}${pair.profit.toFixed(4)}%`;
        const strategyIcon = pair.strategy === 'long' ? '↗' : '↘';
        const oppositeIcon = pair.strategy === 'short' ? '↗' : '↘';
        
        message += `${index + 1}. <b>${pair.ticker}</b> - ${profitFormatted}\n`;
        message += `   ${strategyIcon} ${pair.strategyExchange} ${pair.strategy.toUpperCase()}\n`;
        message += `   ${oppositeIcon} ${pair.oppositeExchange} ${pair.strategy === 'long' ? 'SHORT' : 'LONG'}\n\n`;
    });

    const now = new Date();
    message += `⏰ <i>Updated: ${now.toLocaleString('ko-KR')}</i>`;
    
    return message;
}

// Calculate next funding time for each exchange
function getNextFundingTime(intervalHours) {
    const now = new Date();
    const hours = now.getHours();
    
    if (intervalHours === 1) {
        // Hourly funding - next hour
        const nextHour = new Date(now);
        nextHour.setHours(hours + 1, 0, 0, 0);
        return nextHour;
    } else if (intervalHours === 8) {
        // 8-hour funding - next funding at 00:00, 08:00, 16:00 UTC
        const nextFundingHours = [0, 8, 16];
        let nextHour = nextFundingHours.find(h => h > hours) || nextFundingHours[0];
        if (nextHour < hours) {
            // If past last funding of the day, go to next day
            const nextDay = new Date(now);
            nextDay.setDate(nextDay.getDate() + 1);
            nextDay.setHours(nextHour, 0, 0, 0);
            return nextDay;
        }
        const nextTime = new Date(now);
        nextTime.setHours(nextHour, 0, 0, 0);
        return nextTime;
    } else {
        // For other intervals, calculate based on interval
        const nextTime = new Date(now);
        nextTime.setHours(nextTime.getHours() + intervalHours);
        return nextTime;
    }
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
        // Get Telegram bot token and chat ID from environment variables
        const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
        const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

        if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Missing Telegram credentials. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables.'
                })
            };
        }

        // Fetch top 3 arbitrage opportunities
        const top3 = await fetchAllExchangeData();

        if (top3.length === 0) {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    message: 'No arbitrage opportunities found',
                    top3: []
                })
            };
        }

        // Format and send Telegram message
        const message = formatTelegramMessage(top3);
        await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, message);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                message: 'Telegram notification sent successfully',
                top3: top3.map(p => ({
                    ticker: p.ticker,
                    profit: p.profit,
                    strategy: p.strategy,
                    strategyExchange: p.strategyExchange,
                    oppositeExchange: p.oppositeExchange
                }))
            })
        };
    } catch (error) {
        console.error('Error in sendTelegramNotification:', error);
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

