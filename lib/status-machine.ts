import type { InstructorStatus } from "./types";

const TRANSITIONS: Record<InstructorStatus, InstructorStatus[]> = {
  미검토: ["컨펌 필요", "제외", "보류"],
  "컨펌 필요": ["발송 예정", "제외", "보류"],
  "발송 예정": ["진행 중", "제외", "보류"],
  "진행 중": ["계약 완료", "제외", "보류", "거절"],
  "계약 완료": [],
  제외: [],
  보류: ["발송 예정"],
  거절: [],
};

export function getNextStatuses(current: InstructorStatus): InstructorStatus[] {
  return TRANSITIONS[current] ?? [];
}

export function canTransition(
  from: InstructorStatus,
  to: InstructorStatus
): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function requiresReason(to: InstructorStatus): boolean {
  return to === "제외" || to === "보류" || to === "거절";
}
