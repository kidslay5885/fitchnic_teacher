import { google } from "googleapis";

// Gmail API 발송 헬퍼
// .env.local 에 GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, GMAIL_SENDER 필요

let cachedClient: ReturnType<typeof createOAuth2Client> | null = null;

function createOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Gmail API 환경변수 미설정 (GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET / GMAIL_REFRESH_TOKEN)");
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });
  return oauth2;
}

function getClient() {
  if (!cachedClient) cachedClient = createOAuth2Client();
  return cachedClient;
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

function buildRawMessage(from: string, to: string, subject: string, body: string) {
  const boundary = `fitchnic_${Math.random().toString(36).slice(2)}`;
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
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
}

export async function sendEmail({ to, subject, body }: SendEmailParams) {
  const sender = process.env.GMAIL_SENDER;
  if (!sender) throw new Error("GMAIL_SENDER 환경변수 미설정");
  const auth = getClient();
  const gmail = google.gmail({ version: "v1", auth });
  const raw = buildRawMessage(sender, to, subject, body);
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
