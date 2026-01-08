# 텔레그램 봇 로컬 개발 환경 설정 가이드

로컬에서 텔레그램 봇을 테스트하는 방법입니다.

## 방법 1: Netlify CLI + ngrok 사용 (웹훅 테스트용, 권장)

이 방법을 사용하면 로컬에서 웹훅을 받아 `/funding` 명령어를 테스트할 수 있습니다.

### 1단계: 필수 도구 설치

#### Node.js 설치 확인
```bash
node --version
npm --version
```

#### Netlify CLI 설치
```bash
npm install -g netlify-cli
```

#### ngrok 설치
1. [ngrok 다운로드](https://ngrok.com/download) 또는
2. npm으로 설치:
```bash
npm install -g ngrok
```

### 2단계: 환경 변수 설정

프로젝트 루트에 `.env` 파일을 생성합니다 (또는 `netlify.toml`에 추가):

```bash
# .env 파일 생성
TELEGRAM_BOT_TOKEN=8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0
TELEGRAM_CHAT_ID=1374527604
```

또는 Netlify CLI로 환경 변수 설정:
```bash
netlify env:set TELEGRAM_BOT_TOKEN 8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0
netlify env:set TELEGRAM_CHAT_ID 1374527604
```

### 3단계: Netlify Dev 서버 실행

터미널 1에서:
```bash
cd C:\funding-arbitrage
netlify dev
```

서버가 실행되면 보통 `http://localhost:8888`에서 접속 가능합니다.

### 4단계: ngrok으로 터널링

터미널 2에서 (새 터미널):
```bash
ngrok http 8888
```

ngrok이 공개 URL을 제공합니다:
```
Forwarding  https://xxxx-xx-xx-xx-xx.ngrok-free.app -> http://localhost:8888
```

이 URL을 복사하세요 (예: `https://abc123.ngrok-free.app`)

### 5단계: 텔레그램 웹훅 설정

브라우저에서 다음 URL을 엽니다 (ngrok URL 사용):
```
https://api.telegram.org/bot8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0/setWebhook?url=https://abc123.ngrok-free.app/.netlify/functions/telegramWebhook
```

`"ok":true` 응답이 나오면 성공입니다.

### 6단계: 테스트

1. 텔레그램에서 봇(@arb6974_bot)에게 `/funding` 또는 `/start` 메시지 전송
2. 터미널 1에서 로그 확인
3. 텔레그램에서 응답 확인

### 웹훅 제거 (테스트 완료 후)

```bash
https://api.telegram.org/bot8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0/deleteWebhook
```

---

## 방법 2: 로컬 스크립트로 직접 테스트 (간단한 방법)

웹훅 없이 로컬에서 직접 텔레그램 메시지를 보내는 방법입니다.

### 1단계: 테스트 스크립트 생성

프로젝트 루트에 `test-telegram-local.js` 파일을 생성합니다:

```javascript
// test-telegram-local.js
const fetch = require('node-fetch');

const TELEGRAM_BOT_TOKEN = '8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0';
const TELEGRAM_CHAT_ID = '1374527604';

// Arbitrage 데이터 가져오기 함수 (telegramWebhook.js에서 복사)
async function fetchTop5Arbitrage() {
    const EXCHANGES = {
        variational: {
            baseUrl: 'https://omni-client-api.prod.ap-northeast-1.variational.io',
            endpoint: '/metadata/stats',
            fundingIntervalHours: 8
        },
        binance: {
            baseUrl: 'https://fapi.binance.com',
            endpoint: '/fapi/v1/premiumIndex',
            fundingIntervalHours: 8
        },
        bybit: {
            baseUrl: 'https://api.bybit.com',
            endpoint: '/v5/market/tickers',
            fundingIntervalHours: 8
        },
        hyperliquid: {
            baseUrl: 'https://api.hyperliquid.xyz',
            endpoint: '/info',
            fundingIntervalHours: 1
        }
    };

    // ... (telegramWebhook.js의 fetchTop5Arbitrage 함수 내용 복사)
    // 간단한 버전으로 테스트하려면 더미 데이터 사용 가능
    return [
        { ticker: 'BTC', profit: 1.5, strategy: 'long', strategyExchange: 'Binance', oppositeExchange: 'Bybit' },
        { ticker: 'ETH', profit: 1.2, strategy: 'short', strategyExchange: 'Hyperliquid', oppositeExchange: 'Binance' }
    ];
}

function formatTelegramMessage(top5) {
    if (top5.length === 0) {
        return '📊 <b>No arbitrage opportunities found</b>';
    }

    let message = '🚀 <b>Top 5 Arbitrage Opportunities</b>\n\n';
    
    top5.forEach((pair, index) => {
        const profitFormatted = `${pair.profit >= 0 ? '+' : ''}${pair.profit.toFixed(4)}%`;
        const strategyIcon = pair.strategy === 'long' ? '↗' : '↘';
        const oppositeIcon = pair.strategy === 'short' ? '↗' : '↘';
        
        message += `${index + 1}. <b>${pair.ticker}</b> - ${profitFormatted}\n`;
        message += `   ${strategyIcon} ${pair.strategyExchange} ${pair.strategy.toUpperCase()}\n`;
        message += `   ${oppositeIcon} ${pair.oppositeExchange} ${pair.strategy === 'long' ? 'SHORT' : 'LONG'}\n\n`;
    });

    const now = new Date();
    message += `⏰ <i>Updated: ${now.toLocaleString('ko-KR')}</i>`;
    
    return message;
}

async function sendTelegramMessage(message) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'HTML'
            })
        });

        const data = await response.json();
        
        if (data.ok) {
            console.log('✅ 메시지 전송 성공!');
            console.log(JSON.stringify(data, null, 2));
        } else {
            console.error('❌ 전송 실패:', data);
        }
    } catch (error) {
        console.error('❌ 에러:', error.message);
    }
}

// 실행
(async () => {
    console.log('📊 Arbitrage 데이터 가져오는 중...');
    const top5 = await fetchTop5Arbitrage();
    
    console.log('📝 메시지 포맷팅 중...');
    const message = formatTelegramMessage(top5);
    
    console.log('📤 텔레그램 메시지 전송 중...');
    await sendTelegramMessage(message);
})();
```

### 2단계: 스크립트 실행

```bash
cd C:\funding-arbitrage
node test-telegram-local.js
```

### 3단계: 텔레그램 확인

봇(@arb6974_bot)과의 채팅에서 메시지를 확인합니다.

---

## 방법 2-1: PowerShell 스크립트 사용 (Node.js 없이, Windows 전용)

Node.js가 설치되어 있지 않은 경우 PowerShell 스크립트를 사용할 수 있습니다.

### 1단계: 간단한 테스트 (가장 쉬움)

PowerShell에서:
```powershell
cd C:\funding-arbitrage
.\test-telegram-simple.ps1
```

이 스크립트는 간단한 테스트 메시지를 텔레그램으로 전송합니다.

### 2단계: 전체 기능 테스트

더 상세한 테스트를 원하면:
```powershell
.\test-telegram-local.ps1
```

이 스크립트는:
- Arbitrage 데이터를 가져옵니다 (간단한 버전)
- 메시지를 포맷팅합니다
- 텔레그램으로 전송합니다

### 실행 정책 오류 해결

PowerShell 실행 정책 오류가 발생하면:
```powershell
# 현재 실행 정책 확인
Get-ExecutionPolicy

# 실행 정책 변경 (현재 세션에만 적용)
Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process

# 또는 스크립트 직접 실행
powershell -ExecutionPolicy Bypass -File .\test-telegram-simple.ps1
```

---

## 방법 3: 기존 테스트 HTML 파일 사용

이미 `test-telegram-bot.html` 파일이 있습니다. 이 파일을 브라우저로 열어서 테스트할 수 있습니다.

### 사용 방법:

1. `test-telegram-bot.html` 파일을 브라우저로 엽니다
2. 봇(@arb6974_bot)에게 메시지를 보냅니다
3. "채팅 ID 가져오기" 버튼 클릭
4. "테스트 메시지 전송" 버튼으로 메시지 전송 테스트

**주의**: 이 방법은 웹훅을 사용하지 않으므로 `/funding` 명령어는 작동하지 않습니다. 단순히 메시지 전송만 테스트할 수 있습니다.

---

## 방법 4: 로컬에서 전체 함수 테스트

Netlify Functions를 로컬에서 직접 호출하여 테스트하는 방법입니다.

### 1단계: Netlify Dev 실행

```bash
cd C:\funding-arbitrage
netlify dev
```

### 2단계: 함수 직접 호출

새 터미널에서:
```bash
# GET 요청 (웹훅 엔드포인트 확인)
curl http://localhost:8888/.netlify/functions/telegramWebhook

# POST 요청 (텔레그램 웹훅 시뮬레이션)
curl -X POST http://localhost:8888/.netlify/functions/telegramWebhook \
  -H "Content-Type: application/json" \
  -d "{\"message\":{\"chat\":{\"id\":1374527604},\"text\":\"/funding\"}}"
```

또는 브라우저에서:
```
http://localhost:8888/.netlify/functions/telegramWebhook
```

---

## 환경 변수 설정 방법

### 방법 A: .env 파일 사용 (로컬 개발용)

프로젝트 루트에 `.env` 파일 생성:
```
TELEGRAM_BOT_TOKEN=8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0
TELEGRAM_CHAT_ID=1374527604
```

`.gitignore`에 `.env` 추가 (이미 있을 수 있음):
```
.env
```

### 방법 B: Netlify CLI로 설정

```bash
netlify env:set TELEGRAM_BOT_TOKEN 8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0
netlify env:set TELEGRAM_CHAT_ID 1374527604
```

### 방법 C: netlify.toml에 추가 (비추천 - 보안상 위험)

```toml
[build.environment]
  TELEGRAM_BOT_TOKEN = "8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0"
  TELEGRAM_CHAT_ID = "1374527604"
```

**주의**: 토큰이 노출되므로 Git에 커밋하지 마세요!

---

## 문제 해결

### "netlify: command not found"
- Netlify CLI가 설치되지 않았습니다
- `npm install -g netlify-cli` 실행

### "ngrok: command not found"
- ngrok이 설치되지 않았습니다
- [ngrok 다운로드](https://ngrok.com/download) 또는 `npm install -g ngrok`

### "Missing Telegram credentials" 에러
- 환경 변수가 설정되지 않았습니다
- `.env` 파일 확인 또는 `netlify env:set` 명령어 실행

### 웹훅이 작동하지 않음
- ngrok URL이 올바른지 확인
- ngrok이 실행 중인지 확인
- Netlify Dev 서버가 실행 중인지 확인
- 웹훅 정보 확인: `https://api.telegram.org/bot8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0/getWebhookInfo`

### CORS 에러
- Netlify Dev를 사용하면 CORS 문제가 해결됩니다
- 단순 HTTP 서버(python -m http.server)는 CORS 문제가 발생할 수 있습니다

---

## 빠른 시작

### PowerShell 사용 (Node.js 없이)

```powershell
# 1. 프로젝트 폴더로 이동
cd C:\funding-arbitrage

# 2. 간단한 테스트 실행
.\test-telegram-simple.ps1

# 또는 전체 기능 테스트
.\test-telegram-local.ps1
```

### Node.js 사용 (방법 1 요약)

```bash
# 1. Netlify CLI 설치 (한 번만)
npm install -g netlify-cli ngrok

# 2. 프로젝트 폴더로 이동
cd C:\funding-arbitrage

# 3. 환경 변수 설정
netlify env:set TELEGRAM_BOT_TOKEN 8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0
netlify env:set TELEGRAM_CHAT_ID 1374527604

# 4. 터미널 1: Netlify Dev 실행
netlify dev

# 5. 터미널 2: ngrok 실행
ngrok http 8888

# 6. ngrok URL로 웹훅 설정
# https://api.telegram.org/bot8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0/setWebhook?url=https://YOUR-NGROK-URL/.netlify/functions/telegramWebhook

# 7. 텔레그램에서 /funding 명령어 테스트
```

---

## 참고

- 텔레그램 봇 API: https://core.telegram.org/bots/api
- Netlify Functions: https://docs.netlify.com/functions/overview/
- ngrok: https://ngrok.com/docs
