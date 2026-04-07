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
  "강은비", "국선우", "김기찬", "김동휘", "김보성", "김상원", "김상중",
  "김서윤", "김승철", "김예빈", "김용빈", "김은진", "김지상", "김채린",
  "박응석", "박하은", "박해선", "송성현", "신인철", "신주연", "원소영",
  "위혜민", "유민정", "윤예영", "윤원경", "이은수", "이해수", "장찬민",
  "정세희", "정승요", "정승희", "조솔비", "주수현", "최기쁨", "홍성빈",
];

export const WAVE_RESULTS = ["체크필요", "무응답", "응답", "거절"] as const;

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
