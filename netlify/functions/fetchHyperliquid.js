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
        // Hyperliquid API endpoint
        const url = 'https://api.hyperliquid.xyz/info';
        
        // Request body for metaAndAssetCtxs (includes funding rates)
        const requestBody = {
            type: 'metaAndAssetCtxs'
        };
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Hyperliquid API responded with status: ${response.status}`, errorText);
            throw new Error(`Hyperliquid API error: ${response.status}`);
        }

        const data = await response.json();
        
        console.log('Hyperliquid API response received');
        console.log('Hyperliquid API data type:', Array.isArray(data) ? 'array' : typeof data);
        if (Array.isArray(data) && data.length >= 2) {
            const metadata = data[0];
            const assetContexts = data[1];
            console.log('Hyperliquid API metadata universe length:', metadata && metadata.universe ? metadata.universe.length : 0);
            console.log('Hyperliquid API assetContexts length:', Array.isArray(assetContexts) ? assetContexts.length : 0);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error fetching Hyperliquid data:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to fetch Hyperliquid data',
                message: error.message 
            })
        };
    }
};

