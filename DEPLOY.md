# Netlify 배포 가이드

## 방법 1: Git 저장소 연결 (권장 - Functions 작동)

### 1. GitHub 저장소 생성
1. GitHub에 로그인
2. "New repository" 클릭
3. 저장소 이름: `funding-arbitrage`
4. "Create repository" 클릭

### 2. 로컬에서 Git 초기화 및 푸시
```bash
cd C:\funding-arbitrage
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/funding-arbitrage.git
git push -u origin main
```

### 3. Netlify에 연결
1. [Netlify](https://app.netlify.com) 접속
2. "Add new site" → "Import an existing project"
3. GitHub 선택 및 저장소 선택
4. Build settings:
   - Build command: (비워두기)
   - Publish directory: `.` (또는 비워두기)
5. "Show advanced" 클릭 → "New variable" 클릭하여 환경 변수 추가:
   - `BYBIT_API_KEY` = `OZwc5A2DRkFVhDCueOvMWYi0GwORQZu0SZuU`
   - `BYBIT_API_SECRET` = `Iobd3CM36UWiUgPgKJ`
6. "Deploy site" 클릭

## 방법 2: 드래그 앤 드롭 (간단하지만 Functions 미작동)

1. [Netlify](https://app.netlify.com) 접속
2. "Add new site" → "Deploy manually"
3. `C:\funding-arbitrage` 폴더를 드래그 앤 드롭
4. 배포 완료

⚠️ **주의**: 이 방법은 Netlify Functions가 작동하지 않아 Bybit과 Extended API가 동작하지 않습니다.

## 환경 변수 설정 (방법 1 사용 시)

Netlify 대시보드에서:
1. Site settings → Environment variables
2. 다음 변수 추가:
   - `BYBIT_API_KEY`: `OZwc5A2DRkFVhDCueOvMWYi0GwORQZu0SZuU`
   - `BYBIT_API_SECRET`: `Iobd3CM36UWiUgPgKJ`

## 확인 사항

배포 후:
- ✅ Variational API 작동
- ✅ Binance API 작동
- ✅ Bybit API 작동 (Git 연결 시)
- ✅ Extended API 작동 (Git 연결 시)

