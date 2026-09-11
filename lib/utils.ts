import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// URL 정규화: 프로토콜이 없으면 https:// 자동 추가
// - 빈 값/ID 형태(@handle, 단일 단어)는 그대로 유지
// - 도메인 형태(점 포함)는 https:// 접두
export function normalizeUrl(input: unknown): string {
  if (typeof input !== "string") return "";
  const s = input.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return "https:" + s;
  if (s.startsWith("@")) return s;
  if (/^[\w가-힣.-]+\.[a-zA-Z]{2,}/.test(s)) return "https://" + s;
  return s;
}

// 객체의 문자열 필드를 한글 완성형(NFC)으로 통일
// - 맥/일부 앱에서 붙여넣은 자모 분리형(NFD) 텍스트는 눈으로 같아도 검색·중복 비교에 걸리지 않음
export function normalizeTextFields<T extends Record<string, any>>(obj: T): T {
  const next: any = { ...obj };
  for (const k of Object.keys(next)) {
    if (typeof next[k] === "string") next[k] = next[k].normalize("NFC");
  }
  return next;
}

// 콤마로 분리된 여러 URL 정규화
export function normalizeRefLinks(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .split(/\s*,\s*/)
    .filter(Boolean)
    .map(normalizeUrl)
    .join(" , ");
}

// 편집 거리 (Levenshtein) - 이름/이메일 유사도 체크용
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}
