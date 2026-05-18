import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import crypto from "node:crypto";
import { getSupabase } from "@/lib/supabase";

// GET /api/gmail-oauth/start?account=<email>
// 로그인된 사용자만 호출 가능. account 파라미터로 어떤 gmail_accounts 슬롯에 저장할지 결정.
// 미지정 시 is_default 계정으로 fallback.
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

  // 3) 어떤 계정을 인증할지 결정
  const accountEmailParam = request.nextUrl.searchParams.get("account")?.trim() || null;
  const sb = getSupabase();

  let targetEmail: string | null = accountEmailParam;
  if (!targetEmail) {
    const { data } = await sb
      .from("gmail_accounts")
      .select("email")
      .eq("is_default", true)
      .maybeSingle();
    targetEmail = data?.email ?? null;
  }
  if (!targetEmail) {
    return NextResponse.json(
      { error: "재인증할 계정을 결정할 수 없습니다. account 파라미터를 넘기거나 기본 계정을 설정하세요." },
      { status: 400 },
    );
  }

  // 등록된 계정인지 확인 — 임의 이메일로 토큰을 덮어쓰지 못하게 화이트리스트 검증
  const { data: account } = await sb
    .from("gmail_accounts")
    .select("email")
    .eq("email", targetEmail)
    .maybeSingle();
  if (!account) {
    return NextResponse.json(
      { error: `gmail_accounts 에 등록되지 않은 이메일입니다: ${targetEmail}` },
      { status: 400 },
    );
  }

  // 4) redirect_uri 는 현재 호스트 기준으로 자동 생성 (로컬/프로덕션 자동 분기)
  const redirectUri = `${request.nextUrl.origin}/api/gmail-oauth/callback`;

  // 5) CSRF 방지용 state + 어떤 계정 슬롯에 저장할지 토큰에 박아두기
  const state = crypto.randomBytes(16).toString("hex");

  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent", // 매번 refresh_token 재발급
    // gmail.send 외에 openid+email 도 요청 — 토큰 교환 시 id_token 으로 실제 로그인 계정 검증
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "openid",
      "email",
    ],
    state,
    login_hint: targetEmail, // 구글 로그인 화면에 이 계정 추천
  });

  const res = NextResponse.redirect(url);
  res.cookies.set("gmail_oauth_state", state, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600, // 10분
    path: "/api/gmail-oauth",
  });
  res.cookies.set("gmail_oauth_account", targetEmail, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "lax",
    maxAge: 600,
    path: "/api/gmail-oauth",
  });
  return res;
}
