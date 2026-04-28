import { google } from "googleapis";
import { getSupabase } from "@/lib/supabase";

// Gmail API 발송 헬퍼
// .env.local 에 GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_SENDER 필요
// refresh_token 은 Supabase app_secrets 테이블의 'gmail_refresh_token' 키에 저장.
// 만료/폐기 시 웹에서 /api/gmail-oauth/start 로 재인증하면 자동 갱신됨.

const REFRESH_TOKEN_KEY = "gmail_refresh_token";

// (refresh_token 값 → OAuth 클라이언트) 캐시.
// 같은 토큰이면 재사용, 토큰이 바뀌면 새로 만든다.
let cached: { token: string; client: ReturnType<typeof buildOAuth2Client> } | null = null;

function buildOAuth2Client(refreshToken: string) {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Gmail API 환경변수 미설정 (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET)");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

async function loadRefreshToken(): Promise<string> {
  // 1) DB에서 우선 조회
  const sb = getSupabase();
  const { data, error } = await sb
    .from("app_secrets")
    .select("value")
    .eq("key", REFRESH_TOKEN_KEY)
    .maybeSingle();
  if (error) throw new Error(`refresh_token 조회 실패: ${error.message}`);
  if (data?.value) return data.value;

  // 2) DB에 없으면 환경변수 fallback (기존 운영 호환)
  const envToken = process.env.GMAIL_REFRESH_TOKEN;
  if (envToken) return envToken;

  throw new Error(
    "GMAIL_REFRESH_TOKEN 미설정 — 웹에서 Gmail 재인증을 진행하세요 (/api/gmail-oauth/start)",
  );
}

async function getClient() {
  const token = await loadRefreshToken();
  if (!cached || cached.token !== token) {
    cached = { token, client: buildOAuth2Client(token) };
  }
  return cached.client;
}

// RFC 2047 MIME 헤더 인코딩 (한글 제목 지원)
function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

// 본문 \n → <br> (HTML 파트용), 플레인 텍스트 파트는 원문 그대로
function toHtml(plain: string) {
  const esc = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\r?\n/g, "<br>");
}

const SENDER_NAME = "(주)핏크닉 대표 정승요";

// "표시명" <email> 형식의 주소 헤더. 이름이 없으면 이메일만.
function formatAddress(email: string, name?: string) {
  if (!name || !name.trim()) return email;
  return `${encodeHeader(name)} <${email}>`;
}

function buildRawMessage(from: string, to: string, subject: string, body: string, toName?: string) {
  const boundary = `fitchnic_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${formatAddress(from, SENDER_NAME)}`,
    `To: ${formatAddress(to, toName)}`,
    `Subject: ${encodeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(`<div style="white-space:pre-wrap;font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;font-size:14px;line-height:1.7;color:#222">${toHtml(body)}</div>`, "utf8").toString("base64"),
    "",
    `--${boundary}--`,
  ];
  const raw = lines.join("\r\n");
  // base64url
  return Buffer.from(raw, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
  toName?: string;
}

export async function sendEmail({ to, subject, body, toName }: SendEmailParams) {
  const sender = process.env.GMAIL_SENDER;
  if (!sender) throw new Error("GMAIL_SENDER 환경변수 미설정");
  const auth = await getClient();
  const gmail = google.gmail({ version: "v1", auth });
  const raw = buildRawMessage(sender, to, subject, body, toName);
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return { id: res.data.id, threadId: res.data.threadId };
}

// 템플릿 변수 치환: '채널이름' → name, '채널분야' → field
export function renderTemplate(template: string, vars: { name: string; field: string }) {
  return template
    .replaceAll("'채널이름'", vars.name || "")
    .replaceAll("'채널분야'", vars.field || "");
}

// OAuth 콜백에서 새 refresh_token 을 DB에 저장하고 인메모리 캐시도 즉시 무효화
export async function saveGmailRefreshToken(refreshToken: string) {
  if (!refreshToken || !refreshToken.trim()) {
    throw new Error("refresh_token 값이 비어 있습니다");
  }
  const sb = getSupabase();
  const { error } = await sb
    .from("app_secrets")
    .upsert(
      { key: REFRESH_TOKEN_KEY, value: refreshToken, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`refresh_token 저장 실패: ${error.message}`);
  cached = null; // 다음 발송 시 새 토큰으로 클라이언트 재생성
}
