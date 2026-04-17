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

// 콤마로 분리된 여러 URL 정규화
export function normalizeRefLinks(input: unknown): string {
  if (typeof input !== "string") return "";
  return input
    .split(/\s*,\s*/)
    .filter(Boolean)
    .map(normalizeUrl)
    .join(" , ");
}
