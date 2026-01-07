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
    extended: {
        name: 'Extended',
        baseUrl: 'https://api.starknet.extended.exchange',
        endpoint: '/api/v1/info/markets', // Public API endpoint
        fundingIntervalHours: 1 // Extended funding is applied hourly
    }
};

// API keys are stored server-side in Netlify Functions (not exposed to client)

let allPairs = [];
let currentSort = { column: null, direction: null };
let displayMode = 'interval'; // 'annual' or 'interval' - default: show interval rate first (4hr, 8hr, etc.)

// Fetch Variational data
async function fetchVariationalData() {
    try {
        const response = await fetch(`${EXCHANGES.variational.baseUrl}${EXCHANGES.variational.endpoint}`);
        if (!response.ok) throw new Error(`Variational API error: ${response.status}`);
        const data = await response.json();
        
        // Debug: Log API response structure
        if (data.listings && data.listings.length > 0) {
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
                // Variational API returns annual funding rate, need to convert to interval rate
                const fundingRateRaw = listing.funding_rate;
                const fundingRateDecimal = typeof fundingRateRaw === 'string' 
                    ? parseFloat(fundingRateRaw || '0') 
                    : (fundingRateRaw || 0);
                const annualRatePercent = fundingRateDecimal * 100; // Convert decimal to percentage (annual rate)
                
                // Convert annual rate to interval rate
                // Formula: interval_rate = annual_rate / (365 * 24 / interval_hours)
                const annualTimes = (365 * 24) / fundingIntervalHours;
                const intervalRate = annualRatePercent / annualTimes;
                
                // Debug: Log first few pairs to verify data
                if (Object.keys(pairs).length < 5) {
                    console.log(`Variational [${ticker}]: annual_rate=${annualRatePercent}%, interval=${fundingIntervalHours}hr → interval_rate=${intervalRate.toFixed(4)}%`);
                }
                
                pairs[ticker] = {
                    ticker: ticker,
                    name: listing.name || ticker,
                    variational: intervalRate, // Interval-based funding rate (converted from annual)
                    variationalAnnual: annualRatePercent, // Annual funding rate from API (don't recalculate)
                    variationalInterval: fundingIntervalHours // Interval from API (4hr, 8hr, 1hr, etc. - use as-is)
                };
            });
        }
        console.log(`Variational API: Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        return pairs;
    } catch (error) {
        console.error('Error fetching Variational data:', error);
        return {};
    }
}

// Fetch Binance data - match tickers from Variational
async function fetchBinanceData() {
    try {
        const response = await fetch(`${EXCHANGES.binance.baseUrl}${EXCHANGES.binance.endpoint}`);
        if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
        const data = await response.json();
        
        const pairs = {};
        if (Array.isArray(data)) {
            data.forEach(item => {
                const symbol = item.symbol;
                if (symbol.endsWith('USDT')) {
                    const ticker = symbol.replace('USDT', '');
                    // Binance funding rate is already in percentage (e.g., 0.0001 = 0.01%)
                    // But API returns as decimal, so multiply by 100
                    const fundingRate = parseFloat(item.lastFundingRate || 0) * 100;
                    pairs[ticker] = fundingRate;
                }
            });
        }
        console.log(`Binance API: Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        return pairs;
    } catch (error) {
        console.error('Error fetching Binance data:', error);
        return {};
    }
}

// Fetch Bybit data - match tickers from Variational
// Uses Netlify Function proxy to keep API keys secure (server-side only)
async function fetchBybitData() {
    try {
        // Use Netlify Function proxy instead of direct API call
        const response = await fetch('/.netlify/functions/fetchBybit');
        
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
            data.result.list.forEach(item => {
                const symbol = item.symbol;
                if (symbol && symbol.endsWith('USDT')) {
                    const ticker = symbol.replace('USDT', '');
                    // Bybit funding rate is in decimal format, multiply by 100 for percentage
                    const fundingRate = parseFloat(item.fundingRate || 0) * 100;
                    if (!isNaN(fundingRate) && fundingRate !== 0) {
                        pairs[ticker] = fundingRate;
                    }
                }
            });
        }
        console.log(`Bybit API: Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        return pairs;
    } catch (error) {
        console.error('Error fetching Bybit data:', error);
        return {};
    }
}

// Fetch Extended data - match tickers from Variational
// Uses Netlify Function proxy to handle CORS and User-Agent header
async function fetchExtendedData() {
    try {
        // Use Netlify Function proxy instead of direct API call
        const response = await fetch('/.netlify/functions/fetchExtended');
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Extended API error: ${response.status}`, errorText);
            return {};
        }
        
        const data = await response.json();
        
        // Check if response contains error
        if (data.error) {
            console.error('Extended API error:', data.error, data.message);
            return {};
        }
        
        // Check if response contains error
        if (data.error) {
            console.error('Extended API error:', data.error, data.message);
            return {};
        }
        
        // Debug: Log API response structure
        console.log('Extended API raw response:', data);
        if (data.status && data.data) {
            console.log('Extended API response structure:', {
                status: data.status,
                dataLength: Array.isArray(data.data) ? data.data.length : 'not array',
                firstMarket: Array.isArray(data.data) && data.data.length > 0 ? data.data[0] : null
            });
        }
        
        const pairs = {};
        // Extended API returns data in different formats, check both
        if (data.status === 'ok' && data.data && Array.isArray(data.data)) {
            console.log(`Processing ${data.data.length} markets from Extended API...`);
            data.data.forEach((market, index) => {
                // Extended market format: "BTC-USD", "ETH-USD", etc.
                // Extract ticker by removing "-USD" suffix
                const marketName = market.name;
                if (marketName && marketName.endsWith('-USD')) {
                    const ticker = marketName.replace('-USD', '');
                    
                    // Get funding rate from marketStats
                    // Extended funding rate is in decimal format (e.g., 0.001 = 0.1%)
                    // Multiply by 100 to convert to percentage
                    if (market.marketStats && market.marketStats.fundingRate !== undefined) {
                        const fundingRate = parseFloat(market.marketStats.fundingRate || 0) * 100;
                        if (!isNaN(fundingRate)) {
                            pairs[ticker] = fundingRate;
                            if (index < 5) {
                                console.log(`Extended [${ticker}]: fundingRate=${market.marketStats.fundingRate} → ${fundingRate}%`);
                            }
                        }
                    } else {
                        if (index < 5) {
                            console.log(`Extended [${ticker}]: No marketStats or fundingRate`);
                        }
                    }
                }
            });
        } else {
            console.warn('Extended API: Unexpected response format', {
                status: data.status,
                hasData: !!data.data,
                isArray: Array.isArray(data.data)
            });
        }
        console.log(`Extended API: Fetched ${Object.keys(pairs).length} pairs with funding rates`);
        return pairs;
    } catch (error) {
        console.error('Error fetching Extended data:', error);
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
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #888;">No data available.</td></tr>';
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
        const binanceInterval = EXCHANGES.binance.fundingIntervalHours;
        const binance = formatFundingRate(binanceValue, binanceInterval);
        
        const bybitValue = (pair.bybit !== null && pair.bybit !== undefined && !isNaN(pair.bybit)) ? pair.bybit : null;
        const bybitInterval = EXCHANGES.bybit.fundingIntervalHours;
        const bybit = formatFundingRate(bybitValue, bybitInterval);
        
        const extendedValue = (pair.extended !== null && pair.extended !== undefined && !isNaN(pair.extended)) ? pair.extended : null;
        const extendedInterval = EXCHANGES.extended.fundingIntervalHours;
        const extended = formatFundingRate(extendedValue, extendedInterval);
        
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
                    <td class="funding-rate ${extendedValue !== null && extendedValue >= 0 ? 'positive' : extendedValue !== null ? 'negative' : ''}">${extended}</td>
                    <td class="strategy-cell">${strategyHtml}</td>
                </tr>
            `;
    }).join('');
    
    updateSortIcons();
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
            case 'extended':
                aVal = Math.abs(a.extended || 0);
                bVal = Math.abs(b.extended || 0);
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
        header.addEventListener('click', () => {
            const column = header.getAttribute('data-sort');
            
            if (currentSort.column === column) {
                currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
            } else {
                currentSort.column = column;
                currentSort.direction = 'asc';
            }
            
            const searchInput = document.getElementById('searchInput');
            const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
            
            let pairsToDisplay = allPairs;
            if (searchTerm !== '') {
                pairsToDisplay = allPairs.filter(pair => {
                    const ticker = (pair.ticker || '').toLowerCase();
                    return ticker.includes(searchTerm);
                });
            }
            
            displayTable(pairsToDisplay);
        });
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
        console.log('=== Starting data fetch ===');
        
        // Fetch Variational data (ticker + funding rate)
        console.log('Fetching Variational data...');
        const variationalPairs = await fetchVariationalData();
        console.log(`Variational: ${Object.keys(variationalPairs).length} pairs`);
        
        // Fetch Binance data (real API - match tickers from Variational)
        console.log('Fetching Binance data...');
        const binanceData = await fetchBinanceData();
        console.log(`Binance: ${Object.keys(binanceData).length} pairs`);
        
        // Fetch Bybit data (real API - match tickers from Variational)
        console.log('Fetching Bybit data...');
        const bybitData = await fetchBybitData();
        console.log(`Bybit: ${Object.keys(bybitData).length} pairs`);
        
        // Fetch Extended data (real API - match tickers from Variational)
        console.log('Fetching Extended data...');
        const extendedData = await fetchExtendedData();
        console.log(`Extended: ${Object.keys(extendedData).length} pairs`);
        
        console.log('=== Data fetch complete ===');

        // Match Variational tickers with Binance funding rates
        allPairs = [];
        Object.keys(variationalPairs).forEach(ticker => {
            const varData = variationalPairs[ticker];
            if (!varData || !varData.ticker) return;
            
            // Get Binance, Bybit, and Extended funding rates for this ticker (if available)
            const binanceRate = binanceData[ticker] !== undefined ? binanceData[ticker] : null;
            const bybitRate = bybitData[ticker] !== undefined ? bybitData[ticker] : null;
            const extendedRate = extendedData[ticker] !== undefined ? extendedData[ticker] : null;
            
            const pair = {
                ticker: varData.ticker, // Ticker from Variational API
                name: varData.name || varData.ticker,
                variational: varData.variational !== null && varData.variational !== undefined ? varData.variational : null, // Funding rate from Variational API
                variationalInterval: varData.variationalInterval || EXCHANGES.variational.fundingIntervalHours,
                variationalAnnual: varData.variationalAnnual !== null && varData.variationalAnnual !== undefined ? varData.variationalAnnual : null,
                binance: binanceRate, // Funding rate from Binance API (matched by ticker)
                binanceInterval: EXCHANGES.binance.fundingIntervalHours,
                bybit: bybitRate, // Funding rate from Bybit API (matched by ticker)
                bybitInterval: EXCHANGES.bybit.fundingIntervalHours,
                extended: extendedRate, // Funding rate from Extended API (matched by ticker)
                extendedInterval: EXCHANGES.extended.fundingIntervalHours
            };

            // Calculate strategy and profit - find best arbitrage opportunity
            // Compare ALL exchanges with each other, not just Variational as base
            // Find the pair with the maximum funding rate difference
            const exchanges = [
                { name: 'Variational', rate: pair.variational },
                { name: 'Binance', rate: binanceRate },
                { name: 'Bybit', rate: bybitRate },
                { name: 'Extended', rate: extendedRate }
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

        displayTable(allPairs);
        
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
