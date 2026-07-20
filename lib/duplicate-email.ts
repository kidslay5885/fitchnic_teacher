import type { getSupabase } from "@/lib/supabase";

type SB = ReturnType<typeof getSupabase>;

// 이메일 중복으로 자동 제외될 때 기록하는 사유 (접두어)
export const DUP_EMAIL_REASON = "이메일 중복";

export function normalizeEmail(email?: string | null): string {
  return (email || "").trim().toLowerCase();
}

// 자동 제외 사유 문구 생성 (기존 보유자 이름이 있으면 함께 표기)
export function dupEmailReason(ownerName?: string): string {
  const name = (ownerName || "").trim();
  return name ? `${DUP_EMAIL_REASON} (기존: ${name})` : DUP_EMAIL_REASON;
}

// 이미 이메일 중복으로 자동 제외된 레코드인지 판별
export function isDupEmailReason(reason?: string | null): boolean {
  return (reason || "").startsWith(DUP_EMAIL_REASON);
}

// 주어진 이메일들 중 instructors / youtube_channels에 이미 존재하는 것을 찾아
// "정규화된 이메일 → 기존 보유자 이름" 맵으로 반환한다.
export async function findEmailOwners(
  sb: SB,
  emails: (string | undefined | null)[]
): Promise<Map<string, string>> {
  const owners = new Map<string, string>();

  // 대소문자/앞뒤 공백 차이를 흡수하기 위해 원본과 소문자 변형을 함께 조회
  const variants = new Set<string>();
  for (const e of emails) {
    const raw = (e || "").trim();
    if (!raw) continue;
    variants.add(raw);
    variants.add(raw.toLowerCase());
  }
  if (variants.size === 0) return owners;

  const list = [...variants];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const [ins, yt] = await Promise.all([
      sb.from("instructors").select("email, name").in("email", batch),
      sb.from("youtube_channels").select("email, channel_name").in("email", batch),
    ]);
    for (const row of ins.data ?? []) {
      const key = normalizeEmail(row.email);
      if (key && !owners.has(key)) owners.set(key, row.name || "");
    }
    for (const row of yt.data ?? []) {
      const key = normalizeEmail(row.email);
      if (key && !owners.has(key)) owners.set(key, row.channel_name || "");
    }
  }
  return owners;
}

// youtube_channels에 이미 존재하는 이메일 Set (재임포트인지 판별용)
export async function findExistingChannelEmails(
  sb: SB,
  emails: (string | undefined | null)[]
): Promise<Set<string>> {
  const existing = new Set<string>();
  const variants = new Set<string>();
  for (const e of emails) {
    const raw = (e || "").trim();
    if (!raw) continue;
    variants.add(raw);
    variants.add(raw.toLowerCase());
  }
  if (variants.size === 0) return existing;

  const list = [...variants];
  for (let i = 0; i < list.length; i += 50) {
    const batch = list.slice(i, i + 50);
    const { data } = await sb.from("youtube_channels").select("email").in("email", batch);
    for (const row of data ?? []) {
      const key = normalizeEmail(row.email);
      if (key) existing.add(key);
    }
  }
  return existing;
}
