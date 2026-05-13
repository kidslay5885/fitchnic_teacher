import { NextResponse } from "next/server";
import { google } from "googleapis";
import { getSupabase } from "@/lib/supabase";
import { classifyGmailError } from "@/lib/discord";

// 가벼운 Gmail 토큰 헬스 체크.
// gmail.users.getProfile 한 번으로 OAuth refresh가 트리거되어 만료/유효 판단.
// 발송보다 훨씬 가벼움(메일 보내지 않음).
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
    const gmail = google.gmail({ version: "v1", auth: oauth2 });
    const res = await gmail.users.getProfile({ userId: "me" });
    return NextResponse.json({
      ok: true,
      email: res.data.emailAddress || "",
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
