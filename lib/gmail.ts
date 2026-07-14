import { google } from "googleapis";
import { getSupabase } from "@/lib/supabase";
import { BUSINESS_CARD_ATTACHMENT } from "@/lib/business-card";
import { BUSINESS_CARD_KIMBOSEONG } from "@/lib/business-card-kimboseong";

// Gmail API 발송 헬퍼 (다중 계정 지원)
// gmail_accounts 테이블에서 계정별 refresh_token 을 불러와 OAuth 클라이언트를 만든다.
// 만료/폐기 시 /api/gmail-oauth/start?account=<email> 로 재인증.

export interface GmailAccount {
  id: string;
  email: string;
  label: string;
  from_name: string | null; // 받는사람 메일함에 뜨는 발신자 표시명. 없으면 label 사용.
  refresh_token: string | null;
  is_default: boolean;
  is_cron_sender: boolean;
  bcc: string[];
}

const ACCOUNT_COLUMNS = "id, email, label, from_name, refresh_token, is_default, is_cron_sender, bcc";

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
    .select(ACCOUNT_COLUMNS)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Gmail 계정 조회 실패: ${error.message}`);
  return (data ?? []).map(normalizeAccount);
}

function normalizeAccount(row: Record<string, unknown>): GmailAccount {
  return {
    id: row.id as string,
    email: row.email as string,
    label: row.label as string,
    from_name: (row.from_name as string | null) ?? null,
    refresh_token: (row.refresh_token as string | null) ?? null,
    is_default: !!row.is_default,
    is_cron_sender: !!row.is_cron_sender,
    bcc: Array.isArray(row.bcc) ? (row.bcc as string[]) : [],
  };
}

async function getAccount(accountId?: string | null): Promise<GmailAccount> {
  const sb = getSupabase();
  let query = sb
    .from("gmail_accounts")
    .select(ACCOUNT_COLUMNS);
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
  return normalizeAccount(data);
}

// 자동 후속 발송(2·3차) 대상 계정 전부 조회.
// is_cron_sender=true 인 계정이 여러 개일 수 있으며(대표·팀메일 등),
// 각 계정은 자기 계정으로 1차를 보낸 강사에게만 후속 발송한다.
export async function getCronSenderAccounts(): Promise<GmailAccount[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("gmail_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("is_cron_sender", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`크론 발송 계정 조회 실패: ${error.message}`);
  if (!data || data.length === 0) {
    throw new Error("is_cron_sender=true 인 Gmail 계정이 없습니다.");
  }
  return data.map(normalizeAccount);
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

// 첨부파일. base64 는 줄바꿈 없는 원본 base64 (인코딩은 buildRawMessage 가 처리).
export interface EmailAttachment {
  filename: string;
  mimeType: string;
  base64: string;
}

// MIME 본문 규격(RFC 2045)상 base64 는 76자마다 줄바꿈. 첨부 파트용.
function wrapBase64(b64: string) {
  return b64.replace(/.{76}/g, "$&\r\n");
}

// 한글 파일명을 RFC 2231 형식으로 인코딩 (filename*=UTF-8''...)
function encodeFilename(name: string) {
  return `UTF-8''${encodeURIComponent(name)}`;
}

function buildRawMessage(
  fromEmail: string,
  fromName: string,
  to: string,
  subject: string,
  body: string,
  toName?: string,
  bcc?: string[],
  attachments?: EmailAttachment[],
) {
  const altBoundary = `fitchnic_alt_${Math.random().toString(36).slice(2)}`;
  const headers = [
    `From: ${formatAddress(fromEmail, fromName)}`,
    `To: ${formatAddress(to, toName)}`,
  ];
  if (bcc && bcc.length > 0) {
    headers.push(`Bcc: ${bcc.join(", ")}`);
  }
  headers.push(`Subject: ${encodeHeader(subject)}`);

  // 본문(plain + html)을 묶는 multipart/alternative 블록
  const altPart = [
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(body, "utf8").toString("base64"),
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(`<div style="white-space:pre-wrap;font-family:Malgun Gothic,Apple SD Gothic Neo,sans-serif;font-size:14px;line-height:1.7;color:#222">${toHtml(body)}</div>`, "utf8").toString("base64"),
    "",
    `--${altBoundary}--`,
  ];

  let lines: string[];
  if (attachments && attachments.length > 0) {
    // 첨부가 있으면 multipart/mixed 로 본문 블록 + 첨부 파트를 감싼다
    const mixedBoundary = `fitchnic_mix_${Math.random().toString(36).slice(2)}`;
    lines = [
      ...headers,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
      "",
      `--${mixedBoundary}`,
      ...altPart,
    ];
    for (const att of attachments) {
      lines.push(
        `--${mixedBoundary}`,
        `Content-Type: ${att.mimeType}; name="${encodeHeader(att.filename)}"`,
        "Content-Transfer-Encoding: base64",
        `Content-Disposition: attachment; filename*=${encodeFilename(att.filename)}`,
        "",
        wrapBase64(att.base64),
        "",
      );
    }
    lines.push(`--${mixedBoundary}--`);
  } else {
    lines = [...headers, "MIME-Version: 1.0", ...altPart];
  }

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

// 팀메일 명함 자동 첨부 ON/OFF 토글.
// 현재 명함 이미지가 교체 예정(잘못된 이미지)이라 false 로 비활성화.
// 새 이미지로 business-card.ts 교체 후 true 로 바꾸면 다시 첨부된다.
const ATTACH_BUSINESS_CARD = false;

// 강의기획팀 이메일(팀메일) 계정 판별 — local part 가 business.center
// (messages-tab.tsx 의 발신 계정 색 분기와 동일 기준)
function isTeamAccount(email: string) {
  return email.split("@")[0] === "business.center";
}

// 계정별 자동 첨부 명함 — 해당 계정으로 발송 시 첨부할 명함(없으면 null)
function cardForAccount(email: string): EmailAttachment | null {
  const local = email.split("@")[0];
  if (local === "bbosk456") return BUSINESS_CARD_KIMBOSEONG; // 김보성 명함
  return null;
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
  // 명함 자동 첨부 (크론·수동 발송 공통)
  // - 팀메일 계정: ATTACH_BUSINESS_CARD 토글로 제어 (현재 비활성화)
  // - 그 외 계정: cardForAccount 로 계정별 명함 첨부 (예: 김보성)
  const teamCard =
    ATTACH_BUSINESS_CARD && isTeamAccount(account.email) ? BUSINESS_CARD_ATTACHMENT : null;
  const accountCard = cardForAccount(account.email);
  const cards = [teamCard, accountCard].filter(Boolean) as EmailAttachment[];
  const attachments = cards.length > 0 ? cards : undefined;
  const raw = buildRawMessage(
    account.email,
    account.from_name || account.label, // 받는사람 표시명: from_name 우선, 없으면 label
    to,
    subject,
    body,
    toName,
    account.bcc,
    attachments,
  );
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
