import type { InstructorStatus } from "./types";

export const STATUSES: InstructorStatus[] = [
  "미검토",
  "컨펌 필요",
  "발송 예정",
  "진행 중",
  "계약 완료",
  "제외",
  "보류",
  "거절",
];

export const STATUS_COLORS: Record<InstructorStatus, string> = {
  미검토: "bg-gray-100 text-gray-700",
  "컨펌 필요": "bg-yellow-100 text-yellow-800",
  "발송 예정": "bg-blue-100 text-blue-800",
  "진행 중": "bg-indigo-100 text-indigo-800",
  "계약 완료": "bg-green-100 text-green-800",
  제외: "bg-red-100 text-red-700",
  보류: "bg-orange-100 text-orange-800",
  거절: "bg-rose-100 text-rose-700",
};

export const ASSIGNEES = [
  "김상원",
  "정세희",
  "김서윤",
  "정승요",
  "윤원경",
  "국선우",
];

export const WAVE_RESULTS = ["무응답", "읽씹", "응답", "거절"] as const;

export const OUTREACH_CHANNELS = ["DM", "이메일", "DM+이메일"] as const;

export const APPLICATION_SOURCES = [
  "핏크닉메타",
  "핏크닉홈",
  "머니업홈",
  "핏크닉카",
  "머니업카",
] as const;

export const BANNED_PLATFORMS = [
  "타이탄클래스",
  "인베이더스쿨",
  "코주부클래스",
  "N잡연구소",
  "사이클해커스",
];

export const SOURCES = ["강사모집", "콘텐츠팀", "지원서"] as const;
