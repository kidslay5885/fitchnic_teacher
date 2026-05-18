import { NextResponse } from "next/server";
import { google } from "googleapis";
import { listGmailAccounts } from "@/lib/gmail";
import { classifyGmailError } from "@/lib/discord";

// 가벼운 Gmail 토큰 헬스 체크 (다중 계정).
// gmail.send 스코프만으로는 getProfile 호출이 막혀 있으므로
// OAuth access_token refresh 시도만으로 토큰 유효성을 검증한다.
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

  let accounts;
  try {
    accounts = await listGmailAccounts();
  } catch (e) {
    return NextResponse.json({
      ok: false,
      kind: "config",
      message: e instanceof Error ? e.message : String(e),
      checkedAt: new Date().toISOString(),
    });
  }

  if (accounts.length === 0) {
    return NextResponse.json({
      ok: false,
      kind: "no_account",
      message: "등록된 Gmail 계정이 없습니다 — gmail_accounts 마이그레이션 후 재인증하세요",
      checkedAt: new Date().toISOString(),
    });
  }

  const results = await Promise.all(
    accounts.map(async (a) => {
      if (!a.refresh_token) {
        return {
          email: a.email,
          label: a.label,
          is_default: a.is_default,
          is_cron_sender: a.is_cron_sender,
          ok: false,
          kind: "no_token",
          label_msg: "미인증",
          message: "refresh_token 미설정 — Gmail 재인증 필요",
        };
      }
      try {
        const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
        oauth2.setCredentials({ refresh_token: a.refresh_token });
        const { token } = await oauth2.getAccessToken();
        if (!token) throw new Error("access_token 발급 실패");
        return {
          email: a.email,
          label: a.label,
          is_default: a.is_default,
          is_cron_sender: a.is_cron_sender,
          ok: true,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const { kind, label } = classifyGmailError(msg);
        return {
          email: a.email,
          label: a.label,
          is_default: a.is_default,
          is_cron_sender: a.is_cron_sender,
          ok: false,
          kind,
          label_msg: label,
          message: msg.slice(0, 300),
        };
      }
    }),
  );

  const failed = results.filter((r) => !r.ok);
  const checkedAt = new Date().toISOString();

  if (failed.length === 0) {
    return NextResponse.json({ ok: true, accounts: results, checkedAt });
  }

  // 첫 번째 실패 계정의 정보를 최상위에 노출 (기존 단일 계정 UI 호환)
  // 우선순위: is_cron_sender > is_default > 그 외
  const sortedFailed = [...failed].sort((a, b) => {
    if (a.is_cron_sender !== b.is_cron_sender) return a.is_cron_sender ? -1 : 1;
    if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
    return 0;
  });
  const primary = sortedFailed[0];
  const summary = failed.length === 1
    ? `${primary.email} — ${primary.label_msg ?? "오류"}`
    : `${primary.email} 외 ${failed.length - 1}건 — ${primary.label_msg ?? "오류"}`;

  return NextResponse.json({
    ok: false,
    kind: primary.kind,
    label: primary.label_msg,
    message: summary,
    failedAccount: { email: primary.email, label: primary.label },
    accounts: results,
    checkedAt,
  });
}
