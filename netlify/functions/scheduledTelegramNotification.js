// Scheduled function to send Telegram notifications at funding times
// This function runs on a schedule and calls sendTelegramNotification

const fetch = globalThis.fetch;

exports.handler = async (event, context) => {
    try {
        // Get the site URL from environment or use default
        const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'https://your-site.netlify.app';
        const functionUrl = `${siteUrl}/.netlify/functions/sendTelegramNotification`;

        // Call the sendTelegramNotification function
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Notification failed: ${response.status} - ${errorText}`);
        }

        const result = await response.json();
        console.log('Telegram notification sent:', result);

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Scheduled notification sent',
                result: result
            })
        };
    } catch (error) {
        console.error('Error in scheduledTelegramNotification:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: 'Failed to send notification',
                message: error.message
            })
        };
    }
};

