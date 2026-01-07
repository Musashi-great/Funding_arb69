# Git 저장소 연결 가이드

## 1단계: GitHub 저장소 생성 완료 후

GitHub에서 저장소를 생성했다면, 다음 명령어를 실행하세요:

```bash
cd C:\funding-arbitrage
git remote add origin https://github.com/YOUR_USERNAME/funding-arbitrage.git
git branch -M main
git push -u origin main
```

**YOUR_USERNAME**을 본인의 GitHub 사용자명으로 변경하세요.

## 2단계: Netlify 연결

1. [Netlify](https://app.netlify.com) 접속
2. "Add new site" → "Import an existing project"
3. GitHub 선택
4. 방금 만든 `funding-arbitrage` 저장소 선택
5. Build settings:
   - Build command: (비워두기)
   - Publish directory: `.` (또는 비워두기)
6. "Show advanced" → "New variable" 클릭하여 환경 변수 추가:
   - `BYBIT_API_KEY` = `OZwc5A2DRkFVhDCueOvMWYi0GwORQZu0SZuU`
   - `BYBIT_API_SECRET` = `Iobd3CM36UWiUgPgKJ`
7. "Deploy site" 클릭

## 완료!

배포가 완료되면 모든 API가 정상 작동합니다.

