import type { InstructorStatus } from "./types";

// 발송 탭 — 이메일 목록 분류 로직 (클라이언트 미리보기 · 서버 발송 공용)

// 발송 후 "진행 중"으로 전환할 상태. 발송은 상태와 무관하게 전원에게 한다.
// 진행 중·미팅 완료·계약 완료는 이미 진행된 단계라 상태를 유지한다 (뱃지만 추가)
export const BULK_SEND_TO_IN_PROGRESS: InstructorStatus[] = ["미검토", "컨펌 필요", "발송 예정", "제외", "거절", "보류"];

// 미리보기에서 개수를 보여줄 상태 순서
export const BULK_SEND_STATUS_ORDER: InstructorStatus[] = [
  "미검토", "제외", "거절", "보류",
  "계약 완료", "미팅 완료", "진행 중", "발송 예정", "컨펌 필요",
];

export type BulkSendResult = "대기" | "발송" | "실패" | "미등록" | "연락금지" | "상태제외" | "형식오류";

export interface BulkSendInstructorLite {
  id: string;
  name: string;
  email: string;
  status: string;
  is_banned: boolean;
}

export interface ClassifiedEmail {
  email: string;
  result: BulkSendResult; // 발송 가능하면 "대기"
  reason: string;
  instructors: BulkSendInstructorLite[]; // 이 이메일을 가진 강사 (여러 명일 수 있음)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeBulkEmail(email: string): string {
  return email.trim().toLowerCase();
}

// 붙여넣은 텍스트에서 이메일 추출 (줄바꿈·쉼표·세미콜론·공백 구분), 중복 제거
export function parseEmailList(text: string): { emails: string[]; duplicateCount: number } {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^[<("']+|[>)"']+$/g, ""))
    .filter(Boolean);
  const seen = new Set<string>();
  const emails: string[] = [];
  let duplicateCount = 0;
  for (const t of tokens) {
    const e = normalizeBulkEmail(t);
    if (seen.has(e)) { duplicateCount++; continue; }
    seen.add(e);
    emails.push(e);
  }
  return { emails, duplicateCount };
}

// 강사 email 필드에 여러 주소가 들어있는 경우도 모두 매칭되도록 분리
function splitInstructorEmails(raw: string | null | undefined): string[] {
  return (raw || "")
    .split(/[\s,;/]+/)
    .map(normalizeBulkEmail)
    .filter((e) => EMAIL_RE.test(e));
}

export function buildEmailIndex<T extends BulkSendInstructorLite>(instructors: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const i of instructors) {
    for (const e of splitInstructorEmails(i.email)) {
      const arr = map.get(e);
      if (arr) { if (!arr.includes(i)) arr.push(i); }
      else map.set(e, [i]);
    }
  }
  return map;
}

// 이메일 1개 분류
// - 강사 없음 → 미등록
// - 매칭 강사 중 연락 금지가 있으면 → 연락금지
// - 그 외 → 대기(발송) — 강사 상태와 무관
export function classifyEmail<T extends BulkSendInstructorLite>(
  email: string,
  index: Map<string, T[]>,
): ClassifiedEmail {
  if (!EMAIL_RE.test(email)) {
    return { email, result: "형식오류", reason: "이메일 형식 아님", instructors: [] };
  }
  const matched = index.get(email) ?? [];
  if (matched.length === 0) {
    return { email, result: "미등록", reason: "DB에 없는 이메일", instructors: [] };
  }
  const banned = matched.filter((i) => i.is_banned);
  if (banned.length > 0) {
    return { email, result: "연락금지", reason: `연락 금지: ${banned.map((i) => i.name).join(", ")}`, instructors: matched };
  }
  return { email, result: "대기", reason: "", instructors: matched };
}

export function classifyEmails<T extends BulkSendInstructorLite>(emails: string[], instructors: T[]): ClassifiedEmail[] {
  const index = buildEmailIndex(instructors);
  return emails.map((e) => classifyEmail(e, index));
}

// 뱃지 색 — 발송명 문자열 해시로 고정 색 배정
const BADGE_COLORS = [
  "bg-sky-100 text-sky-800 border-sky-200",
  "bg-violet-100 text-violet-800 border-violet-200",
  "bg-emerald-100 text-emerald-800 border-emerald-200",
  "bg-amber-100 text-amber-800 border-amber-200",
  "bg-pink-100 text-pink-800 border-pink-200",
  "bg-lime-100 text-lime-800 border-lime-200",
  "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-200",
  "bg-orange-100 text-orange-800 border-orange-200",
];

export function badgeColor(label: string): string {
  let h = 0;
  for (let k = 0; k < label.length; k++) h = (h * 31 + label.charCodeAt(k)) | 0;
  return BADGE_COLORS[Math.abs(h) % BADGE_COLORS.length];
}
