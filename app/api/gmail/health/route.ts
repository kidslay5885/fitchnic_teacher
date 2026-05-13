import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getSupabase } from "@/lib/supabase";
import { classifyGmailError } from "@/lib/discord";

// 가벼운 Gmail 토큰 헬스 체크.
// gmail.send 스코프만 있는 refresh_token으로는 getProfile 등 다른 API가 막혀 있어
// (insufficient authentication scopes), OAuth refresh 자체로만 검증한다.
// 토큰이 만료/폐기되면 invalid_grant 에러가 발생하므로 그것만으로 충분.
export async function GET() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json({
      ok: false,
      kind: "config",
      message: "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET 미설정",
      checkedAt: new Date().toISOString(),
    });
  }

  // refresh_token 로드 (DB 우선, env fallback)
  let refreshToken = "";
  try {
    const sb = getSupabase();
    const { data } = await sb
      .from("app_secrets")
      .select("value")
      .eq("key", "gmail_refresh_token")
      .maybeSingle();
    refreshToken = data?.value || process.env.GMAIL_REFRESH_TOKEN || "";
  } catch {
    refreshToken = process.env.GMAIL_REFRESH_TOKEN || "";
  }
  if (!refreshToken) {
    return NextResponse.json({
      ok: false,
      kind: "no_token",
      message: "refresh_token 미설정 — Gmail 재인증 필요",
      checkedAt: new Date().toISOString(),
    });
  }

  try {
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
    oauth2.setCredentials({ refresh_token: refreshToken });
    // access_token 갱신 시도만으로 refresh_token 유효성 확인
    const { token } = await oauth2.getAccessToken();
    if (!token) throw new Error("access_token 발급 실패");
    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const { kind, label } = classifyGmailError(msg);
    return NextResponse.json({
      ok: false,
      kind,
      label,
      message: msg.slice(0, 300),
      checkedAt: new Date().toISOString(),
    });
  }
}
