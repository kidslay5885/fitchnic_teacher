import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { saveGmailRefreshToken } from "@/lib/gmail";

// GET /api/gmail-oauth/callback?code=...&state=...
// 구글이 redirect 로 호출. code 를 토큰으로 교환 → refresh_token 을 DB 저장.
// 결과는 자동으로 닫히는 HTML 페이지로 응답.
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const code = sp.get("code");
  const state = sp.get("state");
  const error = sp.get("error");

  // 사용자가 권한 승인을 거부한 경우
  if (error) {
    return htmlResponse({
      ok: false,
      title: "재인증 취소됨",
      message: `구글 권한 승인이 취소되었습니다 (${error}).`,
    });
  }

  // CSRF 방지: state 일치 확인
  const cookieState = request.cookies.get("gmail_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return htmlResponse({
      ok: false,
      title: "재인증 실패",
      message: "state 검증 실패. 다시 시도해주세요.",
    });
  }

  if (!code) {
    return htmlResponse({
      ok: false,
      title: "재인증 실패",
      message: "인증 코드가 없습니다.",
    });
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return htmlResponse({
      ok: false,
      title: "재인증 실패",
      message: "GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET 환경변수 미설정.",
    });
  }

  // start 와 동일한 redirect_uri 사용해야 토큰 교환 성공
  const redirectUri = `${request.nextUrl.origin}/api/gmail-oauth/callback`;
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oauth2.getToken(code);
    if (!tokens.refresh_token) {
      return htmlResponse({
        ok: false,
        title: "refresh_token 미발급",
        message:
          "Google이 refresh_token을 내려주지 않았습니다. https://myaccount.google.com/permissions 에서 이 앱 권한을 삭제한 뒤 재인증을 다시 시도하세요.",
      });
    }

    await saveGmailRefreshToken(tokens.refresh_token);

    const res = htmlResponse({
      ok: true,
      title: "Gmail 재인증 완료",
      message: "새 refresh_token이 저장되었습니다. 이 창은 자동으로 닫힙니다.",
    });
    // state 쿠키 정리
    res.cookies.delete("gmail_oauth_state");
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return htmlResponse({
      ok: false,
      title: "토큰 교환 실패",
      message: msg,
    });
  }
}

// 자동 닫힘 + 부모 창 알림 HTML 응답
function htmlResponse({ ok, title, message }: { ok: boolean; title: string; message: string }) {
  const color = ok ? "#16a34a" : "#dc2626";
  const bg = ok ? "#f0fdf4" : "#fef2f2";
  const border = ok ? "#bbf7d0" : "#fecaca";
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; font-family: 'Malgun Gothic','Apple SD Gothic Neo',sans-serif; background:#f8fafc; }
  .card { max-width: 420px; padding:28px 32px; border-radius:12px; background:${bg}; border:1px solid ${border}; box-shadow: 0 1px 3px rgba(0,0,0,.04); text-align:center; }
  .title { color:${color}; font-weight:700; font-size:18px; margin:0 0 8px; }
  .msg { color:#374151; font-size:14px; line-height:1.6; margin:0 0 16px; }
  .btn { display:inline-block; padding:8px 16px; background:#1f2937; color:#fff; border-radius:8px; text-decoration:none; font-size:13px; cursor:pointer; border:none; }
</style>
</head>
<body>
  <div class="card">
    <p class="title">${escapeHtml(title)}</p>
    <p class="msg">${escapeHtml(message)}</p>
    <button class="btn" onclick="closeWindow()">닫기</button>
  </div>
<script>
  function closeWindow(){
    try { if (window.opener) { window.opener.postMessage({ type: 'gmail-oauth', ok: ${ok} }, '*'); } } catch(e){}
    window.close();
  }
  ${ok ? `setTimeout(closeWindow, 1500);` : ""}
</script>
</body>
</html>`;
  return new NextResponse(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
