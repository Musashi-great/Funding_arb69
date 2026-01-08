# Telegram Bot Simple Test Script (PowerShell)
# Usage: .\test-telegram-simple.ps1

# Configuration
$TELEGRAM_BOT_TOKEN = "8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0"
$TELEGRAM_CHAT_ID = "1374527604"

Write-Host "Telegram Bot Simple Test" -ForegroundColor Green
Write-Host ""

# Test message
$testMessage = @"
<b>Telegram Bot Test</b>

Local message send test successful!

Updated: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
"@

$url = "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage"

$body = @{
    chat_id = $TELEGRAM_CHAT_ID
    text = $testMessage
    parse_mode = "HTML"
} | ConvertTo-Json

try {
    Write-Host "Sending message..." -ForegroundColor Yellow
    
    $response = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
    
    if ($response.ok) {
        Write-Host "Message sent successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Check your Telegram for the message." -ForegroundColor Cyan
    } else {
        Write-Host "Send failed" -ForegroundColor Red
        Write-Host ($response | ConvertTo-Json)
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}
