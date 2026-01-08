# Telegram Bot Local Test Script (PowerShell)
# Usage: .\test-telegram-local.ps1

# Configuration
$TELEGRAM_BOT_TOKEN = "8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0"
$TELEGRAM_CHAT_ID = "1374527604"

Write-Host "Telegram Bot Local Test Started" -ForegroundColor Green
Write-Host ""
Write-Host "Bot Token: $($TELEGRAM_BOT_TOKEN.Substring(0, 10))..." -ForegroundColor Cyan
Write-Host "Chat ID: $TELEGRAM_CHAT_ID" -ForegroundColor Cyan
Write-Host ""

# Send Telegram message
function Send-TelegramMessage {
    param(
        [string]$Message
    )
    
    $url = "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage"
    
    $body = @{
        chat_id = $TELEGRAM_CHAT_ID
        text = $Message
        parse_mode = "HTML"
    } | ConvertTo-Json
    
    try {
        Write-Host "Sending Telegram message..." -ForegroundColor Yellow
        
        $response = Invoke-RestMethod -Uri $url -Method Post -Body $body -ContentType "application/json"
        
        if ($response.ok) {
            Write-Host "Message sent successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Response:" -ForegroundColor Cyan
            Write-Host ($response | ConvertTo-Json -Depth 10)
            return $true
        } else {
            Write-Host "Send failed" -ForegroundColor Red
            Write-Host ($response | ConvertTo-Json -Depth 10)
            return $false
        }
    } catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.ErrorDetails) {
            Write-Host "Details: $($_.ErrorDetails.Message)" -ForegroundColor Red
        }
        return $false
    }
}

# Get Arbitrage Data - Direct from exchanges (no API needed)
function Get-ArbitrageData {
    Write-Host "Fetching Arbitrage data directly from exchanges..." -ForegroundColor Yellow
    Write-Host "(No Netlify Functions required - standalone PowerShell script)" -ForegroundColor Gray
    Write-Host ""
    
    # Try API first (if Netlify Functions is running), then fallback to direct fetch
    $apiUrl = "http://localhost:8888/.netlify/functions/getArbitrageData?top=3"
    
    try {
        Write-Host "  - Trying getArbitrageData API (optional)..." -ForegroundColor Gray
        $response = Invoke-RestMethod -Uri $apiUrl -Method Get -TimeoutSec 2 -ErrorAction Stop
        
        if ($response.success -and $response.top) {
            Write-Host "  - API call successful, found $($response.top.Count) opportunities" -ForegroundColor Green
            return $response.top
        }
    } catch {
        # API not available - this is expected when running standalone
        Write-Host "  - API not available (this is OK - using direct exchange fetch)" -ForegroundColor DarkGray
    }
    
    # Always use direct exchange fetch (standalone mode)
    return Get-ArbitrageDataDirect
}

# Process Variational data - normalize to common format
function Process-VariationalData {
    param([object]$Data)
    
    $pairs = @{}
    if ($Data -and $Data.listings) {
        foreach ($listing in $Data.listings) {
            if ($listing.ticker) {
                $fundingIntervalSeconds = if ($listing.funding_interval_s) { $listing.funding_interval_s } else { 28800 }
                $fundingIntervalHours = $fundingIntervalSeconds / 3600
                
                if ($fundingIntervalHours -le 0) {
                    continue
                }
                
                # Variational API returns annual funding rate (as decimal, e.g., 0.893 = 89.3% annual)
                # Normalize to interval rate (decimal format)
                $annualRateDecimal = [double]$listing.funding_rate
                $annualRatePercent = $annualRateDecimal * 100
                $annualTimes = (365 * 24) / $fundingIntervalHours
                $intervalRatePercent = $annualRatePercent / $annualTimes
                $intervalRateDecimal = $intervalRatePercent / 100  # Decimal format for comparison
                
                $pairs[$listing.ticker] = @{
                    ticker = $listing.ticker
                    rate = $intervalRateDecimal  # Decimal format (e.g., 0.0001019 = 0.01019%)
                    interval = $fundingIntervalHours
                    apr = $annualRatePercent
                    name = $listing.name
                }
            }
        }
    }
    return $pairs
}

# Process Binance data - normalize to common format
function Process-BinanceData {
    param([object]$Data)
    
    $pairs = @{}
    if ($Data -and ($Data | Measure-Object).Count -gt 0) {
        foreach ($item in $Data) {
            if ($item.symbol -and $item.symbol.EndsWith("USDT")) {
                $ticker = $item.symbol -replace "USDT", ""
                # Binance returns funding rate as decimal (e.g., 0.0005 = 0.05% per 8 hours)
                $rate = [double]$item.lastFundingRate
                $interval = 8
                $apr = $rate * (365 * 24 / $interval) * 100
                
                $pairs[$ticker] = @{
                    ticker = $ticker
                    rate = $rate  # Already in decimal format
                    interval = $interval
                    apr = $apr
                }
            }
        }
    }
    return $pairs
}

# Process Bybit data - normalize to common format
function Process-BybitData {
    param([object]$Data)
    
    $pairs = @{}
    if ($Data -and $Data.result -and $Data.result.list) {
        foreach ($item in $Data.result.list) {
            if ($item.symbol -and $item.symbol.EndsWith("USDT")) {
                $ticker = $item.symbol -replace "USDT", ""
                $rate = [double]$item.fundingRate
                if ($rate -ne 0) {
                    $interval = 8
                    $apr = $rate * (365 * 24 / $interval) * 100
                    
                    $pairs[$ticker] = @{
                        ticker = $ticker
                        rate = $rate  # Already in decimal format
                        interval = $interval
                        apr = $apr
                    }
                }
            }
        }
    }
    return $pairs
}

# Process Hyperliquid data - normalize to common format
function Process-HyperliquidData {
    param([object]$Data)
    
    $pairs = @{}
    if ($Data -and ($Data | Measure-Object).Count -ge 2) {
        $metadata = $Data[0]
        $assetContexts = $Data[1]
        if ($metadata.universe -and $assetContexts) {
            for ($i = 0; $i -lt $metadata.universe.Count; $i++) {
                $asset = $metadata.universe[$i]
                $context = $assetContexts[$i]
                if ($asset.name -and $context.funding -ne $null) {
                    $ticker = $asset.name
                    # Hyperliquid returns funding rate as decimal per hour (e.g., 0.0000125 = 0.00125% per hour)
                    $rate = [double]$context.funding
                    $interval = 1
                    $apr = $rate * (365 * 24 / $interval) * 100
                    
                    $pairs[$ticker] = @{
                        ticker = $ticker
                        rate = $rate  # Already in decimal format
                        interval = $interval
                        apr = $apr
                    }
                }
            }
        }
    }
    return $pairs
}

# Process Lighter data - normalize to common format (limited - WebSocket required for funding rates)
function Process-LighterData {
    param([object]$Data)
    
    $pairs = @{}
    # Note: Lighter order_books doesn't contain funding rate
    # WebSocket is required for actual funding rates (not supported in PowerShell)
    # This is a placeholder for future implementation
    return $pairs
}

# Get Arbitrage Data directly from exchanges (standalone mode)
function Get-ArbitrageDataDirect {
    Write-Host "Fetching exchange data directly..." -ForegroundColor Yellow
    
    $exchanges = @(
        @{ name = "Variational"; url = "https://omni-client-api.prod.ap-northeast-1.variational.io/metadata/stats"; method = "Get" },
        @{ name = "Binance"; url = "https://fapi.binance.com/fapi/v1/premiumIndex"; method = "Get" },
        @{ name = "Bybit"; url = "https://api.bybit.com/v5/market/tickers"; method = "Get" },
        @{ name = "Hyperliquid"; url = "https://api.hyperliquid.xyz/info"; method = "Post"; body = '{"type":"metaAndAssetCtxs"}' },
        @{ name = "Lighter"; url = "https://mainnet.zklighter.elliot.ai/api/v1/orderBooks"; method = "Get"; auth = "ro:92374:single:1854227934:d2a84b224e888823ecb03dc3e90b3cefd0802253ceb8cc9456c6aec01d551cb2" }
    )
    
    $exchangeData = @{}
    
    foreach ($exchange in $exchanges) {
        try {
            Write-Host "  - Fetching $($exchange.name) data..." -ForegroundColor Gray
            $headers = @{}
            if ($exchange.auth) {
                $headers["Authorization"] = $exchange.auth
            }
            
            if ($exchange.method -eq "Post") {
                $response = Invoke-RestMethod -Uri $exchange.url -Method Post -Body $exchange.body -ContentType "application/json" -Headers $headers -ErrorAction Stop
            } else {
                $response = Invoke-RestMethod -Uri $exchange.url -Method Get -Headers $headers -ErrorAction Stop
            }
            $exchangeData[$exchange.name] = $response
            Write-Host "    ✓ $($exchange.name) data received" -ForegroundColor Green
        } catch {
            Write-Host "    ✗ $($exchange.name) failed: $($_.Exception.Message)" -ForegroundColor DarkGray
            $exchangeData[$exchange.name] = $null
        }
    }
    
    Write-Host ""
    Write-Host "Processing exchange data individually..." -ForegroundColor Yellow
    
    # Process each exchange data separately and normalize to common format
    # All rates will be normalized to: { ticker, rate (decimal), interval (hours), apr (percent) }
    
    # 1. Process Variational data
    $variationalPairs = Process-VariationalData -Data $exchangeData["Variational"]
    Write-Host "  Variational: $($variationalPairs.Count) pairs processed" -ForegroundColor Gray
    
    # 2. Process Binance data
    $binancePairs = Process-BinanceData -Data $exchangeData["Binance"]
    Write-Host "  Binance: $($binancePairs.Count) pairs processed" -ForegroundColor Gray
    
    # 3. Process Bybit data
    $bybitPairs = Process-BybitData -Data $exchangeData["Bybit"]
    Write-Host "  Bybit: $($bybitPairs.Count) pairs processed" -ForegroundColor Gray
    
    # 4. Process Hyperliquid data
    $hyperliquidPairs = Process-HyperliquidData -Data $exchangeData["Hyperliquid"]
    Write-Host "  Hyperliquid: $($hyperliquidPairs.Count) pairs processed" -ForegroundColor Gray
    
    # 5. Process Lighter data (limited - WebSocket required for funding rates)
    $lighterPairs = Process-LighterData -Data $exchangeData["Lighter"]
    Write-Host "  Lighter: $($lighterPairs.Count) pairs processed" -ForegroundColor Gray
    
    # Process Lighter data (Note: order_books doesn't contain funding rate, but we can get market list)
    $lighterPairs = @{}
    if ($exchangeData["Lighter"] -and $exchangeData["Lighter"].order_books) {
        # Lighter order_books doesn't have funding rate, but we can get market list
        # For actual funding rate, WebSocket is required (not supported in PowerShell)
        # This is a placeholder - in production, use WebSocket or cached data
        Write-Host "  Note: Lighter funding rates require WebSocket (not available in PowerShell)" -ForegroundColor DarkGray
        Write-Host "  Found $($exchangeData["Lighter"].order_books.Count) Lighter markets (funding rates not available)" -ForegroundColor DarkGray
    }
    
    Write-Host ""
    Write-Host "Finding arbitrage opportunities..." -ForegroundColor Yellow
    
    # Combine all normalized exchange data
    $allExchangePairs = @{
        variational = $variationalPairs
        binance = $binancePairs
        bybit = $bybitPairs
        hyperliquid = $hyperliquidPairs
        lighter = $lighterPairs
    }
    
    # Get all unique tickers from all exchanges
    $allTickers = @()
    foreach ($exchangeName in $allExchangePairs.Keys) {
        $pairs = $allExchangePairs[$exchangeName]
        foreach ($ticker in $pairs.Keys) {
            if ($allTickers -notcontains $ticker) {
                $allTickers += $ticker
            }
        }
    }
    
    $opportunities = @()
    
    # Compare rates across all exchanges for each ticker
    foreach ($ticker in $allTickers) {
        # Collect all exchange rates for this ticker (all normalized to decimal format)
        $exchangeRates = @()
        
        foreach ($exchangeName in $allExchangePairs.Keys) {
            $pairs = $allExchangePairs[$exchangeName]
            if ($pairs[$ticker]) {
                $pair = $pairs[$ticker]
                $exchangeRates += @{
                    exchange = $exchangeName
                    rate = $pair.rate      # Decimal format (e.g., 0.0005 = 0.05%)
                    interval = $pair.interval
                    apr = $pair.apr
                }
            }
        }
        
        # Need at least 2 exchanges to compare
        if ($exchangeRates.Count -ge 2) {
            # Sort by rate (ascending) - lowest rate = best for long, highest rate = best for short
            $sortedRates = $exchangeRates | Sort-Object -Property rate
            
            $bestRate = $sortedRates[0]      # Lowest rate (best for long)
            $worstRate = $sortedRates[-1]    # Highest rate (best for short)
            
            # Calculate spread (difference between highest and lowest rate)
            $spread = [Math]::Abs($worstRate.rate - $bestRate.rate)
            
            if ($spread -gt 0) {
                # Find minimum interval for APR calculation (use most frequent interval)
                $minInterval = $null
                foreach ($rateObj in $sortedRates) {
                    if ($rateObj.interval -ne $null -and $rateObj.interval -gt 0) {
                        if ($minInterval -eq $null -or $rateObj.interval -lt $minInterval) {
                            $minInterval = $rateObj.interval
                        }
                    }
                }
                
                # Calculate estimated APR from spread
                if ($minInterval -ne $null -and $minInterval -gt 0) {
                    $annualTimes = (365 * 24) / $minInterval
                    $estimatedApr = $spread * $annualTimes * 100
                    
                    # Validate calculated values
                    if ([double]::IsNaN($estimatedApr) -or [double]::IsInfinity($estimatedApr)) {
                        Write-Host "    ⚠ Skipping $ticker - invalid estimatedApr calculation" -ForegroundColor DarkGray
                        continue
                    }
                    
                    $opportunities += @{
                        symbol = $ticker
                        spread = $spread
                        estimatedApr = $estimatedApr
                        longExchange = $bestRate.exchange
                        shortExchange = $worstRate.exchange
                        confidence = if ($spread -gt 0.001) { "high" } elseif ($spread -gt 0.0005) { "medium" } else { "low" }
                    }
                }
            }
        }
    }
    
    Write-Host "  Found $($opportunities.Count) arbitrage opportunities" -ForegroundColor Green
    
    # Debug: Show top 5 opportunities before returning
    if ($opportunities.Count -gt 0) {
        $top5Debug = $opportunities | Sort-Object -Property estimatedApr -Descending | Select-Object -First 5
        Write-Host "  Top 5 by estimatedApr:" -ForegroundColor Cyan
        foreach ($opp in $top5Debug) {
            Write-Host "    $($opp.symbol): APR=$([math]::Round($opp.estimatedApr, 2))%, Spread=$([math]::Round($opp.spread * 100, 4))%" -ForegroundColor Gray
        }
    }
    
    return $opportunities
}

# Format Telegram message
function Format-TelegramMessage {
    param(
        [array]$Top3
    )
    
    if ($Top3.Count -eq 0) {
        return "<b>No arbitrage opportunities found</b>"
    }
    
    $message = "=== Top 3 Arbitrage Opportunities ===`n`n"
    
    for ($i = 0; $i -lt $Top3.Count; $i++) {
        $market = $Top3[$i]
        
        # Support both old format (ticker, profit) and new format (symbol, estimatedApr)
        $symbol = if ($market.symbol) { $market.symbol } else { $market.ticker }
        $estimatedApr = if ($market.estimatedApr) { $market.estimatedApr } else { $market.profit }
        $spread = if ($market.spread) { $market.spread } else { 0 }
        $longExchange = if ($market.longExchange) { $market.longExchange } else { $market.strategyExchange }
        $shortExchange = if ($market.shortExchange) { $market.shortExchange } else { $market.oppositeExchange }
        $confidence = if ($market.confidence) { $market.confidence } else { "medium" }
        
        # Spread is in decimal format (e.g., 0.00026 = 0.026%), convert to percentage for display
        # Round to 4 decimal places for percentage display
        $spreadFormatted = if ($spread -gt 0) { "$([math]::Round($spread * 100, 4))%" } else { "" }
        
        # Use text symbols instead of emoji for better compatibility
        $confidenceSymbol = switch ($confidence) {
            "high" { "[HIGH]" }
            "medium" { "[MED]" }
            default { "[LOW]" }
        }
        
        $message += "<b>#$($i + 1) $symbol</b> $confidenceSymbol`n"
        $message += "Spread: <b>$spreadFormatted</b>`n"
        $message += "Long: <b>$($longExchange.ToUpper())</b> | Short: <b>$($shortExchange.ToUpper())</b>`n`n"
    }
    
    $now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $message += "---`nUpdated: $now"
    
    return $message
}

# Main execution
try {
    Write-Host "Fetching Arbitrage data..." -ForegroundColor Yellow
    $allOpportunities = Get-ArbitrageData
    
    Write-Host "Found $($allOpportunities.Count) opportunities" -ForegroundColor Green
    Write-Host ""
    
    # Sort by estimatedApr (descending) if available, otherwise by profit (descending)
    # Always sort by estimatedApr first, then take top 3
    if ($allOpportunities.Count -gt 0) {
        if ($allOpportunities[0].estimatedApr -ne $null) {
            # Sort by estimatedApr descending - ensure numeric sorting
            $sortedTop3 = $allOpportunities | 
                Sort-Object -Property @{Expression = {[double]$_.estimatedApr}} -Descending | 
                Select-Object -First 3
            
            # Debug: Show sorted top 3
            Write-Host "Sorted by estimatedApr (descending)" -ForegroundColor Gray
            Write-Host "  Top 3 after sorting:" -ForegroundColor Cyan
            foreach ($opp in $sortedTop3) {
                Write-Host "    $($opp.symbol): APR=$([math]::Round($opp.estimatedApr, 2))%" -ForegroundColor Gray
            }
        } elseif ($allOpportunities[0].profit -ne $null) {
            # Fallback to profit if estimatedApr not available
            $sortedTop3 = $allOpportunities | 
                Sort-Object -Property @{Expression = {[double]$_.profit}} -Descending | 
                Select-Object -First 3
            Write-Host "Sorted by profit (descending)" -ForegroundColor Gray
        } else {
            $sortedTop3 = $allOpportunities | Select-Object -First 3
            Write-Host "No sort property found, taking first 3" -ForegroundColor Yellow
        }
    } else {
        $sortedTop3 = @()
    }
    
    Write-Host "Formatting message..." -ForegroundColor Yellow
    $message = Format-TelegramMessage -Top3 $sortedTop3
    
    Write-Host ""
    $success = Send-TelegramMessage -Message $message
    
    if ($success) {
        Write-Host ""
        Write-Host "Test completed! Check your Telegram for the message." -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "Test failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "Test failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
