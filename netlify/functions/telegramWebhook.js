// Telegram webhook handler for bot commands
// Handles /funding command to send top 5 arbitrage opportunities

const fetch = globalThis.fetch;

// Fetch arbitrage data from shared API endpoint
// This uses the same logic as the website to ensure consistency
async function fetchTop5Arbitrage() {
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
            // Ensure data is sorted by estimatedApr (descending) - highest first
            const sortedTop = data.top.sort((a, b) => {
                const aApr = a.estimatedApr || 0;
                const bApr = b.estimatedApr || 0;
                // Ensure numeric comparison
                const aNum = typeof aApr === 'number' ? aApr : parseFloat(aApr) || 0;
                const bNum = typeof bApr === 'number' ? bApr : parseFloat(bApr) || 0;
                const result = bNum - aNum; // Descending order (highest first)
                
                // Debug log for first 3 items
                if (data.top.indexOf(a) < 3 || data.top.indexOf(b) < 3) {
                    console.log(`Sorting: ${a.symbol} (${aNum.toFixed(2)}%) vs ${b.symbol} (${bNum.toFixed(2)}%) = ${result > 0 ? 'b > a' : result < 0 ? 'a > b' : 'equal'}`);
                }
                
                return result;
            });
            
            // Debug: Log final sorted order
            console.log('Final sorted top 3:');
            sortedTop.slice(0, 3).forEach((item, i) => {
                console.log(`  ${i + 1}. ${item.symbol}: ${item.estimatedApr?.toFixed(2)}%`);
            });
            
            return sortedTop;
        }
        
        // Fallback to old method if API fails
        console.warn('getArbitrageData API failed, using fallback method');
        return await fetchTop5ArbitrageFallback();
    } catch (error) {
        console.error('Error fetching from getArbitrageData API:', error);
        // Fallback to old method
        return await fetchTop5ArbitrageFallback();
    }
}

// Fallback method (original implementation without Lighter)
async function fetchTop5ArbitrageFallback() {
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

    function extractExchangeData(dataItem, defaultInterval) {
        if (!dataItem) return { rate: null, interval: defaultInterval };
        if (typeof dataItem === 'object' && dataItem.rate !== undefined) {
            return { rate: dataItem.rate, interval: dataItem.interval || defaultInterval };
        }
        return { rate: dataItem, interval: defaultInterval };
    }

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
    
    // Try to fetch Lighter data via WebSocket (simplified version for serverless)
    // In a real implementation, you might want to use a WebSocket library like 'ws'
    // For now, we'll leave it empty and the calculation will work without Lighter data
    // This matches the website structure but Lighter data will be null if not available

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

// Format message for top 3 arbitrage opportunities
function formatTelegramMessage(top3) {
    if (top3.length === 0) {
        return '=== No Arbitrage Opportunities Found ===';
    }

    let message = '=== Top 3 Arbitrage Opportunities ===\n\n';
    
    top3.forEach((market, index) => {
        const symbol = market.symbol || '-';
        const estimatedApr = market.estimatedApr || 0;
        const spread = market.spread || 0;
        const longExchange = market.longExchange || '-';
        const shortExchange = market.shortExchange || '-';
        const confidence = market.confidence || 'medium';
        
        // Format confidence indicator
        const confidenceTag = confidence === 'high' ? '[HIGH]' : confidence === 'medium' ? '[MED]' : '[LOW]';
        
        // Format APR
        const aprFormatted = `${estimatedApr >= 0 ? '+' : ''}${estimatedApr.toFixed(2)}%`;
        
        // Format spread (convert from decimal to percent)
        const spreadPercent = spread * 100;
        const spreadFormatted = `${spreadPercent.toFixed(4)}%`;
        
        message += `#${index + 1} ${symbol} ${confidenceTag}\n`;
        message += `APR: ${aprFormatted} | Spread: ${spreadFormatted}\n`;
        message += `Long: ${longExchange.toUpperCase()} | Short: ${shortExchange.toUpperCase()}\n\n`;
    });

    const now = new Date();
    const dateStr = now.toISOString().replace('T', ' ').substring(0, 19);
    message += `---\nUpdated: ${dateStr}`;
    
    return message;
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
                    error: 'Missing Telegram credentials'
                })
            };
        }

        // Parse webhook update from Telegram
        let update;
        try {
            update = JSON.parse(event.body);
        } catch (e) {
            // If body is not JSON, might be a GET request (webhook setup)
            if (event.httpMethod === 'GET') {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ message: 'Webhook endpoint is active' })
                };
            }
            throw new Error('Invalid request body');
        }

        // Check if it's a message update
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const text = message.text || '';

            // Handle /funding command
            if (text.startsWith('/funding') || text.startsWith('/start')) {
                // Send "Loading..." message
                await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, 'Loading data...');

                // Fetch top 3 arbitrage opportunities
                const top3 = await fetchTop5Arbitrage();

                // Format and send message
                const formattedMessage = formatTelegramMessage(top3);
                await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, formattedMessage);

                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ ok: true, message: 'Notification sent' })
                };
            }

            // Handle /help command
            if (text.startsWith('/help')) {
                const helpMessage = `=== Funding Rate Arbitrage Bot ===\n\n` +
                    `Commands:\n` +
                    `/funding - View top 3 arbitrage opportunities\n` +
                    `/help - Show help\n\n` +
                    `Automatic notifications are sent hourly.`;
                
                await sendTelegramMessage(TELEGRAM_BOT_TOKEN, chatId, helpMessage);
                
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({ ok: true })
                };
            }
        }

        // Return success for other updates (to acknowledge receipt)
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ ok: true })
        };
    } catch (error) {
        console.error('Error in telegramWebhook:', error);
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

