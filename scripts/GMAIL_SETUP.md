# Gmail 자동 발송 세팅 가이드

대표님 계정으로 메일을 자동 발송하려면 **1회성 OAuth 세팅**이 필요합니다.

## 1. Google Cloud Console 준비

1. https://console.cloud.google.com/ 접속
2. 상단 프로젝트 선택 (기존 `google-credentials.json` 만든 프로젝트 그대로 사용)
3. **APIs & Services → Library** → `Gmail API` 검색 → **사용 설정 (Enable)**
4. **APIs & Services → OAuth consent screen**
   - 앱 유형: External (테스트 중이면 OK)
   - Scopes 단계에서 `.../auth/gmail.send` 추가
   - **Test users** 에 대표님 이메일 추가 (본인 테스트용 이메일도 함께 추가해두면 편함)
5. **APIs & Services → Credentials**
   - 기존 OAuth 2.0 클라이언트 ID 편집 (없다면 `OAuth client ID` 새로 생성, 타입: `Desktop app`)
   - Desktop app 이면 redirect URI 자동 설정되므로 별도 추가 불필요
   - `Client ID`, `Client Secret` 복사

## 2. `.env.local` 작성

프로젝트 루트의 `.env.local` 파일에 아래 키를 추가합니다 (없으면 새로 만들기):

```
GMAIL_CLIENT_ID=발급받은_클라이언트_ID
GMAIL_CLIENT_SECRET=발급받은_클라이언트_시크릿
GMAIL_SENDER=대표님이메일주소@gmail.com
# GMAIL_REFRESH_TOKEN 은 다음 단계에서 발급
```

## 3. Refresh Token 발급

터미널에서:

```bash
node scripts/gmail-auth.mjs
```

출력된 URL을 브라우저에서 열고:
1. **대표님 계정**으로 로그인
2. 권한 동의 (경고창이 뜨면 "고급 → 안전하지 않음으로 이동" 클릭)
3. 표시된 **인증 코드**를 복사해서 터미널에 붙여넣기
4. 출력된 `refresh_token` 을 `.env.local` 의 `GMAIL_REFRESH_TOKEN=` 에 저장

## 4. 검증

개발 서버를 재시작하고, 컨택관리 탭에서 본인 이메일이 들어간 강사 한 명을 선택 → 메일 발송 버튼 → 실제로 받은편지함에 도착하는지 확인.

## 자주 겪는 문제

- **"refresh_token 이 발급되지 않았습니다"**
  → https://myaccount.google.com/permissions 에서 이 앱 권한을 제거한 뒤 스크립트를 다시 실행하세요. (`prompt=consent` 가 먹지 않는 경우가 있음)

- **"access blocked"**
  → OAuth consent screen 의 Test users 에 로그인하려는 계정을 추가했는지 확인.

- **토큰 만료**
  → `refresh_token` 은 만료되지 않습니다. 하지만 테스트 앱 상태(publishing status = Testing)에서는 7일마다 만료될 수 있으므로, 이 경우 consent screen 을 "In production" 으로 발행하거나 주기적으로 재발급해야 합니다.
