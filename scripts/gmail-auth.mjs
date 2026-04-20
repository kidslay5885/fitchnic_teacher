// Gmail 발송용 OAuth refresh_token 발급 스크립트
// 1회성 세팅용 — 발송 계정(대표님 계정)으로 로그인하면 refresh_token을 출력한다.
//
// 사용법:
//   1) .env.local 에 GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET 먼저 채워넣기
//   2) node scripts/gmail-auth.mjs
//   3) 출력된 URL을 브라우저에서 열고 대표님 계정으로 로그인 → 권한 동의
//   4) 리다이렉트된 URL의 ?code=... 값을 복사해서 터미널에 붙여넣기
//   5) 출력된 refresh_token을 .env.local 의 GMAIL_REFRESH_TOKEN 에 저장

import { google } from "googleapis";
import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";

// .env.local 간이 로더
const envPath = path.resolve(".env.local");
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
    }
  }
}

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "urn:ietf:wg:oauth:2.0:oob"; // 수동 코드 복사 방식

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ .env.local 에 GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET 을 먼저 채워주세요.");
  process.exit(1);
}

const oAuth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oAuth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.send"],
});

console.log("\n1) 아래 URL을 브라우저에서 열고, 발송할 계정(대표님 계정)으로 로그인 후 권한을 승인하세요:\n");
console.log(authUrl);
console.log("\n2) 리다이렉트 페이지에 표시된 코드를 아래에 붙여넣으세요.\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("인증 코드: ", async (code) => {
  rl.close();
  try {
    const { tokens } = await oAuth2.getToken(code.trim());
    if (!tokens.refresh_token) {
      console.error("❌ refresh_token 이 발급되지 않았습니다. Google 계정의 앱 권한을 제거하고 다시 시도하세요.");
      console.error("   https://myaccount.google.com/permissions 에서 이 앱 권한을 삭제 후 재실행.");
      process.exit(1);
    }
    console.log("\n✅ 성공! 아래 값을 .env.local 에 저장하세요:\n");
    console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log(`\n(참고용 access_token: ${tokens.access_token?.slice(0, 24)}...)`);
  } catch (e) {
    console.error("❌ 토큰 발급 실패:", e.message);
    process.exit(1);
  }
});
