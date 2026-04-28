import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import crypto from "node:crypto";

// GET /api/gmail-oauth/start
// 로그인된 사용자만 호출 가능. CSRF 방지용 state 를 쿠키에 박아두고 구글 OAuth URL 로 redirect.
// 콜백 URL: ${origin}/api/gmail-oauth/callback
export async function GET(request: NextRequest) {
  // 1) 앱 인증 확인 — 미들웨어는 /api/* 를 public 으로 풀어두므로 여기서 직접 확인
  const auth = request.cookies.get("outreach_auth")?.value;
  if (auth !== "authenticated") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // 2) 환경변수 확인
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET 미설정" },
      { status: 500 },
    );
  }

  // 3) redirect_uri 는 현재 호스트 기준으로 자동 생성 (로컬/프로덕션 자동 분기)
  const redirectUri = `${request.nextUrl.origin}/api/gmail-oauth/callback`;

  // 4) CSRF 방지용 state
  const state = crypto.randomBytes(16).toString("hex");

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // 매번 refresh_token 재발급
    scope: ["https://www.googleapis.com/auth/gmail.send"],
    state,
  });

  const res = NextResponse.redirect(url);
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600, // 10분
    path: "/api/gmail-oauth",
  });
  return res;
}
