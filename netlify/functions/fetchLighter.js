// Use native fetch (Node.js 18+) or node-fetch as fallback
let fetch;
try {
    // Try native fetch first (Node.js 18+)
    fetch = globalThis.fetch || require('node-fetch');
} catch (e) {
    // Fallback to node-fetch if native fetch is not available

}

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS request (CORS preflight)
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        // Get auth token from environment variable or use default
        const LIGHTER_AUTH_TOKEN = process.env.LIGHTER_AUTH_TOKEN || 'ro:92374:single:1854227934:d2a84b224e888823ecb03dc3e90b3cefd0802253ceb8cc9456c6aec01d551cb2';
        
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
        
        // Try different authentication methods
        const authMethods = [
            { name: 'Bearer', header: `Bearer ${LIGHTER_AUTH_TOKEN}` },
            { name: 'Token only', header: LIGHTER_AUTH_TOKEN },
            { name: 'No auth', header: null }
        ];
        
        let data = null;
        let lastError = null;
        
        for (const endpoint of endpoints) {
            for (const authMethod of authMethods) {
                try {
                    const url = `https://mainnet.zklighter.elliot.ai${endpoint}`;
                    console.log(`Trying Lighter endpoint: ${url} (${authMethod.name})`);
                    
                    const requestHeaders = {
                        'Content-Type': 'application/json'
                    };
                    
                    if (authMethod.header) {
                        requestHeaders['Authorization'] = authMethod.header;
                    }
                    
                    const response = await fetch(url, {
                        method: 'GET',
                        headers: requestHeaders
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
            throw lastError || new Error('All Lighter API endpoints failed');
        }
        
        console.log('=== Lighter API Response Debug ===');
        console.log('Lighter API response received');
        console.log('Lighter API data type:', Array.isArray(data) ? 'array' : typeof data);
        if (typeof data === 'object' && data !== null) {
            console.log('Lighter API response keys:', Object.keys(data));
        }
        console.log('Lighter API response sample (first 5000 chars):', JSON.stringify(data, null, 2).substring(0, 5000));
        
        // If response is very large, log a sample
        if (Array.isArray(data) && data.length > 0) {
            console.log('First item sample:', JSON.stringify(data[0], null, 2));
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error fetching Lighter data:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to fetch Lighter data',
                message: error.message 
            })
        };
    }
};

