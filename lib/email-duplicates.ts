import type { Instructor, YouTubeChannel } from "@/lib/types";

export type EmailOwner = { id: string; label: string; status: string };

// instructors + youtube_channels에서 같은 이메일을 쓰는 항목들을 묶어 반환.
// 2명 이상인 이메일만 결과에 포함.
export function buildEmailDuplicateMap(
  instructors: Instructor[],
  ytChannels: YouTubeChannel[],
): Map<string, EmailOwner[]> {
  const map = new Map<string, EmailOwner[]>();
  const push = (email: string | undefined | null, owner: EmailOwner) => {
    const e = email?.trim().toLowerCase();
    if (!e) return;
    const arr = map.get(e);
    if (arr) arr.push(owner);
    else map.set(e, [owner]);
  };
  for (const i of instructors) {
    push(i.email, { id: i.id, label: i.name || "이름없음", status: i.status || "" });
  }
  for (const ch of ytChannels) {
    // instructors로 이관되어 연결된 YT채널은 동일 인물이므로 중복 계산에서 제외
    if (ch.instructor_id) continue;
    push(ch.email, { id: ch.id, label: `${ch.channel_name || "채널명없음"} (YT)`, status: ch.status || "" });
  }

  const result = new Map<string, EmailOwner[]>();
  for (const [k, v] of map) if (v.length >= 2) result.set(k, v);
  return result;
}
