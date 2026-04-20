// Discord 웹훅 알림 헬퍼
// DISCORD_WEBHOOK_URL 환경변수 설정 시 동작, 없으면 no-op

export type AlertLevel = "info" | "warn" | "error";

const LEVEL_COLOR: Record<AlertLevel, number> = {
  info: 0x4aa8ff,   // 파랑
  warn: 0xf5a623,   // 주황
  error: 0xe03131,  // 빨강
};

const LEVEL_EMOJI: Record<AlertLevel, string> = {
  info: "ℹ️",
  warn: "⚠️",
  error: "🚨",
};

export interface DiscordAlert {
  title: string;
  description?: string;
  level?: AlertLevel;
  fields?: { name: string; value: string; inline?: boolean }[];
}

export async function sendDiscordAlert(alert: DiscordAlert) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;
  const level = alert.level ?? "error";
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "핏크닉 메일 발송",
        embeds: [
          {
            title: `${LEVEL_EMOJI[level]} ${alert.title}`,
            description: alert.description?.slice(0, 3800) || undefined,
            color: LEVEL_COLOR[level],
            fields: alert.fields?.slice(0, 10),
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
  } catch {
    // 알림 실패가 메인 로직을 막지 않도록
  }
}

// Gmail API 에러를 카테고리로 분류
export type GmailErrorKind = "token_expired" | "quota" | "auth" | "recipient" | "other";

export function classifyGmailError(errorMsg: string): { kind: GmailErrorKind; label: string } {
  const s = errorMsg.toLowerCase();
  if (s.includes("invalid_grant") || s.includes("token has been expired") || s.includes("token is revoked") || s.includes("token expired")) {
    return { kind: "token_expired", label: "OAuth 토큰 만료/폐기" };
  }
  if (s.includes("ratelimitexceeded") || s.includes("quotaexceeded") || s.includes("daily limit") || s.includes("rate limit") || s.includes("too many") || s.includes("quota exceeded") || s.includes("429")) {
    return { kind: "quota", label: "Gmail 발송 한도 초과" };
  }
  if (s.includes("unauthorized") || s.includes("permission") || s.includes("insufficient") || s.includes("forbidden") || s.includes("403") || s.includes("401")) {
    return { kind: "auth", label: "권한/인증 오류" };
  }
  if (s.includes("invalid to") || s.includes("recipient") || s.includes("address") || s.includes("invalid email")) {
    return { kind: "recipient", label: "수신자 이메일 오류" };
  }
  return { kind: "other", label: "발송 오류" };
}
