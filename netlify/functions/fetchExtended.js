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
        // Use public API endpoint (no API key required)
        // Endpoint: GET /api/v1/info/markets
        const url = 'https://api.starknet.extended.exchange/api/v1/info/markets';
        
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'FundingArbitrage/1.0' // Required header for Extended API
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Extended API responded with status: ${response.status}`, errorText);
            throw new Error(`Extended API error: ${response.status}`);
        }

        const data = await response.json();
        
        console.log('Extended API response status:', data.status);
        console.log('Extended API data length:', data.data ? data.data.length : 0);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Error fetching Extended data:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to fetch Extended data',
                message: error.message 
            })
        };
    }
};

