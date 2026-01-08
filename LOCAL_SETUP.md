# 로컬 테스트 환경 설정 가이드

로컬에서 Funding Rate Arbitrage 사이트를 테스트하는 방법입니다.

## 방법 1: Python 사용 (가장 간단)

### Python 3가 설치되어 있는 경우:

1. **터미널/명령 프롬프트 열기**
   - Windows: `Win + R` → `cmd` 입력 → Enter
   - 또는 PowerShell 사용

2. **프로젝트 폴더로 이동**
   ```bash
   cd C:\funding-arbitrage
   ```

3. **로컬 서버 실행**
   ```bash
   python -m http.server 8000
   ```
   
   또는 Python 2인 경우:
   ```bash
   python -m SimpleHTTPServer 8000
   ```

4. **브라우저에서 접속**
   - 주소창에 입력: `http://localhost:8000`
   - 또는: `http://127.0.0.1:8000`

5. **서버 종료**
   - 터미널에서 `Ctrl + C` 누르기

---

## 방법 2: Node.js 사용

### Node.js가 설치되어 있는 경우:

1. **터미널/명령 프롬프트 열기**

2. **프로젝트 폴더로 이동**
   ```bash
   cd C:\funding-arbitrage
   ```

3. **http-server 설치 (한 번만)**
   ```bash
   npm install -g http-server
   ```

4. **로컬 서버 실행**
   ```bash
   http-server -p 8000
   ```

5. **브라우저에서 접속**
   - 주소창에 입력: `http://localhost:8000`

6. **서버 종료**
   - 터미널에서 `Ctrl + C` 누르기

---

## 방법 3: VS Code Live Server 확장 사용

### VS Code를 사용하는 경우:

1. **VS Code에서 프로젝트 폴더 열기**
   - `File` → `Open Folder` → `C:\funding-arbitrage` 선택

2. **Live Server 확장 설치**
   - 왼쪽 사이드바에서 확장 아이콘 클릭 (또는 `Ctrl + Shift + X`)
   - 검색창에 "Live Server" 입력
   - "Live Server" (Ritwick Dey) 설치

3. **서버 실행**
   - `index.html` 파일을 우클릭
   - "Open with Live Server" 선택
   - 자동으로 브라우저가 열립니다

4. **서버 종료**
   - VS Code 하단 상태바의 "Go Live" 버튼 클릭

---

## 방법 4: PHP 사용 (PHP가 설치되어 있는 경우)

1. **터미널/명령 프롬프트 열기**

2. **프로젝트 폴더로 이동**
   ```bash
   cd C:\funding-arbitrage
   ```

3. **로컬 서버 실행**
   ```bash
   php -S localhost:8000
   ```

4. **브라우저에서 접속**
   - 주소창에 입력: `http://localhost:8000`

---

## 테스트 확인 사항

로컬 서버가 실행되면:

1. **브라우저 개발자 도구 열기**
   - `F12` 키 또는 `Ctrl + Shift + I` (Windows)
   - `Cmd + Option + I` (Mac)

2. **Console 탭 확인**
   - API 호출 로그 확인
   - 에러 메시지 확인

3. **Network 탭 확인**
   - API 요청 상태 확인
   - 응답 데이터 확인

---

## 주의사항

- **CORS 문제**: 일부 API는 브라우저에서 직접 호출 시 CORS 오류가 발생할 수 있습니다.
  - `file://` 프로토콜로 직접 열면 CORS 제한이 완화되어 작동할 수 있습니다.
  - `http://localhost`로 서버를 실행하면 CORS 정책이 엄격하게 적용됩니다.
  - **해결 방법**: Netlify CLI를 사용하여 로컬에서 Functions를 실행하면 CORS 문제를 해결할 수 있습니다 (아래 "방법 5" 참조).

- **API 키 보안**: 로컬 테스트 시 Bybit API 키가 브라우저 개발자 도구에서 확인 가능합니다.
  - 배포 시에는 Netlify Functions를 통해 서버 사이드에서만 사용됩니다.

- **포트 번호**: 8000 포트가 이미 사용 중이면 다른 포트를 사용하세요.
  - 예: `python -m http.server 8080`

---

## 방법 5: Netlify CLI 사용 (권장 - CORS 문제 해결)

로컬 서버에서 CORS 문제가 발생하는 경우, Netlify CLI를 사용하면 Functions도 함께 실행되어 CORS 문제를 해결할 수 있습니다.

### Netlify CLI 설치 및 사용:

1. **Node.js 설치 확인**
   - Node.js가 설치되어 있어야 합니다.

2. **Netlify CLI 설치**
   ```bash
   npm install -g netlify-cli
   ```

3. **프로젝트 폴더로 이동**
   ```bash
   cd C:\funding-arbitrage
   ```

4. **Netlify Dev 서버 실행**
   ```bash
   netlify dev
   ```
   
   또는 Functions만 실행하려면:
   ```bash
   netlify dev --live
   ```

5. **브라우저에서 접속**
   - Netlify CLI가 자동으로 URL을 표시합니다 (보통 `http://localhost:8888`)
   - 또는 표시된 URL로 접속

6. **서버 종료**
   - 터미널에서 `Ctrl + C` 누르기

### 장점:
- ✅ Netlify Functions가 로컬에서도 작동
- ✅ CORS 문제 해결
- ✅ 프로덕션 환경과 동일한 환경에서 테스트 가능

### 단점:
- ⚠️ Node.js와 Netlify CLI 설치 필요

---

## 문제 해결

### "포트가 이미 사용 중입니다" 오류
- 다른 포트 번호 사용: `python -m http.server 8080`
- 또는 해당 포트를 사용하는 프로그램 종료

### "Python을 찾을 수 없습니다" 오류
- Python이 설치되어 있는지 확인
- 또는 다른 방법 (Node.js, VS Code Live Server) 사용

### API 데이터가 로드되지 않음
- 브라우저 개발자 도구 Console 탭에서 에러 확인
- Network 탭에서 API 요청 상태 확인
- 인터넷 연결 확인

---

## 빠른 시작 (Python 사용)

```bash
# 1. 프로젝트 폴더로 이동
cd C:\funding-arbitrage

# 2. 서버 실행
python -m http.server 8000

# 3. 브라우저에서 http://localhost:8000 접속
```

