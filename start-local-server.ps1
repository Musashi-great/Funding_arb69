# Funding Rate Arbitrage - Local Server (PowerShell)
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Funding Rate Arbitrage - Local Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting local server on http://localhost:8000" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot
python -m http.server 8000

