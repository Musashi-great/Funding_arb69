# 텔레그램 알림 봇 설정 가이드

이 가이드는 Funding Rate Arbitrage 알림 봇을 설정하는 방법을 설명합니다.

## 1. 텔레그램 봇 생성

1. 텔레그램에서 [@BotFather](https://t.me/botfather)를 찾아 대화를 시작합니다.
2. `/newbot` 명령어를 입력합니다.
3. 봇 이름을 입력합니다 (예: "Funding Arbitrage Bot").
4. 봇 사용자 이름을 입력합니다 (예: "funding_arbitrage_bot").
5. BotFather가 봇 토큰을 제공합니다. 이 토큰을 복사해 두세요.
   - 예: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

**현재 설정된 봇:**
- 봇 이름: `arb6974_bot`
- 봇 토큰: `8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0`

## 2. 채팅 ID 확인

### 방법 1: 테스트 페이지 사용 (권장)

1. 프로젝트 폴더에서 `test-telegram-bot.html` 파일을 브라우저로 엽니다.
2. 봇(@arb6974_bot)에게 메시지를 보냅니다 (예: `/start` 또는 "안녕").
3. 테스트 페이지에서 "채팅 ID 가져오기" 버튼을 클릭합니다.
4. 채팅 ID가 자동으로 표시됩니다.

### 방법 2: 직접 확인

1. 생성한 봇(@arb6974_bot)과 대화를 시작하고 메시지를 보냅니다.
2. 브라우저에서 다음 URL을 엽니다:
   ```
   https://api.telegram.org/bot8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0/getUpdates
   ```
3. 응답에서 `"chat":{"id":123456789}` 부분을 찾습니다.

### 방법 3: userinfobot 사용

1. 텔레그램에서 [@userinfobot](https://t.me/userinfobot)을 찾아 대화를 시작합니다.
2. `/start` 명령어를 입력하면 채팅 ID를 받을 수 있습니다.
   - 예: `123456789`

## 3. 텔레그램 웹훅 설정 (명령어 사용을 위해)

웹훅을 설정하면 `/funding` 명령어로 즉시 데이터를 받을 수 있습니다.

### 웹훅 설정 방법

1. Netlify에 배포가 완료된 후, 사이트 URL을 확인합니다.
   - 예: `https://your-site.netlify.app`

2. 브라우저에서 다음 URL을 엽니다 (봇 토큰을 사용):
   ```
   https://api.telegram.org/bot8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0/setWebhook?url=https://your-site.netlify.app/.netlify/functions/telegramWebhook
   ```

3. 응답에서 `"ok":true`가 나오면 성공입니다.

4. 웹훅 정보 확인:
   ```
   https://api.telegram.org/bot8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0/getWebhookInfo
   ```

### 웹훅 제거 (필요시)

웹훅을 제거하려면:
```
https://api.telegram.org/bot8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0/deleteWebhook
```

## 4. Netlify 환경 변수 설정

1. Netlify 대시보드에 로그인합니다.
2. 프로젝트를 선택합니다.
3. **Site settings** → **Environment variables**로 이동합니다.
4. 다음 환경 변수를 추가합니다:

   | Key | Value |
   |-----|-------|
   | `TELEGRAM_BOT_TOKEN` | `8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0` |
   | `TELEGRAM_CHAT_ID` | `1374527604` |

   **현재 설정된 값:**
   - 봇 토큰: `8502781237:AAH3lykU0ZnExQOV6XRR1S-EuMb-TRVYRK0`
   - 채팅 ID: `1374527604`

## 5. 스케줄링 설정

### 방법 1: Netlify Scheduled Functions (권장)

`netlify.toml` 파일에 다음을 추가합니다:

```toml
[[functions]]
  name = "scheduledTelegramNotification"
  schedule = "0 */1 * * *"  # 매시간 실행 (1시간마다)
  # 또는
  # schedule = "0 0,8,16 * * *"  # 8시간마다 (00:00, 08:00, 16:00 UTC)
```

### 방법 2: 외부 Cron 서비스 사용

1. [cron-job.org](https://cron-job.org) 또는 [EasyCron](https://www.easycron.com)에 가입합니다.
2. 새 cron job을 생성합니다:
   - **URL**: `https://your-site.netlify.app/.netlify/functions/sendTelegramNotification`
   - **Schedule**: 
     - 매시간: `0 * * * *`
     - 8시간마다: `0 0,8,16 * * *`
     - 매 15분: `*/15 * * * *`

## 6. 명령어 사용

웹훅이 설정되면 텔레그램 봇에서 다음 명령어를 사용할 수 있습니다:

- `/funding` - 상위 5개 arbitrage 기회를 즉시 조회
- `/start` - 시작 메시지 및 상위 5개 arbitrage 기회 조회
- `/help` - 도움말 표시

## 7. 수동 테스트

브라우저나 curl을 사용하여 수동으로 테스트할 수 있습니다:

```bash
curl -X POST https://your-site.netlify.app/.netlify/functions/sendTelegramNotification
```

또는 브라우저에서:
```
https://your-site.netlify.app/.netlify/functions/sendTelegramNotification
```

## 8. 알림 메시지 형식

알림 메시지는 다음과 같은 형식으로 전송됩니다:

```
🚀 Top 5 Arbitrage Opportunities

1. AVNT - +3.1521%
   ↘ Hyperliquid SHORT
   ↗ Lighter LONG

2. IP - +1.5184%
   ↘ Hyperliquid SHORT
   ↗ Lighter LONG

...

⏰ Updated: 2024-01-15 10:30:00
```

## 9. 문제 해결

### 알림이 오지 않는 경우

1. **환경 변수 확인**: Netlify 대시보드에서 `TELEGRAM_BOT_TOKEN`과 `TELEGRAM_CHAT_ID`가 올바르게 설정되었는지 확인합니다.
2. **봇 토큰 확인**: BotFather에서 `/token` 명령어로 토큰을 다시 확인할 수 있습니다.
3. **채팅 ID 확인**: 봇과 대화를 시작했는지 확인합니다.
4. **Netlify 로그 확인**: Netlify 대시보드 → Functions → Logs에서 에러를 확인합니다.

### 스케줄이 작동하지 않는 경우

1. **Netlify Scheduled Functions**: Netlify Pro 플랜 이상이 필요할 수 있습니다.
2. **외부 Cron 서비스**: cron 서비스가 활성화되어 있는지 확인합니다.
3. **시간대 확인**: UTC 시간대를 기준으로 스케줄이 설정됩니다.

## 10. 고급 설정

### 펀딩 시간에 맞춰 알림 받기

각 거래소의 펀딩 시간에 맞춰 알림을 받으려면:

1. **1시간 간격 거래소** (Hyperliquid, Lighter): 매시간 알림
2. **8시간 간격 거래소** (Binance, Bybit, Variational): 00:00, 08:00, 16:00 UTC에 알림

여러 스케줄을 설정하려면 여러 함수를 만들거나, 함수 내에서 현재 시간을 확인하여 조건부로 알림을 보낼 수 있습니다.

## 참고

- 텔레그램 봇 API 문서: https://core.telegram.org/bots/api
- Netlify Functions 문서: https://docs.netlify.com/functions/overview/
- Netlify Scheduled Functions: https://docs.netlify.com/functions/scheduled-functions/

