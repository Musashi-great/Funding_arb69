const crypto = require('crypto');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
        // API keys from environment variables (secure, not exposed to client)
        const BYBIT_API_KEY = process.env.BYBIT_API_KEY || 'OZwc5A2DRkFVhDCueOvMWYi0GwORQZu0SZuU';
        const BYBIT_API_SECRET = process.env.BYBIT_API_SECRET || 'Iobd3CM36UWiUgPgKJ';
        
        const timestamp = Date.now().toString();
        const params = {
            category: 'linear'
        };
        
        // Generate signature for Bybit API
        const queryString = Object.keys(params)
            .sort()
            .map(key => `${key}=${params[key]}`)
            .join('&');
        
        const signaturePayload = `${timestamp}${BYBIT_API_KEY}${queryString}`;
        const signature = crypto.createHmac('sha256', BYBIT_API_SECRET)
            .update(signaturePayload)
            .digest('hex');
        
        const url = `https://api.bybit.com/v5/market/tickers?${queryString}`;
        
        const response = await fetch(url, {
            headers: {
                'X-BAPI-API-KEY': BYBIT_API_KEY,
                'X-BAPI-TIMESTAMP': timestamp,
                'X-BAPI-SIGN': signature,
                'X-BAPI-RECV-WINDOW': '5000'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Bybit API responded with status: ${response.status}`, errorText);
            throw new Error(`Bybit API error: ${response.status}`);
        }

        const data = await response.json();
        
        console.log('Bybit API response retCode:', data.retCode);
        console.log('Bybit API result list length:', data.result && data.result.list ? data.result.list.length : 0);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error fetching Bybit data:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to fetch Bybit data',
                message: error.message 
            })
        };
    }
};

