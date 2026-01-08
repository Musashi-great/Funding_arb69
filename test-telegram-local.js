// 로컬에서 텔레그램 봇 테스트 스크립트
// 사용법: node test-telegram-local.js

const fetch = require('node-fetch');

// 설정 (필요시 수정)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || '1374527604';

// Arbitrage 데이터 가져오기 함수 (telegramWebhook.js와 동일)
async function fetchTop5Arbitrage() {
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
        }
    };

    function extractExchangeData(dataItem, defaultInterval) {
        if (!dataItem) return { rate: null, interval: defaultInterval };
        if (typeof dataItem === 'object' && dataItem.rate !== undefined) {
            return { rate: dataItem.rate, interval: dataItem.interval || defaultInterval };
        }
        return { rate: dataItem, interval: defaultInterval };
    }

    console.log('📡 거래소 데이터 가져오는 중...');

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

    // Combine all pairs
    const allPairs = [];
    Object.keys(variationalPairs).forEach(ticker => {
        const varData = variationalPairs[ticker];
        const binanceDataItem = binancePairs[ticker];
        const bybitDataItem = bybitPairs[ticker];
        const hyperliquidDataItem = hyperliquidPairs[ticker];

        const binanceDataExtracted = extractExchangeData(binanceDataItem, EXCHANGES.binance.fundingIntervalHours);
        const bybitDataExtracted = extractExchangeData(bybitDataItem, EXCHANGES.bybit.fundingIntervalHours);
        const hyperliquidDataExtracted = extractExchangeData(hyperliquidDataItem, EXCHANGES.hyperliquid.fundingIntervalHours);

        const exchanges = [
            { name: 'Variational', rate: varData.variational },
            { name: 'Binance', rate: binanceDataExtracted.rate },
            { name: 'Bybit', rate: bybitDataExtracted.rate },
            { name: 'Hyperliquid', rate: hyperliquidDataExtracted.rate }
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

    // Sort by profit and return top 5
    return allPairs
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 5);
}

// Format message for top 5 arbitrage opportunities
function formatTelegramMessage(top5) {
    if (top5.length === 0) {
        return '📊 <b>No arbitrage opportunities found</b>';
    }

    let message = '🚀 <b>Top 5 Arbitrage Opportunities</b>\n\n';
    
    top5.forEach((pair, index) => {
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

// Send Telegram message
async function sendTelegramMessage(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const data = await response.json();
        
        if (data.ok) {
            console.log('✅ 메시지 전송 성공!');
            return data;
        } else {
            console.error('❌ 전송 실패:', JSON.stringify(data, null, 2));
            throw new Error(`Telegram API error: ${data.description || 'Unknown error'}`);
        }
    } catch (error) {
        console.error('❌ 에러:', error.message);
        throw error;
    }
}

// Main execution
(async () => {
    console.log('🤖 텔레그램 봇 로컬 테스트 시작\n');
    console.log(`봇 토큰: ${TELEGRAM_BOT_TOKEN.substring(0, 10)}...`);
    console.log(`채팅 ID: ${TELEGRAM_CHAT_ID}\n`);

    try {
        console.log('📊 Arbitrage 데이터 가져오는 중...');
        const top5 = await fetchTop5Arbitrage();
        
        console.log(`✅ ${top5.length}개의 기회 발견\n`);
        
        console.log('📝 메시지 포맷팅 중...');
        const message = formatTelegramMessage(top5);
        
        console.log('\n📤 텔레그램 메시지 전송 중...');
        await sendTelegramMessage(message);
        
        console.log('\n✨ 테스트 완료! 텔레그램에서 메시지를 확인하세요.');
    } catch (error) {
        console.error('\n❌ 테스트 실패:', error.message);
        process.exit(1);
    }
})();
