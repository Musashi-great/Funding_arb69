# Funding Rate Arbitrage

암호화폐 거래소 간 펀딩 비율 차이를 이용한 차익거래 기회를 찾는 도구입니다.

Compare funding rates across multiple exchanges to identify arbitrage opportunities.

## Exchanges

- Variational
- Binance
- Bybit
- Hyperliquid
- Lighter

## Netlify Deployment

### Environment Variables

Set the following environment variables in Netlify:

- `BYBIT_API_KEY`: Your Bybit API key
- `BYBIT_API_SECRET`: Your Bybit API secret
- `LIGHTER_AUTH_TOKEN`: Your Lighter API token
- `TELEGRAM_BOT_TOKEN`: Telegram bot token (for notifications, optional)
- `TELEGRAM_CHAT_ID`: Telegram chat ID (for notifications, optional)

### Deploy

1. Connect your repository to Netlify
2. Set environment variables in Netlify dashboard
3. Deploy

## Local Development

For local development, you can use Netlify CLI:

```bash
npm install -g netlify-cli
netlify dev
```

Or simply open `index.html` in a browser (some features may not work without Netlify Functions).

## Telegram Notifications

상위 5개 arbitrage 기회를 텔레그램으로 알림받을 수 있습니다.

### 문서

- **프로덕션 설정**: [TELEGRAM_SETUP.md](./TELEGRAM_SETUP.md) - Netlify 배포 후 텔레그램 봇 설정
- **로컬 개발**: [TELEGRAM_LOCAL_SETUP.md](./TELEGRAM_LOCAL_SETUP.md) - 로컬에서 텔레그램 봇 테스트 방법

### Quick Setup

1. 텔레그램에서 [@BotFather](https://t.me/botfather)로 봇 생성
2. 봇 토큰과 채팅 ID 확인
3. Netlify 환경 변수에 `TELEGRAM_BOT_TOKEN`과 `TELEGRAM_CHAT_ID` 설정
4. 스케줄링 설정 (매시간 또는 펀딩 시간에 맞춰)

### 로컬 테스트

로컬에서 텔레그램 봇을 테스트하려면:

**PowerShell 스크립트만 사용 (추천 - Node.js 불필요):**
```powershell
# PowerShell 스크립트만으로 독립 실행
# Netlify Functions 없이도 작동합니다
.\test-telegram-local.ps1
```

이 스크립트는:
- ✅ **독립 실행**: Netlify Functions나 Node.js 없이도 작동
- ✅ **모든 거래소 지원**: Variational, Binance, Bybit, Hyperliquid 데이터 직접 가져오기
- ✅ **실제 데이터 처리**: 거래소 API에서 직접 데이터를 가져와 차익거래 기회 계산
- ✅ **텔레그램 전송**: 계산된 상위 3개 기회를 텔레그램으로 전송

**스크립트 설정:**
1. `test-telegram-local.ps1` 파일을 열어서 상단의 봇 토큰과 채팅 ID를 수정:
   ```powershell
   $TELEGRAM_BOT_TOKEN = "YOUR_BOT_TOKEN"
   $TELEGRAM_CHAT_ID = "YOUR_CHAT_ID"
   ```
2. PowerShell에서 실행:
   ```powershell
   .\test-telegram-local.ps1
   ```

**Node.js 사용 (선택사항):**
```bash
# 간단한 테스트 스크립트 실행
node test-telegram-local.js

# Netlify CLI + ngrok 사용 (웹훅 테스트)
# 자세한 내용은 TELEGRAM_LOCAL_SETUP.md 참고
```

자세한 내용은 `TELEGRAM_SETUP.md` 및 `TELEGRAM_LOCAL_SETUP.md` 파일을 참고하세요.
