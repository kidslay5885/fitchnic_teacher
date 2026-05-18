import { google } from "googleapis";
import { getSupabase } from "@/lib/supabase";

// Gmail API 발송 헬퍼 (다중 계정 지원)
// gmail_accounts 테이블에서 계정별 refresh_token 을 불러와 OAuth 클라이언트를 만든다.
// 만료/폐기 시 /api/gmail-oauth/start?account=<email> 로 재인증.

export interface GmailAccount {
  id: string;
  email: string;
  label: string;
  refresh_token: string | null;
  is_default: boolean;
  is_cron_sender: boolean;
}

// (계정 id → 클라이언트) 캐시. refresh_token 이 바뀌면 무효화된다.
const clientCache = new Map<string, { token: string; client: ReturnType<typeof buildOAuth2Client> }>();

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

export async function listGmailAccounts(): Promise<GmailAccount[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("gmail_accounts")
    .select("id, email, label, refresh_token, is_default, is_cron_sender")
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Gmail 계정 조회 실패: ${error.message}`);
  return (data ?? []) as GmailAccount[];
}

async function getAccount(accountId?: string | null): Promise<GmailAccount> {
  const sb = getSupabase();
  let query = sb
    .from("gmail_accounts")
    .select("id, email, label, refresh_token, is_default, is_cron_sender");
  if (accountId) query = query.eq("id", accountId);
  else query = query.eq("is_default", true);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`Gmail 계정 조회 실패: ${error.message}`);
  if (!data) {
    throw new Error(
      accountId
        ? `Gmail 계정을 찾을 수 없습니다 (id=${accountId})`
        : "기본 Gmail 계정이 설정되어 있지 않습니다. gmail_accounts 테이블에 is_default=true 인 row를 만들고 재인증하세요.",
    );
  }
  return data as GmailAccount;
}

export async function getCronSenderAccount(): Promise<GmailAccount> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("gmail_accounts")
    .select("id, email, label, refresh_token, is_default, is_cron_sender")
    .eq("is_cron_sender", true)
    .maybeSingle();
  if (error) throw new Error(`크론 발송 계정 조회 실패: ${error.message}`);
  if (!data) throw new Error("is_cron_sender=true 인 Gmail 계정이 없습니다.");
  return data as GmailAccount;
}

async function getClient(account: GmailAccount) {
  if (!account.refresh_token) {
    throw new Error(
      `${account.email} 의 refresh_token 이 없습니다 — /api/gmail-oauth/start?account=${encodeURIComponent(account.email)} 로 재인증하세요.`,
    );
  }
  const cached = clientCache.get(account.id);
  if (cached && cached.token === account.refresh_token) return cached.client;
  const client = buildOAuth2Client(account.refresh_token);
  clientCache.set(account.id, { token: account.refresh_token, client });
  return client;
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

// "표시명" <email> 형식의 주소 헤더. 이름이 없으면 이메일만.
function formatAddress(email: string, name?: string) {
  if (!name || !name.trim()) return email;
  return `${encodeHeader(name)} <${email}>`;
}

function buildRawMessage(
  fromEmail: string,
  fromName: string,
  to: string,
  subject: string,
  body: string,
  toName?: string,
) {
  const boundary = `fitchnic_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${formatAddress(fromEmail, fromName)}`,
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
  senderAccountId?: string;          // 미지정 시 is_default 계정 사용
  senderAccount?: GmailAccount;      // 이미 조회한 계정 객체를 전달 (반복 호출 시 N+1 방지)
}

export interface SendEmailResult {
  id: string | null | undefined;
  threadId: string | null | undefined;
  senderAccountId: string;
  senderEmail: string;
}

export async function sendEmail({
  to,
  subject,
  body,
  toName,
  senderAccountId,
  senderAccount,
}: SendEmailParams): Promise<SendEmailResult> {
  const account = senderAccount ?? (await getAccount(senderAccountId));
  const auth = await getClient(account);
  const gmail = google.gmail({ version: "v1", auth });
  const raw = buildRawMessage(account.email, account.label, to, subject, body, toName);
  const res = await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
  return {
    id: res.data.id,
    threadId: res.data.threadId,
    senderAccountId: account.id,
    senderEmail: account.email,
  };
}

// 템플릿 변수 치환: '채널이름' → name, '채널분야' → field
export function renderTemplate(template: string, vars: { name: string; field: string }) {
  return template
    .replaceAll("'채널이름'", vars.name || "")
    .replaceAll("'채널분야'", vars.field || "");
}

// OAuth 콜백에서 새 refresh_token 을 DB에 저장하고 인메모리 캐시도 즉시 무효화
export async function saveGmailRefreshToken(email: string, refreshToken: string) {
  if (!email || !email.trim()) throw new Error("email 값이 비어 있습니다");
  if (!refreshToken || !refreshToken.trim()) {
    throw new Error("refresh_token 값이 비어 있습니다");
  }
  const sb = getSupabase();
  const { data, error } = await sb
    .from("gmail_accounts")
    .update({ refresh_token: refreshToken, updated_at: new Date().toISOString() })
    .eq("email", email)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`refresh_token 저장 실패: ${error.message}`);
  if (!data) {
    throw new Error(`gmail_accounts 에 등록되지 않은 이메일입니다: ${email}`);
  }
  clientCache.delete(data.id); // 다음 발송 시 새 토큰으로 클라이언트 재생성
}
